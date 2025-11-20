const fs=require('fs');
const s=fs.readFileSync('src/components/OnlinePlay.tsx','utf8');
let i=0;const stack=[];
while(i<s.length){
  const c=s[i];
  if(c==='<' && s[i+1] && /[A-Za-z\/] /.test(s[i+1])){
    // start of tag or closing tag
    const start=i;
    let inSingle=false,inDouble=false,inBrace=0, j=i+1;
    while(j<s.length){
      const ch=s[j];
      if(ch==="'" && !inDouble && inBrace===0) inSingle=!inSingle;
      else if(ch==='"' && !inSingle && inBrace===0) inDouble=!inDouble;
      else if(ch==='{' && !inSingle && !inDouble) inBrace++;
      else if(ch==='}' && !inSingle && !inDouble && inBrace>0) inBrace--;
      else if(ch==='>' && !inSingle && !inDouble && inBrace===0) break;
      j++;
    }
    if(j>=s.length) { console.log('Unterminated tag starting at',start); break }
    const tagText=s.slice(i+1,j).trim();
    const isClose=tagText.startsWith('/');
    const cleaned= isClose? tagText.slice(1).trim() : tagText;
    // get tagName as first token before space or >
    const m=cleaned.match(/^([A-Za-z][A-Za-z0-9]*)/);
    const tagName = m ? m[1] : null;
    const selfClose = cleaned.endsWith('/');
    if(!tagName){ i=j+1; continue }
    if(selfClose){ /* do nothing */ }
    else if(isClose){
      const top=stack.pop();
      if(!top || top.tag!==tagName){
        console.log('Mismatch closing',tagName,'at',i,'expected', top?top.tag:null);
        console.log('Context:', s.slice(Math.max(0,i-120), Math.min(s.length,i+80)).replace(/\n/g,'\\n'));
        process.exit(0);
      }
    } else {
      stack.push({tag:tagName, idx:start});
    }
    i=j+1; continue;
  }
  i++;
}
if(stack.length){console.log('Unclosed tag at end', stack[stack.length-1]);} else {console.log('All JSX tags balanced')}
