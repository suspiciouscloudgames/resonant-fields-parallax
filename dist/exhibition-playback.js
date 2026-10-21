/* Natural-speed exhibition. This sampler is also used by the Android companion. */
window.ExhibitionPlayback=(()=>{
  const definitions=[
    {id:'smoking',label:'흡연',side:'indoor',number:1,duration:45000},
    {id:'rain',label:'비',side:'outdoor',number:3,duration:80000},
    {id:'youtube',label:'유튜브',side:'indoor',number:2,duration:45000},
    {id:'police',label:'경찰차',side:'outdoor',number:1,duration:160000},
    {id:'game',label:'게임',side:'indoor',number:3,duration:65000},
    {id:'dog',label:'들개',side:'outdoor',number:2,duration:145000},
  ];
  function sample(cues,time){
    time=Math.max(0,time);const cycleMilliseconds=cues.reduce((n,c)=>n+c.duration,0);
    const cycle=Math.floor(time/cycleMilliseconds);let within=time%cycleMilliseconds,index=0;
    while(index<cues.length-1&&within>=cues[index].duration)within-=cues[index++].duration;
    const cue=cues[index];let phaseTime=within,phase=cue.phases[0];
    for(const p of cue.phases){phase=p;if(phaseTime<p.duration)break;phaseTime-=p.duration;}
    const mode=phase.state==='gaming'?'game':phase.state==='read'&&cue.id==='youtube'?'youtube':'clock';
    return {...cue,index,step:cycle*cues.length+index,elapsed:within,clipTime:within,clock:time,
      phase:phase.state,phaseTime,captionScreen:cue.side==='indoor'?'landscape':'portrait',
      captionVisible:within<5000,phone:{mode,elapsed:mode==='clock'?0:phaseTime,
        remaining:mode==='game'?Math.max(0,60000-phaseTime):0}};
  }
  function create(engine){
    const cues=definitions.map(c=>({...c,phases:engine.exhibitionClip(c.side,c.number,c)}));
    for(const cue of cues)if(cue.phases.reduce((n,p)=>n+p.duration,0)!==cue.duration)throw Error('Invalid scene duration: '+cue.id);
    const cycleMilliseconds=cues.reduce((sum,c)=>sum+c.duration,0);
    let started=false,last=0,elapsed=0,paused=false,current=null;
    function render(){current=sample(cues,elapsed);engine.renderExhibition(current.side,current.number,current.clipTime,current.clock,current);}
    return {cues,cycleMilliseconds,sample:time=>sample(cues,time),
      get started(){return started;},get status(){return {started,paused,elapsed,current};},
      start(now=Date.now()){started=true;last=now;elapsed=0;paused=false;render();},
      advance(now){if(!started)return;const delta=Math.max(0,now-last);last=Math.max(last,now);if(!paused)elapsed+=delta;render();},
      pause(value,now=Date.now()){this.advance(now);paused=!!value;last=now;},
    };
  }
  return {definitions,create,sample};
})();
