/* ►► SECTION: TOOLTIP ◄◄ Project hover tooltip and quadrant naming/color panel
 *
 * Functions defined in this file:
 *   showTip      — shows the project hover tooltip
 *   hideTip      — hides the hover tooltip
 *   openQPanel   — opens the quadrant label/color editor panel
 *   closeQPanel  — closes the quadrant panel
 *   saveQPanel   — saves quadrant labels/colors across all Y-modes
 *   hexToRgba    — converts a #hex color to an rgba() string
 *   rgbaToHex    — converts an rgba() string to a #hex color
 */

// shows the project hover tooltip
function showTip(e,id){
  if(drawTool!=='none')return;
  const p=projects.find(p=>p.id===id);if(!p)return;
  const ax=axX(),ay=axY();
  const td=(p.todos||[]).filter(t=>t.done).length,tt=(p.todos||[]).length;
  const sec=sections.find(s=>s.id===p.sectionId);
  let html=`<b style="color:${p.color}">${escH(p.name)}</b>`;
  if(sec)html+=` <span style="color:${sec.color};font-size:9px">[${escH(sec.name)}]</span>`;
  html+=`<br>${ax.name}: ${p.x} · Impact: ${p.y}`;
  html+=`<br>Visibility: ${p.vis??5} · Enabler: ${p.ena??5}`;
  if(p.note)html+=`<br><span style="color:var(--muted)">${escH(p.note)}</span>`;
  if(p.currentGate)html+=`<br>🏁 <span style="color:var(--muted)">${escH(p.currentGate)}</span> → <span style="color:var(--accent2)">${escH(p.gate||'Next TBD')}</span>`;
  else if(p.gate)html+=`<br>🏁 <span style="color:var(--accent2)">${escH(p.gate)}</span>`;
  if(p.planCost)html+=`<br>💰 ${Math.round(p.planCost/1000)}k€ <span style="color:var(--muted);font-size:9px">[${p.costSource==='plan'?'from resource plan':'manual'}]</span>`;
  if(p.eta) html+=`<br>📅 ${p.eta}`;
  if(tt)    html+=`<br>☑ ${td}/${tt} tasks`;
  if(p.risks&&p.risks.length){const hi=p.risks.filter(r=>(r.sev||1)*(r.occ||1)*(r.det||1)>=300).length;html+=`<br>⚠ ${p.risks.length} risks${hi?` (${hi} HIGH)`:''}`;}
  const t=G('tooltip');t.innerHTML=html;t.style.opacity='1';
  t.style.left=(e.clientX+14)+'px';t.style.top=(e.clientY-10)+'px';
}
// hides the hover tooltip
function hideTip(){G('tooltip').style.opacity='0';}

// opens the quadrant label/color editor panel
function openQPanel(){
  const KEYS=[{key:'tl',pos:'TOP-LEFT'},{key:'tr',pos:'TOP-RIGHT'},{key:'bl',pos:'BOT-LEFT'},{key:'br',pos:'BOT-RIGHT'}];
  const MODES=['impact','visibility','enabler'];
  let rows='';
  KEYS.forEach(function(kd){
    const key=kd.key, pos=kd.pos;
    const baseQ=quadrantsByMode.impact.find(function(q){return q.key===key;});
    const col=baseQ?baseQ.color:'rgba(128,128,128,0.1)';
    const hexCol=rgbaToHex(col);
    const nameInputs=MODES.map(function(mode){
      const mq=quadrantsByMode[mode].find(function(q){return q.key===key;});
      return '<input type="text" id="qn-'+mode+'-'+key+'" value="'+escH(mq?mq.label:'')+'"'+
        ' style="background:var(--bg);border:1px solid var(--border);color:var(--text);'+
        'font-family:\'IBM Plex Mono\',monospace;font-size:11px;padding:4px 6px;border-radius:4px;outline:none;width:100%">';
    }).join('');
    rows+='<div style="display:grid;grid-template-columns:24px 86px 1fr 1fr 1fr 30px;'+
          'gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)" data-key="'+key+'">'+
      '<div class="q-swatch" id="qs-'+key+'" style="background:'+col+'"></div>'+
      '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">'+pos+'</span>'+
      nameInputs+
      '<input type="color" id="qc-'+key+'" value="'+hexCol+'"'+
        ' style="width:26px;height:24px;border-radius:4px;border:1px solid var(--border);background:transparent;cursor:pointer;padding:2px"'+
        ' oninput="G(\'qs-'+key+'\').style.background=this.value" title="Shared background color">'+
    '</div>';
  });
  G('q-rows').innerHTML=rows;
  G('q-panel').classList.add('show');
}
// closes the quadrant panel
function closeQPanel(){G('q-panel').classList.remove('show');}
// saves quadrant labels/colors across all Y-modes
function saveQPanel(){
  const KEYS=['tl','tr','bl','br'];
  const MODES=['impact','visibility','enabler'];
  KEYS.forEach(function(key){
    const newColor=hexToRgba(V('qc-'+key),.10);
    MODES.forEach(function(mode){
      const q=quadrantsByMode[mode].find(function(qq){return qq.key===key;});
      if(!q)return;
      const inp=G('qn-'+mode+'-'+key);
      q.label=(inp&&inp.value)||q.label;
      q.color=newColor;
    });
  });
  closeQPanel();render();saveState();
}
// converts a #hex color to an rgba() string
function hexToRgba(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${a})`;}
// converts an rgba() string to a #hex color
function rgbaToHex(rgba){const m=rgba.match(/[\d.]+/g);if(!m||m.length<3)return '#888888';return '#'+[m[0],m[1],m[2]].map(v=>(+v|0).toString(16).padStart(2,'0')).join('');}
