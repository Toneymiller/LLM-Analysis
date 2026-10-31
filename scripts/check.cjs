const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'glm53_prefill_decode_operator_block_diagram.html'),'utf8');
let scripts=0, data=0;
for(const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if(/type="application\/json"/.test(match[1])) { JSON.parse(match[2]); data++; }
  else if(!/\bsrc=/.test(match[1])) { new vm.Script(match[2]); scripts++; }
}
const assets = fs.readdirSync(path.join(root,'assets'));
for(const file of assets) if(file.endsWith('.js')) new vm.Script(fs.readFileSync(path.join(root,'assets',file),'utf8'),{filename:file});
for(const file of ['index.html','glm53_prefill_decode_operator_block_diagram.html',...assets.map(file=>'assets/'+file)]) {
  const content=fs.readFileSync(path.join(root,file),'utf8');
  if(/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) throw Error('Credential pattern found in '+file);
}
for(const match of source.matchAll(/(?:src|href)="(assets\/[^"?#]+)(?:\?[^"#]*)?"/g)) {
  if(!fs.existsSync(path.join(root,match[1]))) throw Error('Missing asset: '+match[1]);
}
for(const page of ['index.html','sources.html','glm53_prefill_decode_operator_block_diagram.html']) {
  const html=fs.readFileSync(path.join(root,page),'utf8');
  for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if(/^(https?:|data:|#)/.test(match[1])) continue;
    const local=match[1].split(/[?#]/)[0];
    if(local && !fs.existsSync(path.join(root,local))) throw Error(`Broken local link in ${page}: ${local}`);
  }
}
console.log(`Validated ${scripts} inline scripts, ${data} JSON datasets, ${assets.length} assets; credential scan passed.`);
