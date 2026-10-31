(() => {
  'use strict';
  const ids = {flow:'flow-data',cache:'cache-data',weight:'weight-data',pd:'pd-data',ds41:'ds41-data'};
  const select = document.getElementById('dataset');
  const download = document.getElementById('download');
  const raw = document.getElementById('raw');
  const status = document.getElementById('status');
  const requested = new URLSearchParams(location.search).get('dataset');
  if (Object.hasOwn(ids,requested)) select.value = requested;
  let source, current;
  function render() {
    try {
      const element = source.getElementById(ids[select.value]);
      if (!element) throw Error('页面中缺少对应数据集');
      current = JSON.stringify(JSON.parse(element.textContent),null,2);
      raw.textContent = current;
      status.textContent = `${select.options[select.selectedIndex].text} · ${(new TextEncoder().encode(current).length/1024).toFixed(1)} KiB`;
      download.disabled = false;
      const url = new URL(location.href); url.searchParams.set('dataset',select.value); history.replaceState(null,'',url);
    } catch(error) { raw.textContent=error.message; status.textContent='数据读取失败'; download.disabled=true; }
  }
  select.addEventListener('change',render);
  download.addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([current+'\n'],{type:'application/json'}));
    const anchor=document.createElement('a'); anchor.href=url; anchor.download=select.value+'-embedded-data.json'; anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  fetch('glm53_prefill_decode_operator_block_diagram.html').then(response=>{
    if(!response.ok)throw Error('无法读取分析页面：HTTP '+response.status); return response.text();
  }).then(html=>{source=new DOMParser().parseFromString(html,'text/html');render();}).catch(error=>{
    raw.textContent=error.message;status.textContent='请从 HTTP 服务或 GitHub Pages 打开此页';
  });
})();
