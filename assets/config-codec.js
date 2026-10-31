/* Versioned, bounded, URL-safe calculator configuration. No executable payloads. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LLMConfigCodec = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const MAX_LENGTH = 16000;
  const models = ['glm53', 'deepseek-v4.1-flash'];
  function normalize(data) {
    if (!data || data.version !== 1 || !models.includes(data.model) || !data.fields ||
        typeof data.fields !== 'object' || Array.isArray(data.fields)) throw Error('配置格式或版本不受支持');
    const fields = Object.create(null);
    for (const [id, value] of Object.entries(data.fields)) {
      if (!/^(mem|pd|ds41)-[a-zA-Z0-9-]{1,48}$/.test(id)) continue;
      if (typeof value === 'boolean' || (typeof value === 'string' && value.length <= 100)) fields[id] = value;
    }
    if (Object.keys(fields).length > 150) throw Error('配置字段过多');
    return {version: 1, model: data.model, fields};
  }
  function encode(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(normalize(data)));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const value = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (value.length > MAX_LENGTH) throw Error('配置链接过长');
    return value;
  }
  function decode(value) {
    if (typeof value !== 'string' || value.length > MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('配置链接无效');
    try {
      const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
      return normalize(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(binary, x => x.charCodeAt(0)))));
    } catch (error) { throw Error('无法读取配置：' + error.message); }
  }
  return {encode, decode, normalize, MAX_LENGTH};
});
