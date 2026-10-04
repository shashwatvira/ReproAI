const {paperText,groq,wrap}=require('../lib/ai');
const PARAMS=['Model','Dataset','Optimizer','Learning rate','Batch size','Epochs','Seed','Hardware','Precision','Momentum','Weight decay','Scheduler','Max sequence length','Warmup steps','Dropout','Software versions'];
const SYS=`You analyse ML papers for reproducibility. Return ONLY JSON:
{"title":str,"summary":{"question":str,"methodology":str,"evaluation":str},"config":[{"param":str,"value":str,"tag":"Reported|Inferred|Missing|NotApplicable","evidence":str,"impact":"Critical|High|Medium|Low","why":str}],"reported_metric":{"name":str,"value":str},"code_available":"Yes|No|Unclear"}
Params, in this order: ${PARAMS.join(', ')}.
Rules:
- summary.question: one concise sentence, max 20 words.
- Reported = the paper explicitly states the value. "evidence" MUST be ONE sentence copied EXACTLY, character for character, from the paper text (max 30 words). Never paraphrase evidence.
- Inferred = you reconstructed it. Explain your reasoning in "why" and leave "evidence" empty. Prefer Missing over guessing. Never invent numbers.
- Missing = not stated; value "Not stated". If the paper explicitly says it is not reported, copy that sentence as "evidence"; otherwise leave evidence empty.
- NotApplicable = the parameter does not exist for the described method (e.g. momentum for AdamW); value "Not applicable". Never use it to hide missing information.
- Software versions counts as Reported only if version numbers are given.
- impact = how strongly the parameter affects reproducing the published result if it is unknown.
- why = one short sentence on why this parameter matters for reproducibility.
- reported_metric = the paper's headline result with unit, e.g. {"name":"accuracy","value":"91.8%"}; value "" if none.
- code_available: Yes if the paper says code is available now, No if not released or only promised, Unclear otherwise.`;
const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function verify(quote,raw){
  const q=norm(quote).split(' ').filter(Boolean);if(q.length<3)return false;
  const T=' '+norm(raw)+' ';
  if(T.includes(' '+q.join(' ')+' '))return true;
  let hit=0,tot=0;
  for(let i=0;i+4<=q.length;i++){tot++;if(T.includes(' '+q.slice(i,i+4).join(' ')+' '))hit++}
  return tot>0&&hit/tot>=0.8;
}
function sectionFor(raw,quote){
  const tk=(quote.match(/[A-Za-z0-9]+/g)||[]).slice(0,6);if(tk.length<3)return '';
  const m=new RegExp(tk.join('\\W+'),'i').exec(raw);if(!m)return '';
  const lines=raw.slice(0,m.index).split('\n');
  for(let i=lines.length-1;i>=0;i--){const l=lines[i].trim();if(l.length<80&&/^(\d+(\.\d+)*\.?|[IVX]+\.)\s+\S/.test(l))return l}
  return '';
}
function post(d,raw){
  let claimed=0,verified=0;
  const by={};(d.config||[]).forEach(c=>{if(c&&c.param)by[c.param]=c});
  d.config=PARAMS.map(p=>{
    const c=by[p]||{param:p,value:'Not stated',tag:'Missing'};
    c.tag=['Reported','Inferred','Missing','NotApplicable'].includes(c.tag)?c.tag:'Missing';
    c.value=c.value==null?'':String(c.value);
    let ev=String(c.evidence||'').trim();c.ev_ok=false;c.section='';
    if(ev){claimed++;if(verify(ev,raw)){verified++;c.ev_ok=true;c.section=sectionFor(raw,ev)}else{c.note='Quote not found in paper text';ev=''}}
    if(c.tag==='Reported'&&!c.ev_ok){c.tag='Inferred';c.note='No supporting quote found in the paper text'}
    c.evidence=ev;return c;
  });
  d.summary=d.summary||{question:'',methodology:'',evaluation:''};
  d.evidence_stats={claimed,verified};
  return d;
}
exports.handler=wrap(async b=>{
  const text=await paperText(b.storage_path);
  const out=await groq([{role:'system',content:SYS},{role:'user',content:'PAPER TEXT:\n'+text}],true);
  let d;try{d=JSON.parse(out)}catch(e){throw{stage:'parse',msg:'AI returned invalid JSON'}}
  return post(d,text);
});
exports._post=post;
