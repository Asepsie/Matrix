/* ►► SECTION: DRAW ◄◄ Annotation draw tools (line/dash/arrow/text) + canvas mouse/drag handlers
 *
 * Functions defined in this file:
 *   setDrawTool      — selects the active annotation draw tool and re-renders
 *   onDrawMouseDown  — begins drawing an annotation (or places text)
 *   onDrawMouseMove  — updates the live annotation preview while dragging
 *   onDrawMouseUp    — commits the drawn annotation
 *   deleteAnnotation — removes one annotation by id
 *   clearAnnotations — removes all annotations (with confirm)
 *   startProjDrag    — begins dragging a project bubble on the matrix
 *   startSepDrag     — begins dragging a quadrant separator
 *   onMouseDown      — canvas mousedown dispatch (draw mode vs drag mode)
 *   onMouseMove      — canvas mousemove: move project/separator or draw preview
 *   onMouseUp        — canvas mouseup: commit drag or finish drawing
 */

const DRAW_TOOLS=['none','line','dash','arrow','text'];

// selects the active annotation draw tool and re-renders
function setDrawTool(tool){drawTool=tool;drawStart=null;drawPreview=null;DRAW_TOOLS.forEach(t=>G('dt-'+t).classList.toggle('active',t===tool));G('draw-text-input').style.display=tool==='text'?'inline-block':'none';render();}
// begins drawing an annotation (or places text)
function onDrawMouseDown(e){
  if(drawTool==='none')return;
  const svg=G('matrix-svg'),rect=svg.getBoundingClientRect();
  const ax=eaxX(),ay=eaxY(),pw=rect.width-PAD.l-PAD.r,ph=rect.height-PAD.t-PAD.b;
  const dx=datX(e.clientX-rect.left,ax,pw),dy=datY(e.clientY-rect.top,ay,ph);
  if(drawTool==='text'){const txt=(V('draw-text-input')||'').trim();if(!txt)return;annotations.push({id:nextAnnotId++,type:'text',x1:dx,y1:dy,x2:dx,y2:dy,color:V('draw-color'),text:txt});render();saveState();return;}
  drawStart={x:dx,y:dy};
}
// updates the live annotation preview while dragging
function onDrawMouseMove(e){
  if(!drawStart||drawTool==='none'||drawTool==='text')return;
  const svg=G('matrix-svg'),rect=svg.getBoundingClientRect();
  const ax=eaxX(),ay=eaxY(),pw=rect.width-PAD.l-PAD.r,ph=rect.height-PAD.t-PAD.b;
  drawPreview={id:-1,type:drawTool,x1:drawStart.x,y1:drawStart.y,x2:datX(e.clientX-rect.left,ax,pw),y2:datY(e.clientY-rect.top,ay,ph),color:V('draw-color')};render();
}
// commits the drawn annotation
function onDrawMouseUp(e){
  if(!drawStart||drawTool==='none'||drawTool==='text')return;
  const svg=G('matrix-svg'),rect=svg.getBoundingClientRect();
  const ax=eaxX(),ay=eaxY(),pw=rect.width-PAD.l-PAD.r,ph=rect.height-PAD.t-PAD.b;
  const dx=datX(e.clientX-rect.left,ax,pw),dy=datY(e.clientY-rect.top,ay,ph);
  if(Math.hypot(dx-drawStart.x,dy-drawStart.y)>0.02)annotations.push({id:nextAnnotId++,type:drawTool,x1:drawStart.x,y1:drawStart.y,x2:dx,y2:dy,color:V('draw-color')});
  drawStart=null;drawPreview=null;saveState();render();
}
// removes one annotation by id
function deleteAnnotation(id){annotations=annotations.filter(a=>a.id!==id);render();saveState();}
// removes all annotations (with confirm)
function clearAnnotations(){if(!confirm('Clear all annotations?'))return;annotations=[];render();saveState();}

// begins dragging a project bubble on the matrix
function startProjDrag(e,id){if(drawTool!=='none'||animTimer)return;e.preventDefault();dragProj=id;selectProject(id);}
// begins dragging a quadrant separator
function startSepDrag(e,axis){if(drawTool!=='none'||animTimer)return;e.preventDefault();dragSep=axis;}
// canvas mousedown dispatch (draw mode vs drag mode)
function onMouseDown(e){if(drawTool!=='none'){dragProj=null;dragSep=null;onDrawMouseDown(e);}}
// canvas mousemove: move project/separator or draw preview
function onMouseMove(e){
  const svg=G('matrix-svg'),rect=svg.getBoundingClientRect();
  const ax=eaxX(),ay=eaxY(),pw=rect.width-PAD.l-PAD.r,ph=rect.height-PAD.t-PAD.b;
  const mx=e.clientX-rect.left,my=e.clientY-rect.top;
  if(dragProj){const p=projects.find(p=>p.id===dragProj);if(p){p.x=+clamp(datX(mx,ax,pw),axX().min,axX().max).toFixed(2);const yv=+clamp(datY(my,ay,ph),axY().min,axY().max).toFixed(2);if(yMode==='visibility')p.vis=yv;else if(yMode==='enabler')p.ena=yv;else p.y=yv;}renderList();render();if(selId===dragProj)populateEditor();}
  else if(dragSep==='x'){sepX=+clamp(datX(mx,ax,pw),axX().min,axX().max).toFixed(3);render();}
  else if(dragSep==='y'){sepY=+clamp(datY(my,ay,ph),axY().min,axY().max).toFixed(3);render();}
  else if(drawStart)onDrawMouseMove(e);
}
// canvas mouseup: commit drag or finish drawing
function onMouseUp(e){
  if(dragProj||dragSep){saveState();dragProj=null;dragSep=null;return;}
  if(drawStart)onDrawMouseUp(e);
}
