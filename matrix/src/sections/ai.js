/* ►► SECTION: AI ◄◄ In-browser LLM advisor (WebLLM)
 *
 * Everything runs client-side: the WebLLM library is dynamically imported from a
 * CDN, model weights stream from public (ungated) Hugging Face repos with NO
 * login/token, and the browser caches the weights so subsequent use is offline.
 * Nothing is bundled into matrix.html and no data ever leaves the machine.
 *
 * Pieces:
 *   - Model picker  (aiShowModelPicker)  — curated, credential-free shortlist
 *   - Engine load   (aiLoadModel)        — download + init with progress
 *   - Scope menu    (aiOpenScope)        — pick what data to load (context budget)
 *   - Data context  (aiBuildContext)     — scope-aware grounded data + legend
 *   - Chat advisor  (aiStartChat)        — streaming single-/multi-turn Q&A
 *
 * The whole AI surface degrades gracefully: no WebGPU → disabled with a notice;
 * offline → picker still lists curated info, just can't verify/download.
 */
const AI_WEBLLM_CDN='https://esm.run/@mlc-ai/web-llm';
const AI_MODEL_KEY='eim_ai_model';   // localStorage: last chosen model id

// Curated, credential-free models. `id` MUST match an entry in WebLLM's
// prebuiltAppConfig.model_list. dlGB/vramGB are approximate (q4f16_1 quant);
// vramGB is overwritten with the registry's exact figure when verified.
const AI_MODELS=[
  {id:'Llama-3.2-1B-Instruct-q4f16_1-MLC', name:'Llama 3.2 1B', params:'1.2B', dlGB:0.9, vramGB:1.1, note:t('Fastest. Best for short summaries on modest hardware.')},
  {id:'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name:'Qwen2.5 1.5B', params:'1.5B', dlGB:1.0, vramGB:1.6, note:t('Strong small all-rounder.')},
  {id:'Llama-3.2-3B-Instruct-q4f16_1-MLC', name:'Llama 3.2 3B', params:'3.2B', dlGB:1.9, vramGB:2.3, note:t('Noticeably better reasoning, still light.')},
  {id:'Qwen2.5-3B-Instruct-q4f16_1-MLC', name:'Qwen2.5 3B', params:'3.1B', dlGB:1.9, vramGB:2.5, note:t('Great quality-to-size balance (recommended).')},
  {id:'Phi-3.5-mini-instruct-q4f16_1-MLC', name:'Phi-3.5 mini', params:'3.8B', dlGB:2.2, vramGB:3.7, note:t('Best writing quality; needs more memory.')},
];

// Static role + glossary prepended to every system prompt. The model knows HR
// concepts in general but NOT this tool's specific scales/labels, so spell them
// out. Keep this tight — it shares the (~4k-token) context with the data.
const AI_ROLE='You are an HR and R&D portfolio advisor embedded in a talent-management tool called Matrix. '
  +'Give concise, practical, specific advice grounded ONLY in the data below — use the real names. '
  +'If the data needed to answer is missing, say so plainly rather than inventing it. '
  +'Prefer short paragraphs and bullet points.';

const AI_LEGEND='=== DATA LEGEND (how to read the data) ===\n'
  +'- Grade: career grade, integer 1-11; higher = more senior.\n'
  +'- Comparatio: pay vs salary-band midpoint; ~1.0 at midpoint, <1 below, >1 above.\n'
  +'- Potential (GTP): Low / Medium / High — growth potential, not current performance.\n'
  +'- Nine-box: performance (Low->High) x potential (Low->High). The 9 cells:\n'
  +'    RISK (lowperf/lowpot), EFFECTIVE CONTRIBUTOR (mod/low), EXPERT (high/low),\n'
  +'    UNDER PERFORMER (low/mod), CORE PLAYER (mod/mod), HIGH PERFORMER (high/mod),\n'
  +'    ENIGMA (low/high), FUTURE STAR (mod/high), CONSISTENT STAR (high/high).\n'
  +'    "nine-box history" lists the cell per year = the person\'s trajectory.\n'
  +'- Skills: name(level/5); level 1=novice ... 5=expert. [gap:..] flags a known gap.\n'
  +'- Reviews: per-year performance rating + comments.\n'
  +'- Succession: named successor + readiness timeframe + capability gaps.\n'
  +'- Allocations: which projects a person is staffed on (with budget line).\n'
  +'- Projects: status, sector, gate (stage-gate), ETA, impact (EUR value), plan cost,\n'
  +'    and matrix position (effort/impact/visibility/enabler scored ~0-10).\n'
  +'- DISC: behavioural profile placement.';

let _aiSelectedModel='';   // model id chosen in the picker
let _aiRegistryIds=null;   // Set of ids from the live registry, or null if unchecked
let _aiWebllm=null;        // cached WebLLM library module
let _aiEngine=null;        // loaded MLCEngine instance
let _aiEngineModel='';     // id of the engine currently loaded
let _aiLoading=false;      // a download/init or a generation is in flight
let _aiMessages=[];        // chat turns: [{role:'user'|'assistant', content}]
let _aiScope={engIds:[],projIds:[]};  // chat context selection (ids as strings)
let _aiCellMap=null;       // cached nine-box cell key -> label
const AI_STALL_MS=45000;   // no fetch progress for this long → show stall hint
let _aiLoadStartAt=0;      // ms timestamp the current load began
let _aiLastProgressAt=0;   // ms timestamp progress last changed
let _aiLastSig='';         // last progress signature (pct|text) to detect stalls
let _aiStallTimer=null;    // interval id for the stall watchdog
const AI_HISTORY_MAX=6;    // max prior turns sent to the model (bounds prompt size/VRAM)
const AI_CHAT_KEY='eim_ai_chat';  // sessionStorage: conversation to restore after a reload
// Conservative load opts to survive TDR-prone GPUs: a small prefill_chunk_size
// splits prompt processing into many short GPU dispatches so no single one runs
// past Windows' ~2s TDR (which, with chrome's exit_on_context_lost, removes the
// device on the longer follow-up turn). context_window_size also caps KV-cache
// VRAM. Some models reject these → aiReloadModel falls back to defaults.
const AI_SAFE_CHAT_OPTS={context_window_size:4096, prefill_chunk_size:256};

function aiHasWebGPU(){ return typeof navigator!=='undefined' && !!navigator.gpu; }
function aiSavedModel(){ try{return localStorage.getItem(AI_MODEL_KEY)||'';}catch(e){return '';} }
function aiSetSavedModel(id){ try{localStorage.setItem(AI_MODEL_KEY,id);}catch(e){} }

// Loads only the library JS (no weights). Cached after first call.
function aiLoadLib(){
  if(_aiWebllm)return Promise.resolve(_aiWebllm);
  return import(AI_WEBLLM_CDN).then(function(m){_aiWebllm=m;return m;});
}

function aiUpdateButton(){
  var el=document.getElementById('ai-btn'); if(!el)return;
  el.textContent=_aiLoading?'🧠 …':(_aiEngine?'🧠 AI ✓':'🧠 AI');
}

/* ── Model picker ────────────────────────────────────────────────── */
function aiModelStatHTML(m){
  var base='⬇ ~'+m.dlGB.toFixed(1)+t(' GB download · 🖥 ~')+m.vramGB.toFixed(1)+t(' GB VRAM');
  if(!_aiRegistryIds)return base;
  return base+(_aiRegistryIds.has(m.id)
    ?' · <span style="color:var(--accent)">'+t('✓ available')+'</span>'
    :' · <span style="color:var(--danger)">'+t('unavailable')+'</span>');
}

function aiShowModelPicker(){
  // Only one AI dialog at a time — otherwise a lower-z dialog opens hidden behind
  // a higher-z one (e.g. picker z920 behind chat z930), so it looks like nothing
  // happened and the model "can't be changed".
  aiCloseScope(); aiCloseChat(); aiClosePreflight();
  var existing=document.getElementById('ai-model-dlg');
  if(existing)existing.remove();

  var gpuOk=aiHasWebGPU();
  var saved=aiSavedModel();
  var rows=AI_MODELS.map(function(m){
    var isLoaded=(_aiEngineModel===m.id);
    var btnLabel=isLoaded?t('Loaded ✓'):(saved===m.id?t('Use (cached)'):t('Select'));
    return ''
    +'<div class="ai-model-row" data-id="'+m.id+'" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'
      +'<div style="flex:1">'
        +'<div style="font-size:13px;font-weight:700;color:var(--text)">'+escH(m.name)
          +' <span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--accent2)">'+escH(m.params)+' '+t('params')+'</span></div>'
        +'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+escH(m.note)+'</div>'
        +'<div class="ai-model-stat" style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);margin-top:3px">'+aiModelStatHTML(m)+'</div>'
      +'</div>'
      +'<button class="primary" style="padding:5px 12px;font-size:11px;white-space:nowrap"'
        +((gpuOk&&!_aiLoading)?'':' disabled')
        +' onclick="aiSelectModel(\''+m.id+'\')">'+btnLabel+'</button>'
    +'</div>';
  }).join('');

  var warn=gpuOk?'':
    '<div style="background:rgba(241,67,53,.1);border:1px solid var(--danger);border-radius:6px;padding:8px 10px;font-size:11px;color:var(--danger)">'
    +t('⚠ This browser has no WebGPU support, so in-browser AI can’t run here. Try a recent Chrome or Edge.')+'</div>';

  var chatBtn=_aiEngine
    ?'<button class="primary" style="flex:1" onclick="aiOpenChat()">'+t('💬 Open chat')+'</button>'
    :'';

  var dlg=document.createElement('div');
  dlg.id='ai-model-dlg';
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:920;display:flex;align-items:center;justify-content:center';
  dlg.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px 24px;width:min(540px,95vw);max-height:85vh;display:flex;flex-direction:column;gap:12px;box-shadow:0 16px 48px rgba(0,0,0,.8)">'
    +'<div style="display:flex;align-items:center;gap:8px">'
      +'<h2 style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);flex:1">🧠 '+t('AI MODEL')+'</h2>'
      +'<button onclick="aiCloseModelPicker()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px">✕</button>'
    +'</div>'
    +'<div style="font-size:11px;color:var(--muted);line-height:1.6">'
      +t('Runs entirely in your browser — no login, no API key, no data leaves this machine. The model downloads once (needs internet), then works offline.')
    +'</div>'
    +warn
    +'<div id="ai-model-list" style="overflow-y:auto">'+rows+'</div>'
    +'<div id="ai-model-foot" style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--dim)">'+t('Checking model availability…')+'</div>'
    +(chatBtn?('<div style="display:flex;gap:8px">'+chatBtn+'</div>'):'')
    +'</div>';
  document.body.appendChild(dlg);

  aiVerifyAvailability();
}

function aiCloseModelPicker(){
  var d=document.getElementById('ai-model-dlg'); if(d)d.remove();
}

// Cross-check curated ids against the live WebLLM registry (non-blocking).
function aiVerifyAvailability(){
  function setFoot(msg){ var f=document.getElementById('ai-model-foot'); if(f)f.textContent=msg; }
  if(_aiRegistryIds){ aiAnnotateAvailability(); setFoot(t('✓ verified ({n} models in registry)',{n:_aiRegistryIds.size})); return; }
  aiLoadLib().then(function(webllm){
    var list=(webllm.prebuiltAppConfig&&webllm.prebuiltAppConfig.model_list)||[];
    _aiRegistryIds=new Set(list.map(function(x){return x.model_id;}));
    list.forEach(function(x){
      var m=AI_MODELS.find(function(mm){return mm.id===x.model_id;});
      if(m&&x.vram_required_MB)m.vramGB=x.vram_required_MB/1024;
    });
    aiAnnotateAvailability();
    setFoot(t('✓ verified against WebLLM registry ({n} models)',{n:_aiRegistryIds.size}));
  }).catch(function(){
    setFoot(t('Offline — showing approximate sizes (availability unverified)'));
  });
}

function aiAnnotateAvailability(){
  if(!_aiRegistryIds)return;
  AI_MODELS.forEach(function(m){
    var row=document.querySelector('.ai-model-row[data-id="'+m.id+'"]');
    if(!row)return;
    var stat=row.querySelector('.ai-model-stat');
    if(stat)stat.innerHTML=aiModelStatHTML(m);
  });
}

/* ── Engine load (download + init) ───────────────────────────────── */
function aiSelectModel(id){
  if(_aiLoading)return;
  if(!aiHasWebGPU()){alert(t('WebGPU is not available in this browser, so the model can’t run here.'));return;}
  if(_aiEngineModel===id&&_aiEngine){aiOpenChat();return;}  // already loaded
  _aiSelectedModel=id;
  var m=AI_MODELS.find(function(x){return x.id===id;});
  aiPreflight(m).then(function(pf){ aiShowPreflight(id,m,pf); });
}

// ── Pre-flight GPU check ──────────────────────────────────────────
// Browsers don't expose total VRAM, so this is best-effort: confirm a real
// (non-software) adapter exists, surface the GPU + key limits, and flag a large
// model against a modest storage-buffer limit. Catches the common failure modes
// (no/disabled GPU, software fallback) BEFORE a multi-GB download + crash.
function aiPreflight(model){
  if(!navigator.gpu)return Promise.resolve({level:'block',reasons:[t('This browser has no WebGPU support.')]});
  return navigator.gpu.requestAdapter({powerPreference:'high-performance'}).then(function(adapter){
    if(!adapter)return {level:'block',reasons:[t('No WebGPU adapter — your GPU/driver may be disabled or blocklisted. Check that hardware acceleration is on.')]};
    var infoP=adapter.info?Promise.resolve(adapter.info):(adapter.requestAdapterInfo?adapter.requestAdapterInfo():Promise.resolve({}));
    return Promise.resolve(infoP).then(function(info){
      info=info||{};
      var lim=adapter.limits||{};
      var bindGB=(lim.maxStorageBufferBindingSize||0)/1073741824;
      var bufGB=(lim.maxBufferSize||0)/1073741824;
      var gpuName=[info.vendor,info.architecture,info.device,info.description].filter(Boolean).join(' ').trim()||t('GPU detected (name hidden by browser)');
      var base={gpu:gpuName,bufGB:bufGB,bindGB:bindGB};
      if(adapter.isFallbackAdapter)
        return Object.assign(base,{level:'block',reasons:[t('Only a software (CPU) WebGPU adapter is available — the model would be unusably slow or crash. Update your GPU driver / enable hardware acceleration.')]});
      // The REAL test: actually create a device + command queue. requestAdapter
      // alone does NOT catch DXGI_ERROR_DEVICE_REMOVED — requestDevice does. We
      // create a throwaway device, confirm it isn't immediately lost, destroy it.
      return adapter.requestDevice().then(function(device){
        return new Promise(function(resolve){
          var settled=false;
          device.lost.then(function(di){ if(!settled){settled=true;resolve({lost:true,info:di});} });
          setTimeout(function(){ if(!settled){settled=true;resolve({lost:false});} },300);
        }).then(function(r){
          try{device.destroy();}catch(x){}
          if(r.lost)
            return Object.assign(base,{level:'block',reasons:[
              t('The GPU created a device then immediately lost it: {msg}.',{msg:((r.info&&r.info.message)||t('device lost'))}),
              t('Almost always an out-of-date/unstable graphics driver. Update your GPU driver, then fully quit and reopen the browser.')]});
          var reasons=[],level='ok';
          if(model&&model.vramGB&&model.vramGB>4.5&&bindGB&&bindGB<1.0){level='warn';reasons.push(t('Large model with a modest max storage-buffer ({gb} GB) — may fail to load. A smaller model is safer.',{gb:bindGB.toFixed(2)}));}
          return Object.assign(base,{level:level,reasons:reasons});
        });
      }).catch(function(err){
        return Object.assign(base,{level:'block',reasons:[
          t('Your GPU could not create a working device: {msg}',{msg:((err&&err.message)||err)}),
          t('This is a graphics-driver / D3D12 failure (DXGI_ERROR_DEVICE_REMOVED), not a Matrix issue.'),
          t('Fix: update your GPU driver, fully quit and reopen the browser, then open chrome://gpu — WebGPU should read "Hardware accelerated".')]});
      });
    });
  }).catch(function(err){
    return {level:'warn',reasons:[t('Could not fully query the GPU ({msg}). You can still try.',{msg:((err&&err.message)||err)})]};
  });
}

function aiShowPreflight(id,m,pf){
  var existing=document.getElementById('ai-preflight-dlg'); if(existing)existing.remove();
  var color=pf.level==='block'?'var(--danger)':(pf.level==='warn'?'var(--warn)':'var(--accent)');
  var verdict=pf.level==='block'?t('✕ This model can’t run here'):(pf.level==='warn'?t('⚠ Might be risky'):t('✓ Looks good to go'));
  var reasons=(pf.reasons&&pf.reasons.length)
    ?'<ul style="margin:6px 0 0 16px;padding:0;font-size:11px;color:var(--muted);line-height:1.6">'+pf.reasons.map(function(r){return '<li>'+escH(r)+'</li>';}).join('')+'</ul>':'';
  var limits=(pf.bindGB!=null)?t('max buffer {a} GB · max storage-buffer {b} GB',{a:pf.bufGB.toFixed(2),b:pf.bindGB.toFixed(2)}):t('limits unavailable');
  var btns;
  if(pf.level==='block')
    btns='<button class="sm" onclick="aiClosePreflight();aiShowModelPicker()">'+t('Pick another model')+'</button>'
        +'<button onclick="aiClosePreflight()">'+t('Close')+'</button>';
  else if(pf.level==='warn')
    btns='<button class="primary" onclick="aiProceedLoad(\''+id+'\')">'+t('Load anyway')+'</button>'
        +'<button class="sm" onclick="aiClosePreflight();aiShowModelPicker()">'+t('Pick smaller')+'</button>'
        +'<button onclick="aiClosePreflight()">'+t('Cancel')+'</button>';
  else
    btns='<button class="primary" onclick="aiProceedLoad(\''+id+'\')">'+t('Download & load ▶')+'</button>'
        +'<button onclick="aiClosePreflight()">'+t('Cancel')+'</button>';

  var dlg=document.createElement('div');
  dlg.id='ai-preflight-dlg';
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:935;display:flex;align-items:center;justify-content:center';
  dlg.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px 24px;width:min(460px,95vw);display:flex;flex-direction:column;gap:10px;box-shadow:0 16px 48px rgba(0,0,0,.8)">'
    +'<h2 style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent)">🔎 '+t('GPU PRE-FLIGHT')+'</h2>'
    +'<div style="font-size:11px;color:var(--muted);line-height:1.7">'
      +'<div><b style="color:var(--text)">'+t('GPU:')+'</b> '+escH(pf.gpu||t('unknown'))+'</div>'
      +'<div><b style="color:var(--text)">'+t('GPU buffer limits (not free VRAM):')+'</b> '+escH(limits)+'</div>'
      +'<div><b style="color:var(--text)">'+t('Model:')+'</b> '+escH(m?m.name:id)+' — ~'+(m?m.vramGB.toFixed(1):'?')+t(' GB VRAM, ~')+(m?m.dlGB.toFixed(1):'?')+t(' GB download')+'</div>'
    +'</div>'
    +'<div style="border:1px solid '+color+';border-radius:6px;padding:8px 10px">'
      +'<div style="font-size:12px;font-weight:700;color:'+color+'">'+verdict+'</div>'+reasons
    +'</div>'
    +'<div style="font-size:9px;color:var(--dim);font-family:IBM Plex Mono,monospace">'+t('Browsers don’t expose total VRAM — this is a best-effort check.')+'</div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end">'+btns+'</div>'
    +'</div>';
  document.body.appendChild(dlg);
}

function aiClosePreflight(){ var d=document.getElementById('ai-preflight-dlg'); if(d)d.remove(); }
function aiProceedLoad(id){ aiClosePreflight(); aiSetSavedModel(id); aiLoadModel(id); }

function aiRenderProgress(p,msg){
  aiUpdateButton();
  // Any change in pct OR text (e.g. the MB counter) counts as real progress and
  // resets the stall clock — a flat rounded % during a big shard isn't a stall.
  var sig=p+'|'+msg;
  if(sig!==_aiLastSig){ _aiLastSig=sig; _aiLastProgressAt=Date.now(); }
  var foot=document.getElementById('ai-model-foot');
  if(foot){
    if(p<0)      foot.innerHTML='<span style="color:var(--danger)">'+escH(msg)+'</span>';
    else if(p>=1)foot.innerHTML='<span style="color:var(--accent)">✓ '+escH(msg)+'</span>';
    else {
      var el=_aiLoadStartAt?('  ·  '+Math.round((Date.now()-_aiLoadStartAt)/1000)+'s'):'';
      foot.textContent=Math.round(p*100)+'%  ·  '+msg+el;
    }
  }
  var btn=document.querySelector('.ai-model-row[data-id="'+_aiSelectedModel+'"] button');
  if(btn){ if(p>=0&&p<1){btn.textContent=Math.round(p*100)+'%';btn.disabled=true;}
           else if(p>=1)btn.textContent=t('Loaded ✓');
           else {btn.textContent=t('Retry');btn.disabled=false;} }
}

// ── Stall watchdog ────────────────────────────────────────────────
// A hung shard fetch produces no error (no timeout in CreateMLCEngine/reload),
// so surface it: if nothing changes for AI_STALL_MS, tell the user to reload —
// completed shards are cached, so a reload resumes instead of restarting.
function aiStartStallWatch(){
  aiStopStallWatch();
  _aiStallTimer=setInterval(function(){
    if(!_aiLoading){ aiStopStallWatch(); return; }
    var idle=Date.now()-_aiLastProgressAt;
    if(idle>AI_STALL_MS) aiShowStall(Math.round(idle/1000));
  },5000);
}
function aiStopStallWatch(){ if(_aiStallTimer){ clearInterval(_aiStallTimer); _aiStallTimer=null; } }
function aiShowStall(secs){
  var foot=document.getElementById('ai-model-foot'); if(!foot)return;
  foot.innerHTML='<span style="color:var(--warn)">'+t('⚠ No progress for {secs}s — the download may be stalled. Reloading resumes from cached shards.',{secs:secs})+'</span> '
    +'<button class="sm" style="margin-left:6px" onclick="location.reload()">'+t('↻ Reload page')+'</button>';
}

// ONE persistent engine for the whole session. Switching models = reload() into
// this instance. Never call CreateMLCEngine repeatedly — a second call disposes
// the first engine's GPU device ("Object has already been disposed" then "Model
// not loaded" on the next request).
function aiGetEngine(){
  if(_aiEngine)return Promise.resolve(_aiEngine);
  return aiLoadLib().then(function(webllm){
    _aiEngine=new webllm.MLCEngine({
      initProgressCallback:function(r){ aiRenderProgress(r.progress||0, r.text||t('Loading…')); }
    });
    return _aiEngine;
  });
}

// Reload with TDR-safe opts; if the model rejects them (e.g. sliding-window
// models that require a default context), retry with plain defaults. Device-loss
// errors are not retried — the GPU is gone.
function aiReloadModel(engine,id){
  return engine.reload(id,AI_SAFE_CHAT_OPTS).catch(function(err){
    if(aiIsDeviceLost(err))throw err;
    console.warn('[EIM] conservative load opts rejected, retrying with defaults:',err);
    return engine.reload(id);
  });
}

function aiLoadModel(id){
  if(_aiLoading)return;
  _aiLoading=true;
  _aiLoadStartAt=Date.now(); _aiLastSig=''; _aiLastProgressAt=Date.now();
  aiStartStallWatch();
  aiRenderProgress(0,t('Preparing download…'));
  aiGetEngine().then(function(engine){
    return aiReloadModel(engine,id);   // load (or switch) the model into the singleton
  }).then(function(){
    aiStopStallWatch();
    _aiEngineModel=id; _aiLoading=false;
    aiRenderProgress(1,t('Ready'));
    aiRestoreChat(id);   // bring back a conversation that survived a forced reload
    aiOpenChat();
  }).catch(function(err){
    aiStopStallWatch();
    _aiEngineModel=''; _aiLoading=false;
    aiRenderProgress(-1,t('Failed:')+' '+((err&&err.message)||err));
  });
}

/* ── Data context (grounding) ────────────────────────────────────── */
function aiCellLabel(key){
  if(!_aiCellMap){
    _aiCellMap={};
    try{ (typeof _nbCells==='function'?_nbCells():[]).forEach(function(c){_aiCellMap[c.key]=c.label;}); }catch(e){}
  }
  return _aiCellMap[key]||key;
}

function aiNineBoxTrajectory(engUid){
  if(typeof _nineBoxHistory!=='object'||!_nineBoxHistory)return '';
  var parts=[];
  Object.keys(_nineBoxHistory).sort().forEach(function(y){
    var k=_nineBoxHistory[y]&&_nineBoxHistory[y][engUid];
    if(k)parts.push(y+'→'+aiCellLabel(k));
  });
  return parts.join(', ');
}

// Resolve a manager/reportsTo reference (may be an engineer id or free text)
// to a readable name, falling back to the raw value.
function aiResolveEng(ref){
  if(ref==null||ref==='')return '';
  var m=engineers.find(function(x){return String(x.id)===String(ref);});
  return m?m.name:String(ref);
}

// FULL detail for one person, including connected projects (allocations).
function aiPersonDeep(e){
  var ic=e.idcard||{}, L=[];
  L.push('### '+(e.name||'?')+(e.vacant?' (VACANT)':''));
  var basics=[];
  if(e.role)basics.push('role: '+e.role);
  if(ic.seniority&&ic.seniority!==e.role)basics.push('seniority: '+ic.seniority);
  if(ic.grade)basics.push('grade: '+ic.grade+'/11');
  if(ic.comparatio!=null)basics.push('comparatio: '+ic.comparatio);
  if(e.location)basics.push('location: '+e.location);
  if(typeof e.monthlyCost==='number')basics.push('monthlyCost: €'+e.monthlyCost);
  if(ic.contract)basics.push('contract: '+ic.contract);
  if(ic.startdate)basics.push('start: '+ic.startdate);
  if(ic.languages)basics.push('languages: '+ic.languages);
  if(basics.length)L.push(basics.join(' · '));
  var mgmt=[];
  if(ic.reportsTo)mgmt.push('reports to: '+aiResolveEng(ic.reportsTo));
  if(ic.manager&&ic.manager!==ic.reportsTo)mgmt.push('manager: '+aiResolveEng(ic.manager));
  if(mgmt.length)L.push(mgmt.join(' · '));
  var tal=[];
  if(ic.potential)tal.push('potential: '+ic.potential);
  if(ic.mobility)tal.push('mobility: '+ic.mobility);
  var nb=_nineBoxPlacements?_nineBoxPlacements[e.uid]:null;
  if(nb)tal.push('nine-box: '+aiCellLabel(nb));
  var disc=(typeof _discPlacements!=='undefined'&&_discPlacements)?_discPlacements[e.uid]:null;
  if(disc)tal.push('DISC: '+(typeof disc==='object'?JSON.stringify(disc):disc));
  if(tal.length)L.push(tal.join(' · '));
  var traj=aiNineBoxTrajectory(e.uid);
  if(traj)L.push('nine-box history: '+traj);
  if(ic.strengths)L.push('strengths: '+ic.strengths);
  if(ic.devarea)L.push('development areas: '+ic.devarea);
  if(ic.aspirations)L.push('aspirations: '+ic.aspirations);
  if(ic.notes)L.push('notes: '+ic.notes);
  if(ic.nextMove&&(ic.nextMove.position||ic.nextMove.timeline))
    L.push('recommended next move: '+(ic.nextMove.position||'?')+(ic.nextMove.timeline?(' ('+ic.nextMove.timeline+')'):''));
  var s=ic.succession||{};
  if(s.successorId||s.successorFreeText||s.gaps||s.timeframe){
    var succName=s.successorFreeText||'';
    if(s.successorId){var se=engineers.find(function(x){return String(x.id)===String(s.successorId);});if(se)succName=se.name;}
    L.push('succession: successor='+(succName||'—')+(s.timeframe?(' · timeframe '+s.timeframe):'')+(s.gaps?(' · gaps: '+s.gaps):''));
  }
  if((e.skills||[]).length)
    L.push('skills: '+e.skills.map(function(sk){return sk.name+(sk.level?('('+sk.level+'/5)'):'')+(sk.gaps?(' [gap:'+sk.gaps+']'):'');}).join(', '));
  if((ic.reviews||[]).length)
    L.push('reviews: '+ic.reviews.map(function(r){return (r.year||'?')+': '+(r.rating||'?')+(r.comments?(' — '+r.comments):'');}).join(' | '));
  if((ic.cops||[]).length)
    L.push('communities of practice: '+ic.cops.map(function(c){return c.name+(c.goal?(' ('+c.goal+')'):'');}).join(', '));
  var allocs=allocRows.filter(function(r){return String(r.engId)===String(e.id);});
  if(allocs.length){
    var conn=allocs.map(function(r){
      var p=projects.find(function(pp){return String(pp.id)===String(r.projectId);});
      return (p?p.name:(r.projectId?('project#'+r.projectId):'unassigned'))+(r.budgetLine?(' ['+r.budgetLine+']'):'');
    });
    L.push('allocated to: '+conn.join(', '));
  }
  return L.join('\n');
}

// FULL detail for one project, including its allocated team.
function aiProjectDeep(p){
  var L=[];
  L.push('### Project: '+(p.name||'?'));
  var b=[];
  if(p.status)b.push('status: '+p.status);
  if(p.sector)b.push('sector: '+p.sector);
  if(p.gate)b.push('gate: '+p.gate);
  if(p.currentGate)b.push('current gate: '+p.currentGate);
  if(p.eta)b.push('ETA: '+p.eta);
  if(p.impactEur!=null)b.push('impact: €'+p.impactEur);
  if(p.planCost!=null)b.push('plan cost: €'+p.planCost);
  if(b.length)L.push(b.join(' · '));
  L.push('matrix position: effort/x='+p.x+', impact/y='+p.y+', visibility='+p.vis+', enabler='+p.ena);
  if(p.note)L.push('note: '+p.note);
  if((p.risks||[]).length)
    L.push('risks: '+p.risks.map(function(r){return (r.desc||'?')+' (sev'+r.sev+'/occ'+r.occ+'/det'+r.det+', '+(r.status||'open')+(r.owner?(', owner '+r.owner):'')+')';}).join(' | '));
  if((p.milestones||[]).length)
    L.push('milestones: '+p.milestones.map(function(m){return (m.name||'?')+(m.date?(' @'+m.date):'')+(m.done?' ✓':'');}).join(' | '));
  if((p.actions||[]).length)
    L.push('actions: '+p.actions.map(function(a){return (a.desc||'?')+' ['+(a.status||'Open')+(a.member?(', '+a.member):'')+(a.end?(', due '+a.end):'')+']';}).join(' | '));
  var team=allocRows.filter(function(r){return String(r.projectId)===String(p.id);});
  if(team.length){
    var names=team.map(function(r){var e=engineers.find(function(x){return String(x.id)===String(r.engId);});return (e?e.name:('eng#'+r.engId))+(r.budgetLine?(' ['+r.budgetLine+']'):'');});
    L.push('allocated team: '+names.join(', '));
  }
  return L.join('\n');
}

// Broad whole-org overview (used when nothing is focused).
function aiOverview(){
  var lines=[], active=engineers.filter(function(e){return !e.vacant;});
  lines.push('PEOPLE:');
  active.slice(0,60).forEach(function(e){
    var ic=e.idcard||{};
    var nb=_nineBoxPlacements?_nineBoxPlacements[e.uid]:null;
    var head=['- '+(e.name||'?')];
    if(e.role)head.push(e.role);
    if(ic.seniority&&ic.seniority!==e.role)head.push(ic.seniority);
    if(ic.grade)head.push('grade '+ic.grade);
    head.push('9box: '+(nb?aiCellLabel(nb):'unplaced'));
    if(ic.potential)head.push('potential '+ic.potential);
    var skills=(e.skills||[]).slice(0,6).map(function(s){return s.name+(s.level?('('+s.level+')'):'');}).filter(Boolean).join(', ');
    var extra=[];
    if(skills)extra.push('skills: '+skills);
    if(ic.strengths)extra.push('strengths: '+ic.strengths);
    if(ic.devarea)extra.push('dev area: '+ic.devarea);
    if(ic.aspirations)extra.push('aspires: '+ic.aspirations);
    lines.push(head.join(' · ')+(extra.length?('\n    '+extra.join(' | ')):''));
  });
  if(active.length>60)lines.push('… ('+(active.length-60)+' more people not shown — use the 🎯 context menu to focus)');
  lines.push('');
  lines.push('PROJECTS:');
  projects.slice(0,40).forEach(function(p){
    var b=['- '+(p.name||'?')];
    if(p.status)b.push(p.status);
    if(p.sector)b.push(p.sector);
    if(p.impactEur!=null)b.push('impact €'+p.impactEur);
    lines.push(b.join(' · '));
  });
  if(projects.length>40)lines.push('… ('+(projects.length-40)+' more projects not shown)');
  return lines.join('\n');
}

// Scope-aware. Focused people/projects get FULL detail; otherwise an overview.
function aiBuildContext(scope){
  scope=scope||_aiScope||{engIds:[],projIds:[]};
  var engIds=scope.engIds||[], projIds=scope.projIds||[];
  var focus=(engIds.length||projIds.length);
  var lines=[];
  lines.push('Nine-box active year: '+(typeof _nbYear!=='undefined'?_nbYear:'?'));
  lines.push('Totals: '+engineers.filter(function(e){return !e.vacant;}).length+' people · '+projects.length+' projects.');
  lines.push('');
  if(focus){
    if(engIds.length){
      lines.push('=== FOCUSED PEOPLE (full detail) ===');
      engIds.forEach(function(id){var e=engineers.find(function(x){return String(x.id)===String(id);});if(e){lines.push(aiPersonDeep(e));lines.push('');}});
    }
    if(projIds.length){
      lines.push('=== FOCUSED PROJECTS (full detail) ===');
      projIds.forEach(function(id){var p=projects.find(function(x){return String(x.id)===String(id);});if(p){lines.push(aiProjectDeep(p));lines.push('');}});
    }
  } else {
    lines.push(aiOverview());
  }
  var out=lines.join('\n');
  if(out.length>6000)out=out.slice(0,6000)+'\n…[truncated to fit the model context — narrow your selection in the 🎯 context menu]';
  return out;
}

function aiSystemPrompt(){
  return AI_ROLE+'\n\n'+AI_LEGEND+'\n\n=== CURRENT DATA ===\n'+aiBuildContext(_aiScope);
}

/* ── Scope menu (context selector before chat) ───────────────────── */
function aiScopeRow(kind,id,label,checked){
  return '<label class="ai-scope-row" data-label="'+escH(String(label||'').toLowerCase())+'" '
    +'style="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:12px;cursor:pointer">'
    +'<input type="checkbox" '+(checked?'checked':'')+' onchange="aiScopeToggle(\''+kind+'\',\''+id+'\',this.checked)">'
    +'<span>'+escH(label)+'</span></label>';
}

function aiScopeListHTML(){
  var h='<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--accent2);margin:6px 0 2px">'+t('PEOPLE')+'</div>';
  engineers.filter(function(e){return !e.vacant;}).forEach(function(e){
    h+=aiScopeRow('eng',e.id,(e.name||'?')+(e.role?(' · '+e.role):''),_aiScope.engIds.indexOf(String(e.id))>=0);
  });
  h+='<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--accent2);margin:10px 0 2px">'+t('PROJECTS')+'</div>';
  projects.forEach(function(p){
    h+=aiScopeRow('proj',p.id,(p.name||'?')+(p.status?(' · '+p.status):''),_aiScope.projIds.indexOf(String(p.id))>=0);
  });
  return h;
}

function aiOpenScope(){
  if(!_aiEngine){aiOpenChat();return;}
  aiCloseModelPicker(); aiCloseChat();
  var existing=document.getElementById('ai-scope-dlg'); if(existing)existing.remove();
  var dlg=document.createElement('div');
  dlg.id='ai-scope-dlg';
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:925;display:flex;align-items:center;justify-content:center';
  dlg.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px 20px;width:min(560px,96vw);max-height:86vh;display:flex;flex-direction:column;gap:10px;box-shadow:0 16px 48px rgba(0,0,0,.8)">'
    +'<div style="display:flex;align-items:center;gap:8px">'
      +'<h2 style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);flex:1">🎯 '+t('CHAT CONTEXT')+'</h2>'
      +'<button class="sm" onclick="aiShowModelPicker()" title="'+t('Change the AI model')+'">'+t('⚙ Model')+'</button>'
      +'<button onclick="aiCloseScope()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px">✕</button>'
    +'</div>'
    +'<div style="font-size:11px;color:var(--muted);line-height:1.6">'+t('Tick people or projects to load their <b>full</b> detail (and their connections — a person’s projects, a project’s team). Leave all unticked for a whole-org overview. Fewer selections = sharper, faster answers.')+'</div>'
    +'<input id="ai-scope-filter" placeholder="'+t('Filter…')+'" oninput="aiScopeFilter(this.value)" '
      +'style="background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:12px">'
    +'<div><button class="sm" onclick="aiScopeClear()">'+t('Clear selection')+'</button></div>'
    +'<div id="ai-scope-list" style="overflow-y:auto;flex:1">'+aiScopeListHTML()+'</div>'
    +'<div id="ai-scope-foot" style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted)"></div>'
    +'<button class="primary" onclick="aiStartChat()">'+t('Start chat ▶')+'</button>'
    +'</div>';
  document.body.appendChild(dlg);
  aiScopeUpdateFoot();
}

function aiCloseScope(){ var d=document.getElementById('ai-scope-dlg'); if(d)d.remove(); }

function aiScopeToggle(kind,id,on){
  var arr=(kind==='eng')?_aiScope.engIds:_aiScope.projIds;
  var idx=arr.indexOf(String(id));
  if(on&&idx<0)arr.push(String(id));
  if(!on&&idx>=0)arr.splice(idx,1);
  aiScopeUpdateFoot();
}

function aiScopeClear(){
  _aiScope.engIds=[]; _aiScope.projIds=[];
  var l=document.getElementById('ai-scope-list'); if(l)l.innerHTML=aiScopeListHTML();
  aiScopeUpdateFoot();
}

function aiScopeFilter(q){
  q=(q||'').toLowerCase();
  var rows=document.querySelectorAll('#ai-scope-list .ai-scope-row');
  for(var i=0;i<rows.length;i++){
    var lbl=rows[i].getAttribute('data-label')||'';
    rows[i].style.display=(!q||lbl.indexOf(q)>=0)?'':'none';
  }
}

function aiScopeUpdateFoot(){
  var foot=document.getElementById('ai-scope-foot'); if(!foot)return;
  var chars=aiBuildContext(_aiScope).length;
  var n=_aiScope.engIds.length, m=_aiScope.projIds.length;
  var mode=(n||m)?t('Focused: {n} people, {m} projects',{n:n,m:m}):t('Whole-org overview');
  foot.textContent=mode+'  ·  '+t('context ~{c} chars (~{tk} tokens)',{c:chars,tk:Math.round(chars/4)});
}

/* ── Chat advisor ────────────────────────────────────────────────── */
// Entry/router: ensure an engine, then always show the scope menu first.
function aiOpenChat(){
  if(!_aiEngine){
    var saved=aiSavedModel();
    if(saved&&!_aiLoading){
      if(confirm(t('Load AI model?')+'\n\n'+saved+'\n\n'+t('(Uses the cached download if you already got it — otherwise downloads now.)')))
        aiSelectModel(saved);
      return;
    }
    aiShowModelPicker();
    return;
  }
  aiOpenScope();
}

function aiStartChat(){
  aiCloseScope(); aiCloseModelPicker();
  if(!_aiEngine){aiOpenChat();return;}
  var existing=document.getElementById('ai-chat-dlg'); if(existing)existing.remove();

  var n=_aiScope.engIds.length, m=_aiScope.projIds.length;
  var scopeLabel=(n||m)?t('🎯 {n}p/{m}pr',{n:n,m:m}):t('🎯 overview');
  var chips=[
    t('Summarise key talent risks'),
    t('Who are single points of failure (bus factor)?'),
    t('Draft development plans for high-potentials'),
    t('Which projects look under-resourced?')
  ].map(function(t){
    return '<button class="sm" style="font-size:10px" onclick="aiAsk('+JSON.stringify(t).replace(/"/g,'&quot;')+')">'+escH(t)+'</button>';
  }).join('');

  var dlg=document.createElement('div');
  dlg.id='ai-chat-dlg';
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:930;display:flex;align-items:center;justify-content:center';
  dlg.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px;width:min(640px,96vw);height:min(82vh,760px);display:flex;flex-direction:column;gap:10px;box-shadow:0 16px 48px rgba(0,0,0,.8)">'
    +'<div style="display:flex;align-items:center;gap:8px">'
      +'<h2 style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);flex:1">💬 '+t('AI ADVISOR')+'</h2>'
      +'<button class="sm" onclick="aiOpenScope()" title="'+t('Change context (people/projects in scope)')+'">'+scopeLabel+'</button>'
      +'<button class="sm" onclick="aiShowModelPicker()" title="'+t('Change the AI model')+'">'+t('⚙ Model')+'</button>'
      +'<button onclick="aiCloseChat()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px">✕</button>'
    +'</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:6px">'+chips+'</div>'
    +'<div id="ai-chat-msgs" style="flex:1;overflow-y:auto;padding:6px 2px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)"></div>'
    +'<div id="ai-chat-error" style="display:none;background:rgba(241,163,53,.08);border:1px solid var(--warn);border-radius:6px;padding:6px 8px;font-size:11px;font-family:IBM Plex Mono,monospace"></div>'
    +'<div style="display:flex;gap:8px;align-items:flex-end">'
      +'<textarea id="ai-chat-input" rows="2" placeholder="'+t('Ask about your roster, talent, succession, projects…')+'" '
        +'style="flex:1;resize:none;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px;font-size:12px;font-family:inherit" '
        +'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();aiChatSend();}"></textarea>'
      +'<button class="primary" id="ai-chat-send" style="padding:8px 14px" onclick="aiChatSend()">'+t('Send')+'</button>'
    +'</div>'
    +'<div style="font-size:9px;color:var(--dim);font-family:IBM Plex Mono,monospace">'+t('Local model · answers may be imperfect · nothing leaves your browser')+'</div>'
    +'</div>';
  document.body.appendChild(dlg);
  aiRenderChat();
  var inp=document.getElementById('ai-chat-input'); if(inp)inp.focus();
}

function aiCloseChat(){ var d=document.getElementById('ai-chat-dlg'); if(d)d.remove(); }

function aiRenderChat(){
  var box=document.getElementById('ai-chat-msgs'); if(!box)return;
  if(!_aiMessages.length){
    box.innerHTML='<div style="color:var(--muted);font-size:11px;text-align:center;padding:24px;line-height:1.6">'
      +t('Ask a question, or tap a suggestion above.')+'<br>'+t('Context in scope:')+' '
      +((_aiScope.engIds.length||_aiScope.projIds.length)
        ?t('focused on {n} people, {m} projects',{n:_aiScope.engIds.length,m:_aiScope.projIds.length})
        :t('whole-org overview'))
      +'.</div>';
    return;
  }
  var h=_aiMessages.map(function(m,i){
    var last=(i===_aiMessages.length-1);
    var mine=(m.role==='user');
    var bg=mine?'var(--accent)':'var(--bg)';
    var col=mine?'#0a0a0a':'var(--text)';
    var idAttr=(last&&!mine)?' id="ai-bub-last"':'';
    var body=m.content||((last&&!mine)?'…':'');
    return '<div style="display:flex;justify-content:'+(mine?'flex-end':'flex-start')+';margin:6px 0">'
      +'<div'+idAttr+' style="max-width:84%;white-space:pre-wrap;font-size:12px;line-height:1.5;padding:8px 11px;border-radius:10px;background:'+bg+';color:'+col+';border:1px solid var(--border)">'
      +escH(body)+'</div></div>';
  }).join('');
  box.innerHTML=h;
  box.scrollTop=box.scrollHeight;
}

function aiRenderChatStreaming(){
  var el=document.getElementById('ai-bub-last'); if(!el)return;
  el.textContent=_aiMessages[_aiMessages.length-1].content||'…';
  var box=document.getElementById('ai-chat-msgs'); if(box)box.scrollTop=box.scrollHeight;
}

function aiAsk(text){
  var i=document.getElementById('ai-chat-input');
  if(i)i.value=text;
  aiChatSend();
}

// Engine/GPU lifecycle errors worth a single fresh-engine retry.
function aiIsLifecycleErr(err){
  var s=String((err&&err.message)||err||'');
  return /disposed|not loaded|reload\(|already deleted|tokenizer/i.test(s) || aiIsDeviceLost(err);
}
// The GPU device was REMOVED (driver TDR / out of VRAM). Usually fatal for the
// current page — a fresh engine often can't re-acquire a device until reload.
function aiIsDeviceLost(err){
  var s=String((err&&err.message)||err||'');
  return /device_removed|requestdevice|device.*lost|out of memory|\boom\b|dxgi/i.test(s);
}
// Tear down the engine so the next load starts clean (best-effort unload).
function aiHardReset(){
  var e=_aiEngine; _aiEngine=null; _aiEngineModel='';
  if(e&&typeof e.unload==='function'){ try{ return Promise.resolve(e.unload()).catch(function(){}); }catch(x){} }
  return Promise.resolve();
}
// Friendly, actionable error text — device-removed gets specific guidance.
function aiErrorHint(err){
  var s=String((err&&err.message)||err||'');
  if(aiIsDeviceLost(err))
    return t('⚠ The GPU device was removed — almost always too little VRAM for this model, or a graphics-driver reset.\nWhat helps:\n• Pick a smaller model (Llama 3.2 1B) via the ⚙ button.\n• Close other GPU-heavy apps/browser tabs.\n• Reload the page to get a fresh GPU context.');
  return '[error: '+s+']';
}

// One streaming completion → appends tokens to the assistant message.
function aiRunStream(msgs,assistant){
  // Clear KV-cache/state from the previous turn before generating. We always send
  // the full message array (stateless usage), so this is safe — and it avoids
  // carrying engine state across turns, a likely culprit for the deterministic
  // 2nd-turn device drop on TDR/exit_on_context_lost setups.
  var reset=(_aiEngine&&typeof _aiEngine.resetChat==='function')
    ?Promise.resolve(_aiEngine.resetChat()).catch(function(){})
    :Promise.resolve();
  return reset.then(function(){
    return _aiEngine.chat.completions.create({messages:msgs,stream:true,temperature:0.6});
  }).then(function(stream){
    return (async function(){
      for await (var chunk of stream){
        var d=chunk&&chunk.choices&&chunk.choices[0]&&chunk.choices[0].delta&&chunk.choices[0].delta.content;
        if(d){ assistant.content+=d; aiRenderChatStreaming(); }
      }
    })();
  });
}

function aiChatSend(){
  var input=document.getElementById('ai-chat-input'); if(!input)return;
  var text=(input.value||'').trim();
  if(!text||!_aiEngine||_aiLoading)return;
  input.value='';

  var eb=document.getElementById('ai-chat-error'); if(eb)eb.style.display='none';

  _aiMessages.push({role:'user',content:text});
  var assistant={role:'assistant',content:''};
  _aiMessages.push(assistant);
  aiRenderChat();
  aiPersistChat();   // save the question before generating, so a GPU crash can't lose it

  // Cap history to bound prompt size → less VRAM/compute per turn (the follow-up
  // turn is where the device tends to drop on constrained/TDR-prone GPUs).
  var hist=_aiMessages.slice(0,-1);
  if(hist.length>AI_HISTORY_MAX)hist=hist.slice(hist.length-AI_HISTORY_MAX);
  var msgs=[{role:'system',content:aiSystemPrompt()}].concat(hist.map(function(m){return {role:m.role,content:m.content};}));

  _aiLoading=true; aiUpdateButton();
  var sendBtn=document.getElementById('ai-chat-send'); if(sendBtn)sendBtn.disabled=true;
  function reEnable(){ _aiLoading=false; aiUpdateButton(); var b=document.getElementById('ai-chat-send'); if(b)b.disabled=false; }

  aiRunStream(msgs,assistant).catch(function(err){
    // Device removed (driver TDR / out of VRAM): retrying in-page won't recover
    // the GPU context — bail to the actionable hint below.
    if(aiIsDeviceLost(err)) throw err;
    // Milder lifecycle error (unloaded / disposed / tokenizer deleted): rebuild a
    // FRESH engine once (the old instance is dead) and retry the same request.
    if(aiIsLifecycleErr(err)&&_aiEngineModel){
      var model=_aiEngineModel;
      assistant.content=t('↻ engine was reset — reloading the model…'); aiRenderChatStreaming();
      return aiHardReset().then(aiGetEngine).then(function(engine){
        return aiReloadModel(engine,model);
      }).then(function(){
        _aiEngineModel=model; assistant.content=''; aiRenderChatStreaming();
        return aiRunStream(msgs,assistant);
      });
    }
    throw err;
  }).then(function(){
    reEnable(); aiPersistChat();
  }).catch(function(err){
    if(aiIsLifecycleErr(err)) aiHardReset();   // next send/open starts clean
    var hint=aiErrorHint(err);
    assistant.content=(assistant.content&&assistant.content.charAt(0)!=='↻')?(assistant.content+'\n\n'+hint):hint;
    reEnable(); aiRenderChat();
    if(aiIsDeviceLost(err)) aiShowChatReload();   // can't recover in-page → offer reload
  });
}

// Conversation survives the forced page reload that a lost GPU context requires.
function aiPersistChat(){
  try{ sessionStorage.setItem(AI_CHAT_KEY,JSON.stringify({
    model:_aiEngineModel, engIds:_aiScope.engIds, projIds:_aiScope.projIds, messages:_aiMessages
  })); }catch(e){}
}
function aiRestoreChat(id){
  try{
    var raw=sessionStorage.getItem(AI_CHAT_KEY); if(!raw)return;
    var d=JSON.parse(raw); if(!d||d.model!==id)return;
    if(Array.isArray(d.messages))_aiMessages=d.messages.filter(function(m){return m&&m.content&&m.content.charAt(0)!=='⚠'&&m.content.charAt(0)!=='↻';});
    if(d.engIds&&d.projIds)_aiScope={engIds:d.engIds,projIds:d.projIds};
  }catch(e){}
}
function aiShowChatReload(){
  var el=document.getElementById('ai-chat-error'); if(!el)return;
  el.style.display='block';
  el.innerHTML='<span style="color:var(--warn)">'+t('GPU context lost — your browser can’t recover it in-page (exit_on_context_lost). Reload to continue; your conversation is saved.')+'</span> '
    +'<button class="sm" style="margin-left:6px" onclick="location.reload()">'+t('↻ Reload page')+'</button>';
}
