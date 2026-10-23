(() => {
  const params=new URLSearchParams(location.search),exhibition=params.get('exhibition')==='1';
  const id=params.get('screen')==='portrait'?'portrait':'landscape';
  const [w,h]=id==='landscape'?[165,100]:[100,165],canvas=document.getElementById('screen');
  const controls=document.getElementById('controls'),error=document.getElementById('error');
  const exitMenu=document.getElementById('exit-menu'),exitButton=document.getElementById('exit-game');
  window.ExhibitionDisplay={exitRequested:false};
  if(exhibition){
    document.body.classList.add('exhibition');
    // Only a physical Escape key opens the operator exit control. Touches on
    // the artwork cannot reveal controls, navigate, zoom, or pause the loop.
    const block=e=>{
      if(!exitMenu.hidden&&exitButton.contains(e.target)&&!['contextmenu','wheel','dragstart'].includes(e.type))return;
      if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();
    };
    for(const type of ['pointerdown','pointermove','pointerup','touchstart','touchmove','touchend','click','dblclick','contextmenu','wheel','dragstart'])
      window.addEventListener(type,block,{capture:true,passive:false});
    window.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
        exitMenu.hidden=!exitMenu.hidden;
        document.documentElement.classList.toggle('operator-exit-open',!exitMenu.hidden);
        if(exitMenu.hidden){exitButton.blur();hide();}else{document.body.classList.remove('quiet');exitButton.focus();}
        return;
      }
      if(!exitMenu.hidden&&['Enter',' '].includes(e.key)){
        e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)exitButton.click();return;
      }
      e.preventDefault();e.stopImmediatePropagation();
    },true);
    exitButton.onclick=()=>{
      window.ExhibitionDisplay.exitRequested=true;
      const app=hub();if(app)app.exitRequested=true;
      exitButton.disabled=true;
    };
  }
  let menuTimer,hidden=false;
  document.getElementById('title').textContent=`${id==='landscape'?'A · 방 안 / 가로':'B · 창 밖 / 세로'} · ${w} × ${h} mm`;
  function hub(){try{return opener&&!opener.closed&&opener.Installation;}catch{return null;}}
  function hide(){if(controls.contains(document.activeElement))document.activeElement.blur();hidden=true;controls.classList.add('hidden');document.body.classList.add('quiet');}
  function show(){hidden=false;controls.classList.remove('hidden');document.body.classList.remove('quiet');clearTimeout(menuTimer);if(document.fullscreenElement)menuTimer=setTimeout(hide,3500);
    if(exhibition)fetch('/api/info?key='+encodeURIComponent(params.get('run')||'')).then(r=>r.json()).then(info=>{
      const link=document.getElementById('phone-link');link.textContent='모바일 연결: '+info.phoneUrl;link.href=info.phoneUrl;link.hidden=false;
    }).catch(()=>{});
  }
  async function fullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{document.getElementById('size').textContent='브라우저의 전체화면 기능을 사용해 주세요.';}}
  document.getElementById('fullscreen').onclick=fullscreen;document.getElementById('hide').onclick=hide;
  window.addEventListener('keydown',e=>{
    if(exhibition)return;
    if(/INPUT|BUTTON|A/.test(e.target.tagName))return;
    if(e.key.toLowerCase()==='f'&&!exhibition)fullscreen();
    if(e.key.toLowerCase()==='h')hidden?show():hide();
    if(exhibition&&!e.repeat){
      const app=hub(),key=e.key.toLowerCase();if(!app)return;
      if(app.playback){
        if(key===' '){e.preventDefault();app.playback.pause(!app.playback.status.paused);}
        if(key==='r')app.playback.start();
      }
    }
  });
  window.addEventListener('keydown',e=>{if(!exhibition&&e.key==='Enter')e.preventDefault();},true);
  document.addEventListener('fullscreenchange',()=>{if(exhibition)return;show();if(document.fullscreenElement){document.activeElement.blur();menuTimer=setTimeout(hide,2500);}});
  // Keep exhibition output free of menus; H explicitly restores controls.
  document.addEventListener('mousemove',()=>{if(!exhibition&&!hidden)show();});
  function frame(){
    const app=hub();error.hidden=exhibition||!!app;
    if(app?.engine.ready){
      if(app.advance)app.advance(Date.now());else app.engine.advance(Date.now());
      if(exhibition)ExhibitionHours.setSleeping(app.sleeping??!ExhibitionHours.isOpen());
      // In exhibition fullscreen the known physical active area is the ruler.
      // Native resolutions need not have square physical pixels (e.g. 1024x600).
      const full=exhibition||!!document.fullscreenElement;
      // A desktop preview has a stable nominal size; real displays use fullscreen.
      const scale=app.pxPerMM||96/25.4,cw=full?innerWidth:w*scale,ch=full?innerHeight:h*scale,dpr=devicePixelRatio||1;
      canvas.style.width=(Math.round(cw*dpr)/dpr)+'px';canvas.style.height=(Math.round(ch*dpr)/dpr)+'px';
      const pw=Math.max(1,Math.round(cw*dpr)),ph=Math.max(1,Math.round(ch*dpr));
      if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
      const r=app.rect(id);PixelOutput.paint(canvas,app.engine.canvas,r,pw,ph,app.engine.density);
      app.paintCaption(canvas,id);
      const ctx=canvas.getContext('2d');
      if(document.getElementById('alignment').checked){ctx.strokeStyle='#e5864d';ctx.lineWidth=2*dpr;ctx.strokeRect(dpr,dpr,pw-2*dpr,ph-2*dpr);}
      document.body.classList.toggle('fullscreen',full);
      document.getElementById('size').textContent=`${innerWidth} × ${innerHeight} px${full?` · 전체 표시 영역을 ${w} × ${h} mm로 사용합니다.`:` · 미리보기. 실제 ${w} × ${h} mm 디스플레이에서는 F 키로 전체화면을 사용하세요.`}`;
    }
    if(exhibition&&!app)ExhibitionHours.setSleeping(!ExhibitionHours.isOpen());
    requestAnimationFrame(frame);
  }
  if(exhibition){
    document.getElementById('fullscreen').hidden=true;
    controls.querySelector('p').textContent='Esc: 게임 종료 메뉴';
  }
  hide();
  requestAnimationFrame(frame);
})();
