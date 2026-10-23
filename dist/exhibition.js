/* Hidden shared renderer for the portable exhibition. No studio UI is displayed. */
(()=>{
  const sizes={landscape:[165,100],portrait:[100,165]};
  const regions={landscape:{x:48,y:182},portrait:{x:145,y:182}};
  let session=null,sessionId=null,inputAck=0,phoneState=null;
  const playback=ExhibitionPlayback.create({
    exhibitionClip:(...args)=>SceneGame.exhibitionClip(...args),
    gameSession(id,time){if(id!==sessionId){session=BlitzSession.create(id);sessionId=id;}return session.advance(time);},
    renderExhibition(...args){
      const cue=args[4];DeviceScreen.setVideoRound(cue.instance);
      DeviceScreen.setGame(cue.phone.mode==='game'?session?.state:null);
      DeviceScreen.setPhoneState(phoneState);
      SceneGame.renderExhibition(...args);
    },
  });
  DeviceScreen.setVideo(document.getElementById('source-video'));
  SceneAudio.unlock();
  BlitzAudio.unlock();
  function foregroundAudio(cue){
    if(!cue||cue.phone.paused)return false;
    const view={...cue.phone,instance:cue.instance};
    if(PhoneMessages.project(phoneState,view).open)return false;
    if(view.mode==='game')return !!session&&session.state.stage!=='entry';
    return false;
  }
  const token=new URLSearchParams(location.search).get('run')||'';
  let lastPublish=0,publishing=false,lastDraw=-Infinity;
  async function publish(force=false){
    const now=Date.now();if(publishing||(!force&&now-lastPublish<40))return;
    lastPublish=now;publishing=true;
    try{const response=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json','X-Exhibition-Token':token},
      body:JSON.stringify({...playback.status,cues:playback.cues,observedAt:now,game:playback.status.current.id==='game'?session?.state:null,inputAck})});
      if(response.ok){const data=await response.json();DeviceScreen.setVideoSeek(data.videoSeek||null);phoneState=data.phoneState;DeviceScreen.setPhoneState(phoneState);for(const input of data.inputs||[]){
        if(input.id<=inputAck)continue;inputAck=input.id;
        const status=playback.status;
        if(session&&input.round===session.state.round&&!status.paused&&!status.current.phone.paused&&status.current.phone.mode==='game'&&input.revision===session.state.revision)
          session.swap(input.from,input.to,status.current.gameTime);
      }}
    }
    catch{}finally{publishing=false;}
  }
  window.Installation={
    sizes,engine:SceneGame,playback,pxPerMM:96/25.4,placementReady:false,error:null,
    // Both display windows request frames; compose the shared pixel scene once.
    advance(now){if(now-lastDraw>=1000/30-1){
      lastDraw=now;playback.advance(now);
      const cue=playback.status.current,paused=playback.status.paused||!playback.started,foreground=foregroundAudio(cue);
      SceneAudio.update(cue,paused,foreground);
      BlitzAudio.update({...cue?.phone,paused:paused||!foreground},cue?.phone.mode==='game'?session?.state:null);
    }publish();},publish,
    rect(id){const [w,h]=sizes[id];return {...regions[id],w:w*240/500,h:h*240/500};},
    paintCaption(canvas,id){
      const cue=playback.status.current;
      SceneCaptions.paint(canvas,id,{...SceneGame.status,cue,captionScreen:cue?.captionScreen,captionVisible:!!cue});
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
