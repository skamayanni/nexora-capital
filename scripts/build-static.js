import { mkdir, readdir, copyFile, cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const out=resolve(root,'dist');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const name of await readdir(root)) {
  if(/^[a-z-]+\.html$/.test(name)) await copyFile(resolve(root,name),resolve(out,name));
}
for(const name of ['css','js','images']) await cp(resolve(root,name),resolve(out,name),{recursive:true});
console.log('Built public HTML and assets in dist/. Server code and databases are excluded.');
