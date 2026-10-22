/* Smooth display time without changing the host-owned board, score or deadlines. */
window.BlitzPresentation=(()=>{
  function clock(){
    let key=null,value=0,last=0;
    return {reset(){key=null;},sample(id,target,now,paused){
      const dt=Math.max(0,now-last);last=now;
      if(key!==id){key=id;value=target;}
      else if(!paused){
        if(dt>250){value=Math.max(value,target);return value;}
        const next=value+dt;
        // Slew toward fresh snapshots; packet delay must never rewind a falling gem.
        value=next+Math.max(-dt*.15,Math.min(dt*.15,target-next));
      }
      return value;
    }};
  }
  function create(){
    const round=clock(),transition=clock();
    function reset(){round.reset();transition.reset();}
    return {reset,sample(game,elapsed,age,now,paused=false){
      if(!game){reset();return {game,elapsed};}
      const entry=game.stage==='entry';
      const time=round.sample(game.round+(entry?':entry':':round'),elapsed,now,paused||entry);
      if(!game.transition){transition.reset();return {game,elapsed:time};}
      const t=game.transition,duration=t.kind==='in'?BlitzSession.IN:BlitzSession.OUT;
      const target=t.progress*duration+(paused?0:Math.max(0,Math.min(age,1000)));
      const progress=Math.max(0,Math.min(1,transition.sample(game.round+':'+t.kind,target,now,paused)/duration));
      return {game:{...game,transition:{...t,progress}},elapsed:time};
    }};
  }
  return {create};
})();
