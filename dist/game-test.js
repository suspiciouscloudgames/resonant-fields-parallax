/* Game-only rehearsal: same rules, artwork and audio as the exhibition phone. */
(()=>{
  const afternoon=new Date();afternoon.setDate(afternoon.getDate()-7);afternoon.setHours(14,0,0,0);
  const local={loopId:'rehearsal',sceneInstance:'rehearsal',ui:{open:false,conversationId:null,revision:0,readThroughByConversation:{daughter:5,neighbor:0},dismissed:0},messages:PhoneMessages.presets.map((item,i)=>({...item,id:i+1,preset:true,conversationId:'daughter',sender:item.incoming?'딸':'나',receivedAt:afternoon.getTime()+i*420000,sceneInstance:'preset'})),total:5};
  let delivered=false;
  const messages=PhoneMessages.create({action(type,text,conversationId){
    local.ui.revision++;
    if(type==='open'||type==='select'){local.ui.open=true;local.ui.conversationId=conversationId;local.ui.readThroughByConversation[conversationId]=local.messages.filter(m=>m.conversationId===conversationId).at(-1)?.id||0;}
    if(type==='list'){local.ui.open=true;local.ui.conversationId=null;}
    if(type==='back'){local.ui.open=false;local.ui.conversationId=null;}
    if(type==='dismiss')local.ui.dismissed=local.messages.at(-1)?.id||0;
    if(type==='reply')local.messages.push({id:local.messages.length+1,text,incoming:false,conversationId,sender:'나',receivedAt:Date.now(),sceneInstance:'rehearsal'});
    local.total=local.messages.length;return local;
  }});
  const canvas=document.getElementById('board');let round=1,engine=BlitzSession.create('rehearsal:'+Date.now()),started=0,selected=-1,down=null,elapsed=0,entry=0;
  function position(e){const r=canvas.getBoundingClientRect();return BlitzView.hit(e.clientX-r.left,e.clientY-r.top,r.width,r.height);}
  function play(a,b){if(messages.open||entry||engine.state.stage!=='play'||!BlitzGame.adjacent(a,b))return;if(engine.swap(a,b,elapsed))selected=-1;}
  canvas.addEventListener('pointerdown',e=>{BlitzAudio.unlock();const cell=position(e);if(messages.open||entry||cell<0||engine.state.stage!=='play'||engine.state.phase!=='idle')return;if(!started)started=performance.now();e.preventDefault();canvas.setPointerCapture(e.pointerId);down={cell,x:e.clientX,y:e.clientY,id:e.pointerId,selected};if(selected<0)selected=cell;});
  canvas.addEventListener('pointerup',e=>{if(!down||down.id!==e.pointerId)return;const p=down;down=null;if(messages.open||engine.state.stage!=='play'||engine.state.phase!=='idle')return;const dx=e.clientX-p.x,dy=e.clientY-p.y,r=canvas.getBoundingClientRect(),threshold=BlitzView.geometry(r.width,r.height).scale*56*.24;
    if(Math.max(Math.abs(dx),Math.abs(dy))>threshold){const to=p.cell+(Math.abs(dx)>Math.abs(dy)?(dx>0?1:-1):(dy>0?8:-8));play(p.cell,to);}
    else if(p.selected>=0&&p.selected!==p.cell&&BlitzGame.adjacent(p.selected,p.cell))play(p.selected,p.cell);else selected=p.selected===p.cell?-1:p.cell;
  });
  canvas.addEventListener('pointercancel',()=>{down=null;selected=-1;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  function frame(now){
    elapsed=started?now-started:0;
    const snapshot=engine.advance(elapsed),transition=snapshot.transition;round=snapshot.roundNumber;entry=snapshot.stage==='entry';
    const w=Math.round(innerWidth*devicePixelRatio),h=Math.round(innerHeight*devicePixelRatio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    if(elapsed>=95000&&!delivered){delivered=true;local.messages.push({id:local.messages.length+1,text:'5씬 테스트',incoming:true,conversationId:'daughter',sender:'딸',receivedAt:Date.now(),sceneInstance:'rehearsal'});local.total=local.messages.length;local.ui.revision++;}
    if(snapshot.complete){local.ui.open=false;}
    const view={mode:snapshot.complete?'clock':'game',elapsed:snapshot.elapsed,round:snapshot.round,instance:'rehearsal'};
    messages.update(local,view);
    if(messages.open){selected=-1;down=null;}
    DeviceScreen.setPhoneState(local);DeviceScreen.setGame(snapshot);DeviceScreen.update(view);DeviceScreen.render(canvas,view,Date.now(),{selected,transition,notificationsInDOM:true});
    BlitzAudio.update({...view,paused:!started||messages.open||entry},snapshot);
    requestAnimationFrame(frame);
  }
  window.GameTest={get state(){return {round,elapsed,started:!!started,selected,...engine.state};}};
  requestAnimationFrame(frame);
})();
