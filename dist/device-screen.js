/* Shared contents for the character's device and the real Android screen. */
window.DeviceScreen=(()=>{
  let state={mode:'clock',elapsed:0,paused:false},video=null,pixelKey='',pixelColors=[],game=null,videoSeek=null,videoRound=null,videoPreview=null,playing=false,phoneState=null;
  const small=document.createElement('canvas');small.width=24;small.height=40;
  function videoDuration(){return Number.isFinite(video?.duration)&&video.duration>0?video.duration:95.23;}
  function videoPosition(view=state){const offset=videoSeek?.round===videoRound?videoSeek.offset:0;return Math.max(0,Math.min(videoDuration()-.05,videoPreview??(view.elapsed/1000+offset)));}
  function setVideoSeek(value){if(!value)return;if(videoSeek?.round===value.round&&videoSeek.revision>value.revision)return;videoSeek=value;}
  function unlockVideo(){if(!video)return;video.muted=false;video.play().then(()=>{if(state.mode!=='youtube'||window.PhoneMessages?.project(phoneState,state).open)video.pause();}).catch(()=>{});}
  function update(next){
    state={paused:false,...next};
    if(!video)return;
    if(state.mode!=='youtube'||window.PhoneMessages?.project(phoneState,state).open){video.pause();return;}
    const target=videoPosition();
    if(video.readyState>=2&&!video.seeking&&Math.abs(video.currentTime-target)>(state.paused||videoPreview!==null?.001:.25))try{video.currentTime=target;}catch{}
    if(state.paused||videoPreview!==null||target>=videoDuration()-.06)video.pause();
    else if(video.paused&&!playing){playing=true;video.play().catch(()=>{}).finally(()=>playing=false);}
  }
  function render(canvas,view=state,now=Date.now(),options={}){
    const ui=window.PhoneMessages?.project(phoneState,view,now)||{};
    const mode=ui.open?'messages':view.mode;
    if(mode==='game'&&window.BlitzView)BlitzView.render(canvas,game,view.elapsed,{...options,transition:game?.transition,wide:canvas.width>canvas.height});
    const c=canvas.getContext('2d',{alpha:false}),w=canvas.width,h=canvas.height,wide=w>h;
    const W=wide?640:360,H=wide?400:h/w*360;c.setTransform(w/W,0,0,h/H,0,0);
    if(mode!=='game'){c.fillStyle='#101318';c.fillRect(0,0,W,H);}c.textBaseline='top';c.textAlign='left';
    c.font='14px "Malgun Gothic",sans-serif';
    if(mode==='clock'){
      c.fillStyle='#e6e9e9';c.textAlign='center';
      const time=new Date(now),text=time.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
      c.font=`300 ${wide?84:76}px sans-serif`;c.fillText(text,W/2,wide?125:190);
      c.font='16px "Malgun Gothic",sans-serif';c.fillStyle='#a0a8af';
      c.fillText(time.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'}),W/2,wide?230:292);
    }else if(mode==='youtube'){
      c.fillStyle='#080808';c.fillRect(0,0,W,H);
      const header=wide?0:48,footer=wide?0:67,areaH=Math.max(1,H-header-footer);
      if(video?.readyState>=2){const scale=Math.min(W/video.videoWidth,areaH/video.videoHeight),vw=video.videoWidth*scale,vh=video.videoHeight*scale;c.drawImage(video,(W-vw)/2,header+(areaH-vh)/2,vw,vh);}
      if(!wide){
        c.fillStyle='#ff2445';c.beginPath();c.roundRect(17,15,22,22,7);c.fill();c.fillStyle='#fff';c.beginPath();c.moveTo(25,20);c.lineTo(25,32);c.lineTo(34,26);c.fill();
        c.font='bold 21px Arial';c.fillText('Shorts',47,15);
        // Raster decoration only: no navigation, channel, sharing or like handlers.
        c.font='22px Arial';c.textAlign='right';c.fillText('⋮',W-19,14);c.textAlign='left';
        if(!options.seekControl){const position=videoPosition(view),duration=videoDuration();c.fillStyle='#555';c.fillRect(16,H-32,W-32,3);c.fillStyle='#ff3048';c.fillRect(16,H-32,(W-32)*position/duration,3);c.font='10px Arial';c.fillStyle='#ddd';c.fillText(Math.floor(position/60)+':'+String(Math.floor(position%60)).padStart(2,'0'),16,H-21);c.textAlign='right';c.fillText('1:35',W-16,H-21);}
      }
    }
    if(mode==='messages'){
      c.fillStyle='#fff';c.fillRect(0,0,W,H);c.fillStyle='#f5f5f8';c.fillRect(0,0,W,135);
      c.fillStyle='#a6aab3';c.beginPath();c.arc(W/2,72,25,0,Math.PI*2);c.fill();c.fillStyle='#111';c.font='14px sans-serif';c.textAlign='center';c.fillText(ui.conversationId?ui.conversation.title:'메시지',W/2,106);
      const rows=ui.threadItems.slice(-Math.max(1,Math.floor((H-210)/58)));
      rows.forEach((item,i)=>{c.fillStyle=item.incoming?'#e9e9eb':'#34c759';c.beginPath();c.roundRect(item.incoming?16:W-180,155+i*58,164,40,16);c.fill();c.fillStyle=item.incoming?'#111':'#fff';c.textAlign='left';c.font='16px sans-serif';c.fillText(item.text.slice(0,16),item.incoming?28:W-168,168+i*58);});
      if(ui.conversationId){c.strokeStyle='#ddd';c.beginPath();c.roundRect(40,H-49,W-55,33,16);c.stroke();}
      else for(const [i,conversation] of ui.conversations.entries()){const y=160+i*82;c.fillStyle='#a6aab3';c.beginPath();c.arc(38,y+18,23,0,Math.PI*2);c.fill();c.textAlign='left';c.fillStyle='#111';c.font='bold 16px sans-serif';c.fillText(conversation.title,75,y);c.fillStyle='#8e8e93';c.font='13px sans-serif';c.fillText((conversation.latest?.text||'아직 메시지가 없습니다').slice(0,20),75,y+26);}
    }
    if(!options.notificationsInDOM&&(ui.banner||!ui.open&&ui.lock)){
      const cards=ui.lock?ui.lockItems.slice(0,3):[ui.latest];
      cards.forEach((item,i)=>{const y=ui.lock?H*.48+i*85:12;if(y+77>H-20)return;c.fillStyle='#e1e4ea';c.beginPath();c.roundRect(12,y,W-24,77,18);c.fill();c.fillStyle='#34c759';c.fillRect(24,y+20,33,33);c.fillStyle='#202026';c.font='bold 14px sans-serif';c.textAlign='left';c.fillText(item?.sender||'메시지',68,y+15);c.font='14px sans-serif';c.fillText((item?.text||'').slice(0,19),68,y+39);});
    }
    if(Number.isFinite(view.sleepElapsed)&&view.sleepElapsed<650){c.fillStyle='rgba(0,0,0,'+Math.max(0,1-view.sleepElapsed/650)+')';c.fillRect(0,0,W,H);}
    c.setTransform(1,0,0,1,0,0);
  }
  function pixels(){
    const key=state.instance+':'+Math.floor((state.sleepElapsed||0)/83)+':'+(phoneState?.ui?.revision||0)+':'+(game?.revision||0)+':'+state.mode+':'+Math.floor(state.elapsed/83.333)+':'+(state.mode==='clock'?Math.floor(Date.now()/60000):'');
    if(key!==pixelKey){pixelKey=key;render(small);const a=small.getContext('2d').getImageData(0,0,24,40).data;pixelColors=Array.from({length:960},(_,i)=>`rgb(${a[i*4]},${a[i*4+1]},${a[i*4+2]})`);}
    return pixelColors;
  }
  return {update,render,pixels,pixelWidth:24,pixelHeight:40,setPhoneState(value){phoneState=value;},setVideoSeek,setVideoRound(value){if(value!==videoRound){videoSeek=null;videoPreview=null;}videoRound=value;},previewVideo(value){videoPreview=value;},videoPosition,unlockVideo,get videoDuration(){return videoDuration();},setGame(value){game=value;},get game(){return game;},setVideo(element){video=element;},get state(){return state;}};
})();
