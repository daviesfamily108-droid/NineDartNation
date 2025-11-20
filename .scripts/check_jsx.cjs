const fs=require('fs');
const path='src/components/OnlinePlay.tsx';
const s=fs.readFileSync(path,'utf8');
const tagRe=/<(\/)?([A-Za-z][A-Za-z0-9]*)\b([^>]*?)(\/?)>/g;
let m;const stack=[];
while((m=tagRe.exec(s))){
  const isClose=!!m[1];
  const tag=m[2];
  const selfClose=!!m[4];
  const idx=m.index;
  if(selfClose) continue;
  if(isClose){
    if(stack.length===0 || stack[stack.length-1].tag!==tag){
      console.log('Mismatch closing tag',tag,'at',idx);
      process.exit(0);
    } else {
      stack.pop();
    }
  } else {
    stack.push({tag,idx});
  }
}
if(stack.length){
  console.log('Unclosed tag at end:', stack[stack.length-1]);
} else {
  console.log('All JSX tags balanced');
}
