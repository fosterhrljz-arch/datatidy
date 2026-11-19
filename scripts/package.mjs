import JSZip from 'jszip';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
let notices='DataTidy — Third-party notices\n\nThe standalone application bundles the following runtime libraries and their dependencies. Build/test tools are also listed for source distribution. Original licenses follow.\n\n';
for(const [path,info] of Object.entries(lock.packages)){
  if(!path)continue;
  let pkg;try{pkg=JSON.parse(await readFile(`${path}/package.json`,'utf8'));}catch{continue;}
  notices+=`\n${'='.repeat(72)}\n${pkg.name} ${pkg.version}\nLicense: ${typeof pkg.license==='string'?pkg.license:JSON.stringify(pkg.license)}\n${pkg.homepage||''}\n`;
  const entries=await readdir(path);for(const name of entries.filter(n=>/^(license|licence|copying|notice)(\.|$)/i.test(n))){try{notices+=`\n${name}\n${await readFile(`${path}/${name}`,'utf8')}\n`;}catch{}}
}
await writeFile('THIRD-PARTY-NOTICES.txt',notices);
const zip=new JSZip(),root=zip.folder('DataTidy');
root.file('DataTidy.html',await readFile('release/DataTidy.html'));
for(const path of ['README.md','THIRD-PARTY-NOTICES.txt','package.json','package-lock.json','.gitignore'])root.file(path,await readFile(path));
for(const dir of ['src','scripts','tests','samples','docs']){
  for(const e of await readdir(dir,{withFileTypes:true})){
    if(!e.isFile()||e.name.startsWith('.')||e.name==='test-cleaned-inventory.xlsx'||e.name==='download-debug.mjs')continue;
    root.file(`${dir}/${e.name}`,await readFile(`${dir}/${e.name}`));
  }
}
const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:9}});
const path='release/DataTidy-v1.0.0.zip';await writeFile(path,bytes);
const sha=createHash('sha256').update(bytes).digest('hex');await writeFile('release/SHA256SUMS.txt',`${sha}  DataTidy-v1.0.0.zip\n`);
// Verify the shipped application is exactly the tested standalone build.
const check=await JSZip.loadAsync(bytes,{checkCRC32:true});
if(!Buffer.from(await check.file('DataTidy/DataTidy.html').async('uint8array')).equals(await readFile('release/DataTidy.html')))throw new Error('Package verification failed.');
console.log(`Packaged and CRC-verified ${path}: ${(bytes.length/1024/1024).toFixed(2)} MB\nSHA-256: ${sha}`);
