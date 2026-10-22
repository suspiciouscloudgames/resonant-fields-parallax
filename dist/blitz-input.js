/* Shared touch/mouse interaction. Moves remain owned by the game host. */
window.BlitzInput=(()=>{
  const clamp=n=>Math.max(0,Math.min(1,n));
  function create(canvas,{canPlay,move,interact=()=>{}}){
    let selected=-1,down=null,release=null,board=null;
    function reset(){
      const pointer=down?.id;down=null;release=null;selected=-1;
      if(pointer!==undefined&&canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);
    }
    function gesture(e){
      const r=canvas.getBoundingClientRect(),size=BlitzView.geometry(r.width,r.height).scale*56;
      const dx=e.clientX-down.x,dy=e.clientY-down.y,horizontal=Math.abs(dx)>Math.abs(dy);
      const distance=horizontal?dx:dy,to=down.cell+(horizontal?(dx>0?1:-1):(dy>0?8:-8));
      return {from:down.cell,to,progress:BlitzGame.adjacent(down.cell,to)?clamp(Math.abs(distance)/size):0};
    }
    function progress(now=performance.now()){
      if(!release)return down?.drag||null;
      const p=clamp((now-release.at)/120),e=p*p*(3-2*p);
      return {...release,progress:release.progress+(release.target-release.progress)*e};
    }
    function springBack(){
      if(!release)return;release={...progress(),at:performance.now(),target:0};
    }
    function commit(from,to,drag){
      const action={from,to,progress:drag?.progress||0,target:1,at:performance.now(),revision:board.revision};
      release=action;selected=-1;
      Promise.resolve(move(from,to)).then(ok=>{if(ok===false&&release===action)springBack();},()=>{if(release===action)springBack();});
    }
    canvas.style.touchAction='none';
    canvas.addEventListener('pointerdown',e=>{
      if(down||release||!canPlay()||(e.pointerType==='mouse'&&e.button!==0))return;
      const r=canvas.getBoundingClientRect(),cell=BlitzView.hit(e.clientX-r.left,e.clientY-r.top,r.width,r.height);if(cell<0)return;
      interact();e.preventDefault();canvas.setPointerCapture(e.pointerId);
      down={cell,x:e.clientX,y:e.clientY,id:e.pointerId,selected,drag:null};if(selected<0)selected=cell;
    });
    canvas.addEventListener('pointermove',e=>{
      if(!down||down.id!==e.pointerId)return;
      if(!canPlay()){reset();return;}e.preventDefault();down.drag=gesture(e);interact();
    });
    canvas.addEventListener('pointerup',e=>{
      if(!down||down.id!==e.pointerId)return;
      const start=down,drag=gesture(e);down=null;
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(!canPlay()){reset();return;}
      if(drag.progress>.24)commit(drag.from,drag.to,drag);
      else if(start.selected>=0&&start.selected!==start.cell&&BlitzGame.adjacent(start.selected,start.cell))commit(start.selected,start.cell);
      else {selected=start.selected===start.cell?-1:start.cell;if(drag.progress>0)release={...drag,target:0,at:performance.now(),revision:board.revision};}
      interact();
    });
    canvas.addEventListener('pointercancel',reset);
    canvas.addEventListener('lostpointercapture',()=>{if(down)reset();});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    return {reset,get selected(){return selected;},
      update(next,enabled=true){
        if(!enabled||!next||board?.round!==next.round||next.stage!=='play')reset();
        else if(board?.revision!==next.revision){
          selected=-1;down=null;
          if(!(release&&next.phase==='swap'&&next.swap?.includes(release.from)&&next.swap.includes(release.to)))release=null;
        }
        board=next;
        if(release&&(performance.now()-release.at>(release.target?1200:120)))reset();
      },
      get visual(){return {selected,drag:progress()};}
    };
  }
  return {create};
})();
