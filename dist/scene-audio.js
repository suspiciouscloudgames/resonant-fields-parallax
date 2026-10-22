/* One ambient mix on the PC host, shared by both displays. */
window.SceneAudio=(()=>{
  const paths={traffic:'media/ambience/traffic.m4a',rain:'media/ambience/rain.m4a'};
  const outdoors=new Set(['emerge','pause','raise','outside','encounter','dog_encounter','rain_encounter','return_wait']);
  let context=null,loading=null,ready=false,error=null,lastCue=null,paused=true;
  const buffers={},channels={},targets={traffic:0,rain:0};
  function mix(cue,isPaused=false){
    if(isPaused||!cue||cue.side!=='outdoor'||!outdoors.has(cue.phase))return {traffic:0,rain:0};
    const raining=cue.id==='rain'&&['rain_encounter','return_wait'].includes(cue.phase);
    const intensity=raining?(cue.phase==='rain_encounter'?SceneRainEncounter.sample(cue.phaseTime).intensity:1):0;
    return {traffic:raining?.32:.6,rain:intensity*.85};
  }
  function apply(){
    if(!ready||context?.state!=='running')return;
    const levels=mix(lastCue,paused),now=context.currentTime;
    for(const name of Object.keys(paths)){
      if(!channels[name]){
        const source=context.createBufferSource(),gain=context.createGain();
        source.buffer=buffers[name];source.loop=true;gain.gain.value=0;
        source.connect(gain);gain.connect(context.destination);
        source.start(0,Math.max(0,lastCue?.clock||0)/1000%source.buffer.duration);
        channels[name]={source,gain};
      }
      if(Math.abs(targets[name]-levels[name])<.001)continue;
      targets[name]=levels[name];
      channels[name].gain.gain.setTargetAtTime(levels[name],now,paused?.035:name==='rain'&&levels[name]>0?.12:.28);
    }
  }
  async function unlock(){
    try{
      context=context||new (window.AudioContext||window.webkitAudioContext)();
      if(!loading)loading=Promise.all(Object.entries(paths).map(async([name,url])=>{
        const response=await fetch(url);if(!response.ok)throw Error('Cannot load '+url);
        buffers[name]=await context.decodeAudioData(await response.arrayBuffer());
      })).then(()=>{ready=true;error=null;apply();}).catch(e=>{error=e.message;loading=null;});
      await context.resume();await loading;apply();
    }catch(e){error=e.message;}
  }
  function update(cue,isPaused=false){lastCue=cue;paused=isPaused;apply();}
  function stop(){paused=true;apply();}
  document.addEventListener('pointerdown',unlock);
  document.addEventListener('keydown',unlock);
  window.addEventListener('pagehide',()=>{stop();context?.close();});
  return {unlock,update,stop,mix,get status(){return {ready,error,context:context?.state||'locked',targets:{...targets},sources:Object.keys(channels).length};}};
})();
