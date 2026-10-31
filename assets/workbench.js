/* Progressive workstation features. No model inputs, equations, or results are changed. */
(() => {
  'use strict';
  const bootstrap = document.currentScript;
  function init() {
    const shell = document.querySelector('.deck-shell');
    const stage = shell?.querySelector('.deck-stage');
    const nav = shell?.querySelector('.deck-bar');
    if (!stage || !nav || document.getElementById('wb-toolbar')) return;
    const repository = bootstrap?.dataset.repository || 'https://github.com/Toneymiller/LLM-Analysis';
    const source = 'https://biuapha.github.io/LLM-Analysis/glm53_prefill_decode_operator_block_diagram.html';
    const auditURL = bootstrap?.dataset.auditUrl || `${repository}/blob/main/docs/AUDIT.md`;
    const tabs = [...nav.querySelectorAll('[role="tab"][data-page]')];
    const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
    const state = { svg: null, slide: null, zoom: 1, mode: 'readable', hits: [], selected: -1, query: '' };
    let frame = 0, searchTimer = 0, toastTimer = 0;
    const create = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text) element.textContent = text;
      return element;
    };
    const link = (className, text, href) => {
      const element = create('a', className, text);
      element.href = href;
      element.target = '_blank';
      element.rel = 'noopener noreferrer';
      return element;
    };
    const button = (className, text, label) => {
      const element = create('button', className, text);
      element.type = 'button';
      if (label) element.setAttribute('aria-label', label);
      return element;
    };
    const skip = create('a', 'wb-skip', '跳转到分析画布');
    skip.href = '#analysis-canvas';
    skip.addEventListener('click', event => { event.preventDefault(); state.slide?.focus(); });
    document.body.prepend(skip);

    const masthead = create('header', 'wb-masthead');
    const brand = create('div', 'wb-brand');
    const monogram = create('span', 'wb-monogram');
    monogram.setAttribute('aria-hidden', 'true');
    monogram.innerHTML = '<svg viewBox="0 0 32 32" fill="none"><path d="M6 23 16 6l10 17H6Z" stroke="currentColor" stroke-width="1.4"/><path d="m6 23 10-7 10 7M16 6v10" stroke="currentColor" stroke-width="1.2"/><circle cx="16" cy="6" r="2.4" fill="currentColor"/><circle cx="6" cy="23" r="2.4" fill="currentColor"/><circle cx="26" cy="23" r="2.4" fill="currentColor"/><circle cx="16" cy="16" r="2.4" fill="#0c2230" stroke="currentColor"/></svg>';
    const wordmark = create('div', 'wb-wordmark');
    wordmark.append(create('span', 'wb-eyebrow', 'TONEYMILLER / LLM ANALYSIS'), create('span', 'wb-title', '大模型架构与推理分析'));
    brand.append(monogram, wordmark);
    const mastheadLinks = create('div', 'wb-masthead-links');
    const repoLink = link('wb-repo', 'GitHub ↗', repository);
    repoLink.prepend(create('span', '', '⌘'));
    const configActions = create('div', 'wb-config-actions');
    configActions.id = 'wb-config-actions';
    configActions.setAttribute('role', 'group');
    configActions.setAttribute('aria-label', '仿真参数保存与分享');
    mastheadLinks.append(link('wb-source', '参考原作 ↗', source), link('wb-audit', '审阅与改进 ↗', auditURL), configActions, repoLink);
    masthead.append(brand, mastheadLinks);
    shell.prepend(masthead);

    const toolbar = create('div', 'wb-toolbar');
    toolbar.id = 'wb-toolbar';
    toolbar.setAttribute('role', 'region');
    toolbar.setAttribute('aria-label', '画布缩放与搜索');
    const toolsLeft = create('div', 'wb-tools-left');
    const zoomTools = create('div', 'wb-zoom');
    zoomTools.setAttribute('role', 'group');
    zoomTools.setAttribute('aria-label', '画布缩放');
    const fitButton = button('wb-fit', '适应窗口', '适应窗口，快捷键 0');
    const minusButton = button('wb-zoom-step', '−', '缩小画布，快捷键减号');
    const zoomOutput = create('output', 'wb-zoom-output', '100%');
    zoomOutput.id = 'wb-zoom-output';
    zoomOutput.setAttribute('aria-label', '当前画布缩放比例');
    const plusButton = button('wb-zoom-step', '+', '放大画布，快捷键加号');
    const actualButton = button('wb-actual', '100%', '以原始尺寸显示画布');
    const helpButton = button('wb-help', '?', '使用帮助与键盘快捷键');
    helpButton.setAttribute('aria-haspopup', 'dialog');
    helpButton.setAttribute('aria-controls', 'wb-help-dialog');
    zoomTools.append(fitButton, minusButton, zoomOutput, plusButton, actualButton);
    toolsLeft.append(create('span', 'wb-section-caption', 'ANALYSIS CANVAS'), zoomTools, create('span', 'wb-mobile-hint', '左右拖动画布'), helpButton);
    const searchBox = create('div', 'wb-search');
    searchBox.setAttribute('role', 'search');
    const searchIcon = create('span', 'wb-search-icon', '⌕');
    searchIcon.setAttribute('aria-hidden', 'true');
    const searchInput = create('input');
    searchInput.id = 'wb-search';
    searchInput.type = 'search';
    searchInput.placeholder = '搜索算子、Tensor 或 Shape…  /';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.setAttribute('aria-label', '搜索当前画布中的算子、Tensor 或 Shape');
    searchInput.setAttribute('aria-describedby', 'wb-search-count');
    const searchCount = create('span', 'wb-search-count', '');
    searchCount.id = 'wb-search-count';
    searchCount.setAttribute('role', 'status');
    searchCount.setAttribute('aria-live', 'polite');
    searchCount.setAttribute('aria-atomic', 'true');
    const previousButton = button('', '↑', '上一处匹配，Shift 加 Enter');
    const nextButton = button('', '↓', '下一处匹配，Enter');
    const clearButton = button('wb-search-clear', '×', '清除搜索');
    previousButton.disabled = nextButton.disabled = true;
    clearButton.hidden = true;
    searchBox.append(searchIcon, searchInput, searchCount, previousButton, nextButton, clearButton);
    toolbar.append(toolsLeft, searchBox);
    stage.before(toolbar);

    const footer = create('footer', 'wb-footer');
    const footerContext = create('span', 'wb-footer-context');
    const evidence = create('span', 'wb-evidence');
    const evidenceDot = create('span', 'wb-evidence-dot');
    evidenceDot.setAttribute('aria-hidden', 'true');
    evidence.append(evidenceDot, document.createTextNode('解析估算 · 实测有适用范围'));
    footer.append(footerContext, link('wb-footer-source', '基于 biuapha 的公开参考实现 · 保留模型依据', source), evidence);
    shell.append(footer);
    const toast = create('div', 'wb-toast');
    toast.setAttribute('role', 'status');
    toast.hidden = true;
    document.body.append(toast);
    function notify(message) {
      clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
    }

    const help = create('dialog', 'wb-help-dialog');
    help.id = 'wb-help-dialog';
    help.setAttribute('aria-labelledby', 'wb-help-title');
    help.innerHTML = '<header><div><h2 id="wb-help-title">阅读、定位与对比</h2><p>GLM 与 DeepSeek 独立模型 · 四个分析视图</p></div><button type="button" aria-label="关闭使用帮助">关闭 ×</button></header><div class="wb-help-content"><p>先选择模型，再切换算子、KV cache、显存预算或性能仿真。点击图中的算子与连线可查看输入、输出和数学公式。小屏默认保留可读尺寸，可横向和纵向滚动画布。</p><dl class="wb-help-keys"><dt><kbd>1</kbd> – <kbd>4</kbd></dt><dd>切换四个分析页签</dd><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>在页签获得焦点时切换；Home / End 跳至首尾</dd><dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>放大或缩小画布，范围 20% – 250%</dd><dt><kbd>0</kbd></dt><dd>让完整画布适应当前窗口</dd><dt><kbd>/</kbd></dt><dd>搜索当前画布中的算子、Tensor 或 Shape</dd><dt><kbd>Enter</kbd></dt><dd>定位下一处匹配；Shift + Enter 定位上一处</dd><dt><kbd>Esc</kbd></dt><dd>清除搜索；在弹窗中关闭弹窗</dd><dt><kbd>?</kbd></dt><dd>打开本使用说明</dd></dl><p class="wb-help-note">性能与显存结果用于规划和架构理解。算子图表示逻辑依赖，并非设备上的 kernel trace；解析估计需要使用目标硬件与后端的实测数据校准。所有快捷键在参数输入时停用。</p></div>';
    document.body.append(help);
    function openHelp() { if (!help.open) help.showModal(); }
    helpButton.addEventListener('click', openHelp);
    help.querySelector('button').addEventListener('click', () => help.close());
    help.addEventListener('close', () => helpButton.focus({ preventScroll: true }));
    help.addEventListener('click', event => {
      if (event.target !== help) return;
      const box = help.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) help.close();
    });

    function visible(element) { return !element.closest('[hidden]') && getComputedStyle(element).display !== 'none'; }
    function currentCanvas() { return [...stage.querySelectorAll('.deck-slide > svg')].find(visible) || null; }
    function dimensions(svg) {
      const box = svg.viewBox?.baseVal;
      return { width: box?.width || 1600, height: box?.height || 960 };
    }
    function applyZoom(preserveCenter = false) {
      if (!state.svg || !state.slide) return;
      const { width, height } = dimensions(state.svg);
      const slide = state.slide;
      const previous = state.svg.getBoundingClientRect();
      const slideBox = slide.getBoundingClientRect();
      const centerX = previous.width ? (slideBox.left + slide.clientWidth / 2 - previous.left) / previous.width : .5;
      const centerY = previous.height ? (slideBox.top + slide.clientHeight / 2 - previous.top) / previous.height : .5;
      const padding = parseFloat(getComputedStyle(slide).paddingLeft) * 2;
      if (state.mode === 'fit') state.zoom = Math.max(.1, Math.min((slide.clientWidth - padding) / width, (slide.clientHeight - padding) / height, 1.25));
      else if (state.mode === 'readable') state.zoom = Math.max(.85, Math.min((slide.clientWidth - padding) / width, 1));
      state.svg.classList.add('wb-canvas');
      state.svg.style.setProperty('--wb-canvas-width', `${Math.round(width * state.zoom)}px`);
      state.svg.style.setProperty('--wb-canvas-height', `${Math.round(height * state.zoom)}px`);
      zoomOutput.value = `${Math.round(state.zoom * 100)}%`;
      zoomOutput.textContent = zoomOutput.value;
      fitButton.setAttribute('aria-pressed', String(state.mode === 'fit'));
      actualButton.setAttribute('aria-pressed', String(state.mode !== 'fit' && state.zoom === 1));
      minusButton.disabled = state.mode !== 'fit' && state.zoom <= .2;
      plusButton.disabled = state.zoom >= 2.5;
      if (state.mode === 'fit') slide.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      else if (preserveCenter) slide.scrollTo({ left: Math.max(0, centerX * width * state.zoom - slide.clientWidth / 2), top: Math.max(0, centerY * height * state.zoom - slide.clientHeight / 2), behavior: 'instant' });
    }
    function setZoom(value) {
      state.mode = 'manual';
      state.zoom = Math.max(.2, Math.min(2.5, Math.round(value * 100) / 100));
      applyZoom(true);
    }
    function fit() { state.mode = 'fit'; applyZoom(); }
    minusButton.addEventListener('click', () => setZoom(state.zoom - .15));
    plusButton.addEventListener('click', () => setZoom(state.zoom + .15));
    actualButton.addEventListener('click', () => setZoom(1));
    fitButton.addEventListener('click', fit);

    function normalize(value) { return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
    function searchNodes(svg) {
      const candidates = new Set(svg.querySelectorAll('.df-node,.op,.kv-cell,.kv-tensor,[data-ev-hc],[data-ev-family],.mem-card,.mem-weight-row,.pure-stage'));
      for (const group of svg.querySelectorAll('g')) {
        const children = [...group.children];
        if (children.some(el => el.localName === 'rect') && children.some(el => ['text', 'foreignObject'].includes(el.localName))) candidates.add(group);
      }
      const compact = [...candidates].filter(element => ![...candidates].some(other => other !== element && element.contains(other)));
      for (const element of svg.querySelectorAll('text')) if (!compact.some(candidate => candidate.contains(element))) compact.push(element);
      return compact.filter(element => visible(element) && normalize(element.textContent).length > 0);
    }
    function clearHighlights() {
      state.hits.forEach(element => element.classList.remove('wb-search-match', 'wb-search-current'));
      state.hits = [];
      state.selected = -1;
    }
    function showHit(index, scroll = true) {
      if (!state.hits.length) return;
      state.hits.forEach(element => element.classList.remove('wb-search-current'));
      state.selected = (index + state.hits.length) % state.hits.length;
      const target = state.hits[state.selected];
      target.classList.add('wb-search-current');
      searchCount.textContent = `${state.selected + 1}/${state.hits.length}`;
      searchCount.setAttribute('aria-label', `第 ${state.selected + 1} 处，共 ${state.hits.length} 处匹配`);
      if (scroll) target.scrollIntoView({ block: 'center', inline: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
    function runSearch(scroll = false) {
      clearHighlights();
      state.query = normalize(searchInput.value);
      clearButton.hidden = !searchInput.value;
      if (state.query && state.svg) state.hits = searchNodes(state.svg).filter(element => normalize(element.textContent).includes(state.query));
      state.hits.forEach(element => element.classList.add('wb-search-match'));
      previousButton.disabled = nextButton.disabled = !state.hits.length;
      searchCount.textContent = state.query ? `0/${state.hits.length}` : '';
      searchCount.setAttribute('aria-label', state.query ? `${state.hits.length} 处匹配` : '尚未搜索');
      if (state.hits.length) showHit(0, scroll);
    }
    function clearSearch() { clearTimeout(searchTimer); searchInput.value = ''; runSearch(); }
    searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(true), 120); });
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(searchTimer);
        if (state.query !== normalize(searchInput.value)) { runSearch(false); showHit(event.shiftKey ? -1 : 0); }
        else showHit(state.selected + (event.shiftKey ? -1 : 1));
      }
      if (event.key === 'Escape') { event.preventDefault(); clearSearch(); state.slide?.focus({ preventScroll: true }); }
    });
    previousButton.addEventListener('click', () => showHit(state.selected - 1));
    nextButton.addEventListener('click', () => showHit(state.selected + 1));
    clearButton.addEventListener('click', () => { clearSearch(); searchInput.focus(); });

    function refresh() {
      frame = 0;
      const svg = currentCanvas();
      const changed = svg !== state.svg;
      state.svg = svg;
      state.slide = svg?.closest('.deck-slide') || null;
      if (state.slide) {
        state.slide.tabIndex = 0;
        state.slide.setAttribute('aria-label', `${tabs.find(tab => tab.getAttribute('aria-selected') === 'true')?.textContent || '分析'}，可滚动画布`);
        state.slide.setAttribute('data-analysis-canvas', '');
      }
      const selectedTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
      for (const tab of tabs) tab.tabIndex = tab === selectedTab ? 0 : -1;
      const model = document.getElementById('simulation-model');
      const modelLabel = model?.selectedOptions[0]?.textContent || 'LLM';
      footerContext.textContent = `${modelLabel} / ${(selectedTab?.textContent || '').replace(/^\d\s*·\s*/, '')}`;
      if (svg) applyZoom();
      if (changed) { if (state.slide) state.slide.scrollTo({ top: 0, left: 0, behavior: 'instant' }); runSearch(false); }
      else if (state.query) { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(false), 140); }
    }
    function scheduleRefresh() { if (!frame) frame = requestAnimationFrame(refresh); }
    new MutationObserver(scheduleRefresh).observe(stage, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'viewBox'] });
    new MutationObserver(scheduleRefresh).observe(nav, { subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-selected', 'aria-pressed'] });
    if (window.ResizeObserver) new ResizeObserver(scheduleRefresh).observe(stage);
    else window.addEventListener('resize', scheduleRefresh);
    document.getElementById('simulation-model')?.addEventListener('change', scheduleRefresh);
    window.addEventListener('beforeprint', () => state.hits.forEach(element => element.classList.remove('wb-search-match', 'wb-search-current')));
    window.addEventListener('afterprint', () => runSearch(false));
    nav.addEventListener('keydown', event => {
      const current = event.target.closest('[role="tab"][data-page]');
      if (!current) return;
      let index = tabs.indexOf(current);
      if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[index].click();
      tabs[index].focus({ preventScroll: true });
      tabs[index].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    });
    document.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
      if (event.target.closest('input,select,textarea,[contenteditable="true"],[role="textbox"]')) return;
      const pageIndex = ['1', '2', '3', '4'].indexOf(event.key);
      if (pageIndex !== -1 && tabs[pageIndex]) { event.preventDefault(); tabs[pageIndex].click(); tabs[pageIndex].focus({ preventScroll: true }); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(state.zoom + .15); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); setZoom(state.zoom - .15); }
      else if (event.key === '0') { event.preventDefault(); fit(); }
      else if (event.key === '/') { event.preventDefault(); searchInput.focus(); searchInput.select(); }
      else if (event.key === 'Escape') clearSearch();
      else if (event.key === '?') { event.preventDefault(); openHelp(); }
    });
    window.LLMWorkbench = Object.freeze({ fit, setZoom, refresh: scheduleRefresh, notify, clearSearch, toolbar, get zoom() { return state.zoom; }, get mode() { return state.mode; } });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
