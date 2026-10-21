/* Shared contents for the character's device and the real Android screen. */
window.DeviceScreen=(()=>{
  let state={mode:'clock',elapsed:0,paused:false},video=null,pixelKey='',pixelColors=[],game=null;
  const small=document.createElement('canvas');small.width=36;small.height=24;
  function update(next){
    state={...state,...next};
    if(!video)return;
    if(state.mode!=='youtube'){video.pause();return;}
    const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:2.2;
    const target=(state.elapsed/1000)%duration;
    if(video.readyState>=2&&Math.abs(video.currentTime-target)>.35)try{video.currentTime=target;}catch{}
    if(state.paused)video.pause();else if(video.paused)video.play().catch(()=>{});
  }
  function render(canvas,view=state,now=Date.now(),options={}){
    if(view.mode==='game'&&window.BlitzView){BlitzView.render(canvas,game,view.elapsed,{...options,wide:canvas.width>canvas.height});return;}
    const c=canvas.getContext('2d',{alpha:false}),w=canvas.width,h=canvas.height,wide=w>h;
    const W=wide?640:360,H=wide?400:h/w*360;c.setTransform(w/W,0,0,h/H,0,0);
    c.fillStyle='#101318';c.fillRect(0,0,W,H);c.textBaseline='top';c.textAlign='left';
    c.font='14px "Malgun Gothic",sans-serif';
    if(view.mode==='clock'){
      c.fillStyle='#e6e9e9';c.textAlign='center';
      const time=new Date(now),text=time.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
      c.font=`300 ${wide?84:76}px sans-serif`;c.fillText(text,W/2,wide?125:190);
      c.font='16px "Malgun Gothic",sans-serif';c.fillStyle='#a0a8af';
      c.fillText(time.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'}),W/2,wide?230:292);
    }else if(view.mode==='youtube'){
      c.fillStyle='#ff3333';c.fillRect(20,wide?16:42,29,20);c.fillStyle='#fff';c.beginPath();c.moveTo(31,wide?20:46);c.lineTo(31,wide?32:58);c.lineTo(41,wide?26:52);c.fill();
      c.font='600 21px sans-serif';c.fillText('YouTube',58,wide?15:40);
      const x=wide?24:0,y=wide?58:134,vw=wide?592:360,vh=vw*9/16;
      c.fillStyle='#000';c.fillRect(x,y,vw,vh);
      if(video?.readyState>=2)c.drawImage(video,x,y,vw,vh);
      c.fillStyle='#f04747';c.fillRect(x,y+vh-3,vw*Math.min(1,view.elapsed/42100),3);
      if(!wide){c.fillStyle='#f3f3f3';c.font='500 20px "Malgun Gothic",sans-serif';c.fillText('테스트',20,366);c.fillStyle='#69727c';c.fillRect(20,409,210,2);}
    }
    c.setTransform(1,0,0,1,0,0);
  }
  function pixels(){
    const key=(game?.revision||0)+':'+state.mode+':'+Math.floor(state.elapsed/83.333)+':'+(state.mode==='clock'?Math.floor(Date.now()/60000):'');
    if(key!==pixelKey){pixelKey=key;render(small);const a=small.getContext('2d').getImageData(0,0,36,24).data;pixelColors=Array.from({length:864},(_,i)=>`rgb(${a[i*4]},${a[i*4+1]},${a[i*4+2]})`);}
    return pixelColors;
  }
  return {update,render,pixels,setGame(value){game=value;},get game(){return game;},setVideo(element){video=element;},get state(){return state;}};
})();
