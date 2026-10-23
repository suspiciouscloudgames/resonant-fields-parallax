/* One deterministic timeline shared by both installation displays. */
window.SceneEncounter=(()=>{
  const phases=[['arrive',10500,'차량이 인물 옆에 정차하는 중'],['disembark',6000,'남성 두 명과 여성 한 명이 내리는 중'],['approach',7000,'세 사람이 인물에게 다가오는 중'],['snatch',2000,'남성이 피켓을 빼앗는 중'],['throw',1500,'피켓을 바닥에 던지는 중'],['stamp',5000,'피켓을 밟고 인물을 미는 중'],['police_arrive',4500,'경찰차가 뒤쪽에 정차하는 중'],['retreat',8500,'세 사람이 차량으로 돌아가는 중'],['board',1800,'세 사람이 다시 타는 중'],['depart',4500,'차량이 떠나는 중'],['officer_exit',2800,'경찰관이 내리는 중'],['officer_walk',9000,'경찰관이 인물에게 다가오는 중'],['talk',4500,'경찰관과 잠시 이야기하는 중'],['officer_return',9000,'경찰관이 차량으로 돌아가는 중'],['officer_board',2800,'경찰관이 다시 타는 중'],['pickup',2200,'바닥의 피켓을 줍는 중'],['leave',6500,'피켓을 들고 화면 밖으로 걸어가는 중'],['police_wait',5000,'캐릭터 퇴장 후 경찰차가 잠시 기다리는 중'],['police_depart',4500,'경찰차가 떠나는 중']];
  const duration=phases.reduce((sum,p)=>sum+p[1],0),clamp=p=>Math.max(0,Math.min(1,p)),ease=p=>{p=clamp(p);return p*p*(3-2*p);};
  const mix=(a,b,p)=>a+(b-a)*ease(p),point=(a,b,p)=>a.map((v,i)=>mix(v,b[i],p));
  // One ground-plane depth for cars and people. No cap at the parking point:
  // vehicles continue growing as they drive out toward the foreground.
  const perspective=y=>Math.max(.04,(y-181)/42);
  const curb=y=>149.7+(y-184)*.493;
  const projection=window.SceneTraffic.approach.projection;
  const worldY=y=>projection.y+(y-projection.originY)*projection.scaleY;
  function vehicleSize(y,police=false){
    // Convert the tyre contact into the traffic world BEFORE asking its scale.
    // Undo the encounter-layer magnification; do not scale from a person's height.
    return window.SceneTraffic.vehicleSizeAt(worldY(y),police?0:2)/projection.scaleX;
  }
  function curbPosition(y,police=false){
    // In the reference's three-quarter view the curb-side front tyre is
    // 16% of the sprite width left of its center, rather than at its box edge.
    return [curb(y)+vehicleSize(y,police)*.16+.8,y];
  }
  // Join the near lane first, then pull into the curb while braking to rest.
  // Integral of a smooth speed reduction keeps position and velocity continuous.
  function arrivingCar(p){
    const duration=10500,braking=3000,t=clamp(p)*duration,steady=duration-braking;
    const q=clamp((t-steady)/braking);
    const distance=t-braking*(q*q*q-.5*q*q*q*q);
    const progress=distance/(duration-braking/2),y=184+(218-184)*progress;
    const wy=worldY(y),laneX=142+(window.SceneTraffic.pullOverLane.nearX-142)*(wy-180)/78;
    const roadX=projection.originX+(laneX-projection.x)/projection.scaleX;
    const curbPoint=curbPosition(y),pull=clamp((progress-.38)/.52);
    return [mix(roadX,curbPoint[0],pull),y];
  }
  const carStop=curbPosition(218),policeStop=curbPosition(209,true);
  const doorway=(position,police=false)=>{
    const w=vehicleSize(position[1],police),h=w*(police?69:77)/82;
    return [position[0]-w*.48,position[1]-h*.12];
  };
  const carDoor=doorway(carStop),doors=[carDoor,[carDoor[0]-.5,carDoor[1]+1],[carDoor[0]-.5,carDoor[1]-1]];
  const officerDoor=doorway(policeStop,true),officerStep=[155,211];
  function sample(time){
    time=Math.max(0,time);let start=0,index=0;
    while(index<phases.length&&time>=start+phases[index][1]){start+=phases[index][1];index++;}
    const [phase,length,label]=phases[index]||['ended',1,'경찰차가 떠나고 방으로 돌아가는 중'],p=clamp((time-start)/length);
    const at=name=>phases.findIndex(s=>s[0]===name),between=(a,b)=>index>=at(a)&&index<=at(b);
    const carY=index<at('depart')?mix(184,carStop[1],phase==='arrive'?p:1):mix(carStop[1],276,phase==='depart'?p:1);
    const car=phase==='arrive'?arrivingCar(p):curbPosition(carY);
    const policeY=index<at('police_depart')?mix(183,policeStop[1],phase==='police_arrive'?p:1):mix(policeStop[1],276,phase==='police_depart'?p:1);
    const police=curbPosition(policeY,true);
    const targets=[[166,223],[155,225],[169,232]];
    // Measure travelled ground distance in body-sized units, including perspective.
    // The gait follows distance rather than a free-running clock, so stopped feet settle.
    const groundDistance=(a,b)=>{
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      return Math.abs(b[1]-a[1])<.001?length/perspective(a[1]):length*42*Math.log((b[1]-181)/(a[1]-181))/(b[1]-a[1]);
    };
    // Route length controls both translation and steps. Rounded bends skirt the hero.
    const routePoints=points=>{
      if(points.length===2)return points;
      const result=[points[0]];
      for(let i=1;i<points.length-1;i++){
        const a=points[i-1],b=points[i],d=points[i+1];
        const before=a.map((v,j)=>b[j]+(v-b[j])*.16),after=d.map((v,j)=>b[j]+(v-b[j])*.16);
        result.push(before);
        for(let k=1;k<=8;k++){const t=k/8;result.push(b.map((v,j)=>(1-t)*(1-t)*before[j]+2*(1-t)*t*v+t*t*after[j]));}
      }
      result.push(points[points.length-1]);return result;
    };
    const walkProfile=t=>{
      t=clamp(t);const ramp=.18,area=1-ramp;
      if(t<ramp)return .5*(t-ramp/Math.PI*Math.sin(Math.PI*t/ramp))/area;
      if(t>1-ramp){const r=1-t;return 1-.5*(r-ramp/Math.PI*Math.sin(Math.PI*r/ramp))/area;}
      return (t-ramp/2)/area;
    };
    const routeLength=route=>{const pts=routePoints(route);return pts.slice(1).reduce((sum,p,i)=>sum+groundDistance(pts[i],p),0);};
    const movement=(route,q,ms,prior=0)=>{
      const pts=routePoints(route),lengths=pts.slice(1).map((p,i)=>groundDistance(pts[i],p)),total=lengths.reduce((a,b)=>a+b,0);
      const t=clamp(q),distance=total*walkProfile(t);let left=distance,i=0;
      while(i<lengths.length-1&&left>lengths[i])left-=lengths[i++];
      const a=pts[i],b=pts[i+1],u=lengths[i]?left/lengths[i]:0,position=a.map((v,j)=>v+(b[j]-v)*u);
      const lo=Math.max(0,t-.0001),hi=Math.min(1,t+.0001),speed=t===0||t===1?0:total*(walkProfile(hi)-walkProfile(lo))/((hi-lo)*ms/1000);
      return {x:position[0],y:position[1],travel:prior+distance,pace:Math.min(1,speed/3.5),speed,direction:[b[0]-a[0],b[1]-a[1]],moving:speed>.01};
    };
    const people=targets.map((original,i)=>{
      const target=[...original];if(i===0&&index>=at('throw'))target[1]=phase==='throw'?mix(223,226,p):226;
      const step=[[165.8,218],[154,216],[169,218]][i];
      const outRoute=i===1?[doors[i],[158,214.5],step]:[doors[i],step];
      const walkRoute=[step,target];
      const returnRoute=i===1?[target,[154,216],[158,214.5],doors[i]]:[target,step,doors[i]];
      const first=routeLength(outRoute),second=routeLength(walkRoute);
      let pose={x:target[0],y:target[1],travel:first+second,pace:0,direction:[-1,0],moving:false};
      if(phase==='disembark')pose=movement(outRoute,(p-i*.23)/.5,length*.5);
      if(phase==='approach')pose=movement(walkRoute,p,length,first);
      if(phase==='retreat')pose=movement(returnRoute,p,length,first+second);
      if(phase==='board')pose={...pose,x:doors[i][0],y:doors[i][1]};
      return {...pose,visible:between('disembark','board')&&(phase!=='disembark'||p>=i*.23)&&(phase!=='board'||p<.7-i*.17),kind:i===2?'woman':i===0?'man1':'man2'};
    });
    const officerVisible=between('officer_exit','officer_board');
    const officerTarget=[155.5,222],officerRoute=[officerStep,[154.5,216],officerTarget],exitDistance=routeLength([officerDoor,officerStep]),walkDistance=routeLength(officerRoute);
    let officer={x:officerStep[0],y:officerStep[1],travel:exitDistance,pace:0,direction:[1,0],moving:false};
    if(phase==='officer_exit')officer=movement([officerDoor,officerStep],p,length);
    if(phase==='officer_walk')officer=movement(officerRoute,p,length,exitDistance);
    if(phase==='talk')officer={...officer,x:officerTarget[0],y:officerTarget[1],travel:exitDistance+walkDistance};
    if(phase==='officer_return')officer=movement([...officerRoute].reverse(),p,length,exitDistance+walkDistance);
    if(phase==='officer_board')officer=movement([officerStep,officerDoor],p,length,exitDistance+2*walkDistance);
    const sign=index<at('snatch')?'held':phase==='snatch'?(p<.5?'held':'taken'):phase==='throw'?'falling':index<at('pickup')?'ground':phase==='pickup'?(p<.66?'ground':'carried'):phase==='leave'?'carried':'gone';
    return {phase,p,index,label,time,car,carVisible:index<=at('depart'),police,policeVisible:between('police_arrive','police_depart'),people,officer:{...officer,visible:officerVisible&&(phase!=='officer_board'||p<.65)},sign,protagonistVisible:index<=at('leave'),protagonistProgress:phase==='leave'?1-ease(p):index>at('leave')?0:1,damaged:index>=at('stamp')};
  }
  function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x*3)/3,Math.round(y*3)/3,Math.max(1,Math.round(w*3))/3,Math.max(1,Math.round(h*3))/3);}
  function line(c,a,b,width,color){const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*3));for(let i=0;i<=steps;i++)rect(c,a[0]+(b[0]-a[0])*i/steps-width/2,a[1]+(b[1]-a[1])*i/steps-width/2,width,width,color);}
  function sign(c,x,y,fallen=false,damaged=false){
    SceneCharacter.placard(c,x-1.75,y-(fallen?0:2),11.5,fallen?3.3:7,damaged,'police');
  }
  function person(c,a,time,gesture='rest',amount=0){
    SceneCharacter.encounterPerson(c,a,time,gesture,amount,perspective(a.y));
  }
  function vehicle(c,position,fleet,police=false,door=false){
    const [x,y]=position,sprite=fleet[police?0:2][police?1:2];
    const ww=vehicleSize(y,police),hh=ww*sprite.height/sprite.width,depth=ww/(police?24:25);
    c.drawImage(sprite,Math.round((x-ww/2)*3)/3,Math.round((y-hh)*3)/3,ww,hh);
    if(police){
      // High-contrast side identification and a roof-mounted red/blue lightbar.
      rect(c,x-ww*.21,y-hh*.36,ww*.44,hh*.10,'#d9dfd8');
      const barX=x-ww*.34,barY=y-hh*.87;
      rect(c,barX-.35*depth,barY+.8*depth,ww*.46,1.1*depth,'#283239');
      rect(c,barX,barY,ww*.44,1.6*depth,'#d6dcd7');
      rect(c,barX,barY,ww*.20,1.35*depth,'#b64843');
      rect(c,barX+ww*.24,barY,ww*.20,1.35*depth,'#547d99');
      rect(c,barX+.5*depth,barY,ww*.12,.45*depth,'#e19383');
      rect(c,barX+ww*.27,barY,ww*.12,.45*depth,'#a2bbc5');
    }
    if(door){
      const hinge=[x-ww*.33,y-hh*.46],edge=[hinge[0]-3*depth,hinge[1]+1.5*depth];
      line(c,hinge,edge,1.2*depth,police?'#d9dfd8':'#62695d');
      line(c,edge,[edge[0],edge[1]+hh*.23],1*depth,'#353d34');
    }
  }
  function draw(c,time,traffic,animationTime=time){
    const f=sample(time);
    if(f.policeVisible)vehicle(c,f.police,traffic.fleet,true,['officer_exit','officer_board'].includes(f.phase));
    if(f.carVisible)vehicle(c,f.car,traffic.fleet,false,['disembark','board'].includes(f.phase));
    if(['ground','falling'].includes(f.sign)){
      const p=f.phase==='throw'?ease(f.p):1;
      sign(c,mix(162,161,p),mix(205,225.5,p)-Math.sin(p*Math.PI)*3,p>.8,f.damaged);
    }
    const actors=[];
    if(f.protagonistVisible)actors.push({y:264-41*f.protagonistProgress,draw:()=>{
      SceneCharacter.outdoor(c,f.protagonistProgress,f.phase==='leave',time,f.sign==='held'?1:0,animationTime,{placard:'police',showSign:['held','carried'].includes(f.sign),bend:f.phase==='pickup'?Math.sin(f.p*Math.PI):0,damaged:f.damaged});
    }});
    for(const a of f.people)if(a.visible)actors.push({y:a.y,draw:()=>{
      let gesture='rest',amount=0;
      if(a.kind==='man1'&&['snatch','throw'].includes(f.phase)){gesture='reach';amount=-4;}
      if(a.kind==='man1'&&f.phase==='stamp'){gesture='stamp';amount=Math.max(0,Math.sin(f.p*Math.PI*8));}
      if(a.kind==='man2'&&f.phase==='stamp'&&f.p>.18&&f.p<.65){gesture='push';amount=5*Math.sin((f.p-.18)/.47*Math.PI);}
      person(c,a,time,gesture,amount);
    }});
    if(f.officer.visible)actors.push({y:f.officer.y,draw:()=>person(c,{...f.officer,kind:'officer'},time,f.phase==='talk'?'talk':'rest',f.phase==='talk'?Math.max(0,Math.sin(time/650))*2:0)});
    actors.sort((a,b)=>a.y-b.y).forEach(a=>a.draw());
    if(f.sign==='taken'){const transfer=(f.p-.5)*2;sign(c,mix(157,162,transfer),mix(201,205,transfer),false,false);}
    return f;
  }
  return {phases,duration,sample,draw,perspective,vehicleSize,curb,projection,worldY,arrivingCar};
})();
