/* Hidden shared renderer for the portable exhibition. No studio UI is displayed. */
(()=>{
  const sizes={landscape:[165,100],portrait:[100,165]};
  const regions={landscape:{x:48,y:182},portrait:{x:145,y:182}};
  const playback=ExhibitionPlayback.create(SceneGame);
  DeviceScreen.setVideo(document.getElementById('source-video'));
  const token=new URLSearchParams(location.search).get('run')||'';
  let lastPublish=0,publishing=false;
  async function publish(force=false){
    const now=Date.now();if(publishing||(!force&&now-lastPublish<250))return;
    lastPublish=now;publishing=true;
    try{await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json','X-Exhibition-Token':token},
      body:JSON.stringify({...playback.status,current:undefined,cues:playback.cues,observedAt:now})});}
    catch{}finally{publishing=false;}
  }
  window.Installation={
    sizes,engine:SceneGame,playback,pxPerMM:96/25.4,placementReady:false,error:null,
    advance(now){playback.advance(now);publish();},publish,
    rect(id){const [w,h]=sizes[id];return {...regions[id],w:w*240/500,h:h*240/500};},
    paintCaption(canvas,id){
      const cue=playback.status.current;
      SceneCaptions.paint(canvas,id,{...SceneGame.status,captionScreen:cue?.captionScreen,captionVisible:cue?.captionVisible});
    },
  };
  // An exported placement can travel on the USB alongside the artwork.
  fetch('window-installation.json').then(r=>{
    if(!r.ok)throw Error('화면 배치 설정 파일을 찾을 수 없습니다.');
    return r.json();
  }).then(config=>{
    if(config.version!==1||config.framingVersion!==5)throw Error('지원하지 않는 화면 배치 설정');
    for(const id of Object.keys(sizes)){
      const r=config.regions?.[id],rect=Installation.rect(id);
      if(!r||!Number.isFinite(r.x)||!Number.isFinite(r.y))throw Error('화면 배치 설정 오류');
      regions[id]={x:Math.max(0,Math.min(240-rect.w,r.x)),y:Math.max(64,Math.min(384-rect.h,r.y))};
    }
    Installation.placementReady=true;
  }).catch(error=>{Installation.error=error.message;console.error(error);});
  // Visible outputs advance this one clock, including while this hub is minimized.
})();
