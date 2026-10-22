/* Host-owned three-round session. The final settlement determines the scene end. */
window.BlitzSession=(()=>{
  const PLAY=60000,HOLD=900,OUT=1000,IN=1200,ROUNDS=3;
  const minimumDuration=ROUNDS*PLAY+(ROUNDS-1)*(HOLD+OUT+IN)+HOLD;
  function create(id,count=ROUNDS){
    let number=1,start=0,engine=make(1),next=null,completeAt=null,lastTime=0,view=null,results=[];
    function make(n){return BlitzGame.create(BlitzGame.seed(id+':'+n));}
    function advance(time){
      time=Math.max(lastTime,time);lastTime=time;
      for(let guard=0;guard<count+1;guard++){
        const elapsed=Math.max(0,time-start),game=engine.advance(elapsed);
        let stage=elapsed<PLAY?'play':'bonus',transition=null,shown=game,shownNumber=number,shownElapsed=elapsed;
        if(game.endedAt!==null){
          if(!results.some(r=>r.number===number))results.push({number,round:id+':'+number,score:game.score,endedAt:start+game.endedAt});
          const after=elapsed-game.endedAt;
          stage='score';
          if(number===count){if(after>=HOLD){completeAt=start+game.endedAt+HOLD;stage='complete';}}
          else if(after>=HOLD+OUT+IN){start+=game.endedAt+HOLD+OUT+IN;number++;engine=next||make(number);next=null;continue;}
          else if(after>=HOLD+OUT){next=next||make(number+1);shown=next.snapshot();shownNumber=number+1;shownElapsed=0;stage='entry';transition={kind:'in',progress:(after-HOLD-OUT)/IN};}
          else if(after>=HOLD){stage='exit';transition={kind:'out',progress:(after-HOLD)/OUT};}
        }
        view={...shown,round:id+':'+shownNumber,roundNumber:shownNumber,roundCount:count,elapsed:shownElapsed,stage,transition,complete:completeAt!==null,completeAt,sessionElapsed:time,roundResults:results.map(r=>({...r}))};return view;
      }
      throw Error('Unable to advance game session');
    }
    return {advance,swap(a,b,time){const s=advance(time);return s.stage==='play'&&engine.swap(a,b,time-start);},get state(){return view||advance(0);}};
  }
  return {create,minimumDuration,PLAY,HOLD,OUT,IN,ROUNDS};
})();
