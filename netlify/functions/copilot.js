const {paperText,groq,wrap}=require('../lib/ai');
exports.handler=wrap(async b=>{
  if(!b.question)throw{stage:'parse',msg:'No question'};
  const text=await paperText(b.storage_path);
  const answer=await groq([{role:'system',content:'You are REPRO Copilot, a reproducibility assistant. Answer using only the paper below. Clearly separate what the paper states (Reported) from what you infer (Inferred), and name what is Missing. Be concise.'},{role:'user',content:'PAPER:\n'+text+'\n\nQUESTION: '+b.question}],false);
  return {answer};
});
