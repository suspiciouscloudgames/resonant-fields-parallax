(()=>{
  const messages=PhoneMessages.create({
    async action(action,text,conversationId){try{const r=await fetch('/api/phone/action?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'messages.'+action,text,conversationId,instance:current.instance})});if(r.ok){const data=await r.json();if(data.phoneState.sceneInstance===current.instance){if(!snapshot.phoneState||data.phoneState.ui.revision>=snapshot.phoneState.ui.revision)snapshot.phoneState=data.phoneState;return snapshot.phoneState;}}}catch{}},
    async loadOlder(before,conversationId){return (await fetch('/api/messages?key='+encodeURIComponent(key)+'&before='+before+'&conversationId='+encodeURIComponent(conversationId))).json();}
  });
  const canvas=document.getElementById('phone-screen'),button=document.getElementById('fullscreen'),connection=document.getElementById('connection');
  const key=new URLSearchParams(location.search).get('key')||'',client=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  let serial=0,snapshot=null,received=0,lastGood=0,current={mode:'clock',elapsed:0},wake=null,selected=-1,down=null,pending=null,lastRound=null,lastRevision=-1,lastInteraction=0,videoCanvasKey=null;
  const video=document.getElementById('phone-video');DeviceScreen.setVideo(video);
  const videoControls=VideoControls.create(async(position,round)=>{
    const r=await fetch('/api/video/seek?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({position,round}),signal:AbortSignal.timeout(2500)});
    if(!r.ok)throw Error('Seek rejected');return (await r.json()).videoSeek;
  });
  function connected(){return !!snapshot?.connected&&performance.now()-lastGood<3000;}
  function game(){return snapshot?.game?.round===current.round?snapshot.game:null;}
  function playable(){return !messages.open&&connected()&&current.mode==='game'&&!current.paused&&game()?.stage==='play'&&game()?.phase==='idle'&&!pending;}
  async function poll(){
    const sent=performance.now();
    try{const r=await fetch('/api/state?key='+encodeURIComponent(key),{cache:'no-store',signal:AbortSignal.timeout(2500)});if(!r.ok)throw Error('Not connected');
      const data=await r.json();if(snapshot?.phoneState?.sceneInstance===data.phoneState?.sceneInstance&&snapshot.phoneState.ui.revision>data.phoneState.ui.revision)data.phoneState=snapshot.phoneState;received=performance.now();snapshot=data;DeviceScreen.setVideoSeek(data.videoSeek||null);lastGood=received;
      snapshot.elapsedAtReceive=data.elapsed+(!data.paused&&data.started?Math.max(0,data.serverTime-data.observedAt)+(received-sent)/2:0);
    }catch{}finally{setTimeout(poll,100);}
  }
  async function move(from,to){
    if(!playable()||!BlitzGame.adjacent(from,to))return;
    const board=game(),round=current.round;pending={revision:board.revision,since:performance.now()};selected=-1;lastInteraction=performance.now();
    const body=JSON.stringify({round,revision:board.revision,from,to,requestId:client+':'+(++serial)});
    try{
      const send=()=>fetch('/api/game/input?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(2000)});
      let r;try{r=await send();}catch{r=await send();}if(!r.ok)pending=null;
    }catch{pending=null;}
  }
  function cellAt(event){const rect=canvas.getBoundingClientRect();return BlitzView.hit(event.clientX-rect.left,event.clientY-rect.top,rect.width,rect.height);}
  canvas.style.touchAction='none';
  canvas.addEventListener('pointerdown',e=>{
    BlitzAudio.unlock();if(!playable())return;const cell=cellAt(e);if(cell<0)return;
    e.preventDefault();canvas.setPointerCapture(e.pointerId);down={cell,x:e.clientX,y:e.clientY,id:e.pointerId,selected};lastInteraction=performance.now();
    if(selected<0)selected=cell;
  });
  canvas.addEventListener('pointerup',e=>{
    if(!down||down.id!==e.pointerId)return;const start=down;down=null;if(!playable())return;
    const dx=e.clientX-start.x,dy=e.clientY-start.y,rect=canvas.getBoundingClientRect(),threshold=BlitzView.geometry(rect.width,rect.height).scale*56*.24;
    if(Math.max(Math.abs(dx),Math.abs(dy))>threshold){
      const to=start.cell+(Math.abs(dx)>Math.abs(dy)?(dx>0?1:-1):(dy>0?8:-8));if(BlitzGame.adjacent(start.cell,to))move(start.cell,to);else selected=-1;
    }else if(start.selected>=0&&start.selected!==start.cell&&BlitzGame.adjacent(start.selected,start.cell))move(start.selected,start.cell);
    else selected=start.selected===start.cell?-1:start.cell;
  });
  canvas.addEventListener('pointercancel',()=>{down=null;selected=-1;});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  function frame(){
    const now=performance.now(),live=connected();
    if(live&&snapshot.started)current=ExhibitionPlayback.project(snapshot,Math.max(0,snapshot.serverTime-snapshot.observedAt)+now-received);
    else current={mode:'clock',elapsed:0,paused:true,round:null,instance:snapshot?.current?.instance};
    const wall=snapshot?snapshot.serverTime+now-received:Date.now();
    DeviceScreen.setPhoneState(snapshot?.phoneState);DeviceScreen.setVideoRound(current.instance);
    messages.update(snapshot?.phoneState,current,wall);
    video.hidden=current.mode!=='youtube'||messages.open;
    videoControls.update(messages.open?{...current,mode:'messages'}:current);
    if(messages.open){selected=-1;down=null;}
    const board=game();
    if(lastRound!==current.round||current.mode!=='game'){selected=-1;pending=null;down=null;lastInteraction=now;lastRound=current.round;}
    if(board&&lastRevision!==board.revision){selected=-1;if(pending&&pending.revision!==board.revision)pending=null;lastRevision=board.revision;}
    if(pending&&now-pending.since>1200)pending=null;
    button.hidden=!!document.fullscreenElement;connection.hidden=live;DeviceScreen.update(current);DeviceScreen.setGame(board);BlitzAudio.update({...current,paused:current.paused||messages.open||board?.stage==='entry'},board);
    const w=Math.round(innerWidth*devicePixelRatio),h=Math.round(innerHeight*devicePixelRatio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const stillVideoUI=current.mode==='youtube'&&!messages.open,paintKey=stillVideoUI?[current.instance,w,h].join(':'):null;
    if(!stillVideoUI||videoCanvasKey!==paintKey)DeviceScreen.render(canvas,current,wall,{selected,notificationsInDOM:true,seekControl:true,nativeVideo:true,hint:playable()&&now-lastInteraction>6000});
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
  window.PhoneView={get state(){return current;},get messages(){return messages.state;},get connected(){return connected();},get game(){return game();},get playable(){return playable();},get selected(){return selected;},get pending(){return !!pending;}};
  poll();requestAnimationFrame(frame);
})();
