/* Solid pixel rain; the installation clips weather to the outdoor screen. */
window.SceneRainEncounter=(()=>{
  const phases=[['downpour',1800,'시위 중 갑자기 폭우가 쏟아지는 중'],['lower',2200,'비를 맞으며 피켓을 내리는 중'],['leave',12000,'피켓을 내린 채 천천히 걸어 나가는 중']];
  const duration=phases.reduce((n,p)=>n+p[1],0),clamp=p=>Math.max(0,Math.min(1,p)),ease=p=>{p=clamp(p);return p*p*(3-2*p);};
  function sample(time){
    time=Math.max(0,time);let start=0,index=0;
    while(index<phases.length&&time>=start+phases[index][1])start+=phases[index++][1];
    const [phase,length,label]=phases[index]||['ended',1,'빗속의 시위가 끝났습니다'],p=clamp((time-start)/length);
    const progress=phase==='leave'?ease(p):phase==='ended'?1:0;
    return {phase,p,label,intensity:phase==='downpour'?.35+.65*ease(p):1,hero:{visible:phase!=='ended',position:[161+13*progress,223+35*progress],moving:phase==='leave'&&p>0&&p<1,lift:phase==='downpour'?1:phase==='lower'?1-ease(p):0,travel:Math.hypot(13,35)*progress}};
  }
  const random=n=>{let a=Math.imul(n+91,374761393);a=Math.imul(a^(a>>>13),1274126177);return ((a^(a>>>16))>>>0)/4294967296;};
  function rain(c,time,intensity=1){
    const seconds=time/1000,count=Math.round(360*intensity);
    for(let i=0;i<count;i++){
      const speed=35+random(i+400)*35,depth=.55+random(i+800)*.8;
      const y=177+((random(i)*83+seconds*speed)%83),x=131+random(i+200)*75-(y-177)*.11;
      const length=(2.4+random(i+1200)*4.3)*depth;
      c.fillStyle=['#9caaa6','#b9c5bf','#dce1d6','#758681'][i%4];
      // Opaque stair-steps rather than antialiased lines or translucent veils.
      for(let d=0;d<length;d+=1/3)c.fillRect(Math.round((x-d*.12)*3)/3,Math.round((y+d)*3)/3,i%7===0?2/3:1/3,1/3);
    }
    // Brief splashes remain on the ground, below the skyline and sign.
    for(let i=0;i<36;i++){
      const age=(seconds*(1.1+random(i+1600))+random(i+1800))%1;if(age>.22*intensity)continue;
      const x=153+random(i+2000)*31,y=216+random(i+2200)*32,spread=.2+age*3;
      c.fillStyle=i%2?'#b8c3b8':'#778a80';
      c.fillRect(Math.round((x-spread)*3)/3,Math.round((y-age*2)*3)/3,2/3,1/3);
      c.fillRect(Math.round((x+spread)*3)/3,Math.round((y-age*2)*3)/3,1/3,1/3);
    }
  }
  function draw(c,time,animationTime=time){
    const f=sample(time);
    if(f.hero.visible)SceneCharacter.outdoor(c,1,f.hero.moving,f.hero.travel*240,f.hero.lift,animationTime,{position:f.hero.position,carryAside:1-f.hero.lift});
    rain(c,time,f.intensity);return f;
  }
  return {phases,duration,sample,draw,rain};
})();
