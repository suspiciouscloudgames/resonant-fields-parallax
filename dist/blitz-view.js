/* Original video artwork; the board, numbers and animations are live. */
window.BlitzView=(()=>{
  const files={frame:'media/blitz/frame.png',board:'media/blitz/board.png',gems:'media/blitz/gems.png'},images={};
  const ready=Promise.all(Object.entries(files).map(([key,url])=>new Promise(resolve=>{const im=new Image();images[key]=im;im.onload=resolve;im.onerror=resolve;im.src=url;})));
  const surface=document.createElement('canvas');surface.width=452;surface.height=696;
  const clamp=p=>Math.max(0,Math.min(1,p)),ease=p=>{p=clamp(p);return p*p*(3-2*p);};
  function geometry(w,h,wide=false){const sourceH=wide?548:696,scale=Math.min(w/452,h/sourceH);return {x:(w-452*scale)/2,y:(h-sourceH*scale)/2,scale,sourceH};}
  function hit(x,y,w,h){const g=geometry(w,h),px=(x-g.x)/g.scale,py=(y-g.y)/g.scale;if(px<0||px>=448||py<64||py>=512)return -1;return Math.floor((py-64)/56)*8+Math.floor(px/56);}
  function jewel(c,gem,x,y,alpha=1,scale=1,time=0){
    if(gem===undefined||gem===null||gem<0)return;const special=BlitzGame.kind(gem),type=BlitzGame.type(gem);
    c.save();c.globalAlpha=alpha;c.translate(x+28,y+28);c.scale(scale,scale);
    if(special===3){
      c.shadowColor='#d7b8ff';c.shadowBlur=11;c.fillStyle='#f4e4ff';c.fillRect(-19,-19,38,38);
      for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++){const t=(xx+yy*3+Math.floor(time/180))%7;if(images.gems.complete&&images.gems.naturalWidth)c.drawImage(images.gems,t*56,0,56,56,-21+xx*10.5,-21+yy*10.5,12,12);}
    }else if(images.gems.complete&&images.gems.naturalWidth)c.drawImage(images.gems,type*56,0,56,56,-28,-28,56,56);
    if(special===1){
      c.globalCompositeOperation='screen';
      for(let k=0;k<9;k++){const a=k*2.399+time/700,r=16+Math.sin(time/90+k)*7;
        const g=c.createRadialGradient(Math.cos(a)*r,Math.sin(a)*r,0,Math.cos(a)*r,Math.sin(a)*r,14);
        g.addColorStop(0,'#ffffd9');g.addColorStop(.3,'#ffd13e');g.addColorStop(1,'#ff4c0000');c.fillStyle=g;c.fillRect(-34,-34,68,68);
      }
    }
    if(special===2){c.globalCompositeOperation='screen';c.strokeStyle='#fff';c.lineWidth=2;c.shadowColor='#6ddfff';c.shadowBlur=12;
      for(let k=0;k<4;k++){const a=k*Math.PI/2+time/1600;c.beginPath();c.moveTo(Math.cos(a)*9,Math.sin(a)*9);c.lineTo(Math.cos(a)*25,Math.sin(a)*25);c.stroke();}
    }
    c.restore();
  }
  function lightning(c,x,y,tx,ty,time,seed){
    c.beginPath();c.moveTo(x,y);const dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy)||1;
    for(let n=1;n<12;n++){const f=n/12,j=Math.sin(n*17.3+seed*5+Math.floor(time/40)*2.7)*11;c.lineTo(x+dx*f-dy/d*j,y+dy*f+dx/d*j);}c.lineTo(tx,ty);
    c.shadowColor='#8c8fff';c.shadowBlur=16;c.strokeStyle='#a6c9ff';c.lineWidth=7;c.stroke();c.shadowBlur=6;c.strokeStyle='#fff';c.lineWidth=2;c.stroke();
  }
  function power(c,fx,p,time){
    const x=fx.index%8*56+28,y=64+(fx.index/8|0)*56+28;c.save();c.globalCompositeOperation='screen';c.globalAlpha=Math.sin(Math.PI*Math.min(.98,p+.05));
    if(fx.kind===1){
      const r=18+100*Math.sqrt(p),g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#fff');g.addColorStop(.25,'#fff8ac');g.addColorStop(.6,'#ffae26');g.addColorStop(1,'#ff390000');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
      c.lineWidth=5*(1-p);c.strokeStyle='#fff4bb';c.beginPath();c.arc(x,y,r*.8,0,Math.PI*2);c.stroke();
      for(let k=0;k<22;k++){const a=k*2.399,r2=p*(60+k%5*12);c.fillStyle=k%2?'#fff':'#ffb32e';c.fillRect(x+Math.cos(a)*r2,y+Math.sin(a)*r2,5*(1-p)+1,5*(1-p)+1);}
    }else if(fx.kind===2){lightning(c,x,y,0,y,time,1);lightning(c,x,y,448,y,time,2);lightning(c,x,y,x,64,time,3);lightning(c,x,y,x,512,time,4);}
    else for(const i of fx.targets)lightning(c,x,y,i%8*56+28,64+(i/8|0)*56+28,time,i);
    c.restore();
  }
  function render(canvas,game,elapsed,options={}){
    const ctx=canvas.getContext('2d'),c=surface.getContext('2d'),w=canvas.width,h=canvas.height;
    c.clearRect(0,0,452,696);c.fillStyle='#1d0c30';c.fillRect(0,0,452,696);
    if(images.frame.complete&&images.frame.naturalWidth)c.drawImage(images.frame,0,0);
    if(images.board.complete&&images.board.naturalWidth)c.drawImage(images.board,0,64);
    else c.fillRect(0,64,448,448);
    if(game?.board?.length===64){
      const p=clamp((elapsed-game.phaseStart)/Math.max(1,game.phaseEnd-game.phaseStart)),e=ease(p),pair=game.swap||[];
      c.save();c.beginPath();c.rect(0,64,448,448);c.clip();
      if(game.phase==='fall')for(const f of game.falls)jewel(c,f.gem,f.col*56,64+(f.from+(f.to-f.from)*e)*56,1,1,elapsed);
      else for(let i=0;i<64;i++){
        let x=i%8*56,y=64+(i/8|0)*56,gem=game.board[i],alpha=1,size=1;
        const tr=options.transition;
        if(tr){const delay=(i%8)*.035+(7-(i/8|0))*.012,q=clamp((tr.progress-delay)/.65);
          if(tr.kind==='out')y+=q*q*560;else y-=(1-q)*(1-q)*560;
        }
        if((game.phase==='swap'||game.phase==='revert')&&pair.includes(i)){
          const other=pair[0]===i?pair[1]:pair[0];gem=game.previous[i];x+=(other%8-i%8)*56*e;y+=((other/8|0)-(i/8|0))*56*e;
        }
        if(game.phase==='clear'&&game.removed.includes(i)){alpha=1-p;size=1+.25*p;}
        jewel(c,gem,x,y,alpha,size,elapsed);
      }
      if(game.phase==='clear')for(const i of game.removed){
        const x=i%8*56+28,y=64+(i/8|0)*56+28;c.fillStyle=`rgba(255,240,188,${1-p})`;
        for(let k=0;k<6;k++){const a=k*Math.PI/3,r=8+p*31;c.fillRect(x+Math.cos(a)*r-2,y+Math.sin(a)*r-2,4,4);}
      }
      if(game.phase==='clear')for(const fx of game.effects||[])power(c,fx,p,elapsed);
      const select=options.selected??-1;
      if(select>=0){c.strokeStyle='#fff9ce';c.lineWidth=3;c.shadowColor='#ffe172';c.shadowBlur=7;c.strokeRect(select%8*56+3,64+(select/8|0)*56+3,50,50);c.shadowBlur=0;}
      // Show a legal move after an idle pause without activating the source hint button.
      if(options.hint&&game.phase==='idle')for(const i of BlitzGame.moves(game.board)[0]||[]){c.strokeStyle=`rgba(255,239,176,${.35+Math.sin(elapsed/240)*.25})`;c.lineWidth=2;c.strokeRect(i%8*56+5,64+(i/8|0)*56+5,46,46);}
      c.restore();
    }
    c.textAlign='center';c.textBaseline='middle';c.font='bold 32px Arial,sans-serif';c.fillStyle='#fff';c.shadowColor='#321445';c.shadowBlur=2;
    const score=game?.phase==='clear'?Math.round(game.score-(game.event?.points||0)*(1-ease((elapsed-game.phaseStart)/(game.phaseEnd-game.phaseStart)))):game?.score||0;
    c.fillText(score.toLocaleString('en-US'),226,29);c.shadowBlur=0;
    c.fillStyle='#1e0b33';c.fillRect(396,18,32,23);c.font='bold 16px Arial';c.fillStyle='#eee5ff';c.fillText('x'+(game?.multiplier||1),412,29);
    const seconds=Math.ceil(Math.max(0,60000-elapsed)/1000),bar=c.createLinearGradient(0,521,0,539);bar.addColorStop(0,'#3fddd3');bar.addColorStop(.5,'#16a7a8');bar.addColorStop(1,'#126774');
    c.fillStyle='#16464f';c.fillRect(10,521,432,16);c.fillStyle=bar;c.fillRect(10,521,432*clamp((60000-elapsed)/60000),16);
    c.font='bold 14px Arial';c.lineWidth=3;c.strokeStyle='#234b60';const label=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');c.strokeText(label,226,530);c.fillStyle='#fff';c.fillText(label,226,530);
    if(game?.phase==='clear'&&game.event?.points){c.font='bold 25px Arial';c.strokeStyle='#244e26';c.lineWidth=3;c.strokeText('+'+game.event.points,226,260);c.fillStyle='#e5ffd0';c.fillText('+'+game.event.points,226,260);}
    const g=geometry(w,h,options.wide);ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;
    ctx.drawImage(surface,0,0,452,g.sourceH,g.x,g.y,452*g.scale,g.sourceH*g.scale);
  }
  return {ready,render,hit,geometry};
})();
