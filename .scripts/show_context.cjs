const fs=require('fs');
const path='src/components/OnlinePlay.tsx';
const s=fs.readFileSync(path,'utf8');
const idx=58283;
let line=1;let col=1;for(let i=0;i<idx;i++){if(s[i]=='\n'){line++;col=1}else col++}
console.log('index',idx,'line',line,'col',col);
const lines=s.split('\n');
for(let i=Math.max(0,line-6);i<Math.min(lines.length,line+5);i++){console.log((i+1)+': '+lines[i])}
