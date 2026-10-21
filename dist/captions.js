/* Typography is rendered at display resolution, independently of the pixel-art master. */
window.SceneCaptions=(()=>{
  const text='테스트';
  const indoor=new Set(['enter','sit','cigarette','smoke','smokeHold','tablet','read','gaming','stow','stand','exit','return_enter','return_sit','home','plant_walk','plant_care','plant_back','plant_sit']);
  const outdoor=new Set(['emerge','pause','raise','outside','lower','encounter','dog_encounter','rain_encounter','ended']);
  const cache=new Map(),fontMM=8;
  const visible=(id,state)=>(id==='landscape'?indoor:outdoor).has(state);
  function layout(id,width,height){
    const key=[id,width,height].join(':');if(cache.has(key))return cache.get(key);
    const [mmW,mmH]=id==='portrait'?[100,165]:[165,100],sx=width/mmW,sy=height/mmH;
    const lines=[text];
    const font=`600 ${fontMM}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
    const measure=document.createElement('canvas').getContext('2d');measure.font=font;
    const padding=3,margin=4,lineHeight=11.2;
    const mmWidth=Math.min(mmW-margin*2,Math.max(...lines.map(line=>measure.measureText(line).width))+padding*2);
    const mmHeight=lines.length*lineHeight+padding*2;
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(mmWidth*sx);canvas.height=Math.ceil(mmHeight*sy);
    const c=canvas.getContext('2d',{alpha:false});
    c.fillStyle='#292b28';c.fillRect(0,0,canvas.width,canvas.height);
    c.fillStyle='#73766d';c.fillRect(0,0,canvas.width,Math.max(1,Math.round(.25*sy)));
    // Draw directly at native pixel density. Font edge shades are baked into
    // this opaque plate; no low-resolution glyph upscaling or translucent overlay.
    c.scale(sx,sy);c.font=font;c.textBaseline='top';c.fillStyle='#eeeDE6';
    lines.forEach((line,i)=>c.fillText(line,padding,padding+i*lineHeight));
    const result={canvas,x:Math.round(margin*sx),y:id==='portrait'?Math.round(margin*sy):height-Math.round(margin*sy)-canvas.height,w:canvas.width,h:canvas.height,fontMM,lines};
    if(cache.size>24)cache.clear();cache.set(key,result);return result;
  }
  function paint(target,id,status){
    if(status.captionVisible===false)return;
    if(status.captionScreen?id!==status.captionScreen:!visible(id,status.state))return;
    const caption=layout(id,target.width,target.height),c=target.getContext('2d');
    c.drawImage(caption.canvas,caption.x,caption.y);
  }
  function drawRegion(ctx,id,status,r){
    if(!visible(id,status.state))return;
    const caption=layout(id,Math.max(1,Math.round(r.w)),Math.max(1,Math.round(r.h)));
    ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();
    ctx.drawImage(caption.canvas,Math.round(r.x)+caption.x,Math.round(r.y)+caption.y);ctx.restore();
  }
  return {text,visible,layout,paint,drawRegion};
})();
