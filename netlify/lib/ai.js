const pdf=require('pdf-parse/lib/pdf-parse.js');
const SB='https://zhdrxrpjkzheubxicxwk.supabase.co',KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZHJ4cnBqa3poZXVieGljeHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MDk2MTMsImV4cCI6MjEwNjM4NTYxM30.23yvll7ov9U5HsBpbgFBDWEZmZKkLN5VwG0L7f7aOd8';
const J=(c,o)=>({statusCode:c,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},body:JSON.stringify(o)});
async function paperText(path){
  if(!path||/\.\./.test(path))throw{stage:'supabase',msg:'Missing or invalid storage_path'};
  let r;
  for(let i=0;i<3;i++){
    try{r=await fetch(SB+'/storage/v1/object/authenticated/papers/'+encodeURIComponent(path),{headers:{apikey:KEY,Authorization:'Bearer '+KEY},signal:AbortSignal.timeout(8000)});if(r.status<500)break}catch(e){}
    await new Promise(s=>setTimeout(s,800*(i+1)));
  }
  if(!r||!r.ok)throw{stage:'supabase',msg:'Could not download paper (status '+(r&&r.status)+')'};
  const buf=Buffer.from(await r.arrayBuffer());
  if(!buf.slice(0,1024).includes('%PDF-'))throw{stage:'parse',msg:'Downloaded file is not a PDF ('+buf.length+' bytes, starts with "'+buf.slice(0,20).toString().replace(/\s+/g,' ')+'")'};
  let t='';
  try{t=(await pdf(buf)).text}catch(e1){
    try{const u=await import('unpdf');const d=await u.getDocumentProxy(new Uint8Array(buf));t=(await u.extractText(d,{mergePages:true})).text}
    catch(e2){throw{stage:'parse',msg:'Could not read this PDF ('+e1.message+'). Try re-saving it via Print to PDF and upload again.'}}
  }
  if(!t.trim())throw{stage:'parse',msg:'No readable text in PDF (scanned?)'};
  return t.slice(0,24000);
}
async function groqCall(messages,json){
  if(!process.env.GROQ_API_KEY)throw{stage:'ai',msg:'GROQ_API_KEY is not set in Netlify'};
  const model=process.env.GROQ_MODEL||'llama-3.3-70b-versatile';
  for(let i=0;i<3;i++){
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.GROQ_API_KEY},body:JSON.stringify({model,messages,temperature:0.1,...(json?{response_format:{type:'json_object'}}:{})})});
    if(r.ok)return (await r.json()).choices[0].message.content;
    if(![429,500,503].includes(r.status)||i==2)throw{stage:'ai',msg:'Groq '+r.status+' ('+model+'): '+(await r.text()).slice(0,200)};
    await new Promise(s=>setTimeout(s,1500*(i+1)));
  }
}

async function geminiCall(messages,json){
  const key=process.env.GEMINI_API_KEY;
  if(!key)throw{stage:'ai',msg:'No API key: set GEMINI_API_KEY (or GROQ_API_KEY) in Netlify and redeploy'};
  const model=process.env.GEMINI_MODEL||'gemini-3.8-flash';
  const sys=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
  const body={contents:messages.filter(m=>m.role!=='system').map(m=>({role:'user',parts:[{text:m.content}]})),generationConfig:{temperature:0.1,...(json?{responseMimeType:'application/json'}:{})}};
  if(sys)body.systemInstruction={parts:[{text:sys}]};
  for(let i=0;i<4;i++){
    const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body)});
    if(r.ok){const d=await r.json();const t=d.candidates&&d.candidates[0]&&d.candidates[0].content&&d.candidates[0].content.parts.map(p=>p.text||'').join('');if(!t)throw{stage:'ai',msg:'Gemini returned no text'};return t}
    if(![429,500,503].includes(r.status)||i==3)throw{stage:'ai',msg:'Gemini '+r.status+' ('+model+'): '+(await r.text()).slice(0,200)};
    await new Promise(s=>setTimeout(s,1500*(i+1)));
  }
}
const groq=(m,j)=>process.env.GROQ_API_KEY?groqCall(m,j):geminiCall(m,j);
const wrap=fn=>async ev=>{if(ev.httpMethod==='OPTIONS')return J(200,{});try{return J(200,await fn(JSON.parse(ev.body||'{}')))}catch(e){return J(500,{stage:e.stage||'ai',error:e.msg||e.message||String(e)})}};
module.exports={paperText,groq,wrap};
