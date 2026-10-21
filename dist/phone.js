(()=>{
  const canvas=document.getElementById('phone-screen'),button=document.getElementById('fullscreen'),connection=document.getElementById('connection');
  const key=new URLSearchParams(location.search).get('key')||'';let snapshot=null,received=0,lastGood=0,current={mode:'clock',elapsed:0},wake=null;
  DeviceScreen.setVideo(document.getElementById('phone-video'));
  async function poll(){
    const sent=performance.now();
    try{const r=await fetch('/api/state?key='+encodeURIComponent(key),{cache:'no-store',signal:AbortSignal.timeout(2500)});if(!r.ok)throw Error('Not connected');
      const data=await r.json();received=performance.now();snapshot=data;lastGood=received;
      snapshot.elapsedAtReceive=data.elapsed+(!data.paused&&data.started?Math.max(0,data.serverTime-data.observedAt)+(received-sent)/2:0);
    }catch{}finally{setTimeout(poll,250);}
  }
  function frame(){
    const now=performance.now(),connected=!!snapshot?.connected&&now-lastGood<3000;
    if(connected&&snapshot.started){const time=snapshot.elapsedAtReceive+(snapshot.paused?0:now-received),cue=ExhibitionPlayback.sample(snapshot.cues,time);current={...cue.phone,paused:snapshot.paused};}
    else current={mode:'clock',elapsed:0,paused:true};
    connection.hidden=connected;DeviceScreen.update(current);
    const w=Math.round(innerWidth*devicePixelRatio),h=Math.round(innerHeight*devicePixelRatio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    DeviceScreen.render(canvas,current);canvas.dataset.mode=current.mode;canvas.setAttribute('aria-label',current.mode==='clock'?'모바일 시계 화면':current.mode==='youtube'?'유튜브 테스트 영상':'Bejeweled Blitz 테스트 화면');
    requestAnimationFrame(frame);
  }
  async function keepAwake(){try{if(navigator.wakeLock&&document.visibilityState==='visible')wake=await navigator.wakeLock.request('screen');}catch{}}
  button.onclick=async()=>{try{await document.documentElement.requestFullscreen();await keepAwake();}catch{}};
  document.addEventListener('fullscreenchange',()=>{button.hidden=!!document.fullscreenElement;});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){keepAwake();lastGood=0;}else if(wake)wake.release().catch(()=>{});});
  document.getElementById('close-operator').onclick=()=>document.getElementById('operator').hidden=true;
  addEventListener('keydown',async e=>{if(e.key.toLowerCase()!=='h')return;const panel=document.getElementById('operator');panel.hidden=!panel.hidden;
    if(!panel.hidden){try{const info=await(await fetch('/api/info?key='+encodeURIComponent(key))).json();const a=document.getElementById('phone-link');a.textContent=info.phoneUrl;a.href=info.phoneUrl;}catch{}}});
  window.PhoneView={get state(){return current;},get connected(){return !!snapshot?.connected&&performance.now()-lastGood<3000;}};
  poll();requestAnimationFrame(frame);
})();
