/* The dual-display controller owns the sequence. Phones follow published cues. */
window.ExhibitionPlayback=(()=>{
  const definitions=[
    {id:'smoking',label:'흡연',side:'indoor',number:1,duration:45000,messageAt:12000},
    {id:'rain',label:'비',side:'outdoor',number:3,duration:115000,outsideDuration:42000,messageAt:40000},
    {id:'youtube',label:'유튜브',side:'indoor',number:2,duration:100000},
    {id:'police',label:'경찰차',side:'outdoor',number:1,duration:185000,outsideDuration:28000,messageAt:40000},
    {id:'game',label:'게임',side:'indoor',number:3,duration:190000,messageAt:24000},
    {id:'dog',label:'들개',side:'outdoor',number:2,duration:325000,outsideDuration:184000,messageAt:42000},
  ];
  function cueAt(cue,index,step,within,time,sceneStart){
    let phaseTime=within,phase=cue.phases[0];
    for(const p of cue.phases){phase=p;if(phaseTime<p.duration)break;phaseTime-=p.duration;}
    const sceneLock=within<1800;
    const mode=sceneLock?'clock':phase.state==='gaming'?'game':phase.state==='read'&&cue.id==='youtube'?'youtube':'clock';
    return {...cue,index,step,elapsed:within,clipTime:within,clock:time,sceneStart,
      phase:phase.state,phaseTime,phaseRemaining:Math.max(0,phase.duration-phaseTime),
      captionScreen:cue.side==='indoor'?'landscape':'portrait',captionVisible:true,
      messageAt:cue.messageAt??20000,
      phone:{mode,sceneLock,...(sceneLock?{sleepElapsed:within}:{}),elapsed:mode==='clock'?0:phaseTime,remaining:mode==='game'?Math.max(0,60000-phaseTime):0}};
  }
  // Static nominal sampler remains useful for cue selection and offline tools.
  function sample(cues,time){
    time=Math.max(0,time);const length=cues.reduce((n,c)=>n+c.duration,0),cycle=Math.floor(time/length);let within=time%length,index=0;
    while(index<cues.length-1&&within>=cues[index].duration)within-=cues[index++].duration;
    return cueAt(cues[index],index,cycle*cues.length+index,within,time,time-within);
  }
  function create(engine){
    const cues=definitions.map(c=>({...c,phases:engine.exhibitionClip(c.side,c.number,c)}));
    for(const c of cues)if(c.phases.reduce((n,p)=>n+p.duration,0)!==c.duration)throw Error('Invalid scene duration: '+c.id);
    const cycleMilliseconds=cues.reduce((n,c)=>n+c.duration,0);
    let started=false,last=0,elapsed=0,paused=false,current=null,runId='',serial=0,index=0,step=0,sceneStart=0,cycleStart=0,lastCycleMilliseconds=null;
    function render(){
      for(let guard=0;guard<100000;guard++){
        let cue={...cues[index]},within=elapsed-sceneStart,game=null;
        const instance=runId+':'+step;
        if(cue.id==='game'&&engine.gameSession){
          game=engine.gameSession(instance,Math.max(0,within-1800));
          cue.duration=game.complete?1800+game.completeAt+1100:Math.max(cue.duration,within+1101);
          cue.phases=engine.exhibitionClip(cue.side,cue.number,cue);
        }
        if(within>=cue.duration){sceneStart+=cue.duration;step++;index=(index+1)%cues.length;if(index===0){lastCycleMilliseconds=sceneStart-cycleStart;cycleStart=sceneStart;}continue;}
        current=cueAt(cue,index,step,within,elapsed,sceneStart);current.instance=instance;current.cycle=Math.floor(step/cues.length);
        current.phone.round=instance;
        current.gameTime=Math.max(0,within-1800);current.phone.paused=false;
        if(current.phone.mode==='game'&&game)current.phone={...current.phone,elapsed:game.elapsed,round:game.round,stage:game.stage,remaining:Math.max(0,60000-game.elapsed)};
        if(cue.id==='game'&&game?.complete)current.phone.sleepElapsed=within-(1800+game.completeAt);
        engine.renderExhibition(current.side,current.number,current.clipTime,current.clock,current);return;
      }
      throw Error('Exhibition clock jump is too large');
    }
    return {cues,cycleMilliseconds,sample:t=>sample(cues,t),
      get started(){return started;},get status(){return {started,paused,elapsed,current,runId,lastCycleMilliseconds};},
      start(now=Date.now()){runId=Date.now().toString(36)+'-'+(++serial);started=true;last=now;elapsed=0;paused=false;index=step=sceneStart=cycleStart=0;lastCycleMilliseconds=null;render();},
      advance(now){if(!started)return;const delta=Math.max(0,now-last);last=Math.max(last,now);if(!paused)elapsed+=delta;render();},
      pause(value,now=Date.now()){this.advance(now);paused=!!value;last=now;},
    };
  }
  function project(snapshot,delta=0){
    const c=snapshot.current;if(!c)return {mode:'clock',elapsed:0,paused:true,round:null};
    const paused=snapshot.paused||c.phone.paused,dt=paused?0:Math.max(0,Math.min(delta,1000)),p={...c.phone,paused:paused,instance:c.instance};
    // Do not predict a different cue or round; only the dual-display host advances them.
    if(p.mode==='youtube'||p.mode==='game'&&['play','bonus','score','exit'].includes(p.stage))p.elapsed+=dt;
    if(Number.isFinite(p.sleepElapsed))p.sleepElapsed+=dt;
    return p;
  }
  return {definitions,create,sample,project};
})();
