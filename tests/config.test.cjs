const test = require('node:test');
const assert = require('node:assert/strict');
const codec = require('../assets/config-codec.js');
test('configuration round trips Unicode values, checkbox states and model', () => {
  const data = {version:1,model:'deepseek-v4.1-flash',fields:{'mem-dp':'16','mem-casts':true,'pd-case':'配置'}};
  const decoded = codec.decode(codec.encode(data));
  assert.equal(decoded.model,data.model); assert.deepEqual({...decoded.fields},data.fields);
});
test('untrusted names and unsupported value types are discarded', () => {
  const data = codec.normalize(JSON.parse('{"version":1,"model":"glm53","fields":{"__proto__":{"polluted":true},"onclick":"alert(1)","mem-dp":"8","pd-object":{},"mem-total":null}}'));
  assert.deepEqual({...data.fields},{'mem-dp':'8'}); assert.equal({}.polluted,undefined);
});
test('malformed, oversized, invalid version and unknown models fail closed', () => {
  for(const value of ['<script>', 'a'.repeat(codec.MAX_LENGTH+1), 'a']) assert.throws(()=>codec.decode(value));
  assert.throws(()=>codec.encode({version:2,model:'glm53',fields:{}}));
  assert.throws(()=>codec.encode({version:1,model:'unknown',fields:{}}));
});
