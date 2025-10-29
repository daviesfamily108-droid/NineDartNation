const fs = require('fs');
const s = fs.readFileSync('server/server.js','utf8');
let bal = 0;
let line = 1;
let inS=false,inD=false,inB=false,inLine=false,inBlock=false,esc=false;
for (let i=0;i<s.length;i++){
  const ch = s[i];
  if (ch === '\n'){
    if (inLine) inLine=false;
    line++;
    esc=false;
    continue;
  }
  if (inLine){ continue; }
  if (inBlock){ if (ch==='*' && s[i+1]==='/' ){ inBlock=false; i++; continue; } else { continue; } }
  if (!inS && !inD && !inB && ch==='/' && s[i+1]==='/'){ inLine=true; i++; continue; }
  if (!inS && !inD && !inB && ch==='/' && s[i+1]==='*'){ inBlock=true; i++; continue; }
  if (!inD && !inB && ch==="'" && !esc){ inS=!inS; continue; }
  if (!inS && !inB && ch==='"' && !esc){ inD=!inD; continue; }
  if (!inS && !inD && ch==='`' && !esc){ inB=!inB; continue; }
  if ((inS||inD||inB) && ch==='\\' && !esc){ esc=true; continue; }
  if (esc){ esc=false; continue; }
  if (!inS && !inD && !inB && !inLine && !inBlock){
    if (ch==='{') { bal++; }
    else if (ch==='}') { bal--; if (bal<0){ console.log('NEGATIVE at line', line); process.exit(0); } }
  }
}
console.log('FINAL_BALANCE', bal);
