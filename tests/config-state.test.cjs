const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const codec = require('../assets/config-codec.js');

const script = fs.readFileSync(require.resolve('../assets/config-state.js'), 'utf8');
const storageKey = 'toneymiller.llm-analysis.config.v1';

// A small event-bubbling DOM models the existing calculators' integration points.
// Assertions concern reload/share/reset behavior, not private implementation state.
function launch({search = '', saved, blockedStorage = false} = {}) {
  const elements = new Map(), timers = new Map(), store = new Map();
  let nextTimer = 1, copied = '', nativeRuns = 0, nativeSnapshot;
  if (saved) store.set(storageKey, codec.encode(saved));
  class MockEvent {
    constructor(type, options = {}) { this.type = type; this.bubbles = options.bubbles; }
  }
  class Element {
    constructor(tag = 'input', id = '', value = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.value = value;
      this.type = tag === 'input' ? 'number' : ''; this.disabled = false;
      this.min = ''; this.max = ''; this.options = []; this.checked = false;
      this.children = []; this.listeners = new Map(); this.dataset = {};
      if (id) elements.set(id, this);
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      for (const fn of this.listeners.get(event.type) || []) fn(event);
      if (event.bubbles && this.parent) this.parent.dispatchEvent(event);
      return true;
    }
    setAttribute(name, value) { this[name] = value; }
    append(...children) {
      for (const child of children) { child.parent = this; this.children.push(child); if (child.id) elements.set(child.id, child); }
    }
    closest(selector) {
      return selector.split(',').some(part => part === '#' + this.id || (part === '[data-memory-preset]' && this.dataset.memoryPreset)) ? this : null;
    }
  }
  const document = new Element('document');
  document.body = new Element('body'); document.body.parent = document;
  document.createElement = tag => new Element(tag);
  document.getElementById = id => elements.get(id) || null;
  const forms = ['memory-form', 'pd-form', 'ds41-form', 'ds41-memory-form'].map(id => new Element('form', id));
  forms.forEach(form => { form.parent = document; });
  function control(formId, id, value, {tag = 'input', type, disabled, min, max, options, bind} = {}) {
    const el = new Element(tag, id, value);
    if (type) el.type = type;
    if (disabled) el.disabled = true;
    if (min !== undefined) el.min = String(min);
    if (max !== undefined) el.max = String(max);
    if (options) el.options = options.map(value => ({value}));
    if (bind) el.dataset.dsBind = bind;
    elements.get(formId).append(el);
    return el;
  }
  const mode = control('pd-form', 'pd-mode', 'ideal', {tag:'select', options:['ideal','analytic','msmodeling']});
  control('pd-form', 'pd-input', '4096', {min:1,max:1048576});
  control('pd-form', 'pd-compute-scale', '1', {disabled:true,min:0.01,max:1});
  control('pd-form', 'pd-ratio', '5', {min:1,max:6});
  control('pd-form', 'pd-mtp-draft', '5', {min:1,max:7});
  control('pd-form', 'pd-chunk', '256', {min:0,max:1048576});
  control('pd-form', 'pd-p-dp', '2', {disabled:true});
  control('memory-form', 'mem-casts', '', {type:'checkbox'});
  control('memory-form', 'mem-util', '85', {min:1,max:100});
  control('ds41-form', 'ds41-offload', '32', {disabled:true,min:0.01,max:1000});
  control('ds41-form', 'ds41-util', '85', {min:1,max:100});
  control('ds41-memory-form', 'ds41-mem-util', '85', {bind:'util'});
  const model = new Element('select', 'simulation-model', new URLSearchParams(search).get('model') || 'glm53');
  model.parent = document;
  const actions = new Element('div', 'wb-config-actions'); actions.parent = document;
  document.querySelector = selector => selector === '.deck-bar' ? actions : null;
  document.querySelectorAll = selector => forms.flatMap(form => selector.includes('#' + form.id + ' input') ? form.children : []);
  mode.addEventListener('change', () => {
    elements.get('pd-compute-scale').disabled = mode.value === 'ideal';
    const ratio = elements.get('pd-ratio'), chunk = elements.get('pd-chunk');
    if (mode.value === 'msmodeling' && !nativeSnapshot) {
      nativeSnapshot = {ratio:ratio.value,chunk:chunk.value}; ratio.value='1'; chunk.value='0';
    } else if (mode.value !== 'msmodeling' && nativeSnapshot) {
      ratio.value=nativeSnapshot.ratio; chunk.value=nativeSnapshot.chunk; nativeSnapshot=undefined;
    }
  });
  elements.get('pd-form').addEventListener('change', event => {
    if (event.target.id === 'pd-mode' && mode.value === 'msmodeling') nativeRuns++;
    if (mode.value !== 'msmodeling') {
      const ratio = elements.get('pd-ratio');
      ratio.max=String(Number(elements.get('pd-mtp-draft').value)+1);
      ratio.value=String(Math.min(Number(ratio.value),Number(ratio.max)));
    }
  });
  for (const type of ['input','change']) {
    elements.get('ds41-memory-form').addEventListener(type, event => {
      const target = elements.get('ds41-' + event.target.dataset.dsBind);
      if (target) target.value = event.target.value;
    });
  }
  const location = {href:'https://example.test/LLM-Analysis/diagram.html' + search,search};
  const history = {replaceState(_state, _title, url) { location.href = String(url); location.search = new URL(location.href).search; }};
  const localStorage = {
    getItem(key) { if (blockedStorage) throw Error('Storage blocked'); return store.get(key) || null; },
    setItem(key, value) { if (blockedStorage) throw Error('Storage blocked'); store.set(key, value); },
    removeItem(key) { if (blockedStorage) throw Error('Storage blocked'); store.delete(key); }
  };
  const context = {window:{LLMConfigCodec:codec},document,Event:MockEvent,URL,URLSearchParams,location,history,localStorage,
    navigator:{clipboard:{async writeText(value) { copied = value; }}},
    setTimeout(fn) { const id = nextTimer++; timers.set(id, fn); return id; },clearTimeout(id) { timers.delete(id); }};
  vm.runInNewContext(script,context,{filename:'config-state.js'});
  return {get:id => elements.get(id),store,location,get copied() { return copied; },get nativeRuns() { return nativeRuns; },
    event(id,type) { elements.get(id).dispatchEvent(new MockEvent(type,{bubbles:true})); },
    async share() { this.event('config-share','click'); await Promise.resolve(); },
    flush() { for (let n=0; timers.size && n<10; n++) { const work=[...timers.values()]; timers.clear(); work.forEach(fn=>fn()); } }};
}
function config(fields = {}, model = 'glm53') { return {version:1,model,fields}; }

