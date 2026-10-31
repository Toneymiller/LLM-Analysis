/* Calculator inputs stay in this browser; only an explicit share action creates a URL. */
(() => {
  'use strict';
  const codec = window.LLMConfigCodec;
  const key = 'toneymiller.llm-analysis.config.v1';
  const selector = '#memory-form input[id],#memory-form select[id],#pd-form input[id],#pd-form select[id],#ds41-form input[id],#ds41-form select[id]';
  const controls = [...document.querySelectorAll(selector)].filter(el => el.type !== 'hidden' &&
    !/^(pd|ds41)-[pd]-dp$/.test(el.id));
  const byId = new Map(controls.map(el => [el.id, el]));
  const model = document.getElementById('simulation-model');
  const forms = ['memory-form', 'pd-form', 'ds41-form'].map(id => document.getElementById(id));
  let timer;
  let restoring = false;
  function isConfigInput(element) {
    return byId.has(element.id) || (element.dataset.dsBind && byId.has('ds41-' + element.dataset.dsBind));
  }
  const capture = () => ({version: 1, model: model.value, fields: Object.fromEntries(controls.map(el =>
    [el.id, el.type === 'checkbox' ? el.checked : el.value]))});
  const defaults = capture();
  const notice = document.createElement('span');
  notice.className = 'config-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  function say(text) { notice.textContent = text; }
  function restore(data, restoreModel) {
    data = codec.normalize(data);
    restoring = true;
    try {
      const engine = document.getElementById('pd-mode');
      const desiredMode = data.fields['pd-mode'];
      if (desiredMode !== 'msmodeling' && [...engine.options].some(o => o.value === desiredMode)) engine.value = desiredMode;
      else if (engine.value === 'msmodeling') engine.value = defaults.fields['pd-mode'];
      // The original native-mode handler may restore its own snapshot. Run it first.
      engine.dispatchEvent(new Event('change'));
      for (const [id, value] of Object.entries(data.fields)) {
        const el = byId.get(id);
        if (!el) continue;
        if (el.type === 'checkbox') { if (typeof value === 'boolean') el.checked = value; continue; }
        if (typeof value !== 'string') continue;
        if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === value)) continue;
        // Native modeling requires a separately running local service and explicit selection.
        if (id === 'pd-mode' && value === 'msmodeling') continue;
        if (el.type === 'number') {
          const number = Number(value);
          const dynamicMax = id === 'pd-ratio' ? Math.min(Number(data.fields['pd-output'] || document.getElementById('pd-output')?.value || 1048575), Number(data.fields['pd-mtp-draft'] || document.getElementById('pd-mtp-draft').value) + 1)
            : id === 'ds41-accept' ? Math.min(6, Number(data.fields['ds41-output'] || document.getElementById('ds41-output')?.value || 1048575)) : null;
          const maximum = dynamicMax === null ? (el.max === '' ? Infinity : Number(el.max)) : dynamicMax;
          if (value.trim() === '' || !Number.isFinite(number) ||
              (el.min !== '' && number < Number(el.min)) || number > maximum) continue;
        }
        el.value = value;
      }
      if (restoreModel) { model.value = data.model; model.dispatchEvent(new Event('change', {bubbles: true})); }
      // One update per form, after all fields are assigned, keeps a shared topology consistent.
      forms.filter(Boolean).forEach(form => form.dispatchEvent(new Event('change', {bubbles: true})));
    } finally { restoring = false; }
  }
  function persist() {
    if (restoring) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(key, codec.encode(capture())); } catch { /* Storage may be disabled. */ }
    }, 300);
  }
  const actions = document.getElementById('wb-config-actions') || document.querySelector('.deck-bar');
  const copy = document.createElement('button');
  copy.type = 'button'; copy.textContent = '复制配置链接';
  copy.id = 'config-share'; copy.title = '复制当前模型和计算器输入，接收者可复现配置';
  const reset = document.createElement('button');
  reset.type = 'button'; reset.textContent = '恢复初始参数'; reset.id = 'config-reset';
  actions.append(copy, reset, notice);
  let dialog;
  async function share() {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('restore');
      url.searchParams.set('model', model.value);
      url.searchParams.set('cfg', codec.encode(capture()));
      try { await navigator.clipboard.writeText(url.href); say('配置链接已复制'); }
      catch {
        if (!dialog) {
          dialog = document.createElement('dialog'); dialog.className = 'config-share-dialog';
          const title = document.createElement('h2'); title.textContent = '复制配置链接';
          const help = document.createElement('p'); help.textContent = '浏览器未允许自动复制，请选中下面的链接并复制。';
          const field = document.createElement('textarea'); field.readOnly = true; field.setAttribute('aria-label', '配置链接');
          const close = document.createElement('button'); close.type = 'button'; close.textContent = '关闭'; close.onclick = () => dialog.close();
          dialog.append(title, help, field, close); document.body.append(dialog);
        }
        dialog.querySelector('textarea').value = url.href; dialog.showModal(); dialog.querySelector('textarea').select();
      }
    } catch (error) { say(error.message); }
  }
  copy.addEventListener('click', share);
  reset.addEventListener('click', () => {
    clearTimeout(timer);
    try { localStorage.removeItem(key); } catch { /* no persistence */ }
    const url = new URL(location.href); url.searchParams.delete('cfg'); url.searchParams.delete('restore'); history.replaceState(null, '', url);
    restore({...defaults, model: model.value}, false); say('已恢复初始参数');
  });
  const params = new URLSearchParams(location.search);
  try {
    const shared = params.get('cfg');
    const saved = shared || localStorage.getItem(key);
    if (saved) { restore(codec.decode(saved), !!shared || !params.has('model')); say(shared ? '已加载链接中的配置' : '已恢复上次参数'); }
  } catch (error) { say('已使用默认参数；' + error.message); }
  document.addEventListener('input', event => { if (isConfigInput(event.target)) persist(); });
  document.addEventListener('change', event => { if (event.target === model || isConfigInput(event.target)) persist(); });
  // Preset and reset buttons also change values without emitting input events.
  document.addEventListener('click', event => {
    if (event.target.closest('[data-memory-preset],#pd-latest,#pd-case,#ds41-reset,#ds41-reset-top')) setTimeout(persist, 0);
  });
})();
