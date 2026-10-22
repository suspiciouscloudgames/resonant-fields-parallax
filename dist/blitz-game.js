/* Pure, deterministic match-3 rules. Only the exhibition host owns this state. */
window.BlitzGame=(()=>{
  const N=8,COUNT=64,TYPES=7;
  const type=v=>v===24?-1:v%8,kind=v=>Math.floor(v/8),adjacent=(a,b)=>Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<64&&b<64&&Math.abs(a%8-b%8)+Math.abs((a/8|0)-(b/8|0))===1;
  function groups(board){
    const result=[];
    for(let axis=0;axis<2;axis++)for(let line=0;line<8;line++){
      let start=0;
      while(start<8){let end=start+1;const at=n=>axis?line+n*8:line*8+n,t=type(board[at(start)]);
        while(end<8&&t>=0&&type(board[at(end)])===t)end++;
        if(t>=0&&end-start>=3)result.push(Array.from({length:end-start},(_,i)=>at(start+i)));
        start=end;
      }
    }
    return result;
  }
  function moves(board){
    const result=[];
    for(let a=0;a<64;a++)for(const b of [a+1,a+8]){
      if(!adjacent(a,b))continue;
      if(board[a]===24||board[b]===24){result.push([a,b]);continue;}
      const copy=board.slice();[copy[a],copy[b]]=[copy[b],copy[a]];
      if(groups(copy).length)result.push([a,b]);
    }
    return result;
  }
  function create(seed=1,initial){
    let random=seed>>>0||1,board=[],score=0,multiplier=1,total=0,revision=0,eventId=0,phase='idle',start=0,end=0,previous=[],removed=[],falls=[],swapPair=null,combo=0,creations=[],lastMatch=-5000,event=null,effects=[],ending=false,endedAt=null;
    const rand=n=>{random^=random<<13;random^=random>>>17;random^=random<<5;return (random>>>0)%n;};
    function fresh(){
      for(let attempt=0;attempt<50;attempt++){
        const b=[];
        for(let i=0;i<64;i++){let t;do{t=rand(TYPES);}while((i%8>=2&&b[i-1]===t&&b[i-2]===t)||(i>=16&&b[i-8]===t&&b[i-16]===t));b.push(t);}
        if(moves(b).length)return b;
      }
      throw Error('Unable to create a playable board');
    }
    board=initial?initial.slice():fresh();
    function emit(name,extra={}){event={id:++eventId,type:name,...extra};}
    function setPhase(name,time,duration){phase=name;start=time;end=time+duration;revision++;}
    function clear(time,matched,forced=[]){
      const hits=new Set(forced);creations=[];effects=[];
      for(const group of matched)group.forEach(i=>hits.add(i));
      const intersections=new Set();
      for(const i of hits)if(matched.filter(g=>g.includes(i)).length>=2)intersections.add(i);
      for(const i of ending?[]:intersections)creations.push({index:i,gem:type(board[i])+16});
      for(const group of matched){
        if(group.some(i=>intersections.has(i)))continue;
        if(!ending&&group.length>=4){const index=swapPair?.find(i=>group.includes(i))??group[Math.floor(group.length/2)];
          if(!creations.some(c=>c.index===index))creations.push({index,gem:group.length>=5?24:type(board[index])+8});}
      }
      const pending=[...hits],triggered=new Set();
      while(pending.length){const i=pending.pop(),special=kind(board[i]);if(special===0||triggered.has(i))continue;triggered.add(i);
        const targets=[];effects.push({index:i,kind:special,targets});
        const add=j=>{if(j>=0&&j<64){targets.push(j);if(!hits.has(j)){hits.add(j);pending.push(j);}}};
        if(special===1)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=i%8+dx,y=(i/8|0)+dy;if(x>=0&&x<8&&y>=0&&y<8)add(y*8+x);}
        if(special===2)for(let j=0;j<8;j++){add((i/8|0)*8+j);add(j*8+i%8);}
        if(special===3){const counts=Array(7).fill(0);board.forEach(g=>{if(type(g)>=0)counts[type(g)]++;});const target=forced.length&&!ending?null:counts.indexOf(Math.max(...counts));board.forEach((g,j)=>{if(target===null?forced.includes(j):type(g)===target)add(j);});}
      }
      removed=[...hits];previous=board.slice();total+=removed.length;multiplier=Math.min(8,1+Math.floor(total/30));
      const bonus=time-lastMatch<1800?100:0,points=(removed.length*50+bonus)*Math.max(1,combo)*multiplier;
      score+=points;lastMatch=time;emit(triggered.size?'power':'match',{points,combo,count:removed.length});setPhase('clear',time,triggered.size?650:240);
    }
    function resolve(time){
      if(swapPair&&(board[swapPair[0]]===24||board[swapPair[1]]===24)){
        const [a,b]=swapPair,both=board[a]===24&&board[b]===24,target=type(board[board[a]===24?b:a]);
        clear(time,[],board.map((g,i)=>both||g===24||type(g)===target?i:-1).filter(i=>i>=0));return;
      }
      const matched=groups(board);
      if(matched.length){clear(time,matched);return;}
      if(phase==='swap'){
        previous=board.slice();[board[swapPair[0]],board[swapPair[1]]]=[board[swapPair[1]],board[swapPair[0]]];
        emit('invalid');setPhase('revert',time,140);return;
      }
      if(ending){finish(time);return;}
      if(!moves(board).length){board=fresh();emit('shuffle');revision++;}
      phase='idle';start=end=time;swapPair=null;previous=[];removed=[];falls=[];combo=0;
    }
    function drop(time){
      const empty=new Set(removed);creations.forEach(c=>{board[c.index]=c.gem;empty.delete(c.index);});
      falls=[];const next=Array(64);
      for(let col=0;col<8;col++){
        let dest=7;
        for(let row=7;row>=0;row--){const i=row*8+col;if(empty.has(i))continue;const to=dest*8+col;next[to]=board[i];falls.push({from:row,to:dest,col,gem:board[i]});dest--;}
        for(let row=dest;row>=0;row--){const gem=rand(7);next[row*8+col]=gem;falls.push({from:row-dest-1,to:row,col,gem});}
      }
      board=next;swapPair=null;removed=[];creations=[];setPhase('fall',time,240);
    }
    function finish(time){
      swapPair=null;previous=[];removed=[];falls=[];effects=[];combo=1;
      const special=board.findIndex(g=>kind(g)>0);
      if(special>=0){clear(time,[],[special]);return;}
      endedAt=time;setPhase('ended',time,0);emit('settled');
    }
    function advance(time){
      if(time>=60000&&!ending){
        // First finish all moves started before the deadline, then cash out unused powers.
        advance(59999.999);ending=true;
        if(phase==='idle')finish(60000);
      }
      // Finite state transitions remain deterministic under slow frames or reconnects.
      for(let guard=0;guard<200&&phase!=='idle'&&phase!=='ended'&&time>=end;guard++){
        const at=end;
        if(phase==='swap')resolve(at);
        else if(phase==='revert'){phase='idle';start=end=at;swapPair=null;previous=[];revision++;if(ending)finish(at);}
        else if(phase==='clear')drop(at);
        else if(phase==='fall'){combo++;resolve(at);}
      }
      return snapshot();
    }
    function swap(a,b,time){
      advance(time);if(time>=60000||phase!=='idle'||!adjacent(a,b))return false;
      previous=board.slice();[board[a],board[b]]=[board[b],board[a]];swapPair=[a,b];combo=1;emit('swap');setPhase('swap',time,140);return true;
    }
    function snapshot(){return {ending,endedAt,effects:effects.map(e=>({...e,targets:e.targets.slice()})),board:board.slice(),score,multiplier,revision,phase,phaseStart:start,phaseEnd:end,previous:previous.slice(),removed:removed.slice(),falls:falls.map(f=>({...f})),swap:swapPair?.slice()||null,event:event?{...event}:null};}
    return {advance,swap,snapshot,legalMoves:()=>moves(board)};
  }
  function seed(text){let h=2166136261;for(const char of String(text)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  return {create,groups,moves,adjacent,type,kind,seed};
})();
