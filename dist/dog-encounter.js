/* The second outing: a wary dog, food on the verge, then separate departures. */
window.SceneDogEncounter=(()=>{
  const phases=[
    ['approach',6500,'개가 거리를 두고 다가와 꼬리를 흔드는 중'],
    ['watch',2200,'개가 조금 떨어져 기다리는 중'],
    ['lower',1400,'개를 보고 피켓을 내리는 중'],
    ['pocket',2400,'주머니에서 먹을 것을 꺼내는 중'],
    ['to_grass',2400,'왼쪽 풀밭으로 다가가는 중'],
    ['place',2600,'몸을 숙여 풀밭에 먹이를 내려놓는 중'],
    ['step_back',2600,'피켓을 들던 자리로 돌아오는 중'],
    ['to_food',4000,'개가 꼬리를 흔들며 먹이로 다가오는 중'],
    ['eat',5500,'개가 풀밭에 놓인 먹이를 먹는 중'],
    ['sit',1600,'개가 앉아 그녀를 바라보는 중'],
    ['raise',1400,'개 옆에서 다시 피켓을 드는 중'],
    ['hold',5000,'개가 바라보는 동안 피켓을 들고 서 있는 중'],
    ['lower_leave',1200,'피켓을 내리고 돌아갈 준비를 하는 중'],
    ['leave',6500,'개가 일어나 그녀를 따라가는 중'],
    ['turn',1200,'그녀가 사라지자 개가 반대편으로 돌아서는 중'],
    ['walk_away',36000,'개가 반대편 길로 천천히 걸어가는 중']
  ];
  const duration=phases.reduce((n,p)=>n+p[1],0);
  const clamp=p=>Math.max(0,Math.min(1,p)),ease=p=>{p=clamp(p);return p*p*(3-2*p);};
  const lerp=(a,b,p)=>a+(b-a)*p,point=(a,b,p)=>a.map((n,i)=>lerp(n,b[i],ease(p)));
  const positions={hero:[161,223],verge:[158.2,224.5],food:[153.5,226.2],entry:[171,252],wait:[156,233.5],meal:[154.5,230],follow:[169,236],exit:[174,258],away:[149.5206,183.7383]};
  const depth=y=>Math.max(0,(y-181)/42);
  const heading=(a,b)=>{const dx=b[0]-a[0],dy=(b[1]-a[1])/.55,n=Math.hypot(dx,dy);return n?[dx/n,dy/n]:[0,-1];};
  function sample(time){
    time=Math.max(0,time);let start=0,index=0;
    while(index<phases.length&&time>=start+phases[index][1])start+=phases[index++][1];
    const [phase,length,label]=phases[index]||['ended',1,'방으로 돌아가는 중'],p=clamp((time-start)/length);
    const at=name=>phases.findIndex(s=>s[0]===name);
    const hero={position:positions.hero,visible:index<=at('leave'),moving:false,lift:index<at('lower')?1:0,bend:0,pocket:0,reach:0,food:false,gaitTime:0};
    if(phase==='lower')hero.lift=1-ease(p);
    if(phase==='pocket'){hero.pocket=Math.sin(p*Math.PI);hero.food=p>.5;}
    if(phase==='to_grass'){hero.position=point(positions.hero,positions.verge,p);hero.moving=p>0&&p<1;hero.food=true;}
    if(phase==='place'){hero.position=positions.verge;hero.bend=Math.sin(p*Math.PI);hero.reach=Math.sin(p*Math.PI);hero.food=p<.55;}
    if(phase==='step_back'){hero.position=point(positions.verge,positions.hero,p);hero.moving=p>0&&p<1;}
    if(phase==='raise')hero.lift=ease(p);
    if(phase==='hold')hero.lift=1;
    if(phase==='lower_leave')hero.lift=1-ease(p);
    if(phase==='leave'){hero.position=point(positions.hero,positions.exit,p);hero.moving=p>0&&p<1;}
    const origin=phase==='step_back'?positions.verge:positions.hero;
    hero.gaitTime=Math.hypot(hero.position[0]-origin[0],hero.position[1]-origin[1])*240;
    const dog={position:positions.wait,visible:index<phases.length,facing:-1,view:'rear',moving:false,travel:0,sit:0,eat:0,wag:1,turn:1,direction:heading(positions.entry,positions.wait)};
    let from=positions.wait,to=positions.wait,q=0;
    if(phase==='approach'){from=positions.entry;to=positions.wait;q=p;}
    if(phase==='to_food'){from=positions.wait;to=positions.meal;q=p;}
    if(index>=at('eat')){dog.position=positions.meal;dog.direction=heading(positions.meal,positions.food);}
    if(phase==='watch'||index>at('watch')&&index<at('to_food'))dog.direction=heading(positions.wait,positions.meal);
    if(phase==='eat'){dog.eat=Math.min(1,p*7);dog.wag=.45;}
    if(phase==='sit')dog.sit=ease(p);
    if(index>=at('sit')&&index<=at('lower_leave')){dog.sit=phase==='sit'?ease(p):1;dog.facing=1;dog.wag=.5;if(phase==='sit'){dog.facing=p<.5?-1:1;dog.turn=1-.6*Math.sin(p*Math.PI);};}
    if(phase==='leave'){
      dog.facing=1;dog.sit=1-ease(p/.13);
      from=positions.meal;to=positions.follow;q=clamp((p-.14)/.86);
    }
    if(phase==='turn'){
      dog.position=positions.follow;dog.facing=p<.5?1:-1;
      dog.turn=.3+.7*Math.abs(2*p-1);dog.wag=.25;
    }
    if(phase==='walk_away'){from=positions.follow;to=positions.away;q=p;dog.wag=.2;}
    if(['approach','to_food','leave','walk_away'].includes(phase)){
      dog.position=point(from,to,q);
      if(phase==='walk_away'){
        // Stay on the sidewalk's vanishing line, below the horizon.
        // Exponential recession keeps steps steady in body lengths as the dog shrinks.
        const progress=(p-.06*(1-Math.exp(-p/.06)))/(1-.06*(1-Math.exp(-1/.06)));
        const distanceScale=Math.exp(-3*progress);
        dog.position=[148.5+(positions.follow[0]-148.5)*distanceScale,181+(positions.follow[1]-181)*distanceScale];
      }
      dog.direction=heading(from,to);
      const dy=dog.position[1]-from[1],distance=Math.hypot(dog.position[0]-from[0],dy);
      // Step cadence follows distance in body lengths, including perspective.
      const safeY=Math.max(181.01,dog.position[1]),safeFrom=Math.max(181.01,from[1]);
      dog.travel=Math.abs(dy)<.001?distance/depth(from[1]):distance*42*Math.log((safeY-181)/(safeFrom-181))/dy;
      dog.moving=q>0&&q<1;dog.view=to[1]>from[1]?'front':'rear';
    }
    if(phase==='sit'||index>at('sit')&&index<=at('lower_leave')){
      const a=heading(positions.meal,positions.food),b=heading(positions.meal,positions.hero),u=phase==='sit'?ease(p):1;
      dog.direction=a.map((v,i)=>lerp(v,b[i],u));
    }
    if(phase==='turn'){
      dog.view=p<.5?'front':'rear';
      const a=heading(positions.meal,positions.follow),b=heading(positions.follow,positions.away);
      const angleA=Math.atan2(a[1],a[0]),angleB=Math.atan2(b[1],b[0]);
      const delta=Math.atan2(Math.sin(angleB-angleA),Math.cos(angleB-angleA)),angle=angleA+delta*ease(p);
      dog.direction=[Math.cos(angle),Math.sin(angle)];
    }
    const foodVisible=(index>at('place')||phase==='place'&&p>=.55)&&index<=at('eat');
    return {phase,p,index,label,hero,dog,food:{position:positions.food,visible:foodVisible,remaining:phase==='eat'?1-p:1}};
  }
  // Solid 1/3-world-pixel shapes, matching the outdoor character's print density.
  function poly(c,points,color){
    c.fillStyle=color;
    const top=Math.floor(Math.min(...points.map(a=>a[1]))*3),bottom=Math.ceil(Math.max(...points.map(a=>a[1]))*3);
    for(let row=top;row<bottom;row++){
      const y=(row+.5)/3,xs=[];
      for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
      xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2){const left=Math.ceil(xs[i]*3-.5),right=Math.ceil(xs[i+1]*3-.5);c.fillRect(left/3,row/3,(right-left)/3,1/3);}
    }
  }
  function stroke(c,points,width,color){
    c.fillStyle=color;for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*3));
      for(let j=0;j<=steps;j++)c.fillRect(Math.round((lerp(a[0],b[0],j/steps)-width/2)*3)/3,Math.round((lerp(a[1],b[1],j/steps)-width/2)*3)/3,width,width);
    }
  }
  function drawDog(c,a,time){
    if(!a.visible)return;
    const [x,y]=a.position,scale=.82*depth(y),sit=a.sit;
    if(scale<=0)return;
    c.save();c.translate(Math.round(x*3)/3,Math.round(y*3)/3);c.scale(scale,scale);
    const gait=a.travel/6*Math.PI*2;
    const paper='#b9ad87',light='#c9bf9e',shade='#8b8168',ink='#565346';
    const direction=a.direction||[0,a.view==='rear'?-1:1],norm=Math.hypot(...direction)||1;
    const fx=direction[0]/norm,fy=direction[1]/norm;
    // Rotate the entire quadruped on the ground plane, including every footfall.
    // Screen Y compresses depth; height is independent of the walking direction.
    const ground=(side,along,height)=>[side*fy+along*fx,(-side*fx+along*fy)*.55-height];
    const shoulder=4.35,hip=4.05-sit*1.8,bob=a.moving?Math.cos(gait*2)*.07:0;
    const parts=[];
    const part=(side,along,draw)=>parts.push({z:ground(side,along,0)[1],draw});
    for(const front of [false,true])for(const side of [-1,1]){
      const along=front?1.65:-1.65,phase=gait+(side<0?0:Math.PI)+(front?0:Math.PI);
      const swing=a.moving?Math.sin(phase)*.65:0,lift=a.moving?Math.max(0,Math.cos(phase))*.45:0;
      const foot=ground(side*1.05,along+swing, lift),knee=ground(side*1.05,along-.25+swing*.45,1.8-sit*.45);
      part(side,along,()=>{stroke(c,[ground(side*.9,along,(front?shoulder:hip)+bob),knee,foot],.7,side*fx<0?shade:paper);stroke(c,[foot,[foot[0]+fx*.45,foot[1]+fy*.25]],.5,shade);});
    }
    part(0,0,()=>{
      const outline=[[-1,-2,hip],[-1,1.8,shoulder],[0,2.2,shoulder+.45],[1,1.8,shoulder],[1,-2,hip],[0,-2.4,hip+.2]].map(v=>ground(v[0],v[1],v[2]+bob));
      poly(c,outline.map(v=>[v[0],v[1]+1.65]),shade);poly(c,outline,paper);
      stroke(c,[ground(-.25,-1.6,hip+.1+bob),ground(-.25,1.5,shoulder+.1+bob)],.65,light);
    });
    const headAlong=2.35+a.eat*.85,headHeight=5.1-a.eat*3.25+bob;
    part(0,2.5,()=>{
      const h=ground(0,headAlong,headHeight),earOffset=fx*.2;
      poly(c,[[h[0]-1.15,h[1]-.4],[h[0]-1.25,h[1]-2.15],[h[0]-.35,h[1]-1.4+earOffset],[h[0]+.45,h[1]-1.4-earOffset],[h[0]+1.3,h[1]-2.1],[h[0]+1.2,h[1]-.35],[h[0]+.8,h[1]+.9],[h[0]-.7,h[1]+.95]],fy<0?shade:paper);
      // Plain muzzle silhouette, with no eyes, mouth or expression marks.
      const muzzle=ground(0,headAlong+.7,headHeight-.65);
      poly(c,[[h[0]-.65,h[1]+.2],[h[0]+.7,h[1]+.2],[muzzle[0]+.55,muzzle[1]+.65],[muzzle[0]-.55,muzzle[1]+.65]],fy<0?shade:paper);
    });
    part(0,-2.6,()=>{
      const wag=Math.sin(time/520)*a.wag*.3;
      // A narrow, gently curled Jindo tail, with no bushy plume.
      const points=[[0,-2.05,hip-.1],[wag,-2.7,hip+1],[wag+.1,-2.75,hip+1.85],[wag+.5,-2.2,hip+2.05],[wag+.7,-1.9,hip+1.65]].map(v=>ground(...v));
      stroke(c,points,.45,paper);
    });
    parts.sort((a,b)=>a.z-b.z);for(const part of parts)part.draw();c.restore();
  }

  function draw(c,time,animationTime=time){
    const f=sample(time);
    if(f.food.visible){const [x,y]=f.food.position;for(let i=0;i<Math.ceil(f.food.remaining*5);i++){c.fillStyle=i%2?'#7c735b':'#b2a78a';c.fillRect(x+(i%3)*.4-.6,y+Math.floor(i/3)*.35,.55,.35);}}
    const hero=()=>{if(f.hero.visible)SceneCharacter.outdoor(c,1,f.hero.moving,f.hero.gaitTime,f.hero.lift,animationTime,{position:f.hero.position,feedBend:true,bend:f.hero.bend,bendDirection:-1,pocket:f.hero.pocket,reach:f.hero.reach,food:f.hero.food,carryAside:1-f.hero.lift});};
    if(f.dog.position[1]<f.hero.position[1]){drawDog(c,f.dog,animationTime);hero();}else{hero();drawDog(c,f.dog,animationTime);}
    return f;
  }
  return {phases,duration,positions,sample,draw,drawDog,depth};
})();
