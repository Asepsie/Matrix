/* ►► SECTION: IDCARD ◄◄ ID card modal: open/save, photo upload/compress
 *
 * Functions defined in this file:
 *   syncManagerDisplayName — auto-fills manager name when roster engineer is selected
 *   openIdCardModal        — populates and opens the ID card modal for an engineer
 *   idcPhotoSelected       — handles photo file selection: compress → IDB → preview
 *   idcPhotoClear          — removes photo from preview and IDB
 *   closeIdCardModal       — hides the modal and clears state
 *   saveIdCardModal        — saves all ID card fields back to the engineer object
 *   idcRenderCops          — renders the editable Communities-of-Practice rows
 *   idcAddCop / idcDelCop  — add / remove a CoP entry (working copy)
 *   idcRenderReviews       — renders the editable performance-review rows
 *   idcAddReview/idcDelReview — add / remove a review entry (working copy)
 *
 * Note: engInitials() and engGroupColor() are defined in helpers.js
 *       makeCop() and makeReview() are defined in data/model.js
 */

// auto-fills manager name when a roster engineer is selected
export function syncManagerDisplayName(sel){
  const inp=G('idc-manager');if(!inp)return;
  if(!sel.value){ inp.placeholder=t('e.g. external manager name…'); return; }
  const eng=engineers.find(e=>String(e.id)===String(sel.value));
  if(eng&&!inp.value) inp.value=eng.name;
}
// populates and opens the ID card modal for an engineer
export function openIdCardModal(engId){
  _idcardEngId=engId;
  const eng=engineers.find(e=>e.id===engId);if(!eng)return;
  const c=eng.idcard||{};
  G('idcard-modal-title').textContent=t('PROFILE —')+' '+eng.name;
  G('idc-name').value=eng.name||'';
  G('idc-role').value=eng.role||'';
  G('idc-location').value=eng.location||'';
  G('idc-cost').value=eng.monthlyCost||'';
  const sel=G('idc-reportsto');
  sel.innerHTML='<option value="">'+t('— No manager —')+'</option>';
  engineers.filter(e=>e.id!==engId).forEach(e=>{
    const opt=document.createElement('option');
    opt.value=e.id;
    opt.textContent=e.name+(e.role?' · '+e.role:'');
    if(String(c.reportsTo)===String(e.id))opt.selected=true;
    sel.appendChild(opt);
  });
  G('idc-contract').value=c.contract||'';
  var crInp=G('idc-comparatio');if(crInp)crInp.value=(c.comparatio!=null?c.comparatio:'');
  var grInp=G('idc-grade');if(grInp)grInp.value=(c.grade!=null?c.grade:'');
  var nm=c.nextMove||{};
  var nmPos=G('idc-nextmove-pos');if(nmPos)nmPos.value=nm.position||'';
  var nmTime=G('idc-nextmove-time');if(nmTime)nmTime.value=nm.timeline||'';
  var nmShow=G('idc-nextmove-show');if(nmShow)nmShow.checked=!!nm.show;
  var itCb=G('idc-include-talent');if(itCb)itCb.checked=(eng.includeTalent!==false);
  G('idc-seniority').value=c.seniority||'';
  var potSel=G('idc-potential');if(potSel)potSel.value=c.potential||'';
  var mobInp=G('idc-mobility');if(mobInp)mobInp.value=c.mobility||'';
  G('idc-startdate').value=c.startdate||'';
  G('idc-reviewdate').value=c.reviewdate||'';
  G('idc-languages').value=c.languages||'';
  const genderSel=G('idc-gender');if(genderSel)genderSel.value=c.gender||'';
  const mgInp=G('idc-manager');if(mgInp)mgInp.value=c.manager||'';
  G('idc-aspirations').value=c.aspirations||'';
  G('idc-strengths').value=c.strengths||'';
  G('idc-devarea').value=c.devarea||'';
  G('idc-notes').value=c.notes||'';
  const prev=G('idc-photo-preview');
  const _cachedPh=idbGetPhoto(eng.id)||(c.photo||'');
  if(_cachedPh){
    prev.innerHTML='<img src="'+_cachedPh+'" style="width:100%;height:100%;object-fit:cover">';
  } else {
    prev.innerHTML='<span style="font-size:22px">'+engInitials(eng.name)+'</span>';
  }
  if(!_cachedPh){
    idbFetchPhoto(eng.id).then(function(photo){
      if(photo){prev.innerHTML='<img src="'+photo+'" style="width:100%;height:100%;object-fit:cover">';}
    });
  }
  var info=idbStorageInfo();
  var hint=G('idc-photo-storage-hint');
  if(hint)hint.textContent=info.photos>0?t('{n} photo(s) · {kb}KB',{n:info.photos,kb:info.kb}):'';
  // Communities of Practice & performance reviews — load working copies and render
  _idcCops=(c.cops||[]).map(function(x){return {name:x.name||'',goal:x.goal||'',notes:x.notes||''};});
  _idcReviews=(c.reviews||[]).map(function(x){return {year:x.year||'',rating:x.rating||'',comments:x.comments||''};});
  idcRenderCops();
  idcRenderReviews();
  G('idcard-modal-overlay').classList.add('show');
}
// handles photo file selection: compress → IDB → preview
export function idcPhotoSelected(inp){
  const file=inp.files[0];if(!file)return;
  const prev=G('idc-photo-preview');
  prev.innerHTML='<span style="font-size:13px;color:var(--muted)">⏳</span>';
  idbCompressAndSave(_idcardEngId,file).then(function(res){
    var dataURL=res.dataURL||res;
    prev.innerHTML='<img src="'+dataURL+'" style="width:100%;height:100%;object-fit:cover">';
    prev._pendingPhoto='idb';
    idbUpdateStatus();
    var hint=G('idc-photo-storage-hint');
    var kb=res.kb||Math.round(dataURL.length/1024);
    if(hint)hint.textContent=t('Saved · {kb}KB ({w}×{h}px) · {n} total',{kb:kb,w:res.w,h:res.h,n:idbStorageInfo().photos});
  }).catch(function(){
    var reader=new FileReader();
    reader.onload=function(e){
      prev.innerHTML='<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover">';
      prev._pendingPhoto=e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
// removes photo from preview and IDB
export function idcPhotoClear(){
  G('idc-photo-preview').innerHTML='<span style="font-size:22px">👤</span>';
  G('idc-photo-preview')._pendingPhoto='clear';
  if(_idcardEngId){idbDeletePhoto(_idcardEngId);idbUpdateStatus();}
}
// hides the modal and clears state
export function closeIdCardModal(){
  G('idcard-modal-overlay').classList.remove('show');
  _idcardEngId=null;
}
// saves all ID card fields back to the engineer object
export function saveIdCardModal(){
  const eng=engineers.find(e=>e.id===_idcardEngId);if(!eng)return;
  eng.name=G('idc-name').value||eng.name;
  eng.role=G('idc-role').value;
  eng.location=G('idc-location').value;
  eng.monthlyCost=+G('idc-cost').value||eng.monthlyCost;
  if(!eng.idcard)eng.idcard={};
  const rts=G('idc-reportsto');
  eng.idcard.reportsTo=rts&&rts.value?String(rts.value):'';
  const mgInp=G('idc-manager');
  if(mgInp&&mgInp.value.trim()){
    eng.idcard.manager=mgInp.value.trim();
  } else if(rts&&rts.value){
    const resolvedMgr=engineers.find(e=>String(e.id)===String(rts.value));
    eng.idcard.manager=resolvedMgr?resolvedMgr.name:'';
  } else {
    eng.idcard.manager='';
  }
  const prev=G('idc-photo-preview');
  if(prev&&prev._pendingPhoto){
    if(prev._pendingPhoto==='clear'||prev._pendingPhoto==='idb'){
      eng.idcard.photo='';
    } else {
      eng.idcard.photo=prev._pendingPhoto;
    }
    prev._pendingPhoto=null;
  }
  eng.idcard.contract=G('idc-contract').value;
  var crInp2=G('idc-comparatio');
  if(crInp2){var crv=crInp2.value.trim();eng.idcard.comparatio=crv===''?null:(+crv);}
  var grInp2=G('idc-grade');
  if(grInp2){
    var grv=grInp2.value.trim();
    if(grv===''){eng.idcard.grade=null;}
    else{var gn=Math.round(+grv);eng.idcard.grade=isNaN(gn)?null:Math.max(1,Math.min(11,gn));}
  }
  if(!eng.idcard.nextMove)eng.idcard.nextMove={};
  var nmPos2=G('idc-nextmove-pos');if(nmPos2)eng.idcard.nextMove.position=nmPos2.value.trim();
  var nmTime2=G('idc-nextmove-time');if(nmTime2)eng.idcard.nextMove.timeline=nmTime2.value.trim();
  var nmShow2=G('idc-nextmove-show');eng.idcard.nextMove.show=nmShow2?nmShow2.checked:false;
  var itCb2=G('idc-include-talent');eng.includeTalent=itCb2?itCb2.checked:true;
  eng.idcard.seniority=G('idc-seniority').value;
  eng.idcard.potential=G('idc-potential')?G('idc-potential').value:'';
  eng.idcard.mobility=G('idc-mobility')?G('idc-mobility').value:'';
  eng.idcard.startdate=G('idc-startdate').value;
  eng.idcard.reviewdate=G('idc-reviewdate').value;
  eng.idcard.languages=G('idc-languages').value;
  eng.idcard.gender=G('idc-gender')?G('idc-gender').value:'';
  eng.idcard.aspirations=G('idc-aspirations').value;
  eng.idcard.strengths=G('idc-strengths').value;
  eng.idcard.devarea=G('idc-devarea').value;
  eng.idcard.notes=G('idc-notes').value;
  eng.idcard.cops=_idcCops.map(function(x){return {name:x.name||'',goal:x.goal||'',notes:x.notes||''};});
  eng.idcard.reviews=_idcReviews.map(function(x){return {year:x.year||'',rating:x.rating||'',comments:x.comments||''};});
  saveState();
  closeIdCardModal();
  if(resActiveTab==='profiles')renderProfilesTab();
  else if(G('eng-roster'))renderResPlan();
}

/* ── Communities of Practice (editable rows in the ID-card modal) ── */
// renders the editable CoP rows from the working copy (_idcCops)
function idcRenderCops(){
  var wrap=G('idc-cop-list');if(!wrap)return;
  var cnt=G('idc-cop-count');if(cnt)cnt.textContent=_idcCops.length?('· '+_idcCops.length):'';
  if(!_idcCops.length){
    wrap.innerHTML='<div style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;padding:2px 0">'+t('No communities of practice yet — click “+ ADD CoP”.')+'</div>';
    return;
  }
  wrap.innerHTML=_idcCops.map(function(cop,i){
    return '<div style="border:1px solid var(--border);border-radius:6px;padding:8px;background:var(--bg)">'
      +'<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'
      +'<input class="id-card-inp" style="flex:1" placeholder="'+t('CoP name — e.g. Frontend Guild')+'" value="'+escH(cop.name||'')+'" oninput="_idcCops['+i+'].name=this.value">'
      +'<button class="row-del-btn" title="'+t('Remove this CoP')+'" onclick="idcDelCop('+i+')">×</button>'
      +'</div>'
      +'<input class="id-card-inp" style="width:100%;margin-bottom:6px" placeholder="'+t('Goal / role in this CoP')+'" value="'+escH(cop.goal||'')+'" oninput="_idcCops['+i+'].goal=this.value">'
      +'<input class="id-card-inp" style="width:100%" placeholder="'+t('Notes (optional)')+'" value="'+escH(cop.notes||'')+'" oninput="_idcCops['+i+'].notes=this.value">'
      +'</div>';
  }).join('');
}
// adds a blank CoP entry and ensures the section is expanded
function idcAddCop(){
  _idcCops.push(typeof makeCop==='function'?makeCop():{name:'',goal:'',notes:''});
  var b=G('idc-cop-body');
  if(b&&b.style.display==='none'){b.style.display='block';var a=b.parentElement.querySelector('.cop-arrow');if(a)a.textContent='▼';}
  idcRenderCops();
}
// removes the CoP entry at index i
function idcDelCop(i){ _idcCops.splice(i,1); idcRenderCops(); }

/* ── Performance reviews (editable rows in the ID-card modal) ── */
// renders the editable review rows from the working copy (_idcReviews)
function idcRenderReviews(){
  var wrap=G('idc-rev-list');if(!wrap)return;
  var cnt=G('idc-rev-count');if(cnt)cnt.textContent=_idcReviews.length?('· '+_idcReviews.length):'';
  if(!_idcReviews.length){
    wrap.innerHTML='<div style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;padding:2px 0">'+t('No performance reviews yet — click “+ ADD REVIEW”.')+'</div>';
    return;
  }
  wrap.innerHTML=_idcReviews.map(function(r,i){
    return '<div style="border:1px solid var(--border);border-radius:6px;padding:8px;background:var(--bg)">'
      +'<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'
      +'<input class="id-card-inp" style="width:84px" placeholder="'+t('Year')+'" value="'+escH(String(r.year||''))+'" oninput="_idcReviews['+i+'].year=this.value">'
      +'<input class="id-card-inp" style="flex:1" placeholder="'+t('Rating — e.g. Exceeds expectations')+'" value="'+escH(r.rating||'')+'" oninput="_idcReviews['+i+'].rating=this.value">'
      +'<button class="row-del-btn" title="'+t('Remove this review')+'" onclick="idcDelReview('+i+')">×</button>'
      +'</div>'
      +'<textarea class="id-card-textarea" style="min-height:46px" placeholder="'+t('Comments')+'" oninput="_idcReviews['+i+'].comments=this.value">'+escH(r.comments||'')+'</textarea>'
      +'</div>';
  }).join('');
}
// adds a blank review entry and ensures the section is expanded
function idcAddReview(){
  _idcReviews.push(typeof makeReview==='function'?makeReview():{year:'',rating:'',comments:''});
  var b=G('idc-rev-body');
  if(b&&b.style.display==='none'){b.style.display='block';var a=b.parentElement.querySelector('.rev-arrow');if(a)a.textContent='▼';}
  idcRenderReviews();
}
// removes the review entry at index i
function idcDelReview(i){ _idcReviews.splice(i,1); idcRenderReviews(); }
