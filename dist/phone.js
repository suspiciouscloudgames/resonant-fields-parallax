(()=>{
  const messages=PhoneMessages.create({
    async action(action,text,conversationId){try{const r=await fetch('/api/phone/action?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'messages.'+action,text,conversationId,instance:current.instance})});if(r.ok){const data=await r.json();if(data.phoneState.sceneInstance===current.instance){if(!snapshot.phoneState||data.phoneState.ui.revision>=snapshot.phoneState.ui.revision)snapshot.phoneState=data.phoneState;return snapshot.phoneState;}}}catch{}},
    async loadOlder(before,conversationId){return (await fetch('/api/messages?key='+encodeURIComponent(key)+'&before='+before+'&conversationId='+encodeURIComponent(conversationId))).json();}
  });
  const canvas=document.getElementById('phone-screen'),button=document.getElementById('fullscreen'),connection=document.getElementById('connection');
  const key=new URLSearchParams(location.search).get('key')||'',client=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  // The combined local preview already plays the PC mix on the same speakers.
  const audioEnabled=new URLSearchParams(location.search).get('audio')!=='off';
  SceneAudio.unlock();
  let serverId=null;
  let serial=0,snapshot=null,received=0,lastGood=0,current={mode:'clock',elapsed:0},wake=null,pending=null,lastRound=null,lastInteraction=0,videoCanvasKey=null;
  const video=document.getElementById('phone-video');DeviceScreen.setVideo(video);
  const videoControls=VideoControls.create(async(position,round)=>{
    const r=await fetch('/api/video/seek?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({position,round}),signal:AbortSignal.timeout(2500)});
    if(!r.ok)throw Error('Seek rejected');return (await r.json()).videoSeek;
  });
  function connected(){return !!snapshot?.connected&&performance.now()-lastGood<3000;}
  function authoritative(){return snapshot?.game?.round===current.round?snapshot.game:null;}
  function game(){return pending?.round===current.round&&pending.view?pending.view:authoritative();}
  let sleeping=!ExhibitionHours.isOpen();
  function playable(){return !sleeping&&!messages.open&&connected()&&current.mode==='game'&&!current.paused&&game()?.stage==='play'&&game()?.phase==='idle'&&!pending;}
  async function poll(){
    const sent=performance.now();
    try{const r=await fetch('/api/state?key='+encodeURIComponent(key),{cache:'no-store',signal:AbortSignal.timeout(2500)});if(!r.ok)throw Error('Not connected');
      const data=await r.json();
      if(serverId&&data.serverId&&serverId!==data.serverId){location.reload();return;}
      serverId=data.serverId||serverId;
      if(snapshot?.phoneState?.sceneInstance===data.phoneState?.sceneInstance&&snapshot.phoneState.ui.revision>data.phoneState.ui.revision)data.phoneState=snapshot.phoneState;received=performance.now();snapshot=data;DeviceScreen.setVideoSeek(data.videoSeek||null);lastGood=received;
      snapshot.elapsedAtReceive=data.elapsed+(!data.paused&&data.started?Math.max(0,data.serverTime-data.observedAt)+(received-sent)/2:0);
    }catch{}finally{setTimeout(poll,40);}
  }
  async function move(from,to){
    if(!playable()||!BlitzGame.adjacent(from,to))return false;
    const board=authoritative(),round=current.round,now=performance.now();
    const action={revision:board.revision,since:now,round,ack:null,elapsed:current.elapsed};
    if(board.simulation){action.engine=BlitzGame.fromSnapshot(board);action.engine.swap(from,to,current.elapsed);action.view={...board,...action.engine.snapshot(),elapsed:current.elapsed};}
    pending=action;lastInteraction=now;
    const body=JSON.stringify({round,revision:board.revision,from,to,requestId:client+':'+(++serial)});
    try{
      const send=()=>fetch('/api/game/input?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(2000)});
      let r;try{r=await send();}catch{r=await send();}if(!r.ok){if(pending===action)pending=null;return false;}
      action.ack=(await r.json()).id;return true;
    }catch{if(pending===action)pending=null;return false;}
  }
  const input=BlitzInput.create(canvas,{canPlay:playable,move,interact(){BlitzAudio.unlock();lastInteraction=performance.now();}});
  const presentation=BlitzPresentation.create();
  function frame(){
    const now=performance.now(),live=connected();
    const age=snapshot?Math.max(0,snapshot.serverTime-snapshot.observedAt)+now-received:0;
    if(live&&snapshot.started)current=ExhibitionPlayback.project(snapshot,age);
    else current={mode:'clock',elapsed:0,paused:true,round:null,instance:snapshot?.current?.instance};
    const wall=snapshot?snapshot.serverTime+now-received:Date.now();
    sleeping=!ExhibitionHours.isOpen(wall)||!!snapshot?.sleeping;
    ExhibitionHours.setSleeping(sleeping);
    if(sleeping)current={...current,mode:'clock',paused:true,sceneLock:true};
    DeviceScreen.setPhoneState(snapshot?.phoneState);DeviceScreen.setVideoRound(current.instance);
    messages.update(snapshot?.phoneState,current,wall);
    video.hidden=current.mode!=='youtube'||messages.open;
    videoControls.update(messages.open?{...current,mode:'messages'}:current);
    if(lastRound!==current.round||current.mode!=='game'){pending=null;lastInteraction=now;lastRound=current.round;}
    const host=authoritative();
    if(pending){
      if(!live||current.paused||host?.stage!=='play')pending=null;
      else{
        if(pending.engine){const t=pending.elapsed+now-pending.since;pending.view={...host,...pending.engine.advance(t),elapsed:t};}
        const acknowledged=pending.ack!==null&&snapshot.inputAck>=pending.ack;
        if(acknowledged&&(host.revision<=pending.revision||host.phase==='idle'&&(!pending.view||pending.view.phase==='idle')))pending=null;
        else if(!acknowledged&&now-pending.since>3000)pending=null;
      }
    }
    const board=game();
    if(!live||current.mode!=='game')presentation.reset();
    const display=presentation.sample(board,pending?.view?.elapsed??current.elapsed,age,now,current.paused);
    const renderView={...current,elapsed:display.elapsed};
    input.update(board,live&&!messages.open&&!current.paused&&current.mode==='game');
    button.hidden=!!document.fullscreenElement;connection.hidden=true;DeviceScreen.update(current);DeviceScreen.setGame(display.game);
    const gameAudio=current.mode==='game'&&!current.paused&&!messages.open&&board?.stage!=='entry';
    BlitzAudio.update({...renderView,paused:!audioEnabled||!gameAudio},board);
    const cue=snapshot?.current,advance=live&&!current.paused?Math.max(0,Math.min(age,1000)):0;
    SceneAudio.update(cue?{...cue,phaseTime:cue.phaseTime+advance,clock:cue.clock+advance}:null,!audioEnabled||!live||!snapshot?.started||current.paused,gameAudio);
    const w=Math.round(innerWidth*devicePixelRatio),h=Math.round(innerHeight*devicePixelRatio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const stillVideoUI=current.mode==='youtube'&&!messages.open,paintKey=stillVideoUI?[current.instance,w,h].join(':'):null;
    if(!stillVideoUI||videoCanvasKey!==paintKey)DeviceScreen.render(canvas,renderView,wall,{...input.visual,notificationsInDOM:true,seekControl:true,nativeVideo:true,hint:playable()&&now-lastInteraction>6000});
    videoCanvasKey=paintKey;canvas.dataset.mode=messages.state.mode;
    canvas.setAttribute('aria-label',current.mode==='clock'?'모바일 시계 화면':current.mode==='youtube'?'Gaza Child Calls Himself Man of the House · Shorts':'Bejeweled Blitz · 보석을 밀거나 두 개를 눌러 교환');
    requestAnimationFrame(frame);
  }
  async function keepAwake(){try{if(navigator.wakeLock&&document.visibilityState==='visible')wake=await navigator.wakeLock.request('screen');}catch{}}
  document.addEventListener('pointerdown',()=>{BlitzAudio.unlock();DeviceScreen.unlockVideo();keepAwake();},{once:true});
  button.onclick=async()=>{BlitzAudio.unlock();DeviceScreen.unlockVideo();try{await document.documentElement.requestFullscreen();await keepAwake();}catch{}};
  document.addEventListener('fullscreenchange',()=>{button.hidden=!!document.fullscreenElement;});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){keepAwake();lastGood=0;}else if(wake)wake.release().catch(()=>{});});
  document.getElementById('close-operator').onclick=()=>document.getElementById('operator').hidden=true;
  addEventListener('keydown',async e=>{if(e.key.toLowerCase()!=='h')return;const panel=document.getElementById('operator');panel.hidden=!panel.hidden;
    if(!panel.hidden){try{const info=await(await fetch('/api/info?key='+encodeURIComponent(key))).json();const a=document.getElementById('phone-link');a.textContent=info.phoneUrl;a.href=info.phoneUrl;}catch{}}});
  window.PhoneView={get sleeping(){return sleeping;},get serverId(){return serverId;},get state(){return current;},get messages(){return messages.state;},get connected(){return connected();},get game(){return game();},get playable(){return playable();},get selected(){return input.selected;},get pending(){return !!pending;}};
  poll();requestAnimationFrame(frame);
})();
