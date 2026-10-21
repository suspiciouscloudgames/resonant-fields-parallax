/* Audio extracted from the supplied recording. No synthesized replacement sounds. */
window.BlitzAudio=(()=>{
  const paths={recording:'media/blitz/recording.m4a',swap:'media/blitz/swap.m4a',match:'media/blitz/match.m4a',power:'media/blitz/power.m4a'};
  let context=null,loading=null,ready=false,bed=null,bedRound=null,lastEvent=null,active=false,round=null,time=0,paused=true,bedOffset=0,bedStarted=0;
  const buffers={},effects=new Set();
  async function unlock(){
    try{context=context||new (window.AudioContext||window.webkitAudioContext)();await context.resume();
      if(!loading)loading=Promise.all(Object.entries(paths).map(async([k,url])=>{const r=await fetch(url);if(!r.ok)throw Error('Audio load failed');buffers[k]=await context.decodeAudioData(await r.arrayBuffer());})).then(()=>ready=true).catch(()=>{loading=null;});
      await loading;syncBed();
    }catch{}
  }
  function stopBed(){if(bed){try{bed.stop();}catch{}bed.disconnect();bed=null;}bedRound=null;}
  function stop(){stopBed();for(const node of effects)try{node.stop();}catch{}effects.clear();}
  function syncBed(){
    if(!context||context.state!=='running'||!ready||!active||paused){stop();return;}
    const target=time/1000;if(bed&&(bedRound!==round||Math.abs(bedOffset+context.currentTime-bedStarted-target)>.6))stopBed();
    if(!bed&&target<buffers.recording.duration){bed=context.createBufferSource();bed.buffer=buffers.recording;const gain=context.createGain();gain.gain.value=.5;bed.connect(gain);gain.connect(context.destination);bed.start(0,target);bedOffset=target;bedStarted=context.currentTime;bedRound=round;}
  }
  function update(view,game){
    active=view.mode==='game';paused=!!view.paused;time=view.elapsed||0;round=view.round||null;syncBed();
    const event=game?.event,key=round+':'+event?.id;
    if(key===lastEvent)return;lastEvent=key;
    if(!active||paused||!ready||context?.state!=='running'||!event)return;
    const name=event.type==='invalid'?'swap':event.type;if(!buffers[name]||name==='recording')return;
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers[name];gain.gain.value=.65;source.connect(gain);gain.connect(context.destination);effects.add(source);source.onended=()=>{effects.delete(source);source.disconnect();gain.disconnect();};source.start();
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  return {unlock,update,stop,get status(){return {ready,playing:!!bed,context:context?.state||'locked',effects:effects.size};}};
})();
