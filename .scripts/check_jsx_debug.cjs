const fs=require('fs');
const s=fs.readFileSync('src/components/OnlinePlay.tsx','utf8');
const tagRe=/<(\/)?([A-Za-z][A-Za-z0-9]*)\b([^>]*?)(\/?)>/g;
let m;const stack=[];
while((m=tagRe.exec(s))){
  const isClose=!!m[1];const tag=m[2];const selfClose=!!m[4];const idx=m.index;
  if(selfClose) continue;
  if(isClose){
    const top = stack[stack.length-1];
    if(stack.length===0 || top.tag!==tag){
      console.log('Mismatch closing tag',tag,'at idx',idx);
      console.log('Top of stack:', top);
      const start=Math.max(0, idx-120);
      console.log('Context:', s.substring(start, idx+80).replace(/\n/g,'\\n'));
      process.exit(0);
    } else stack.pop();
  } else { stack.push({tag, idx}); }
}
console.log('No mismatches, top of stack', stack[stack.length-1]);
