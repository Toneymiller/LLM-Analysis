const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'glm53_prefill_decode_operator_block_diagram.html'), 'utf8');
const jsonScripts = new Map();
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!/type="application\/json"/.test(match[1])) continue;
  jsonScripts.set(match[1].match(/id="([^"]+)"/)[1], match[2]);
}
const context = vm.createContext({
  document: { getElementById: id => ({ textContent: jsonScripts.get(id) }) },
});
const section = (start, end) => {
  const from = html.indexOf(start), to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing model section ${start}`);
  return html.slice(from, to);
};
vm.runInContext(`
const GiB=2**30;
const memoryData=JSON.parse(document.getElementById('weight-data').textContent);
const pdData=JSON.parse(document.getElementById('pd-data').textContent);
const pdNum=(x,d=2)=>Number(x).toFixed(d);
${section('function calculateRankMemory(', 'function readMemoryInputs(')}
${section('const pdGroups=', '// A modeled memory rejection')}
${section('const DS41=(()=>{', 'DS41.init();')}
`, context);
const evaluate = source => vm.runInContext(source, context);
const plain = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} differs from ${expected}`);
};

test('all embedded executable scripts remain syntactically valid', () => {
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="application\/json"/.test(match[1])) continue;
    assert.doesNotThrow(() => new vm.Script(match[2]));
  }
});
evaluate(`
const glmDefaults=()=>({input:4096,output:128,ttft:2,itl:.09,tpot:.02,
 fidelity:'analytic',decodeMode:'mtp',mtpDraft:5,ratioSource:'custom',itlTpotRatio:3,
 fixedP:1,fixedD:1,maxP:1,maxD:1,chunk:0,util:85,reserve:4,
 pScale:1,dScale:1,computeScale:1,memoryScale:1,overlap:0,imbalance:1.1,
 p:{hw:'a3-752',nodes:1,tp:8,ep:16,dp:2},d:{hw:'a3-752',nodes:1,tp:1,ep:16,dp:16}});
const glmRow=r=>r.d.results[0]||r.d.firstMemoryRejected;
`);

test('GLM SLO changes cannot change explicit acceptance or modeled candidate throughput', () => {
  const result = plain(evaluate(`(()=>{
    const a=calculatePDSimulation(glmDefaults());
    const b=calculatePDSimulation({...glmDefaults(),itl:.9,tpot:.000001});
    return {a,b,ra:glmRow(a),rb:glmRow(b)};
  })()`));
  assert.equal(result.a.valid, true);
  assert.equal(result.b.valid, true);
  assert.equal(result.a.config.itlTpotRatio, 3);
  assert.equal(result.b.config.itlTpotRatio, 3);
  for (const key of ['qps', 'itlSeconds', 'tpotSeconds', 'duration', 'peakBytes']) close(result.ra[key], result.rb[key]);
  assert.equal(result.rb.feasible, false);
});

test('GLM acceptance obeys output and verification limits; AR and native emit one token', () => {
  const values = plain(evaluate(`[
    pdLatencyConfig({...glmDefaults(),itlTpotRatio:99}).itlTpotRatio,
    pdLatencyConfig({...glmDefaults(),output:2,itlTpotRatio:5}).itlTpotRatio,
    pdLatencyConfig({...glmDefaults(),decodeMode:'ratio',itlTpotRatio:5}).itlTpotRatio,
    pdLatencyConfig({...glmDefaults(),fidelity:'msmodeling',itlTpotRatio:5}).itlTpotRatio,
    pdLatencyConfig({...glmDefaults(),itlTpotRatio:undefined}).itlTpotRatio
  ]`));
  assert.deepEqual(values, [6, 2, 1, 1, 1]);
});

test('invalid GLM acceptance is rejected instead of silently deriving it from SLOs', () => {
  const result = plain(evaluate(`calculatePDSimulation({...glmDefaults(),itlTpotRatio:NaN})`));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('比值')));
});

test('scoped GLM MTP reference interpolation remains selectable and SLO independent', () => {
  const result = plain(evaluate(`(()=>{
    const c=pdLatencyConfig({...glmDefaults(),fidelity:'calibrated',output:1024,ratioSource:'reference'});
    const a=pdMtpBatch(c,c.d,4,pdMemory(c,c.d));
    const d={...c,itl:9,tpot:.00001};
    const b=pdMtpBatch(d,d.d,4,pdMemory(d,d.d));
    return {source:c.ratioSource,reference:pdMtpReference(c,c.d,4),a,b};
  })()`));
  assert.equal(result.source, 'reference');
  assert.equal(result.a.projection.ratioSource, 'training_interpolation');
  assert.equal(result.a.calibration.applied, true);
  close(result.a.itlTpotRatio, result.reference.ratio);
  close(result.a.qps, result.b.qps);
});

