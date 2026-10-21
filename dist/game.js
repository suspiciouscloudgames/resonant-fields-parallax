(() => {
  const game=document.querySelector('.game'),scene=document.querySelector('.scene');
  const installationMode=document.body?.hasAttribute('data-installation');
  const density=installationMode?3:1;
  const W=240,H=384,canvas=document.createElement('canvas');
  // One shared placement for furniture, plant interaction and every indoor actor pose.
  const indoorOffsetX=6,indoorOffsetY=38;
  canvas.width=W*density;canvas.height=H*density;canvas.className='animation';scene.prepend(canvas);
  const ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;ctx.setTransform(density,0,0,density,0,0);
  const background=new Image(),original=new Image(),layout=new Image(),streetReference=new Image();
  streetReference.src='assets/street-reference-no-spire.png';layout.src='assets/layout-reference.png';background.src='assets/empty.png';original.src='assets/original-reference.png';
  const room=document.createElement('canvas'),plant=document.createElement('canvas'),plantUnderlay=document.createElement('canvas'),touchedPlant=document.createElement('canvas');
  plantUnderlay.width=touchedPlant.width=W;plantUnderlay.height=touchedPlant.height=H;
  let plantPixels=null;
  room.width=plant.width=W;room.height=plant.height=H;
  const actor=document.createElement('canvas');actor.width=272;actor.height=362;const actorContext=actor.getContext('2d');actorContext.imageSmoothingEnabled=false;
  const outdoorLayer=document.createElement('canvas');outdoorLayer.width=W*density;outdoorLayer.height=H*density;
  const outdoorContext=outdoorLayer.getContext('2d');outdoorContext.imageSmoothingEnabled=false;
  const swayLayer=document.createElement('canvas');swayLayer.width=W;swayLayer.height=H;
  let traffic=null,masterRoom=room,printRoom=room,printLayout=null;
  let completedOutings=0,selectedEncounter=1,indoorAction=0,afterStow='home',standPurpose='exit';
  let state='loading',elapsed=0,last=0,animationTime=0,stillPixels,leafPixels,tabletFromArm=null;
  const durations={enter:SceneCharacter.walkDurations.enter,sit:3600,cigarette:6800,tablet:1800,stow:1100,stand:3600,exit:SceneCharacter.walkDurations.exit,wait:10000,emerge:5800,pause:1200,raise:1200,outside:5000,encounter:SceneEncounter.duration,dog_encounter:SceneDogEncounter.duration,rain_encounter:SceneRainEncounter.duration,return_wait:5000,plant_walk:5500,plant_care:12000,plant_back:5500,plant_sit:3600,return_enter:SceneCharacter.walkDurations.enter,return_sit:3600};
  const next={enter:'sit',sit:'cigarette',cigarette:'smoke',tablet:'read',stow:'stand',stand:'exit',exit:'wait',wait:'emerge',emerge:'pause',pause:'raise',raise:'outside',outside:'encounter',encounter:'return_wait',return_enter:'return_sit',return_sit:'home',dog_encounter:'return_wait',rain_encounter:'return_wait',return_wait:'return_enter',plant_walk:'plant_care',plant_care:'plant_back',plant_back:'plant_sit',plant_sit:'home'};
  const words={plant_walk:'일어나 화분으로 걸어가는 중',plant_care:'벤자민 이파리를 살피고 돌보는 중',plant_back:'화분에서 의자로 돌아가는 중',plant_sit:'다시 의자에 앉는 중',return_wait:'장면이 끝났습니다 · 5초 뒤 실내로 복귀',return_enter:'1번 화면으로 돌아오는 중',return_sit:'다시 의자에 앉는 중',home:'방으로 돌아와 앉아 있는 중',idle:'빈 방',smokeHold:'흡연 후 앉아 있는 중',enter:'왼쪽 화분 뒤로 들어오는 중',sit:'창을 향해 앉는 중',cigarette:'주머니에서 담배를 꺼내 입으로 가져가는 중',smoke:'담배를 피우는 중',tablet:'아이패드를 꺼내는 중',read:'아이패드를 보는 중',stow:'아이패드를 내려놓는 중',stand:'일어나는 중',exit:'화분 뒤로 나가는 중',wait:'창 밖으로 내려가는 중',emerge:'인도로 걸어오는 중',pause:'인도에서 잠시 멈춰 있는 중',raise:'피켓을 머리 위로 올리는 중',lower:'피켓을 내리는 중',outside:'인도에서 피켓을 머리 위에 들고 서 있는 중',return:'방으로 돌아오는 중'};
  const ease=t=>t*t*(3-2*t);
  function change(s){if(s==='return_enter')completedOutings++;if(s==='home')indoorAction=0;state=s;game.dataset.state=s;scene.setAttribute('aria-label',words[s]||'장면 불러오는 중');}
  function transition(){
    if(state==='outside')return selectedEncounter===3?'rain_encounter':selectedEncounter===2?'dog_encounter':'encounter';
    if(state==='sit')return indoorAction===2?'tablet':indoorAction===3?'stand':indoorAction===1?'cigarette':'home';
    if(state==='stow')return afterStow;
    if(state==='stand')return standPurpose==='plant'?'plant_walk':'exit';
    return next[state];
  }
  function advanceTimeline(){
    let length;while((length=durations[state])&&elapsed>=length){elapsed-=length;change(transition());}
  }
  function canChooseScene(){return ['idle','home','smoke','smokeHold','read'].includes(state);}
  function beginAction(target){
    installationPaused=false;last=Date.now();elapsed=0;change(target);
    if(window.SceneGame.ready)draw();
  }
  function startOuting(number){
    if(![1,2,3].includes(number)||!canChooseScene())return false;
    selectedEncounter=number;indoorAction=4;standPurpose='exit';afterStow='stand';
    beginAction(state==='idle'?'emerge':state==='read'?'stow':'stand');return true;
  }
  function selectIndoor(number){
    if(![1,2,3,4].includes(number)||!canChooseScene())return false;
    if(number===4)return startOuting(selectedEncounter);
    if(number===indoorAction&&((number===1&&state==='smoke')||(number===2&&state==='read')))return true;
    indoorAction=number;standPurpose=number===3?'plant':'exit';
    const target=number===1?'cigarette':number===2?'tablet':'stand';
    if(number===2&&state==='smoke')tabletFromArm=SceneCharacter.smokePose(elapsed);else tabletFromArm=null;
    afterStow=target;
    beginAction(state==='idle'?'enter':state==='read'?'stow':target);return true;
  }
  // Recompose actual source pixels instead of regenerating any object designs.
  function cutout(image,sx,sy,sw,sh,polygons){
    const tile=document.createElement('canvas');tile.width=sw;tile.height=sh;
    const t=tile.getContext('2d');t.imageSmoothingEnabled=false;
    t.beginPath();for(const points of polygons){points.forEach(([x,y],i)=>i?t.lineTo(x-sx,y-sy):t.moveTo(x-sx,y-sy));t.closePath();}t.clip();
    t.drawImage(image,-sx,-sy);if(installationMode)PixelOutput.hardenAlpha(tile);return tile;
  }
  // Solid ink on the room substrate: whole cells, broken edges and open paper.
  // Furniture, glass and the moving actors are composited over this same print layer.
  // Hand-placed opaque ink silhouettes. Unequal breaks and large unbroken areas
  // matter more here than a regular chipped outline or evenly scattered noise.
  function inkShape(r,tone,points,top,bottom){
    r.fillStyle=tone;
    for(let y=top;y<bottom;y++){
      const edges=[];
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const [ax,ay]=points[j],[bx,by]=points[i];
        if((ay<=y+.5&&by>y+.5)||(by<=y+.5&&ay>y+.5))edges.push(ax+(y+.5-ay)*(bx-ax)/(by-ay));
      }
      edges.sort((a,b)=>a-b);
      for(let i=0;i+1<edges.length;i+=2){const x=Math.ceil(edges[i]);r.fillRect(x,y,Math.ceil(edges[i+1])-x,1);}
    }
  }
  function roomInk(r){
    const ink=(tone,points)=>inkShape(r,tone,points,64,260);
    const cuts=(tone,rects)=>{r.fillStyle=tone;rects.forEach(box=>r.fillRect(...box));};
    ink('#bcbcbc',[[0,64],[94,64],[94,68],[78,68],[78,71],[89,71],[89,75],
      [65,75],[65,82],[69,82],[69,84],[52,84],[52,92],[56,92],[56,110],
      [51,110],[51,113],[57,113],[57,116],[71,116],[71,125],[68,125],
      [68,128],[85,128],[85,133],[92,133],[92,145],[80,145],[80,149],
      [82,149],[82,165],[86,165],[86,169],[75,169],[75,175],[62,175],
      [62,179],[76,179],[76,182],[80,182],[80,198],[76,198],[76,201],
      [91,201],[91,205],[108,205],[108,213],[101,213],[101,227],[104,227],
      [104,230],[93,230],[93,234],[110,234],[110,242],[103,242],[103,247],
      [115,247],[115,260],[0,260]]);
    // Uneven wiped-through paper, with gaps that join the main white wall.
    ink('#fafafa',[[13,64],[28,64],[28,78],[22,78],[22,86],[25,86],[25,90],
      [17,90],[17,105],[12,105],[12,101],[9,101],[9,96],[14,96],[14,81],[11,81]]);
    ink('#fafafa',[[42,113],[66,113],[66,116],[52,116],[52,121],[56,121],
      [56,124],[33,124],[33,131],[28,131],[28,126],[37,126],[37,118],[42,118]]);
    ink('#fafafa',[[0,144],[18,144],[18,147],[11,147],[11,150],[30,150],
      [30,153],[22,153],[22,156],[8,156],[8,166],[3,166],[3,172],[0,172]]);
    ink('#fafafa',[[47,183],[68,183],[68,185],[57,185],[57,189],[62,189],
      [62,192],[51,192],[51,202],[46,202],[46,208],[42,208],[42,200],[47,200]]);
    // Keep the tree readable against a pale wall; darker ink sits away from foliage.
    ink('#828282',[[0,64],[7,64],[7,69],[3,69],[3,74],[8,74],[8,79],
      [5,79],[5,93],[0,93]]);
    ink('#828282',[[31,69],[48,69],[48,72],[39,72],[39,80],[35,80],
      [35,89],[31,89],[31,85],[29,85],[29,76],[31,76]]);
    ink('#828282',[[1,111],[8,111],[8,119],[6,119],[6,126],[12,126],
      [12,128],[3,128],[3,136],[0,136],[0,116],[1,116]]);
    ink('#bcbcbc',[[107,73],[114,73],[114,77],[110,77],[110,94],[106,94],
      [106,89],[102,89],[102,87],[107,87]]);
    cuts('#fafafa',[[36,96,12,2],[39,100,6,1],[32,104,3,4],[45,144,17,2],
      [39,147,7,1],[56,146,3,5],[19,174,4,3],[65,218,20,2],[71,221,6,1],
      [87,238,9,3],[91,243,3,6]]);
    cuts('#bcbcbc',[[83,91,4,2],[88,95,2,5],[75,104,10,1],[79,105,3,3],
      [101,156,5,3],[98,159,4,1],[105,167,2,6],[91,186,8,2]]);
    ink('#828282',[[240,64],[236,64],[236,76],[232,76],[232,88],[236,88],
      [236,119],[230,119],[230,126],[234,126],[234,135],[239,135],
      [239,158],[231,158],[231,163],[235,163],[235,188],[229,188],
      [229,194],[234,194],[234,201],[238,201],[238,226],[230,226],
      [230,239],[226,239],[226,260],[240,260]]);
    // Black ink is confined to the deep corner and worn structural edges.
    // Intermediate gray layers retain the torn geometry of the supplied version.
    ink('#999999',[[0,92],[5,92],[5,100],[10,100],[10,108],[7,108],
      [7,114],[0,114]]);
    ink('#dedede',[[46,115],[51,115],[51,120],[45,120],[45,125],
      [35,125],[35,128],[30,128],[30,125],[39,125],[39,119],[46,119]]);
    ink('#1e1e1e',[[0,64],[4,64],[4,68],[2,68],[2,73],[0,73]]);
    ink('#303030',[[232,121],[235,121],[235,128],[238,128],
      [238,133],[235,133],[235,129],[232,129]]);
    cuts('#1e1e1e',[[32,77,2,5],[33,84,1,3],[3,119,2,4],[236,189,2,4]]);
  }
  function floorInk(r){
    const ink=(tone,points)=>inkShape(r,tone,points,260,H);
    const marks=(tone,rects)=>{r.fillStyle=tone;rects.forEach(box=>r.fillRect(...box));};
    r.fillStyle='#929292';r.fillRect(0,260,W,124);
    // A torn light spill, broken across the ink instead of a neat central wedge.
    ink('#fafafa',[[118,260],[219,260],[219,265],[205,265],[205,268],[223,268],
      [223,271],[190,271],[190,274],[207,274],[207,277],[176,277],
      [176,280],[201,280],[201,282],[155,282],[155,286],[168,286],
      [168,289],[134,289],[134,292],[119,292],[119,289],[101,289],
      [101,286],[126,286],[126,282],[113,282],[113,275],[118,275]]);
    ink('#fafafa',[[240,298],[215,298],[215,300],[182,300],[182,303],
      [203,303],[203,306],[165,306],[165,308],[217,308],[217,310],[240,310]]);
    ink('#fafafa',[[77,315],[111,315],[111,317],[126,317],[126,320],
      [104,320],[104,322],[145,322],[145,325],[97,325],[97,323],
      [86,323],[86,320],[72,320],[72,317],[77,317]]);
    ink('#fafafa',[[0,343],[14,343],[14,345],[47,345],[47,348],[29,348],
      [29,350],[62,350],[62,353],[20,353],[20,356],[0,356]]);
    ink('#fafafa',[[145,360],[162,360],[162,357],[176,357],[176,360],
      [208,360],[208,363],[192,363],[192,365],[225,365],[225,368],
      [173,368],[173,365],[143,365],[143,363],[137,363],[137,361]]);
    // Dense, asymmetric ink at furniture contacts and the near edge.
    ink('#303030',[[0,260],[36,260],[36,266],[52,266],[52,269],[30,269],
      [30,272],[43,272],[43,275],[16,275],[16,279],[0,279]]);
    ink('#303030',[[20,311],[51,311],[51,308],[65,308],[65,311],[81,311],
      [81,314],[57,314],[57,317],[43,317],[43,319],[11,319],[11,316],[20,316]]);
    ink('#303030',[[0,375],[21,375],[21,370],[29,370],[29,373],[35,373],
      [35,378],[54,378],[54,375],[69,375],[69,373],[74,373],[74,377],
      [88,377],[88,381],[104,381],[104,384],[0,384]]);
    ink('#303030',[[164,384],[164,381],[172,381],[172,376],[179,376],
      [179,372],[184,372],[184,374],[188,374],[188,379],[216,379],
      [216,375],[224,375],[224,378],[240,378],[240,384]]);
    ink('#303030',[[116,341],[127,341],[127,337],[135,337],[135,339],
      [158,339],[158,342],[139,342],[139,344],[148,344],[148,346],
      [110,346],[110,344],[116,344]]);
    marks('#fafafa',[[20,284,16,2],[24,287,6,1],[73,294,8,3],[84,295,2,1],
      [148,296,28,1],[154,294,11,2],[220,320,20,2],[230,323,7,1],
      [181,332,4,3],[188,335,9,1],[65,338,23,2],[72,341,6,1],
      [92,354,3,4],[99,358,7,2],[3,365,19,1],[27,366,5,2],
      [117,375,21,2],[124,373,8,2],[216,384,7,1]]);
    marks('#303030',[[56,281,9,2],[63,279,4,2],[191,291,8,2],[196,293,15,1],
      [150,316,5,3],[157,319,3,1],[220,339,20,3],[215,342,9,2],
      [36,332,11,2],[40,330,4,2],[68,363,17,2],[73,361,4,2]]);
  }
  function floorInkDetails(r){
    // The original worn gray detail is retained along the restored ink breaks.
    const chips=(tone,rects)=>{r.fillStyle=tone;rects.forEach(box=>r.fillRect(...box));};
    chips('#a4a4a4',[[78,329,14,3],[88,332,10,2],[96,330,5,2],[174,292,14,2],[180,294,5,3],[191,295,8,2],[206,322,3,9],[209,329,4,4],[207,336,2,5],[33,359,17,2],[40,361,13,3],[54,362,7,2],[139,373,6,3],[142,376,16,3]]);
    chips('#737373',[[80,330,11,1],[90,332,5,2],[98,331,3,1],[176,293,7,1],[184,295,8,1],[207,324,1,5],[209,331,2,3],[207,338,1,4],[36,360,8,1],[43,362,10,2],[55,363,5,1],[140,374,4,1],[145,377,12,1]]);
    chips('#454545',[[86,330,3,1],[94,333,2,1],[182,293,2,1],[210,332,1,2],[45,362,5,1],[151,377,3,1]]);
    chips('#dedede',[[80,329,6,1],[91,331,5,1],[177,292,5,1],[190,294,6,1],[208,325,1,3],[211,330,1,3],[38,359,7,1],[48,361,4,1],[144,375,6,1],[154,376,4,1]]);
    chips('#fafafa',[[87,330,2,1],[97,331,1,2],[187,294,3,1],[208,334,2,2],[46,361,2,1],[153,377,1,2]]);
  }
  function openPaperFloor(r){
    // Preserve the original gray values; flattening them erases the worn detail.
    // Unfinished forms stop in open paper instead of always reaching the floor.
    inkShape(r,'#fafafa',[[0,350],[39,350],[39,354],[68,354],[68,358],
      [55,358],[55,361],[91,361],[91,367],[80,367],[80,371],[106,371],
      [106,379],[95,379],[95,384],[0,384]],350,384);
    inkShape(r,'#fafafa',[[240,331],[210,331],[210,334],[184,334],[184,338],
      [197,338],[197,341],[170,341],[170,345],[201,345],[201,349],
      [228,349],[228,353],[240,353]],331,354);
    r.fillStyle='#929292';
    [[19,365,10,2],[24,363,7,2],[55,374,4,6],[59,377,6,2],
      [11,381,16,3],[213,338,14,2],[217,340,4,4],[233,347,7,2]].forEach(b=>r.fillRect(...b));
    r.fillStyle='#141414';
    [[38,373,4,2],[41,371,3,3],[83,381,11,2],[90,379,4,2]].forEach(b=>r.fillRect(...b));
  }
  function plantFloorShadow(r){
    // Cast shade stays attached to the pot and the chair behind it. Remap the
    // existing ink locally so its broken lines survive inside the shadow.
    const mask=document.createElement('canvas');mask.width=W;mask.height=H;
    const m=mask.getContext('2d');
    inkShape(m,'#808080',[[0,296],[25,296],[25,300],[42,300],[42,306],
      [55,306],[55,313],[48,313],[48,321],[53,321],[53,328],[45,328],
      [45,337],[50,337],[50,345],[46,345],[46,357],[41,357],[41,364],
      [30,364],[30,367],[17,367],[17,370],[0,370]],296,370);
    inkShape(m,'#ffffff',[[0,313],[20,313],[20,318],[31,318],[31,329],
      [38,329],[38,341],[43,341],[43,355],[37,355],[37,362],
      [24,362],[24,365],[11,365],[11,367],[0,367]],313,367);
    const region=m.getImageData(0,296,55,74).data;
    const image=r.getImageData(0,296,55,74),p=image.data;
    for(let i=0;i<p.length;i+=4){
      if(!region[i+3])continue;
      const v=p[i],deep=region[i]>200;
      const tone=deep?(v>=230?110:v>=130?52:v>=80?40:20)
        :(v>=230?164:v>=130?84:v>=80?64:32);
      p[i]=p[i+1]=p[i+2]=tone;p[i+3]=255;
    }
    r.putImageData(image,0,296);
    inkShape(r,'#141414',[[16,357],[42,357],[42,361],[34,361],
      [34,364],[22,364],[22,366],[9,366],[9,363],[16,361]],357,366);
  }
  function breakInkEdges(r,floorOnly=false){
    const image=r.getImageData(0,64,W,196+124),src=new Uint8ClampedArray(image.data),out=image.data;
    const hash=(x,y)=>{let n=Math.imul(x+97,374761393)^Math.imul(y+211,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;};
    const eligible=(x,y)=>y>=196||(!floorOnly&&(x<113||x>228));
    for(let y=1;y<319;y++)for(let x=1;x<W-1;x++){
      if(!eligible(x,y))continue;
      const i=(y*W+x)*4,seed=hash(x,y);
      // Sparse clusters interrupt some contours; long untouched stretches remain.
      if(seed%37!==0)continue;
      const neighbours=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
      const other=neighbours.find(([xx,yy])=>Math.abs(src[(yy*W+xx)*4]-src[i])>35);
      if(!other)continue;
      const j=(other[1]*W+other[0])*4,w=1+((seed>>>8)%4),h=1+((seed>>>12)%3);
      for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){
        const xx=x+dx,yy=y+dy;if(xx>=W||yy>=320||!eligible(xx,yy))continue;
        if(dx===w-1&&dy===h-1&&seed%3===0)continue;
        const k=(yy*W+xx)*4;out[k]=out[k+1]=out[k+2]=src[j];out[k+3]=255;
      }
    }
    r.putImageData(image,0,64);
  }
  function roomInkDetails(r){
    // Layered chips follow the worn wall edges, like the reference jamb.
    const chips=(tone,rects)=>{r.fillStyle=tone;rects.forEach(box=>r.fillRect(...box));};
    chips('#a4a4a4',[[34,83,4,9],[32,89,3,12],[35,102,2,7],[33,108,3,4],
      [66,126,4,7],[63,132,5,11],[66,142,3,5],[68,148,2,3],
      [8,128,5,5],[10,133,3,9],[7,140,4,3],[229,204,5,9],[231,214,3,6]]);
    chips('#737373',[[34,85,2,5],[33,94,2,8],[34,106,1,5],
      [65,129,2,9],[64,139,3,5],[67,147,1,2],
      [9,130,2,7],[8,139,2,4],[230,207,2,8]]);
    chips('#454545',[[34,95,1,3],[65,135,1,4],[9,132,1,3],[230,211,1,3]]);
    chips('#dedede',[[37,83,1,6],[36,91,1,7],[36,103,1,4],
      [68,127,1,4],[67,133,1,9],[69,144,1,3],
      [12,130,1,6],[10,141,1,2],[233,205,1,9]]);
    chips('#fafafa',[[35,88,2,2],[34,102,2,2],[66,137,1,2],[67,145,2,1],
      [9,137,2,1],[231,216,2,2]]);
    // Leave a broad calm wall behind the seated actor, shared by print and live
    // crops. Clear the substrate before furniture/plant compositing, not A alone.
    inkShape(r,'#fafafa',[[40,173],[49,173],[49,170],[67,170],[67,174],
      [87,174],[87,171],[114,171],[114,260],[36,260],[36,230],[39,230],
      [39,216],[35,216],[35,197],[38,197],[38,181],[40,181]],170,260);
  }
  function prepare(){
    const r=room.getContext('2d');r.imageSmoothingEnabled=false;r.fillStyle='#fafafa';r.fillRect(0,0,W,H);
    roomInk(r);
    breakInkEdges(r);
    roomInkDetails(r);
    floorInk(r);
    breakInkEdges(r,true);
    floorInkDetails(r);
    openPaperFloor(r);
    plantFloorShadow(r);
    // Keep the marked gap between the plant and draped chair blank.
    r.fillStyle='#777775';
    [[0,12],[16,7],[55,14],[79,9],[98,13],[119,7],[231,9]]
      .forEach(([x,w])=>r.fillRect(x,260,w,1));
    r.save();r.translate(-6,-8);
    // Reframe only the view through the glass. The exterior keeps one uniform scale.
    r.save();r.beginPath();r.rect(130,88,98,169);r.clip();
    r.translate(106,48);r.scale(1.25,1.25);r.translate(-130,-88);
    r.drawImage(background,294,48,526,908,130,88,98,169);
    r.drawImage(background,400,753,106,202,130,219,20,38);
    // Widen toward the verge; the roadway keeps its original perspective.
    // Paint on the glass layer so furniture and the sill remain in front.
    for(let y=202;y<257;y++){
      const d=y-202,left=Math.round(161+d*.16),right=Math.round(164+d*.42);
      r.fillStyle='#d5d5d2';r.fillRect(left,y,right-left,1);
      r.fillStyle='#f7f7f5';r.fillRect(right-1,y,1,1);
      r.fillStyle='#777775';r.fillRect(right,y,1,1);
      if([215,233,254].includes(y)){
        r.fillStyle='#aaaaa7';r.fillRect(left+1,y,Math.max(1,right-left-3),1);
      }
    }
    r.restore();
    // Distant streetlamps belong to the exterior's gray range. Limit the
    // adjustment to their heads/shafts; dark accents are reserved for the frame.
    const streetSample=document.createElement('canvas');streetSample.width=W;streetSample.height=H;
    const streetContext=streetSample.getContext('2d');streetContext.drawImage(room,0,0);
    const streetPixels=streetContext.getImageData(143,183,25,50);
    const lampParts=[[143,183,6,2],[145,185,2,9],
      [149,186,7,3],[153,189,3,20],
      [162,194,6,6],[163,200,3,30],[164,229,3,3]];
    for(const [x,y,w,h] of lampParts)for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){
      const i=((py-183)*25+px-143)*4;
      if(streetPixels.data[i]>=105)continue;
      const tone=132+Math.round(streetPixels.data[i]*.15);
      streetPixels.data[i]=tone;streetPixels.data[i+1]=tone;streetPixels.data[i+2]=tone-2;
    }
    const streetTile=document.createElement('canvas');streetTile.width=25;streetTile.height=50;
    streetTile.getContext('2d').putImageData(streetPixels,0,0);
    r.save();r.setTransform(1,0,0,1,0,0);r.drawImage(streetTile,143,183);r.restore();
    // Two sparse, flat cloud wisps in the open sky, below the existing high cloud.
    r.save();r.beginPath();r.rect(130,88,98,169);r.clip();
    r.fillStyle='#babbb5';
    [[157,118,7,2],[165,119,9,2],[173,120,4,1],
      [180,137,5,2],[187,136,8,2],[196,137,4,2]]
      .forEach(([x,y,w,h])=>r.fillRect(x,y,w,h));
    r.fillStyle='#a0a29b';
    [[160,120,10,2],[171,121,5,1],[184,138,10,2],[194,138,6,1]]
      .forEach(([x,y,w,h])=>r.fillRect(x,y,w,h));
    r.fillStyle='#d3d3cc';
    [[155,119,2,1],[177,121,3,1],[178,138,2,1],[201,139,2,1]]
      .forEach(([x,y,w,h])=>r.fillRect(x,y,w,h));
    r.restore();
    r.drawImage(background,210,100,84,660,115,88,15,169);
    r.drawImage(background,864,60,42,334,227,88,9,169);
    r.drawImage(background,210,0,696,60,114,76,122,12);
    // Turn the same left-jamb pixels into a deeper sill. The bright inside
    // edge faces upward; the broken dark/gray face continues around the corner.
    const sill=document.createElement('canvas');sill.width=120;sill.height=22;
    const sc=sill.getContext('2d');sc.imageSmoothingEnabled=false;
    sc.translate(0,22);sc.rotate(-Math.PI/2);
    sc.drawImage(background,210,100,84,660,0,0,22,120);
    r.drawImage(sill,115,257,120,30);
    // Break only the inner rails' ink into uneven gray clusters. Work on the
    // rasterized frame before furniture is composited, preserving the glass view.
    const railSample=document.createElement('canvas');railSample.width=W;railSample.height=H;
    const railContext=railSample.getContext('2d');railContext.drawImage(room,0,0);
    function roughRail(x,y,length,thickness,horizontal,seed,reverse=false){
      const pixels=railContext.getImageData(x,y,horizontal?length:thickness,horizontal?thickness:length);
      const width=pixels.width;
      let along=0,index=0;
      while(along<length){
        let hash=Math.imul(++index+seed,374761393);
        hash=Math.imul(hash^(hash>>>13),1274126177)>>>0;
        const span=6+hash%8,inkWidth=Math.min(thickness,2+(hash>>>4)%2);
        const gap=(hash>>>9)%13===0,tone=88+(hash>>>13)%3*9;
        for(let a=along;a<Math.min(length,along+span);a++)for(let d=0;d<thickness;d++){
          const px=horizontal?a:d,py=horizontal?d:a,i=(py*width+px)*4;
          if(pixels.data[i]>155)continue;
          const across=reverse?thickness-1-d:d;
          const chipped=a===along&&hash%3===0&&across===inkWidth-1;
          const accent=!gap&&(hash>>>11)%4===0&&a<along+2+(hash>>>21)%3&&across<Math.min(2,inkWidth);
          const value=accent?28+(hash>>>23)%2*8:gap?178:(across<inkWidth&&!chipped?tone:164+(hash>>>17)%3*12);
          pixels.data[i]=value;pixels.data[i+1]=value+1;pixels.data[i+2]=value-3;
        }
        along+=span;
      }
      const tile=document.createElement('canvas');tile.width=pixels.width;tile.height=pixels.height;
      tile.getContext('2d').putImageData(pixels,0,0);
      r.save();r.setTransform(1,0,0,1,0,0);r.drawImage(tile,x,y);r.restore();
    }
    roughRail(120,80,169,3,false,11,true);
    roughRail(221,80,169,3,false,29);
    roughRail(109,250,120,4,true,47);
    roughRail(120,77,109,1,true,67);
    r.restore();r.save();r.translate(20+indoorOffsetX,indoorOffsetY);
    const lamp=cutout(original,0,332,212,520,[[[0,446],[28,395],[64,352],[98,335],[119,335],[128,376],[175,379],[200,430],[207,490],[51,499],[49,478],[83,378],[61,378],[32,422],[14,455],[14,850],[0,850]]]);
    r.drawImage(lamp,18,138,37,91);
    r.save();r.translate(-10,0);
    const table=cutout(original,188,753,212,267,[
      [[189,801],[220,790],[275,790],[284,807],[293,807],[294,781],[308,772],[318,754],[332,753],[342,773],[364,782],[364,803],[397,802],[399,829],[365,839],[225,839],[189,830]],
      [[205,827],[227,827],[226,956],[207,956]],
      [[315,830],[338,830],[338,1005],[317,1005]],
      [[362,828],[380,828],[380,989],[364,989]]
    ]);
    r.save();r.translate(-6,0);r.translate(96,261);r.scale(1.1,1.1);r.translate(-96,-261);
    r.fillStyle='#080808';r.fillRect(101,241,2,20);r.fillRect(112,241,2,17);
    r.drawImage(table,76,196,41,51);r.restore();
    // Upholstery uses the original pixels; structural legs are clean pixel silhouettes.
    const chair=cutout(background,0,846,455,507,[
      [[0,846],[100,854],[119,862],[133,879],[142,912],[149,947],[222,932],[251,933],[268,945],[278,968],[414,958],[439,970],[454,986],[440,1180],[181,1274],[0,1266]]
    ]);
    function chairLeg(topX,topY,bottomX,bottomY,width){
      for(let y=topY;y<=bottomY;y++){
        const t=(y-topY)/(bottomY-topY),x=Math.round(topX+(bottomX-topX)*t);
        r.fillStyle='#090909';r.fillRect(x,y,width,1);
        if(y<bottomY-3){r.fillStyle='#777775';r.fillRect(x,y,1,1);}
      }
    }
    chairLeg(31,262,29,283,3);
    chairLeg(55,265,52,287,4);
    chairLeg(99,247,101,277,4);
    // Keep the rear silhouette continuous from crown to base, following the marked contour.
    // Clip away the source image's vertical crop edge before adding the complete back panel.
    r.save();r.beginPath();
    [[26,201],[106,201],[106,289],[33,289],[33,270],[30,248],[29,232],[26,207]]
      .forEach(([x,y],i)=>i?r.lineTo(x,y):r.moveTo(x,y));
    r.closePath();r.clip();r.drawImage(chair,29,203,76,85);r.restore();
    for(let y=203;y<274;y++){
      const t=(y-203)/71;
      const left=Math.round(26+7*t),right=Math.round(49+14*t);
      r.fillStyle='#090909';r.fillRect(left,y,right-left,1);
      r.fillStyle='#252622';r.fillRect(right-2,y,2,1);
    }
    // The top seam turns into the right seam without a separate cap or inward notch.
    r.fillStyle='#090909';r.fillRect(27,201,10,1);r.fillRect(26,202,19,1);
    r.fillStyle='#464741';r.fillRect(27,202,10,1);r.fillRect(37,203,8,1);r.fillRect(45,204,4,1);
    // The narrow backrest side is a shaded charcoal plane, not silver piping.
    for(let y=201;y<266;y++){
      const t=(y-201)/65,edge=Math.round(48+14*t);
      r.fillStyle='#20211f';r.fillRect(edge-5,y,7,1);
      r.fillStyle='#111210';r.fillRect(edge+2,y,2,1);
      if((y>=206&&y<216)||(y>=232&&y<239)||(y>=253&&y<258)){
        r.fillStyle='#363831';r.fillRect(edge-3,y,2,1);
      }
      if(y===208||y===209||y===234){r.fillStyle='#474941';r.fillRect(edge-3,y,1,1);}
    }
    // A heavy blanket bends once over the chair and hangs in long weighted
    // folds. Thickness belongs to the folded top and hem, not repeated bulges.
    for(let y=199;y<270;y++){
      const v=y-199,t=Math.min(1,v/65);
      const cap=v<6?Math.ceil((6-v)/2):0;
      const left=20+Math.round(8*t)+cap;
      const right=47+Math.round(8*t)-Math.max(0,cap-1);
      for(let x=left;x<right;x++){
        const across=(x-left)/(right-left),u=across*26;
        const hem=263+Math.round(4*(1-Math.abs(across-.48)*2));
        if(y>hem)continue;
        // The plaid follows two broad lengthwise folds, with only a slight sag.
        const foldShift=Math.round(t+across*1.5);
        const vertical=u>=9+foldShift&&u<13+foldShift;
        const wovenV=v-Math.round(2*Math.sin(across*Math.PI));
        const horizontal=(wovenV>=16&&wovenV<20)||(wovenV>=47&&wovenV<51);
        let tone=vertical&&horizontal?79:vertical||horizontal?59:38;
        if(across>.16&&across<.51)tone+=10;
        if(across>.62&&across<.78)tone-=12;
        if(across>=.86)tone-=16;
        if(across<.08)tone-=7;
        // A compressed fold over the support, then a dense doubled lower hem.
        if(v<6)tone=across<.64?65-Math.abs(v-2)*4:39;
        if(y>=hem-3)tone-=12;
        const grain=(Math.floor(u)*17+v*11+Math.floor(v/5)*7)%53;
        if(grain===3&&across>.12&&across<.75)tone+=5;
        tone=Math.max(20,tone);
        r.fillStyle=`rgb(${tone},${tone},${tone-5})`;
        r.fillRect(x,y,1,1);
      }
    }
    r.restore();r.restore();
    const foliage=document.createElement('canvas');foliage.width=266;foliage.height=765;
    const f=foliage.getContext('2d');f.drawImage(original,820,390,266,765,0,0,266,765);
    const fp=f.getImageData(0,0,266,765);
    for(let y=0;y<765;y++)for(let x=0;x<266;x++){
      const i=(y*266+x)*4,l=(fp.data[i]+fp.data[i+1]+fp.data[i+2])/3;
      // Mask the pot silhouette too: the old rectangular exception retained wall pixels.
      const pot=y>=563&&y<764&&x>=Math.max(124,124+(y-585)*.16);
      if((x<100&&(y<100||y>440))||(!pot&&l>95)||(pot&&l>220))fp.data[i+3]=0;
    }f.putImageData(fp,0,0);
    const pc=plant.getContext('2d');pc.imageSmoothingEnabled=false;
    // The reference ends inside the plant. Reuse its own left edge to close the silhouette.
    const whole=document.createElement('canvas');whole.width=380;whole.height=765;
    const wc=whole.getContext('2d');wc.imageSmoothingEnabled=false;
    wc.drawImage(foliage,0,0);
    wc.save();wc.translate(532,0);wc.scale(-1,1);
    wc.drawImage(foliage,172,0,94,557,172,0,94,557);
    wc.restore();
    // Mirror the pot's rounded lit edge, rather than leaving a vertical image boundary.
    wc.clearRect(206,557,154,208);
    wc.save();wc.translate(412,0);wc.scale(-1,1);
    wc.drawImage(foliage,124,557,82,208,124,557,82,208);
    wc.restore();
    // Keep the pot and its placement. A Benjamin ficus has a bare tall trunk
    // and a single drooping canopy, not leaves running all the way to the soil.
    pc.drawImage(whole,0,557,380,208,-23,273,93,51);
    pc.fillStyle='#171717';pc.fillRect(25,188,4,88);
    pc.fillStyle='#777775';pc.fillRect(25,208,1,65);
    pc.fillStyle='#171717';pc.fillRect(23,198,1,15);pc.fillRect(24,211,1,6);
    pc.fillRect(30,194,1,15);pc.fillRect(29,207,1,8);
    // Retain the reference's irregular leaf pixels, gathered into an upper canopy.
    // The transparent leaf edges replace the former circular blobs.
    const leaves=document.createElement('canvas');leaves.width=W;leaves.height=H;
    const lc=leaves.getContext('2d');lc.imageSmoothingEnabled=false;
    lc.drawImage(whole,0,0,380,557,-18,139,83,82);
    // Mask the assembled crown, not individual rectangles. Both edges finish in leaf tips.
    const edge=[[3,162],[7,160],[6,154],[12,153],[13,146],[20,148],[23,142],
      [29,146],[35,143],[40,148],[46,147],[47,154],[54,156],[52,162],
      [59,165],[56,173],[62,179],[58,184],[60,190],[55,193],[56,199],
      [49,201],[47,207],[40,206],[37,214],[31,216],[28,221],[24,215],
      [19,217],[16,210],[11,211],[10,203],[5,200],[7,193],[2,188],
      [5,182],[1,177],[4,172]];
    lc.globalCompositeOperation='destination-in';lc.beginPath();
    edge.forEach(([x,y],i)=>i?lc.lineTo(x,y):lc.moveTo(x,y));lc.closePath();lc.fill();
    // Open slender gaps around the central branches instead of adding more overlapping patches.
    lc.clearRect(25,178,2,4);lc.clearRect(26,182,3,3);
    lc.clearRect(31,189,2,4);lc.clearRect(29,193,3,2);
    lc.clearRect(21,200,2,3);lc.clearRect(22,203,2,3);
    lc.globalCompositeOperation='source-atop';lc.fillStyle='#777775';
    lc.fillRect(28,173,1,3);lc.fillRect(33,185,1,3);lc.fillRect(18,195,1,3);
    if(installationMode)PixelOutput.hardenAlpha(leaves);
    pc.drawImage(leaves,0,0);
    if(installationMode)PixelOutput.hardenAlpha(plant);
    plantUnderlay.getContext('2d').drawImage(room,0,0);
    plantPixels=pc.getImageData(0,0,W,H);
    r.drawImage(plant,indoorOffsetX,indoorOffsetY);
    const exterior=window.SceneStreet?.build(room,background,3,streetReference);
    if(exterior)masterRoom=exterior.canvas;
    if(window.SceneTraffic){traffic=window.SceneTraffic.create(background,density,streetReference);traffic.prepare(masterRoom,exterior?3:1,exterior?.foreground);}
    // The wall keeps a frozen traffic composition; only physical display patches animate.
    printRoom=document.createElement('canvas');printRoom.width=masterRoom.width;printRoom.height=masterRoom.height;
    refreshPrint();
    stillPixels=r.getImageData(0,0,W,H);leafPixels=r.createImageData(W,H);
    stillPixels=r.getImageData(0,0,W,H);
  }
  function touchedLeaves(progress){
    // Contact begins once the hand reaches the lower right leaves; the branch
    // settles before she withdraws. The trunk, pot and furniture stay stationary.
    const contact=Math.max(0,Math.min(1,(progress-.26)/.10,(.88-progress)/.20));
    const strength=ease(contact),phase=(elapsed-3120)/760;
    const tc=touchedPlant.getContext('2d'),pixels=tc.createImageData(W,H);pixels.data.set(plantPixels.data);
    for(let y=184;y<221;y++)for(let x=30;x<65;x++){
      const radius=((x-47)/17)**2+((y-205)/17)**2,weight=Math.max(0,1-radius)**2;
      const dx=Math.sin(phase)*2.2*weight*strength,dy=Math.sin(phase+.65)*1.3*weight*strength;
      const sx=Math.max(0,Math.min(W-1,Math.round(x-dx))),sy=Math.max(0,Math.min(H-1,Math.round(y-dy)));
      const dst=(y*W+x)*4,src=(sy*W+sx)*4;for(let k=0;k<4;k++)pixels.data[dst+k]=plantPixels.data[src+k];
    }
    tc.putImageData(pixels,0,0);
    ctx.save();ctx.beginPath();ctx.rect(30+indoorOffsetX,184+indoorOffsetY,35,37);ctx.clip();
    ctx.drawImage(plantUnderlay,0,0);ctx.drawImage(touchedPlant,indoorOffsetX,indoorOffsetY);ctx.restore();
  }
  const tips=[[8,156,10,9],[43,154,11,9],[5,184,9,10],[49,188,10,12],[24,205,10,8]];
  function sway(){
    leafPixels.data.set(stillPixels.data);
    const strength=ease(Math.max(0,Math.min(1,elapsed/1000,(10000-elapsed)/1000)));
    for(let y=133+indoorOffsetY;y<215+indoorOffsetY;y++)for(let x=indoorOffsetX;x<70+indoorOffsetX;x++){
      if(x>=24+indoorOffsetX&&x<=27+indoorOffsetX)continue;let dx=0;
      for(const [i,[cx,cy,rx,ry]] of tips.entries()){const d=((x-indoorOffsetX-cx)/rx)**2+((y-cy-indoorOffsetY)/ry)**2;if(d<1)dx+=Math.sin(elapsed/660+i)*Math.pow(1-d,2)*1.5*strength;}
      const sx=Math.max(0,Math.min(W-1,Math.round(x-dx))),to=(y*W+x)*4,from=(y*W+sx)*4;
      for(let k=0;k<4;k++)leafPixels.data[to+k]=stillPixels.data[from+k];
    }
    swayLayer.getContext('2d').putImageData(leafPixels,0,0);ctx.drawImage(swayLayer,indoorOffsetX,133+indoorOffsetY,70,82,indoorOffsetX,133+indoorOffsetY,70,82);
  }
  function displayRects(){return window.Installation?Object.keys(Installation.sizes).map(id=>Installation.rect(id)):[];}
  function refreshPrint(){
    const regions=installationMode?displayRects():[],key=JSON.stringify(regions);
    if(key===printLayout)return;printLayout=key;
    const pc=printRoom.getContext('2d');pc.imageSmoothingEnabled=false;pc.drawImage(masterRoom,0,0);
    if(traffic){pc.save();pc.scale(masterRoom.width/W,masterRoom.width/W);traffic.drawStatic(pc,regions);pc.restore();}
  }
  function draw(){
    refreshPrint();
    ctx.drawImage(printRoom,0,0,W,H);if(state==='wait')sway();
    if(traffic){
      ctx.save();
      if(installationMode){
        ctx.beginPath();
        for(const r of displayRects()){
          const x=Math.ceil(r.x*density-.5),y=Math.ceil(r.y*density-.5);
          ctx.rect(x/density,y/density,(Math.ceil((r.x+r.w)*density-.5)-x)/density,(Math.ceil((r.y+r.h)*density-.5)-y)/density);
        }
        ctx.clip();
      }
      // Clear frozen cars only inside the display apertures, preserving the same road.
      ctx.drawImage(masterRoom,0,0,W,H);traffic.draw(ctx,animationTime);ctx.restore();
    }
    const p=Math.min(1,elapsed/(durations[state]||1));
    const indoorState={return_enter:'enter',return_sit:'sit',plant_sit:'sit',home:'rest'}[state]||state;
    if(['enter','sit','cigarette','smoke','smokeHold','tablet','read','gaming','stow','stand','exit','rest','plant_walk','plant_care','plant_back'].includes(indoorState)){
      const tending=indoorState==='plant_care';if(tending)touchedLeaves(p);
      actorContext.clearRect(0,0,272,362);SceneCharacter.indoor(actorContext,indoorState,elapsed,['enter','exit','sit','stand','cigarette','plant_walk','plant_care','plant_back'].includes(indoorState)?p:ease(p),room,animationTime,tabletFromArm);SceneCharacter.rimLight(actor,1);if(installationMode)PixelOutput.hardenAlpha(actor);ctx.drawImage(actor,-3+indoorOffsetX,-42+indoorOffsetY,326,434);
      ctx.save();ctx.translate(indoorOffsetX,0);SceneCharacter.tabletVideo(ctx,state,ease(p),animationTime,density,indoorOffsetY);ctx.restore();
      // After the pivot, only the chair's actual front panel occludes the actor.
      // Do not restore the floor below it: that erased the shins and planted feet.
      if(!['enter','exit','plant_walk','plant_care','plant_back'].includes(indoorState)&&!(indoorState==='sit'&&p<.28)&&!(indoorState==='stand'&&p>.60)){
        ctx.save();ctx.translate(indoorOffsetX,indoorOffsetY);ctx.beginPath();ctx.moveTo(65,238);ctx.lineTo(110,224);ctx.lineTo(116,230);ctx.lineTo(114,260);ctx.lineTo(66,279);ctx.lineTo(64,245);ctx.closePath();ctx.clip();ctx.drawImage(masterRoom,-indoorOffsetX,-indoorOffsetY,W,H);ctx.restore();
      }
      if(!tending)ctx.drawImage(plant,indoorOffsetX,indoorOffsetY);
    }
    if(['emerge','pause','raise','outside','encounter','dog_encounter','rain_encounter','ended'].includes(state)||(state==='return_wait'&&selectedEncounter===3)){
      // Preserve the outdoor sprite before the old 240px wall could discard it.
      // Flatten the sprite mask to solid cells before compositing on the background.
      const outside=installationMode?outdoorContext:ctx;
      if(installationMode){outside.setTransform(1,0,0,1,0,0);outside.clearRect(0,0,outdoorLayer.width,outdoorLayer.height);outside.setTransform(density,0,0,density,0,0);}
      outside.save();outside.beginPath();outside.rect(124,80,98,169);outside.clip();
      if(installationMode){outside.beginPath();for(const r of displayRects()){
        const x=Math.ceil(r.x*density-.5),y=Math.ceil(r.y*density-.5);
        outside.rect(x/density,y/density,(Math.ceil((r.x+r.w)*density-.5)-x)/density,(Math.ceil((r.y+r.h)*density-.5)-y)/density);
      }outside.clip();}
      const projection=SceneEncounter.projection;outside.translate(projection.x,projection.y);outside.scale(projection.scaleX,projection.scaleY);outside.translate(-projection.originX,-projection.originY);
      if(state==='emerge')SceneCharacter.outdoor(outside,p,true,elapsed,0,animationTime);
      if(['pause','raise','outside','lower'].includes(state)){
        const lift=state==='raise'?p:state==='lower'?1-p:state==='outside'?1:0;
        SceneCharacter.outdoor(outside,1,false,elapsed,lift,animationTime);
      }
      if(['encounter','ended'].includes(state)&&window.SceneEncounter)SceneEncounter.draw(outside,state==='ended'?SceneEncounter.duration:elapsed,traffic,animationTime);
      if(state==='dog_encounter')SceneDogEncounter.draw(outside,elapsed,animationTime);
      if(state==='rain_encounter')SceneRainEncounter.draw(outside,elapsed,animationTime);
      if(state==='return_wait'&&selectedEncounter===3)SceneRainEncounter.rain(outside,SceneRainEncounter.duration+elapsed);
      outside.restore();
      if(installationMode){PixelOutput.hardenAlpha(outdoorLayer,{x:124*density,y:80*density,w:98*density,h:169*density});ctx.drawImage(outdoorLayer,0,0,W,H);}
    }
  }
  function tick(now){
    if(!last)last=now;elapsed+=now-last;animationTime+=now-last;last=now;
    advanceTimeline();
    draw();requestAnimationFrame(tick);
  }
  // The installation windows share this one renderer and timeline. Any visible
  // output may advance it, so a background controller does not stall playback.
  let installationPaused=false;
  // Finite versions of the original actions for the USB exhibition playlist.
  // The editor's interactive timing and state transitions remain independent.
  function exhibitionClip(side,number,cue){
    if(!['indoor','outdoor'].includes(side)||![1,2,3].includes(number))throw Error('Invalid exhibition cue');
    if(cue){
      let phases;
      if(cue.id==='smoking')phases=[{state:'cigarette',duration:6800},{state:'smoke',duration:38200}];
      else if(cue.id==='youtube')phases=[{state:'tablet',duration:1800},{state:'read',duration:42100},{state:'stow',duration:1100}];
      else if(cue.id==='game')phases=[{state:'tablet',duration:1800},{state:'gaming',duration:60000},{state:'stow',duration:1100}];
      else phases=['stand','exit','wait','emerge','pause','raise','outside',
        ['encounter','dog_encounter','rain_encounter'][number-1],'return_wait','return_enter','return_sit'].map(state=>({state,duration:durations[state]}));
      const length=phases.reduce((n,p)=>n+p.duration,0);
      if(length>cue.duration)throw Error('Scene duration is shorter than its original animation');
      if(length<cue.duration)phases.push({state:'home',duration:cue.duration-length});
      return phases;
    }
    const names=side==='indoor'
      ?number===1?['cigarette','smoke']:number===2?['tablet','read']:['stand','plant_walk','plant_care','plant_back','plant_sit']
      :[...(number===2?['stow']:[]),'stand','exit','wait','emerge','pause','raise','outside',
        ['encounter','dog_encounter','rain_encounter'][number-1],'return_wait','return_enter','return_sit'];
    return names.map(state=>({state,duration:durations[state]||8000}));
  }
  window.SceneGame={
    canvas, get background(){if(this.ready)refreshPrint();return printRoom;}, width:W, height:H, density, ready:false,
    get status(){return {state,elapsed,animationTime,completedOutings,selectedEncounter,canChooseScene:canChooseScene(),indoorAction,canChooseIndoor:canChooseScene(),paused:installationPaused,label:state==='rain_encounter'?window.SceneRainEncounter.sample(elapsed).label:state==='dog_encounter'?window.SceneDogEncounter.sample(elapsed).label:state==='encounter'?window.SceneEncounter?.sample(elapsed).label:state==='ended'?'장면 끝':words[state]||'불러오는 중'};},
    selectIndoor,startOuting,
    exhibitionClip,
    renderExhibition(side,number,clipTime,clock,cue){
      if(!this.ready)return;
      const phases=cue?.phases||exhibitionClip(side,number);
      let phase=phases[0],remaining=Math.max(0,clipTime);
      for(const candidate of phases){
        phase=candidate;
        if(remaining<candidate.duration)break;
        remaining-=candidate.duration;
      }
      selectedEncounter=number;indoorAction=side==='indoor'?number:4;
      standPurpose=!cue&&side==='indoor'&&number===3?'plant':'exit';
      afterStow='stand';tabletFromArm=null;
      elapsed=Math.min(remaining,phase.duration);animationTime=clock;
      if(window.DeviceScreen&&cue)DeviceScreen.update({...cue.phone,paused:window.Installation?.playback.status.paused});
      if(state!==phase.state)change(phase.state);
      draw();
    },
    reset(){selectedEncounter=1;completedOutings=0;indoorAction=0;afterStow='home';standPurpose='exit';elapsed=0;animationTime=0;last=Date.now();tabletFromArm=null;change('idle');if(this.ready)draw();},
    pause(value){installationPaused=!!value;last=Date.now();},
    advance(now){
      if(!this.ready)return;
      if(!last)last=now;
      const delta=Math.max(0,now-last);last=Math.max(last,now);
      if(!installationPaused){
        elapsed+=delta;animationTime+=delta;
        advanceTimeline();
      }
      draw();
    }
  };
  Promise.all([background.decode(),original.decode(),layout.decode(),streetReference.decode()]).then(()=>{prepare();change('idle');window.SceneGame.ready=true;draw();if(!installationMode)requestAnimationFrame(tick);}).catch(e=>console.error('Scene image failed to load',e));
})();
