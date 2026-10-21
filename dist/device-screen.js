/* Shared contents for the character's device and the real Android screen. */
window.DeviceScreen=(()=>{
  let state={mode:'clock',elapsed:0,paused:false},video=null,pixelKey='',pixelColors=[];
  const small=document.createElement('canvas');small.width=36;small.height=24;
  const colors=['#57b6e6','#ed685c','#80c96a','#b482eb','#f4c761','#f0ecdf'];
  function update(next){
    state={...state,...next};
    if(!video)return;
    if(state.mode!=='youtube'){video.pause();return;}
    const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:2.2;
    const target=(state.elapsed/1000)%duration;
    if(video.readyState>=2&&Math.abs(video.currentTime-target)>.35)try{video.currentTime=target;}catch{}
    if(state.paused)video.pause();else if(video.paused)video.play().catch(()=>{});
  }
  function boardAt(time){
    const turn=Math.floor(time/2400),cells=Array.from({length:64},(_,i)=>(i*7+Math.floor(i/8)*3+2)%6);
    // A deterministic visual rehearsal; the interactive match-3 will replace this.
    for(let k=0;k<turn;k++){const a=(k*13+9)%63,b=a%8===7?a-1:a+1;[cells[a],cells[b]]=[cells[b],cells[a]];if(k%3===2)for(let j=0;j<3;j++)cells[(a+j)%64]=(cells[(a+j)%64]+1)%6;}
    return {cells,turn,selected:(turn*13+9)%63,progress:(time%2400)/2400};
  }
  function render(canvas,view=state,now=Date.now()){
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
    }else{
      c.fillStyle='#161326';c.fillRect(0,0,W,H);c.fillStyle='#e9def7';c.font='600 23px sans-serif';c.fillText('Bejeweled Blitz',wide?24:20,wide?12:45);
      c.textAlign='right';c.font='600 20px sans-serif';c.fillStyle='#f2ca6a';c.fillText(String(Math.ceil(Math.max(0,60000-view.elapsed)/1000)).padStart(2,'0'),W-22,wide?15:87);
      const size=wide?320:328,x=(W-size)/2,y=wide?60:145,cell=size/8,board=boardAt(view.elapsed);
      c.fillStyle='#080d21';c.fillRect(x-5,y-5,size+10,size+10);
      for(let row=0;row<8;row++)for(let col=0;col<8;col++){
        const i=row*8+col,cx=x+(col+.5)*cell,cy=y+(row+.5)*cell,r=cell*.37;
        c.fillStyle=colors[board.cells[i]];c.beginPath();c.moveTo(cx,cy-r);c.lineTo(cx+r,cy);c.lineTo(cx,cy+r);c.lineTo(cx-r,cy);c.closePath();c.fill();
        c.fillStyle='#ffffff55';c.beginPath();c.moveTo(cx,cy-r*.8);c.lineTo(cx+r*.62,cy);c.lineTo(cx,cy-r*.1);c.fill();
        if(i===board.selected&&board.progress<.45){c.strokeStyle='#ffffff';c.lineWidth=2;c.strokeRect(x+col*cell+2,y+row*cell+2,cell-4,cell-4);}
      }
      if(!wide){c.textAlign='center';c.fillStyle='#b4a9c7';c.font='16px "Malgun Gothic",sans-serif';c.fillText('테스트',W/2,530);}
    }
    c.setTransform(1,0,0,1,0,0);
  }
  function pixels(){
    const key=state.mode+':'+Math.floor(state.elapsed/83.333)+':'+(state.mode==='clock'?Math.floor(Date.now()/60000):'');
    if(key!==pixelKey){pixelKey=key;render(small);const a=small.getContext('2d').getImageData(0,0,36,24).data;pixelColors=Array.from({length:864},(_,i)=>`rgb(${a[i*4]},${a[i*4+1]},${a[i*4+2]})`);}
    return pixelColors;
  }
  return {update,render,pixels,boardAt,setVideo(element){video=element;},get state(){return state;}};
})();
