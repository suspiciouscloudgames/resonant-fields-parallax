/* Rough pixel masses and local patch animation; no decorative contour lines. */
window.SceneCharacter = (() => {
  const BLACK='#080808', BACK='#7d7d7d', GREY='#7d7d7d';
  const rect=(c,x,y,w,h,color=BLACK)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
  // Rasterize on the scene's pixel grid; diagonals have solid stair-step edges.
  function shape(c,points,color=BLACK){
    const lo=Math.floor(Math.min(...points.map(p=>p[1]))),hi=Math.ceil(Math.max(...points.map(p=>p[1])));
    for(let y=lo;y<hi;y++){
      const crossings=[];
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length];
        if((a[1]<=y+.5&&b[1]>y+.5)||(b[1]<=y+.5&&a[1]>y+.5))crossings.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      crossings.sort((a,b)=>a-b);
      for(let i=0;i+1<crossings.length;i+=2){const x=Math.ceil(crossings[i]-.5),end=Math.ceil(crossings[i+1]-.5);rect(c,x,y,end-x,1,color);}
    }
  }
  function stroke(c,points,width,color=BLACK){
    for(let i=1;i<points.length;i++){
      let [x,y]=points[i-1].map(Math.round);const [tx,ty]=points[i].map(Math.round);
      const dx=Math.abs(tx-x),dy=-Math.abs(ty-y),sx=x<tx?1:-1,sy=y<ty?1:-1;let e=dx+dy;
      for(;;){rect(c,x-Math.floor(width/2),y-Math.floor(width/2),width,width,color);if(x===tx&&y===ty)break;const e2=e*2;if(e2>=dy){e+=dy;x+=sx;}if(e2<=dx){e+=dx;y+=sy;}}

    }
  }
  // All motion is sampled on a 12 fps pixel clock, independent of action changes.
  let clock=0;
  // Stable, non-repeating schedules: pauses and travel times vary per gesture.
  // A seeded schedule is reproducible at any timestamp and never adds frame noise.
  const unit=(seed,index)=>{
    let n=Math.imul(index+1,374761393)^Math.imul(seed,668265263);
    n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
  };
  const idleTracks={
    breath:{seed:11,hold:500,holdRange:1800,move:2100,moveRange:1400,value:i=>i%2?0:-.68-unit(71,i)*.24},
    tilt:{seed:23,hold:8000,holdRange:7000,activeHold:.2,move:2000,moveRange:1800,value:i=>i%2?0:unit(31,i)>.5?.75:-.75},
    sway:{seed:37,hold:5000,holdRange:6000,activeHold:.25,move:1800,moveRange:1400,value:i=>i%2?0:unit(41,i)>.5?.7:-.7},
    light:{seed:53,hold:2100,holdRange:3200,move:0,moveRange:0,value:i=>i+1},
    screen:{seed:67,hold:9000,holdRange:9000,move:0,moveRange:0,value:i=>i+1}
  };
  function sampleIdle(name,time){
    const track=idleTracks[name],segments=track.segments||(track.segments=[]);
    time=Math.max(0,time);
    while(!segments.length||segments[segments.length-1].end<=time){
      const i=segments.length,previous=segments[i-1];
      const start=previous?previous.end:0;
      const hold=(track.hold+unit(track.seed,i)*track.holdRange)*(i%2?(track.activeHold||1):1);
      const move=track.move+unit(track.seed+101,i)*track.moveRange;
      segments.push({start,hold,move,end:start+hold+move,from:previous?previous.to:0,to:track.value(i)});
    }
    // Binary search also supports re-rendering earlier frames during QA/replay.
    let lo=0,hi=segments.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(segments[mid].end<=time)lo=mid+1;else hi=mid;}
    const f=segments[lo],t=f.move?Math.max(0,Math.min(1,(time-f.start-f.hold)/f.move)):0;
    const smooth=t*t*(3-2*t);
    return f.from+(f.to-f.from)*smooth;
  }
  function idleMotion(time){
    return {breath:sampleIdle('breath',time),tilt:sampleIdle('tilt',time),
      sway:sampleIdle('sway',time),light:Math.floor(sampleIdle('light',time))%6,
      screen:Math.floor(sampleIdle('screen',time))%24};
  }
  let motion=idleMotion(0);
  function head(c,x,y,shoulder=[x+7,y+20]){
    // The nape is attached to the shoulder, not translated with the hair.
    // A 14 by 17 bob keeps an adult head-to-body ratio without adding bright noise.
    shape(c,[[x+4,y+11],[x+10,y+11],[shoulder[0]+4,shoulder[1]+4],
      [shoulder[0]-4,shoulder[1]+4],[x+4,y+14]],'#3b3d39');
    // One rough bob-shaped mass: no eye, brow, nose, cheek or facing mask.
    const rows=[
      '    mmmmmm    ', '   mmmmmmmm   ', '  mmmmmmmmmm  ',
      ' mmmmmmmmmmmm ', ' mmmmmmmmmmmm ', 'mmmmmmmmmmmmm ',
      'mmmmmmmmmmmmm ', 'mmmmmmmmmmmmm ', 'dmmmmmmmmmmm  ',
      'dddmmmmmmmdd  ', ' ddddmmmdddd  ', ' ddddddddddd  ',
      ' dddddddddd   ', '  dddddddd    ', '   dnnnnd    ',
      '    nnnn     ', '    nnnn      '
    ];
    // Light sits over the crown, then falls into the neck: no fixed side mask
    // that could make the head appear to face the wrong way while leaving.
    const palette={d:'#60625e',m:'#81827e',n:'#3b3d39'};
    const pixels=rows.map(row=>row.split(''));
    const phase=motion.light;
    const lightEdge=[[],[[2,9]],[[2,9],[4,10]],[[4,10],[6,11]],[[6,11]],[]];
    for(const [dx,dy] of lightEdge[phase])pixels[dy][dx]='m';
    const sway=Math.round(motion.sway);
    pixels.forEach((row,dy)=>{
      for(let dx=0;dx<row.length;dx++)if(palette[row[dx]]){
        const bend=dy>=11&&dx<6?sway:0;
        rect(c,x+dx+bend,y+dy,1,1,palette[row[dx]]);
      }
    });
  }
  function fabric(c,x,y,w=13,h=24){
    // Sparse low-contrast clusters shift locally; the dark body remains one mass.
    const shift=Math.round(motion.breath*.8),drop=Math.round(-motion.breath*.65);
    const patches=[
      [w-5,4+drop,3,2,'#343530'],[w-4+shift,6+drop,2,2,'#41423b'],
      [3+shift,Math.floor(h*.58),2,2,'#292a26'],
      [5+shift,Math.floor(h*.58)+1,2,2,'#242521'],
      [w-5,h-5+drop,3,2,'#30312c']
    ];
    for(const [dx,dy,pw,ph,tone] of patches)rect(c,x+dx,y+dy,pw,ph,tone);
  }
  function rimLight(canvas,width=1){
    const c=canvas.getContext('2d'),image=c.getImageData(0,0,canvas.width,canvas.height);
    const src=new Uint8ClampedArray(image.data),out=image.data,w=canvas.width,h=canvas.height;
    const solid=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&src[(y*w+x)*4+3]>=128;
    const edges=[];let left=w,right=0,top=h,bottom=0;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=(y*w+x)*4;
      if(src[i+3]<128||Math.max(src[i],src[i+1],src[i+2])>155||Math.max(src[i],src[i+1],src[i+2])-Math.min(src[i],src[i+1],src[i+2])>24)continue;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      if(!solid(x+width,y)||!solid(x,y-width))edges.push([x,y]);
    }
    if(!edges.length)return;
    // Only tiny glints at selected silhouette landmarks, never an edge outline.
    // Re-select from the actual pose each frame, with no random sparkle at rest.
    const targets=width===1?[[.7,.02],[.88,.24],[.96,.48]]:
      [[.7,.02],[.88,.24],[.96,.48],[.66,.91]];
    const chosen=[];
    for(const [u,v] of targets){
      const tx=left+(right-left)*u,ty=top+(bottom-top)*v;
      let best=null,score=Infinity;
      for(const point of edges){
        if(chosen.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<width*4))continue;
        const d=(point[0]-tx)**2+(point[1]-ty)**2*3;
        if(d<score){score=d;best=point;}
      }
      if(!best)continue;chosen.push(best);
      for(const [x,y] of edges){
        if(Math.abs(x-best[0])>1||Math.abs(y-best[1])>(width===1?0:1))continue;
        const i=(y*w+x)*4;out[i]=out[i+1]=out[i+2]=250;out[i+3]=255;
      }
    }
    c.putImageData(image,0,0);
  }
  const gait=[
    {near:[[0,35],[-2,45],[-5,56]],far:[[2,35],[4,46],[5,56]],hand:-2},
    {near:[[0,35],[-2,46],[-3,56]],far:[[2,35],[3,45],[4,54]],hand:-1},
    {near:[[0,35],[0,46],[0,56]],far:[[2,35],[3,44],[1,53]],hand:0},
    {near:[[0,35],[3,45],[5,56]],far:[[2,35],[0,46],[-4,56]],hand:2},
    {near:[[0,35],[3,45],[4,54]],far:[[2,35],[-1,46],[-2,56]],hand:1},
    {near:[[0,35],[2,44],[0,53]],far:[[2,35],[0,46],[0,56]],hand:0}
  ];
  const walkDurations={enter:12000,exit:13500};
  const standingX=76,walkDepth=8;
  const smooth=t=>t*t*(3-2*t);
  // Integrate a gradual start, a walking pace and a gradual stop.
  function walkDistance(t){
    t=Math.max(0,Math.min(1,t));const a=.14,b=.18,area=1-(a+b)/2;
    if(t<a)return .5*(t-a/Math.PI*Math.sin(Math.PI*t/a))/area;
    if(t>1-b){const tail=1-t;return 1-.5*(tail-b/Math.PI*Math.sin(Math.PI*tail/b))/area;}
    return (t-a/2)/area;
  }
  function walkMotion(state,progress){
    const p=Math.max(0,Math.min(1,progress));
    const position=t=>{
      let route;
      if(state==='enter')route=t<.78?.82*walkDistance(t/.78):.82+.18*(t-.78)/.22;
      else route=t<=.1?1:t<.32?1-.18*(t-.1)/.22:.82*(1-walkDistance((t-.32)/.68));
      return approachPose(route);
    };
    const path=position(p),lo=Math.max(0,p-.0001),hi=Math.min(1,p+.0001),a=position(lo),b=position(hi);
    const speed=(p===0||p===1)?0:Math.hypot(b.x-a.x,b.depth-a.depth)/Math.max(.000001,(hi-lo)*walkDurations[state]/1000);
    const facing=state==='exit'?1-2*smooth(Math.min(1,p/.1)):1;
    const distance=state==='enter'?path.x+35+walkDepth-path.depth:standingX-path.x+path.depth;
    return {...path,facing,distance,speed,motion:Math.min(1,speed/14)};
  }
  function walkPose(time,amount=1,facing=1,distance=null){
    const phase=distance===null?time/1800:distance/20;
    const foot=offset=>{
      const t=((phase+.3+offset)%1+1)%1;
      return t<.6?{x:6-20*t,lift:0}:{x:-6+12*smooth((t-.6)/.4),lift:4*Math.sin(Math.PI*(t-.6)/.4)};
    };
    const near=foot(0),far=foot(.5),f=seatPose(0);
    f.facing=facing;f.s[0]+=1.5*amount*facing;f.turn=.25*(1-Math.abs(facing));
    f.foot=[standingX+(4+near.x*amount)*facing,269-near.lift*amount];
    f.farFoot=[standingX+(-2+far.x*amount)*facing,267-far.lift*amount];
    f.knee=[standingX+(2+near.x*.45*amount)*facing,246-near.lift*.3*amount];
    return f;
  }
  // Each arm is part of an explicit held pose, shoulder -> elbow -> hand.
  const poses={
    rest:{elbow:[59,222],hand:[61,223]},
    smokeRest:{elbow:[63,210],hand:[67,196]},
    smokeLift:{elbow:[61,211],hand:[60,196]},
    lift:{elbow:[61,222],hand:[64,220]},
    nearMouth:{elbow:[60,213],hand:[56,205]},
    mouth:{elbow:[59,211],hand:[54,198]},
    lower:{elbow:[61,222],hand:[67,232]},
    reach:{elbow:[64,212],hand:[66,196]},
    ashApproach:{elbow:[65,212],hand:[65,197]},
    ash:{elbow:[66,210],hand:[64,194]},
    tabletLow:{elbow:[63,223],hand:[74,232]},
    tabletMid:{elbow:[64,222],hand:[76,225]},
    tablet:{elbow:[58,219],hand:[62,213]}
  };
  // Every torso ring shares one shoulder-to-pelvis axis. Its two sides cannot
  // cross when leaning; head, sleeves and fabric are attached to that same frame.
  function bodyFrame(shoulder,hip,turn=0,squash=0){
    const length=Math.hypot(hip[0]-shoulder[0],hip[1]-shoulder[1]);
    const u=[(hip[0]-shoulder[0])/length,(hip[1]-shoulder[1])/length],n=[u[1],-u[0]];
    const point=(along,across)=>[shoulder[0]+u[0]*along+n[0]*across,shoulder[1]+u[1]*along+n[1]*across];
    const width=6.5+turn*2+squash;
    const rings=[[-1,width*.65],[5,width],[length*.65,width*.83],[length+1,width*.8]];
    const contour=[...rings.map(([y,w])=>point(y,-w)),...rings.slice().reverse().map(([y,w])=>point(y,w))];
    return {point,contour,length,near:point(7,5),far:point(7,-5)};
  }
  function torso(c,frame){
    shape(c,frame.contour,'#191b18');
    // A broad shoulder plane carries the neck shade into the coat.
    shape(c,[frame.point(-1,-3),frame.point(-1,3),frame.point(5,5),
      frame.point(16,2),frame.point(12,-1),frame.point(4,-4)],'#2c2e2a');
    const shift=Math.round(motion.breath*.8);
    for(const [t,offset,tone] of [[.25,3,'#343530'],[.62,-2,'#292a26'],[.86,2,'#30312c']]){
      const p=frame.point(frame.length*t,offset+shift);rect(c,p[0],p[1],2,2,tone);
    }
  }
  function seated(c,name,ember=false,screenTime=0,arm=null){
    const p=arm||poses[name],lean=arm?arm.lean:name==='ash'?3:name==='ashApproach'?2:name==='reach'?1:0;
    const rigidContext=c;
    c=postureContext(c,1);
    const amount=name.startsWith('tablet')?(arm?.tabletAmount??1):0;
    const tabletOffset=22*amount,hasTablet=amount>.04;
    const f=seatPose(1);
    for(const key of ['s','hip','knee','foot','farFoot'])f[key]=[f[key][0]-8,f[key][1]];
    f.s[0]+=lean;
    drawRig(c,f,{elbow:p.elbow,hand:p.hand,farHand:arm?.farHand||[62+13*amount,224-15*amount],compact:amount>.01?1-amount:0,softSleeves:amount<.01});
    if(ember||arm?.cigarette)rect(c,p.hand[0]+1,p.hand[1],2,1,'#bcbcb2');
    if(ember){
      const heat=typeof ember==='number'?ember:.25,x=p.hand[0]+3,y=p.hand[1];
      rect(c,x,y,2,2,'#a73529');
      rect(c,x+1,y,1,1,heat>.65?'#ffbc6b':'#df6838');
      rect(c,x,y+1,1,1,heat>.65?'#f08040':'#c4482d');
      if(heat>.85)rect(c,x+2,y,1,1,'#e99a53');
    }
    if(hasTablet){
      // Bypass the body's per-row breathing warp. Rasterize a fixed local device
      // and translate it by whole pixels so neither its case nor screen stretches.
      const device=moved(rigidContext,59,223-Math.round(tabletOffset)+Math.round(motion.breath*.55));
      tablet(device,Math.floor(clock/900));
    }
  }
  let videoPixels=null;
  function tabletScreen(phase){
    if(window.DeviceScreen&&window.Installation?.playback)return DeviceScreen.pixels();
    if(videoPixels)return videoPixels;
    const pixels=Array(36*24).fill('#090b0c');
    const panel=(x,y,w,h,color)=>{for(let py=y;py<Math.min(24,y+h);py++)for(let px=x;px<Math.min(36,x+w);px++)if(px>=0&&py>=0)pixels[py*36+px]=color;};
    // A dark video-browsing page: three thumbnail columns, short pale title
    // strokes, red logo and small category tabs. No miniature readable text.
    panel(1,1,3,2,'#e12832');panel(2,1,1,1,'#faf6ed');
    panel(5,1,6,1,'#d8dad6');panel(31,1,1,1,'#d8dad6');panel(33,1,2,1,'#929995');
    [[1,5],[7,6],[14,5],[20,6],[27,7]].forEach(([x,w],i)=>panel(x,3,w,1,i?'#353a3b':'#c9cbc5'));
    // Warm cultural footage, a crowded protest, and a dark breaking-news card.
    panel(1,5,10,6,'#c0b18b');panel(1,5,2,6,'#5e5945');panel(9,5,2,6,'#6d6752');
    [[3,7],[5,6],[7,7]].forEach(([x,y])=>{panel(x,y,1,1,'#e3c9a4');panel(x,y+1,2,2,'#3b514a');panel(x,y+3,1,1,'#af4b39');});
    panel(13,5,10,6,'#788b70');panel(13,5,10,1,'#56bd43');
    [[14,7],[17,6],[19,8],[21,7]].forEach(([x,y],i)=>{panel(x,y,1,1,'#d9cab2');panel(x,y+1,2,2,i%2?'#454d65':'#bec8c0');});
    panel(16,9,5,1,'#e4e0d1');panel(19,10,3,1,'#c64b35');
    panel(25,5,10,6,'#252c2e');panel(25,5,3,1,'#c9322d');
    panel(27,7,1,3,'#cebd83');panel(28,9,3,1,'#9b652e');
    panel(32,7,2,3,'#4e5445');panel(26,10,8,1,'#d1c7b3');
    // A rubble panorama and a blue news-studio thumbnail on the second row.
    panel(1,15,10,6,'#868577');panel(1,15,10,1,'#bec0b2');
    panel(2,16,2,3,'#4a4e47');panel(6,17,3,2,'#535750');
    panel(1,19,7,1,'#c7bba2');panel(5,20,6,1,'#484d45');panel(3,18,2,1,'#d4c9b1');
    panel(13,15,10,6,'#6a94bb');panel(13,15,2,2,'#38a8be');panel(21,15,2,6,'#9ca9bf');
    panel(17,16,2,2,'#c5aa8d');panel(16,18,4,3,'#323b44');panel(14,19,8,1,'#d5d4c7');
    // Tiny channel marks and two unequal title strokes beneath each card.
    [[1,12,8],[13,12,9],[25,12,7],[1,22,7],[13,22,8]].forEach(([x,y,w],i)=>{
      panel(x,y,1,1,i===2?'#bd4a3c':'#c6cac0');panel(x+2,y,w-2,1,'#c9cbc4');
      if(y<22)panel(x+2,y+1,w-3,1,'#646d6d');
    });
    videoPixels=pixels;return pixels;
  }
  function tablet(c,phase){
    const video=tabletScreen(phase);
    // A smaller 16 × 12 case. The glass is 11 × 7 actor pixels; the final
    // compositor paints its video at native output density, below body-pixel size.
    for(let x=0;x<15;x++){
      const u=(x+.5)/15,top=u,height=12-2*u;
      for(let y=0;y<12;y++){
        const v=(y+.5-top)/height;if(v<0||v>=1)continue;
        const py=Math.min(11,Math.floor(v*12));
        if((x===0||x===14)&&(py===0||py===11))continue;
        let color='#151817';
        if(x===0||py===0)color='#8c9189';
        else if(x===14||py===11)color='#414541';
        else if(x===13)color=py===5?'#414541':'#c5c9c1';
        else if(x>=2&&x<13&&py>=2&&py<9)color=video[Math.min(23,Math.floor((v*12-2)/7*24))*36+Math.min(35,Math.floor((x-2+.5)/11*36))];
        rect(c,x,y,1,1,color);
      }
    }
    rect(c,15,2,1,8,'#414541');
    rect(c,3,12,2,2,GREY);rect(c,16,8,2,2,GREY);
  }
  function tabletVideo(c,state,progress,animationTime,density=1,indoorOffsetY=32){
    const amount=state==='read'||state==='gaming'?1:state==='tablet'?progress:state==='stow'?1-progress:0;
    if(amount<=.04)return;
    const t=Math.floor(animationTime/(1000/12))*(1000/12),video=tabletScreen(Math.floor(t/900));
    const ax=67,ay=223-Math.round(22*amount)+Math.round(idleMotion(t).breath*.55);
    const sx=326/272,sy=434/362,originX=-3+ax*sx,originY=-42+indoorOffsetY+ay*sy;
    const left=Math.floor((originX+2*sx)*density),right=Math.ceil((originX+13*sx)*density);
    const top=Math.floor((originY+2*sy)*density),bottom=Math.ceil((originY+10*sy)*density);
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      // Snap every video texel to a solid output pixel. No low-resolution actor
      // canvas in this path, and no alpha/filtering that could blur the thumbnail grid.
      const localX=((x+.5)/density-originX)/sx,localY=((y+.5)/density-originY)/sy,u=localX/15;
      const surfaceY=(localY-u)/(12-2*u)*12;
      if(localX<2||localX>=13||surfaceY<2||surfaceY>=9)continue;
      const tx=Math.min(35,Math.floor((localX-2)/11*36)),ty=Math.min(23,Math.floor((surfaceY-2)/7*24));
      c.fillStyle=video[ty*36+tx];c.fillRect(x/density,y/density,1/density,1/density);
    }
  }
  // The pelvis settles first; the upper back then rests against the chair.
  // Head tuck stays coupled to that motion rather than lifting a separate neck.
  const seatingFrames=[
    {at:0,s:[110,184],hip:[110,223],knee:[112,246],foot:[114,269],farFoot:[108,267],turn:0,squash:0,tuck:0,rest:0,reach:0},
    {at:.14,s:[110,184],hip:[110,223],knee:[115,245],foot:[118,268],farFoot:[108,267],turn:.55,squash:0,tuck:0,rest:0,reach:0},
    {at:.28,s:[109,186],hip:[107,223],knee:[112,245],foot:[112,269],farFoot:[104,267],turn:1,squash:0,tuck:.25,rest:0,reach:.1},
    {at:.42,s:[106,193],hip:[99,226],knee:[108,244],foot:[104,269],farFoot:[98,267],turn:.85,squash:.4,tuck:.7,rest:0,reach:.4},
    {at:.62,s:[91,204],hip:[83,232],knee:[102,243],foot:[104,269],farFoot:[98,267],turn:.75,squash:1,tuck:1,rest:0,reach:.85},
    {at:.82,s:[65,200],hip:[72,230],knee:[99,242],foot:[104,269],farFoot:[98,267],turn:.75,squash:.6,tuck:1,rest:.5,reach:1},
    {at:1,s:[52,201],hip:[71,228],knee:[99,242],foot:[104,269],farFoot:[98,267],turn:.75,squash:0,tuck:1,rest:1,reach:1}
  ];
  const standingFrames=[
    {...seatingFrames[6],at:0},
    {at:.28,s:[86,200],hip:[74,228],knee:[99,242],foot:[104,269],farFoot:[98,267],turn:.75,squash:.6,tuck:1,rest:0,reach:1},
    {at:.53,s:[103,190],hip:[99,221],knee:[107,244],foot:[104,269],farFoot:[98,267],turn:.8,squash:0,tuck:.65,rest:0,reach:.5},
    {at:.76,s:[110,184],hip:[110,223],knee:[112,245],foot:[110,269],farFoot:[104,267],turn:.5,squash:0,tuck:.15,rest:0,reach:0},
    {...seatingFrames[0],at:1}
  ];
  // Monotone cubic interpolation carries velocity through intermediate poses;
  // unlike a smoothstep on every segment it does not stop at every keyframe.
  function trajectory(frames,progress){
    const p=Math.max(0,Math.min(1,progress));
    let i=0;while(i<frames.length-2&&p>frames[i+1].at)i++;
    const a=frames[i],b=frames[i+1],h=b.at-a.at,t=(p-a.at)/h;
    const scalar=get=>{
      const slope=j=>(get(frames[j+1])-get(frames[j]))/(frames[j+1].at-frames[j].at);
      const tangent=j=>{
        if(j===0||j===frames.length-1)return 0;
        const before=slope(j-1),after=slope(j);
        if(before*after<=0)return 0;
        return 2*before*after/(before+after);
      };
      return (2*t*t*t-3*t*t+1)*get(a)+(t*t*t-2*t*t+t)*h*tangent(i)
        +(-2*t*t*t+3*t*t)*get(b)+(t*t*t-t*t)*h*tangent(i+1);
    };
    const f={};
    for(const key of ['s','hip','knee','foot','farFoot'])f[key]=[0,1].map(j=>scalar(v=>v[key][j]));
    for(const key of ['turn','squash','tuck','rest','reach'])f[key]=scalar(v=>v[key]);
    return f;
  }
  // Keep the seated pose fixed, but stand directly beside the cushion instead of far to its right.
  function closeToChair(f){
    const shift=-(f.s[0]-52)*(110-standingX)/(110-52);
    for(const key of ['s','hip','knee','foot','farFoot'])f[key][0]+=shift;
    return f;
  }
  const seatPose=p=>closeToChair(trajectory(seatingFrames,p)),standPose=p=>closeToChair(trajectory(standingFrames,p));
  function postureContext(c,amount){
    const breath=Math.round(motion.breath*amount);
    return {set fillStyle(v){c.fillStyle=v;},fillRect(x,y,w,h){
      const shift=py=>Math.round(breath*Math.max(0,Math.min(1,(230-py)/26)));
      const top=y+shift(y),bottom=y+h+shift(y+h);c.fillRect(Math.round(x),top,w,bottom-top);
    }};
  }
  function foldedElbow(shoulder,hand){
    // A small, consistently downward bend. Do not solve or switch elbow sides:
    // the previous two-solution blend rolled the forearm through the upper arm.
    const dx=hand[0]-shoulder[0],dy=hand[1]-shoulder[1];
    const distance=Math.hypot(dx,dy),bend=Math.max(0,Math.min(3,12-distance/2));
    return [(shoulder[0]+hand[0])/2,(shoulder[1]+hand[1])/2+bend];
  }
  function drawRig(c,f,arm=null){
    const frame=bodyFrame(f.s,f.hip,f.turn,f.squash);
    const facing=f.facing??1;
    const mix=(a,b)=>a.map((v,j)=>v+(b[j]-v)*f.reach);
    const nearHand=arm?.hand||mix(frame.point(frame.length+1,5*facing),[f.hip[0]-2,f.hip[1]-5]);
    let nearElbow=arm?.elbow||mix(frame.point(23,6*facing),[f.hip[0]-4,f.hip[1]-6]);
    const farHand=arm?.farHand||mix(frame.point(frame.length+1,-5*facing),[f.hip[0]-1,f.hip[1]-4]);
    let farElbow=mix(frame.point(23,-6*facing),[f.hip[0]+3,f.hip[1]-6]);
    const soft=!!arm?.softSleeves;
    const nearShoulder=frame.point(soft?11:7,(soft?7:5)*facing),farShoulder=frame.point(soft?11:7,-(soft?7:5)*facing);
    const compact=arm?(arm.compact||0):f.reach;
    const fold=(joint,hand,shoulder)=>{
      const target=foldedElbow(shoulder,hand,joint);
      return joint.map((v,i)=>v+(target[i]-v)*compact);
    };
    nearElbow=fold(nearElbow,nearHand,nearShoulder);
    farElbow=fold(farElbow,farHand,farShoulder);
    stroke(c,[[f.hip[0]+facing,f.hip[1]-2],[f.knee[0]-4*facing,f.knee[1]-2],f.farFoot],4,'#343a34');
    rect(c,f.farFoot[0]-4+2*facing,f.farFoot[1],8,3,'#343a34');
    stroke(c,[[f.hip[0]+facing,f.hip[1]-1],f.knee,f.foot],5);rect(c,f.foot[0]-4+2*facing,f.foot[1],8,3);
    stroke(c,[farShoulder,farElbow,farHand],4,soft?'#30362f':'#343a34');
    torso(c,frame);
    head(c,f.s[0]-7+2*facing+2*f.tuck+Math.round(motion.tilt*f.rest),f.s[1]-18+5*f.tuck,f.s);
    if(soft){
      // Attach the sleeve to the outer upper arm, below the neck; keep the elbow bend.
      stroke(c,[nearShoulder,nearElbow],5,'#343a32');
      stroke(c,[nearElbow,nearHand],4,'#42483e');
    }else stroke(c,[nearShoulder,nearElbow,nearHand],4);
    rect(c,nearHand[0],nearHand[1],2,2,'#7d8078');
  }
  function settling(c,progress,standing=false){
    const f=standing?standPose(progress):seatPose(progress);
    // Settle with empty hands at the lap; retrieving the cigarette is separate.
    drawRig(postureContext(c,f.rest),f);
  }
  function moved(c,dx,dy){return {set fillStyle(v){c.fillStyle=v;},fillRect(x,y,w,h){c.fillRect(x+dx,y+dy,w,h);}};}
  function approachPose(route){
    // Walk on the floor in front of the furniture before heading up its right side.
    const x=route<.82?-35+(standingX+35)*(route/.82):standingX;
    const t=Math.max(0,Math.min(1,(route-.82)/.18));
    const depth=walkDepth*(1-t*t*(3-2*t));
    return {x,depth,motion:Math.max(0,Math.min(1,(1-route)/.12))};
  }
  // Empty hands -> inner coat pocket -> draw out a cigarette -> mouth -> smoking rest.
  // Pose coordinates are shared with the existing seated and smoking rig.
  const cigaretteFrames=[
    {at:0,...poses.rest,farHand:[62,224],lean:0,heat:0},
    {at:.12,...poses.rest,farHand:[62,224],lean:0,heat:0},
    {at:.30,hand:[49,212],elbow:[62,221],farHand:[62,224],lean:2,heat:0},
    {at:.40,hand:[49,207],elbow:[60,219],farHand:[62,224],lean:2,heat:0},
    {at:.48,hand:[58,211],elbow:[63,218],farHand:[62,224],lean:1.5,heat:0},
    {at:.54,hand:[61,204],elbow:[65,218],farHand:[62,224],lean:1,heat:0},
    {at:.72,...poses.mouth,farHand:[62,224],lean:0,heat:0},
    {at:.80,...poses.mouth,farHand:[62,224],lean:0,heat:0},
    {at:.87,...poses.mouth,farHand:[62,224],lean:0,heat:.95},
    {at:.94,...poses.smokeLift,farHand:[62,224],lean:0,heat:.4},
    {at:1,...poses.smokeRest,farHand:[62,224],lean:0,heat:.2}
  ];
  function cigarettePose(progress){
    const p=Math.max(0,Math.min(1,progress));let i=0;
    while(i<cigaretteFrames.length-2&&p>cigaretteFrames[i+1].at)i++;
    const a=cigaretteFrames[i],b=cigaretteFrames[i+1];
    let t=(p-a.at)/(b.at-a.at);t=t*t*(3-2*t);
    const mix=(x,y)=>x+(y-x)*t,pose={lean:mix(a.lean,b.lean),heat:mix(a.heat,b.heat),cigarette:p>=.4};
    for(const key of ['hand','elbow','farHand'])pose[key]=a[key].map((v,j)=>mix(v,b[key][j]));
    return pose;
  }
  const smokingCycles=[];
  // A gesture schedule, not a short repeating clip: two or three slow puffs
  // precede one tap. Seeded timing varies per group and is stable during replay.
  function smokingCycle(index,start){
    const keys=[{at:start,name:'smokeRest',heat:.2}],exhales=[];
    let at=start;
    const add=(dt,name,heat=.2)=>{at+=dt;keys.push({at,name,heat});};
    const puffs=2+(unit(127,index)>.5?1:0);
    for(let puff=0;puff<puffs;puff++){
      const n=index*3+puff;
      add(2600+unit(89,n)*3300,'smokeRest');
      add(1000+unit(97,n)*400,'smokeLift');add(1300,'mouth',.95);
      add(2300+unit(101,n)*1100,'mouth',1);
      exhales.push({start:at+500,end:at+3800});
      add(1600,'smokeLift',.5);add(1400,'smokeRest',.2);
    }
    add(1800+unit(107,index)*2600,'smokeRest');
    add(1400,'reach');add(950,'ashApproach');add(850,'ash');
    const tap=at;add(650,'ash');add(1100,'ashApproach');
    add(1100,'reach');add(1500,'smokeRest');add(1800+unit(109,index)*2000,'smokeRest');
    return {start,end:at,keys,exhales,puffs,tap};
  }
  function smokePose(time){
    time=Math.max(0,time);
    while(!smokingCycles.length||smokingCycles[smokingCycles.length-1].end<=time){
      const previous=smokingCycles[smokingCycles.length-1];
      smokingCycles.push(smokingCycle(smokingCycles.length,previous?previous.end:0));
    }
    const cycle=smokingCycles.find(c=>time<c.end),keys=cycle.keys;
    let i=0;while(i+1<keys.length&&time>=keys[i+1].at)i++;
    const a=keys[i],b=keys[Math.min(i+1,keys.length-1)];
    const t=b.at===a.at?0:(time-a.at)/(b.at-a.at),ease=t*t*(3-2*t);
    const blend=(x,y)=>x.map((v,j)=>v+(y[j]-v)*ease);
    const lean=n=>n==='ash'?3:n==='ashApproach'?2:n==='reach'?1:0;
    const exhale=cycle.exhales.find(e=>time>=e.start&&time<e.end);
    const ash=time>=cycle.tap&&time<cycle.tap+600?(time-cycle.tap)/600:null;
    const hand=blend(poses[a.name].hand,poses[b.name].hand);
    if(ash!==null)hand[1]+=Math.sin(ash*Math.PI);
    return {elbow:blend(poses[a.name].elbow,poses[b.name].elbow),hand,
      lean:lean(a.name)+(lean(b.name)-lean(a.name))*ease,
      heat:a.heat+(b.heat-a.heat)*ease,
      ash,
      exhale:exhale?(time-exhale.start)/(exhale.end-exhale.start):null,
      cycleStart:cycle.start,cycleEnd:cycle.end,puffs:cycle.puffs,tap:cycle.tap};
  }
  function drawSmoke(c,pose,time){
    // Opaque, sparse grey pixels: thin smoke widens and breaks apart as it rises.
    // Each wisp keeps its emission position even after the hand moves away.
    const tick=Math.floor(time/(1000/12))*(1000/12),palette=['#92988e','#a8ada3','#bdc1b7','#d0d3ca'];
    for(let i=0;i<24;i++){
      const emitted=Math.floor(tick/170)*170-i*170;if(emitted<0)continue;
      const age=(tick-emitted)/3700;if(age<0||age>=1)continue;
      const seed=Math.floor(emitted/170),source=smokePose(emitted);
      if(age>.55&&unit(211,seed)<(age-.55)*1.6)continue;
      const drift=Math.sin(age*5+seed*.27)*(.35+age*1.8);
      const x=source.hand[0]+4+age*3+drift,y=source.hand[1]-1-age*19;
      rect(c,x,y,1,age<.35?2:1,palette[Math.min(3,Math.floor(age*4))]);
      if(age>.3&&age<.7&&seed%3===0)rect(c,x+1,y-1,1,1,palette[2]);
    }
    if(pose.exhale!==null){
      const since=pose.exhale*3300;
      for(let i=0;i<11;i++){
        const age=(since-i*120)/2100;if(age<0||age>=1)continue;
        const spread=age*3,dx=Math.sin(i*1.7+age*3)*spread,dy=Math.cos(i*2.1)*spread*.4;
        const x=54+age*16+dx,y=195-age*11+dy;
        const color=palette[Math.min(3,1+Math.floor(age*3))];
        if(age<.65||i%2===0)rect(c,x,y,age<.45?2:1,1,color);
        if(age>.18&&age<.7)rect(c,x-1,y-1,1,1,palette[2]);
      }
    }
  }
  function plantPose(state,time,p){
    const care=state==='plant_care',route=care?1:state==='plant_back'?1-smooth(p):smooth(p);
    let x=standingX,depth=0;
    if(route<.25)depth=walkDepth*smooth(route/.25);
    else if(route<.75){x=standingX-(standingX-60)*smooth((route-.25)/.5);depth=walkDepth;}
    else{x=60;depth=walkDepth*(1-smooth((route-.75)/.25));}
    const moving=!care&&p>0&&p<1,amount=moving?Math.min(1,p/.14,(1-p)/.14):0;
    const facing=care?-1:state==='plant_back'?(-1+2*smooth(Math.min(1,p/.14))):(1-2*smooth(Math.min(1,p/.14)));
    const distance=state==='plant_back'?(1-route)*32:route*32;
    const pose=walkPose(time,amount,facing,distance);
    // Feet stay planted. Shift the pelvis back slightly and hinge at the waist,
    // keeping the shoulder-to-hip length fixed instead of stretching the torso.
    const bend=care?smooth(Math.max(0,Math.min(1,p/.30,(1-p)/.28))):0;
    const reach=care?smooth(Math.max(0,Math.min(1,(p-.10)/.25,(.88-p)/.20))):0;
    if(care){
      const torsoLength=Math.hypot(pose.hip[0]-pose.s[0],pose.hip[1]-pose.s[1]),angle=bend*Math.PI/5;
      pose.hip[0]+=9*bend;pose.hip[1]+=2*bend;
      pose.s=[pose.hip[0]-Math.sin(angle)*torsoLength,pose.hip[1]-Math.cos(angle)*torsoLength];
      pose.knee[0]-=2*bend;pose.knee[1]+=bend;pose.tuck=.35*bend;
    }
    const frame=bodyFrame(pose.s,pose.hip,pose.turn,pose.squash);
    const blend=(a,b)=>a.map((v,i)=>v+(b[i]-v)*reach);
    const touch=care&&p>.35&&p<.68?Math.sin((p-.35)/.33*Math.PI*2):0;
    const hand=blend(frame.point(frame.length+1,-5),[57+touch*.6,208+touch*.7]);
    const arm=care?{
      hand,elbow:blend(frame.point(23,-6),[64,212]),softSleeves:true,
      // The other hand rests lightly against the thigh while she leans.
      farHand:blend(frame.point(frame.length+1,5),[81,233])
    }:null;
    return {x,depth,pose,arm,reach,bend};
  }
  function tendPlant(c,state,time,p){
    const f=plantPose(state,time,p);drawRig(moved(c,f.x-standingX,f.depth),f.pose,f.arm);
  }
  function indoor(c,state,time,p,background,animationTime=time,tabletFromArm=null){
    clock=Math.floor(animationTime/ (1000/12))*(1000/12);
    motion=idleMotion(clock);
    if(['plant_walk','plant_care','plant_back'].includes(state)){tendPlant(c,state,time,p);return;}
    if(state==='enter'||state==='exit'){
      const path=walkMotion(state,p);
      drawRig(moved(c,Math.round(path.x)-standingX,Math.round(path.depth)),walkPose(time,path.motion,path.facing,path.distance));return;
    }

    if(state==='sit'||state==='stand'){
      settling(c,p,state==='stand');
      return;
    }
    // Sit slightly forward on the cushion, with shins beyond the front panel.
    c=moved(c,8,0);
    if(state==='cigarette'){
      const pose=cigarettePose(p);
      seated(c,'rest',pose.heat,time,pose);
    }else if(state==='smoke'){
      const pose=smokePose(time);
      seated(c,'rest',pose.heat,time,pose);
      drawSmoke(c,pose,time);
      if(pose.ash!==null){
        // Actor-local tray rim y=199 maps to scene y=197. The cigarette tip
        // is centered over the bowl (scene x=88), not over the table's legs.
        const breath=Math.round(motion.breath),start=pose.hand[1]+2+breath;
        const y=Math.min(199,Math.round(start+(199-start)*pose.ash));
        rect(c,pose.hand[0]+4,y,1,1,'#b6aa8c');
        if(pose.ash>.25)rect(c,pose.hand[0]+5,Math.max(start,y-1),1,1,'#73736c');
      }
    }else if(state==='read')seated(c,'tablet',false,time);
    else if(state==='gaming'){
      const move=Math.sin(time/420)*.9,tap=Math.max(0,Math.sin(time/160));
      seated(c,'tablet',false,time,{...poses.tablet,lean:0,hand:[62+move,213-tap],farHand:[75,209]});
    }
    else if(state==='tablet'||state==='stow'){
      const frame=state==='tablet'?p:1-p;
      const blend=(a,b)=>a.map((v,j)=>v+(b[j]-v)*frame);
      const from=state==='tablet'&&tabletFromArm?tabletFromArm:poses.rest;
      seated(c,'tablet',false,time,{elbow:blend(from.elbow,poses.tablet.elbow),hand:blend(from.hand,poses.tablet.hand),lean:(from.lean||0)*(1-frame),tabletAmount:frame});
    }else seated(c,state==='smokeHold'?'smokeRest':'rest');

  }
  function outdoorArmPose(lift){
    const held=Math.round(Math.max(0,Math.min(1,lift))*4)/4;
    // Fold at the elbow instead of lengthening the forearm to reach the sign.
    const shoulder=[6,20],elbow=[10,31-22*held],hand=[11,43-45*held];
    return {shoulder,elbow,hand,boardY:hand[1]-21};
  }
  const streetSprite=document.createElement('canvas');streetSprite.width=48;streetSprite.height=124;
  const streetContext=streetSprite.getContext('2d');streetContext.imageSmoothingEnabled=false;
  const feedingSprite=document.createElement('canvas');feedingSprite.width=96;feedingSprite.height=124;
  const feedingContext=feedingSprite.getContext('2d');feedingContext.imageSmoothingEnabled=false;
  const placardArt=document.createElement('canvas');placardArt.width=35;placardArt.height=21;
  const placardContext=placardArt.getContext('2d');
  // Three-pixel bitmap lettering stays crisp at the display's native density.
  // White board, red STOP, black GENOCIDE and green underline retain all four flag colors.
  const placardGlyphs={
    S:['111','100','111','001','111'],T:['111','010','010','010','010'],
    O:['111','101','101','101','111'],P:['110','101','110','100','100'],
    K:['101','101','110','101','101'],I:['111','010','010','010','111'],
    L:['100','100','100','100','111'],N:['101','111','111','111','101'],
    G:['111','100','101','101','111'],C:['111','100','100','100','111'],
    H:['101','101','111','101','101'],D:['110','101','101','101','110'],
    R:['110','101','110','101','101'],E:['111','100','110','100','111']
  };
  placardContext.fillStyle='#262923';placardContext.fillRect(0,0,35,21);
  placardContext.fillStyle='#f4f3ec';placardContext.fillRect(1,1,33,19);
  [['STOP','#be3034'],['GENOCIDE','#111512']].forEach(([word,color],line)=>{
    const left=(35-(word.length*4-1))/2;
    placardContext.fillStyle=color;
    [...word].forEach((letter,n)=>placardGlyphs[letter].forEach((row,y)=>[...row].forEach((cell,x)=>{
      if(cell==='1')placardContext.fillRect(left+n*4+x,4+line*7+y,1,1);
    })));
  });
  placardContext.fillStyle='#137340';placardContext.fillRect(2,18,31,2);
  function placard(c,x,y,w=11.5,h=7,damaged=false){
    c.save();c.imageSmoothingEnabled=false;c.drawImage(placardArt,x,y,w,h);
    if(damaged){
      // Small edge tears preserve the message after the board has been stepped on.
      c.fillStyle='#73796b';c.fillRect(x,y+h*.62,w*.08,h*.13);
      c.fillRect(x+w*.91,y+h*.25,w*.09,h*.12);
      c.fillStyle='#8a8c7f';c.fillRect(x+w*.54,y+h*.9,w*.22,h*.07);
    }
    c.restore();
  }
  function outdoor(c,p,moving,time,lift=0,animationTime=time,options={}){
    clock=Math.floor(animationTime/(1000/12))*(1000/12);
    motion=idleMotion(clock);
    c.save();c.beginPath();c.rect(110,50,116,200);c.clip();
    const x=options.position?Math.round(options.position[0]*3)/3:Math.round(174-13*p),y=options.position?Math.round(options.position[1]*3)/3:Math.round(264-41*p);
    const activeSprite=options.feedBend?feedingSprite:streetSprite,s=options.feedBend?feedingContext:streetContext;
    s.clearRect(0,0,activeSprite.width,124);s.save();s.translate(activeSprite.width/2,25);
    const f=gait[Math.floor(time/360)%gait.length];
    // Narrow foot placement under the hips, with a relaxed bent knee.
    // Keep vertical foot lift while reducing the sideways walking stride.
    const leg=(points,offset)=>points.map(([px,py])=>[offset+px*.65,53+(py-35)*1.8]);
    const farLeg=moving?leg(f.far,2):[[2,53],[4,70],[3,88]];
    const nearLeg=moving?leg(f.near,-2):[[-2,53],[-4,72],[-2,91]];
    const crouch=options.feedBend?(options.bend||0):0;
    if(crouch){for(const points of [farLeg,nearLeg]){points[0][1]+=crouch*17;points[1][0]-=crouch*5;points[1][1]+=crouch*5;}}
    function trousers(points,color,far){
      stroke(s,points.slice(0,2),7,color);stroke(s,points.slice(1),5,color);
      const [kx,ky]=points[1],[ax,ay]=points[2];
      // A short knee fold, tapered cuff and flat shoe replace the vertical poles.
      rect(s,kx-2,ky,3,2,far?'#555a50':'#343930');
      rect(s,ax-2,ay-2,4,3,color);
      rect(s,ax-(far?2:5),ay,8,3,far?'#30352e':'#11140f');
    }
    trousers(farLeg,'#4a5046',true);trousers(nearLeg,'#11140f',false);
    s.save();
    if(options.feedBend){s.translate(-crouch*2,crouch*17+53);s.rotate(-crouch*.45);s.translate(0,-53);}
    else s.translate((options.bend||0)*9*(options.bendDirection||1),(options.bend||0)*26);
    shape(s,[[-6,17],[4,16],[7,26],[6,50],[3,56],[-5,55],[-8,34]]);
    head(s,-7,Math.round(motion.breath*.65),[0,19]);
    fabric(s,-6,18,12,35);
    const arms=outdoorArmPose(lift),handY=Math.round(arms.hand[1]);
    // The torso transform also moves the arms when bending; no second extension.
    for(const side of [-1,1]){
      const points=[arms.shoulder,arms.elbow,arms.hand].map(([px,py])=>[side*px,py]);
      if(side===-1&&(options.pocket||options.reach)){
        const amount=options.reach||options.pocket,target=options.reach?[[-6,20],[-23,43],[-30,65]]:[[-6,20],[-12,32],[-5,45]];
        for(let j=1;j<3;j++)for(let k=0;k<2;k++)points[j][k]+=(target[j][k]-points[j][k])*amount;
      }
      const sleeve=side<0?'#343a34':'#10130f';
      stroke(s,points.slice(0,2),6,sleeve);stroke(s,points.slice(1),5,sleeve);
      rect(s,points[1][0]-1,points[1][1],2,2,'#454b40');
      rect(s,points[2][0]-2,points[2][1],4,3,GREY);
      if(side===-1&&options.food)rect(s,points[2][0]-3,points[2][1]+2,5,4,'#b2a78a');
    }
    const boardY=Math.round(arms.boardY);
    s.restore();s.restore();
    rimLight(activeSprite,3);
    c.drawImage(activeSprite,Math.round(x-4)-(options.feedBend?4.5:0),Math.round(y-21),options.feedBend?18:9,23);
    // Render the lettering directly, bypassing the reduced character sprite.
    if(options.showSign!==false){
    const boardTop=Math.round(y-21+(25+boardY)*23/124);
    const aside=Number(options.carryAside)||0;
    placard(c,x-5.75+7.25*aside,(boardTop-2)*(1-aside)+(y-10)*aside,11.5-5.8*aside,7-2.6*aside,options.damaged);
    }
    c.restore();
  }
  // Same source-pixel proportions, head silhouette and cloth treatment as the hero.
  // A stance occupies 60% of a step; the returning foot bends up through the knee.
  function encounterWalkPose(a){
    const pace=a.pace||0,phase=(a.travel||0)/5.6;
    const [dx,dy]=a.direction||[-1,0],length=Math.hypot(dx,dy)||1;
    const forward=[dx/length,dy/length*.38];
    const foot=(side,offset)=>{
      const u=((phase+offset)%1+1)%1,stance=u<.6;
      const t=stance?u/.6:(u-.6)/.4;
      const stride=stance?10-20*t:-10+20*smooth(t);
      const lift=stance?0:Math.sin(t*Math.PI)*7;
      return [side*4+stride*forward[0]*pace,91+stride*forward[1]*pace-lift*pace];
    };
    const farFoot=foot(1,.5),nearFoot=foot(-1,0);
    const bob=(1-Math.cos(phase*Math.PI*4))*.6*pace;
    function leg(side,end){
      const hip=[side*3,53+bob],dx=end[0]-hip[0],dy=end[1]-hip[1];
      const d=Math.hypot(dx,dy),bend=Math.sqrt(Math.max(0,20.5*20.5-d*d/4));
      return [hip,[(hip[0]+end[0])/2+dy/d*bend*forward[0],(hip[1]+end[1])/2-dx/d*bend*forward[0]],end];
    }
    const settle=(walk,rest)=>walk.map((p,i)=>p.map((v,j)=>rest[i][j]+(v-rest[i][j])*pace));
    return {far:settle(leg(1,farFoot),[[3,53],[5,72],[7,90]]),near:settle(leg(-1,nearFoot),[[-3,53],[-5,72],[-5,92]]),bob,swing:pace?Math.sin(phase*Math.PI*2)*7*pace:0,pace};
  }
  const encounterSprite=document.createElement('canvas');encounterSprite.width=64;encounterSprite.height=128;
  const encounterContext=encounterSprite.getContext('2d');encounterContext.imageSmoothingEnabled=false;
  function encounterPerson(c,a,time,gesture='rest',amount=0,depth=1){
    const s=encounterContext,police=a.kind==='officer',woman=a.kind==='woman';
    const body=police?'#303b40':a.kind==='man1'?'#34372f':woman?'#44463e':'#171c17';
    const shadow=police?'#202a2e':'#181d17',light=police?'#4b5558':'#55594e';
    clock=Math.floor(time/(1000/12))*(1000/12);motion=idleMotion(clock);
    const f=encounterWalkPose(a),face=a.moving?(a.direction[0]<0?-1:1):-1;
    s.clearRect(0,0,64,128);s.save();s.translate(32,24);
    function leg(points,far){
      stroke(s,points.slice(0,2),7,far?'#3d433a':'#1b201a');
      stroke(s,points.slice(1),5,far?'#353b32':'#151a14');
      const [kx,ky]=points[1],[ax,ay]=points[2];
      rect(s,kx-2,ky,3,2,far?'#55594e':'#343a30');
      shape(s,[[ax-3,ay-2],[ax+2,ay-2],[ax+2+face*3,ay],[ax+2+face*3,ay+2],[ax-3,ay+2]],'#11150f');
    }
    let near=f.near;
    if(gesture==='stamp')near=[[-3,53],[-8,70-amount*12],[-7,91-amount*16]];
    leg(f.far,true);leg(near,false);
    s.save();s.translate(0,Math.round(f.bob+motion.breath*.4));
    const arm=(points,far)=>{
      stroke(s,points.slice(0,2),6,far?shadow:body);stroke(s,points.slice(1),5,far?shadow:body);
      rect(s,points[1][0]-1,points[1][1],2,2,light);
      const hand=points[2];shape(s,[[hand[0]-2,hand[1]-2],[hand[0]+1,hand[1]-2],[hand[0]+2,hand[1]+1],[hand[0],hand[1]+3],[hand[0]-2,hand[1]+2]],'#7d8175');
    };
    const direction=a.direction||[-1,0],distance=Math.hypot(...direction)||1;
    const swingX=f.swing*direction[0]/distance,swingY=f.swing*direction[1]/distance*.75;
    let farArm=[[5,21],[7-swingX*.5,33-swingY*.4],[6-swingX,44-swingY]],nearArm=[[-5,21],[-8+swingX*.5,33+swingY*.4],[-7+swingX,44+swingY]];
    if(woman&&!a.moving){farArm=[[6,21],[10,34],[-4,32]];nearArm=[[-6,21],[-10,35],[5,30]];}
    if(gesture==='reach'){nearArm=[[-6,21],[-13,17],[-18,7]];farArm=[[6,21],[1,16],[-10,9]];}
    if(gesture==='push'){const reach=amount/5;nearArm=[[-6,21],[1+5*reach,29],[6+14*reach,24]];farArm=[[6,21],[12,30],[12+10*reach,25]];}
    if(gesture==='talk'){const toward=(a.direction?.[0]||-1)>0?-1:1;nearArm=[[-6,21],[-12,34],[-16,28-amount*2]].map(([x,y])=>[x*toward,y]);}
    arm(farArm,true);
    shape(s,[[-6,17],[4,16],[8,23],[7,43],[5,55],[-5,55],[-8,36]],body);
    shape(s,[[-6,20],[-3,22],[-3,49],[-6,53],[-8,35]],shadow);
    fabric(s,-6,18,12,35);
    // Reuse the hero's rounded, stepped head rather than a rectangular face block.
    head(s,-7,0,[0,19]);
    if(woman){
      shape(s,[[-10,5],[-8,0],[-3,-2],[4,0],[7,5],[6,16],[9,22],[4,22],[2,14],[3,5],[-5,3],[-7,15],[-10,20]],'#45483f');
      rect(s,-7,2,3,2,'#66695f');
    }else if(police){
      shape(s,[[-8,3],[-7,-1],[-3,-3],[4,-2],[7,1],[7,5],[-9,5]],'#29353c');
      stroke(s,[[-9,5],[-3,6],[7,5]],2,'#172128');rect(s,-2,1,2,2,'#92998f');
      rect(s,3,25,2,3,'#9b9e8e');stroke(s,[[-6,47],[6,47]],2,'#19231f');
    }else{
      shape(s,[[-7,4],[-5,0],[0,-1],[5,1],[7,5],[3,4],[-3,3]],a.kind==='man1'?'#40443a':'#30362e');
    }
    arm(nearArm,false);
    if(woman&&!a.moving)arm(farArm,false);
    s.restore();s.restore();
    rimLight(encounterSprite,3);
    // Identical source-pixel scale to the protagonist; depth is anchored at the feet.
    const scale=23/124*depth;
    c.save();c.imageSmoothingEnabled=false;
    c.drawImage(encounterSprite,Math.round((a.x-32*scale)*3)/3,Math.round((a.y-117*scale)*3)/3,64*scale,128*scale);
    c.restore();
  }
  return {indoor,outdoor,rimLight,plantPose,tabletVideo,placard,encounterPerson,encounterWalkPose,outdoorArmPose,foldedElbow,seatPose,standPose,walkPose,bodyFrame,approachPose,idleMotion,smokePose,cigarettePose,walkMotion,walkDurations};
})();