test('mean MTP calibration scales the final-context estimate instead of treating the mean as worst', () => {
  const result = plain(evaluate(`(()=>{
    const c=pdLatencyConfig({...glmDefaults(),fidelity:'calibrated',output:1024,ratioSource:'reference'});
    const row=pdMtpBatch(c,c.d,4,pdMemory(c,c.d));
    const z=pdForward(c,c.d,4,6,c.input+c.output-6,'decode',true,'verify');
    let seconds=z.seconds;
    for(let j=0;j<5;j++)seconds+=pdForward(c,c.d,4,1,c.input+c.output-6+j,'decode',true,'draft').seconds;
    return {row,last:seconds*row.calibration.factor};
  })()`));
  close(result.row.worstITL, result.last);
  assert.ok(result.row.worstITL >= result.row.itlSeconds);
  assert.equal(result.row.projection.worstLatencyBasis, 'scaled_analytic_last_context');
});

test('DeepSeek SLO changes leave a fixed DSpark acceptance and candidate throughput unchanged', () => {
  const result = plain(evaluate(`(()=>{
    const c={...DS41.defaults(),input:4096,output:128,maxP:1,maxD:1,accept:2.5};
    const a=DS41.calculate(c),b=DS41.calculate({...c,itl:9,tpot:.000001});
    return {a,b,ra:a.d.rows[0]||a.d.rejected,rb:b.d.rows[0]||b.d.rejected};
  })()`));
  assert.equal(result.a.valid, true);
  assert.equal(result.b.valid, true);
  assert.equal(result.a.config.accept, 2.5);
  assert.equal(result.b.config.accept, 2.5);
  for (const key of ['qps', 'itl', 'tpot', 'seconds', 'peak']) close(result.ra[key], result.rb[key]);
  assert.equal(result.rb.latencyFeasible, false);
});

test('DeepSeek acceptance bounds and invalid values are handled independently of SLOs', () => {
  const result = plain(evaluate(`(()=>{
    const c={...DS41.defaults(),input:64,maxP:1,maxD:1};
    return {
      cap:DS41.calculate({...c,accept:99}).config.accept,
      output:DS41.calculate({...c,output:2,accept:5}).config.accept,
      ar:DS41.calculate({...c,decode:'ar',accept:5}).config.accept,
      invalid:DS41.calculate({...c,accept:NaN}).valid
    };
  })()`));
  assert.deepEqual(result, { cap:6, output:2, ar:1, invalid:false });
});

test('pooled causal counts equal the discrete reference sum', () => {
  for (const n of [0, 1, 3, 4, 5, 63, 64, 2047, 2048, 2051]) {
    const expected = Array.from({length:n}, (_, i) => Math.ceil((i + 1) / 4)).reduce((a, b) => a + b, 0);
    assert.equal(evaluate(`pdPoolPrefix(${n})`), expected);
  }
});

test('Roofline summation handles compute/memory crossover exactly', () => {
  for (const [n, ac, bc, am, bm] of [[1, 3, 3, 4, 4], [8, 1, 9, 10, 2], [17, 10, 2, 1, 12], [5, 3, 3, 3, 3]]) {
    const a={compute:ac,memory:am,launch:.25},b={compute:bc,memory:bm,launch:.25};
    const expected=Array.from({length:n}, (_, i) => Math.max(ac+(bc-ac)*i/Math.max(1,n-1),am+(bm-am)*i/Math.max(1,n-1))+.25).reduce((x,y)=>x+y,0);
    close(evaluate(`pdSumRoof(${JSON.stringify(a)},${JSON.stringify(b)},${n})`), expected);
  }
});

test('optimized full-stage summation matches direct evaluation at causal and sparse-cap boundaries', () => {
  const cases = [
    {q:1,prefix:0,step:1,n:9,phase:'decode'},
    {q:1,prefix:2043,step:1,n:13,phase:'decode'},
    {q:64,prefix:0,step:64,n:37,phase:'prefill'},
    {q:65,prefix:0,step:65,n:35,phase:'prefill'},
  ];
  for (const item of cases) {
    const {sum, direct} = plain(evaluate(`(()=>{
      const c=glmDefaults(),s=c.d,t=${JSON.stringify(item)};
      const sum=pdSumForwards(c,s,1,t.q,t.prefix,t.step,t.n,t.phase,true).seconds;
      let direct=0;for(let i=0;i<t.n;i++)direct+=pdForward(c,s,1,t.q,t.prefix+i*t.step,t.phase,true).seconds;
      return {sum,direct};
    })()`));
    close(sum, direct);
  }
});

test('physical cache pool allocation never exceeds its memory budget', () => {
  const rows = plain(evaluate(`[0,5,7].map(q=>calculateRankMemory({dp:16,tp:1,ep:16,total:64,util:85,reserve:4,q,sp:'off',vision:'off',casts:true,quant:'checkpoint'}))`));
  for (const row of rows) {
    assert.equal(row.valid, true);
    assert.ok(row.kv <= row.kvBudget);
    assert.equal(row.kv, row.blocks * row.poolBytes);
    assert.ok(row.alignment >= 0 && row.alignment < row.poolBytes);
  }
});
