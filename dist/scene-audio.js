/* One ambient mix per device; the PC host shares its mix across both displays. */
window.SceneAudio=(()=>{
  const paths={music:'media/music/to-the-star.mp3',traffic:'media/ambience/traffic.m4a',rain:'media/ambience/rain.m4a'};
  const outdoors=new Set(['wait','emerge','pause','raise','outside','encounter','dog_encounter','rain_encounter','return_wait']);
  let context=null,loading=null,ready=false,error=null,lastCue=null,paused=true,mediaPlaying=false,output=null,volume=1;
  const buffers={},channels={},targets={music:0,traffic:0,rain:0};
  function mix(cue,isPaused=false,foreground=false){
    if(isPaused||!cue)return {music:0,traffic:0,rain:0};
    const outside=cue.side!=='indoor'&&(outdoors.has(cue.phase)||(cue.phase==='exit'&&cue.indoorVisible===false));
    if(!outside)return {music:foreground?.10:.42,traffic:0,rain:0};
    const raining=cue.id==='rain'&&['rain_encounter','return_wait'].includes(cue.phase);
    const intensity=raining?(cue.phase==='rain_encounter'?SceneRainEncounter.sample(cue.phaseTime).intensity:1):0;
    // Use the last part of the empty-screen return to finish the crossfade
    // before the actor is visible indoors. Keep an audible bed throughout.
    const remaining=cue.phaseRemaining??5000;
    const p=cue.phase==='return_wait'?Math.max(0,Math.min(1,1-remaining/1500)):0;
    const inside=p*p*(3-2*p);
    return {music:.42*inside,traffic:(raining?.32:.6)*(1-inside),rain:intensity*.85*(1-inside)};
  }
  function apply(){
    if(!ready||context?.state!=='running')return;
    const levels=mix(lastCue,paused,mediaPlaying),now=context.currentTime;
    for(const name of Object.keys(paths)){
      if(!channels[name]){
        const source=context.createBufferSource(),gain=context.createGain();
        source.buffer=buffers[name];source.loop=true;gain.gain.value=0;
        source.connect(gain);gain.connect(output);
        source.start(0,Math.max(0,lastCue?.clock||0)/1000%source.buffer.duration);
        channels[name]={source,gain};
      }
      const gain=channels[name].gain.gain;
      const room=!outdoors.has(lastCue?.phase)&&!(lastCue?.phase==='exit'&&lastCue?.indoorVisible===false);
      const silenceOutside=name!=='music'&&levels[name]===0&&room&&!paused;
      if(targets[name]===levels[name]&&!(silenceOutside&&gain.value!==0))continue;
      targets[name]=levels[name];
      // Approach the new level from the current gain, including mid-fade changes.
      // Scene crossfades settle in ~1.5s; duck quickly and recover gently.
      const ducking=name==='music'&&levels.music>0&&mediaPlaying;
      if(silenceOutside){
        // No exponential outdoor tail may remain over a visible indoor actor.
        gain.cancelScheduledValues(now);gain.setValueAtTime(0,now);
      }else gain.setTargetAtTime(levels[name],now,paused?.035:ducking?.18:lastCue?.phase==='return_wait'?.035:.5);
    }
  }
  async function unlock(){
    try{
      context=context||new (window.AudioContext||window.webkitAudioContext)();
      if(!output){output=context.createGain();output.gain.value=volume;output.connect(context.destination);}
      if(!loading)loading=Promise.all(Object.entries(paths).map(async([name,url])=>{
        const response=await fetch(url);if(!response.ok)throw Error('Cannot load '+url);
        buffers[name]=await context.decodeAudioData(await response.arrayBuffer());
      })).then(()=>{ready=true;error=null;apply();}).catch(e=>{error=e.message;loading=null;});
      await context.resume();await loading;apply();
    }catch(e){error=e.message;}
  }
  function update(cue,isPaused=false,foreground=false){lastCue=cue;paused=isPaused;mediaPlaying=foreground;apply();}
  function stop(){paused=true;apply();}
  function setVolume(value){if(!Number.isFinite(value))return;volume=Math.max(0,Math.min(2,value));if(output)output.gain.setTargetAtTime(volume,context.currentTime,.05);}
  document.addEventListener('pointerdown',unlock);
  document.addEventListener('keydown',unlock);
  window.addEventListener('pagehide',()=>{stop();context?.close();});
  return {unlock,update,stop,mix,setVolume,get status(){return {ready,error,volume,context:context?.state||'locked',targets:{...targets},sources:Object.keys(channels).length};}};
})();