test('shared input validates ranges, selection values and checkbox types before rendering', () => {
  const app = launch({search:'?cfg=' + codec.encode(config({'pd-input':'8192','pd-mode':'unknown','mem-util':'101','mem-casts':true,'pd-unknown':'17'}))});
  assert.equal(app.get('pd-input').value,'8192');
  assert.equal(app.get('pd-mode').value,'ideal');
  assert.equal(app.get('mem-util').value,'85');
  assert.equal(app.get('mem-casts').checked,true);
});

test('a shared native mode never selects or starts the local native backend', () => {
  const app = launch({search:'?cfg=' + codec.encode(config({'pd-mode':'msmodeling','pd-input':'8192'}))});
  assert.equal(app.get('pd-mode').value,'ideal');
  assert.equal(app.nativeRuns,0);
});

test('a valid shared MTP ratio can exceed the previous draft configuration range', () => {
  const app = launch({search:'?cfg=' + codec.encode(config({'pd-mtp-draft':'7','pd-ratio':'7'}))});
  assert.equal(app.get('pd-mtp-draft').value,'7');
  assert.equal(app.get('pd-ratio').value,'7');
});

test('settings initially disabled persist and share after the user enables them', async () => {
  const app = launch();
  app.get('pd-mode').value = 'analytic'; app.event('pd-mode','change');
  app.get('pd-compute-scale').value = '0.6'; app.event('pd-compute-scale','input'); app.flush();
  const stored = codec.decode(app.store.get(storageKey));
  assert.equal(stored.fields['pd-compute-scale'],'0.6');
  await app.share();
  assert.equal(codec.decode(new URL(app.copied).searchParams.get('cfg')).fields['pd-compute-scale'],'0.6');
});

test('editing the DeepSeek memory page persists the synchronized performance setting', () => {
  const app = launch();
  app.get('ds41-mem-util').value = '72'; app.event('ds41-mem-util','input'); app.flush();
  assert.equal(app.get('ds41-util').value,'72');
  assert.equal(codec.decode(app.store.get(storageKey)).fields['ds41-util'],'72');
});

test('reset cancels pending saves, restores all calculator defaults and preserves current model', () => {
  const app = launch({search:'?model=deepseek-v4.1-flash&restore=msmodeling&cfg=' + codec.encode(config({'pd-input':'8192'},'deepseek-v4.1-flash'))});
  app.get('pd-mode').value='analytic'; app.event('pd-mode','change');
  app.get('pd-compute-scale').value='0.6'; app.event('pd-compute-scale','input');
  app.event('config-reset','click'); app.flush();
  assert.equal(app.get('pd-input').value,'4096');
  assert.equal(app.get('pd-compute-scale').value,'1');
  assert.equal(app.get('simulation-model').value,'deepseek-v4.1-flash');
  assert.equal(app.store.has(storageKey),false);
  assert.equal(new URL(app.location.href).searchParams.has('cfg'),false);
  assert.equal(new URL(app.location.href).searchParams.has('restore'),false);
});

test('explicit model URL survives saved settings and shared URLs omit native restore', async () => {
  const app = launch({search:'?model=deepseek-v4.1-flash&restore=msmodeling',saved:config({'pd-input':'2048'},'glm53')});
  assert.equal(app.get('simulation-model').value,'deepseek-v4.1-flash');
  assert.equal(app.get('pd-input').value,'2048');
  await app.share();
  assert.equal(new URL(app.copied).searchParams.has('restore'),false);
  assert.equal(codec.decode(new URL(app.copied).searchParams.get('cfg')).model,'deepseek-v4.1-flash');
});

test('reset from native mode restores defaults after the original mode handler restores its snapshot', () => {
  const app = launch();
  app.get('pd-ratio').value='3'; app.get('pd-chunk').value='512';
  app.get('pd-mode').value='msmodeling'; app.event('pd-mode','change');
  assert.equal(app.nativeRuns,1);
  app.event('config-reset','click'); app.flush();
  assert.equal(app.get('pd-mode').value,'ideal');
  assert.equal(app.get('pd-ratio').value,'5');
  assert.equal(app.get('pd-chunk').value,'256');
  assert.equal(app.nativeRuns,1);
});

test('blocked browser storage does not prevent explicitly sharing a valid configuration', async () => {
  const app = launch({blockedStorage:true});
  app.get('pd-input').value='2048'; app.event('pd-input','input'); app.flush();
  await app.share();
  assert.equal(codec.decode(new URL(app.copied).searchParams.get('cfg')).fields['pd-input'],'2048');
});
