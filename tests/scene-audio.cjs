const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sources=[],gains=[];
class AudioContext {
  constructor(){this.state='running';this.currentTime=0;this.destination={};}
  resume(){return Promise.resolve();}
  decodeAudioData(){return Promise.resolve({duration:60});}
  createBufferSource(){const source={connect(){},start(...args){this.startArgs=args;}};sources.push(source);return source;}
  createGain(){const gain={gain:{value:0,calls:[],setTargetAtTime(...args){this.calls.push(args);},cancelScheduledValues(){},setValueAtTime(value){this.value=value;}},connect(){}};gains.push(gain);return gain;}
}
const sandbox={window:{AudioContext,addEventListener(){}},document:{addEventListener(){}},fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}),SceneRainEncounter:{sample:()=>({intensity:1})}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/scene-audio.js'),'utf8'),sandbox);
const audio=sandbox.window.SceneAudio,levels=()=>JSON.parse(JSON.stringify(audio.status.targets));
(async()=>{
 assert.equal(audio.status.volume,1,'Mobile/default mix remains unchanged');
 audio.setVolume(1.2);
 await audio.unlock();assert.equal(gains[0].gain.value,1.2,'PC master gain is ready before playback');assert.deepEqual(levels(),{music:0,traffic:0,rain:0});
 const indoor={side:'indoor',id:'smoking',phase:'cigarette',clock:2000};
 audio.update(indoor);assert.deepEqual(levels(),{music:.42,traffic:0,rain:0});
 assert.equal(gains[1].gain.calls.at(-1)[2],.5,'Gentle scene fade-in');
 audio.update({...indoor,id:'youtube'},false,false);assert.equal(levels().music,.42,'YouTube keeps the normal music level');
 audio.update({...indoor,id:'game'},false,true);assert.equal(levels().music,.1);
 assert.equal(gains[1].gain.calls.at(-1)[2],.18,'Duck before foreground sound is masked');
 audio.update({...indoor,id:'game'},false,false);assert.equal(levels().music,.42,'Recover when game audio stops/messages open');
 assert.equal(gains[1].gain.calls.at(-1)[2],.5);
 audio.update({...indoor,id:'game'},false,true);assert.equal(levels().music,.1);
 audio.update({side:'outdoor',id:'rain',phase:'outside'});assert.deepEqual(levels(),{music:0,traffic:.6,rain:0});
 audio.update({side:'outdoor',id:'rain',phase:'rain_encounter',phaseTime:2000});assert.deepEqual(levels(),{music:0,traffic:.32,rain:.85});
 for(const id of ['dog','police']){audio.update({side:'outdoor',id,phase:'outside'});assert.deepEqual(levels(),{music:0,traffic:.6,rain:0});}
 audio.update(indoor);assert.equal(levels().music,.42);
 for(const phase of ['stand','exit','return_enter','return_sit','home']){
   assert.deepEqual(JSON.parse(JSON.stringify(audio.mix({side:'outdoor',id:'police',phase,indoorVisible:true}))),{music:.42,traffic:0,rain:0});
 }
 assert.equal(audio.mix({side:'outdoor',id:'police',phase:'exit',indoorVisible:false}).traffic,.6);
 assert.equal(audio.mix({side:'outdoor',id:'police',phase:'wait'}).traffic,.6);
 for(const remaining of [1500,1200,750,300,0]){
   const mix=audio.mix({side:'outdoor',id:'rain',phase:'return_wait',phaseRemaining:remaining});
   assert.ok(mix.music+mix.traffic+mix.rain>0,'No return-transition silence');
 }
 audio.update({side:'outdoor',id:'rain',phase:'return_enter',indoorVisible:true});
 assert.equal(gains[2].gain.value,0,'No street tail when actor is indoors');
 assert.equal(gains[3].gain.value,0,'No rain tail when actor is indoors');
 audio.update(indoor);
 const scheduled=gains[1].gain.calls.length;audio.update(indoor);assert.equal(gains[1].gain.calls.length,scheduled,'Repeated frames must not restart the fade');
 assert.equal(sources.length,3,'One persistent loop per layer, even across rapid scene changes');
 assert.ok(sources.every(s=>s.loop&&s.startArgs.length===2));
 assert.ok(gains.slice(1).every(g=>g.gain.value===0),'Never jump gain directly after initial silence');
 audio.update(indoor,true);assert.deepEqual(levels(),{music:0,traffic:0,rain:0});
 audio.update(indoor);assert.equal(levels().music,.42);
 audio.stop();assert.deepEqual(levels(),{music:0,traffic:0,rain:0});
 audio.setVolume(1);assert.equal(gains[0].gain.calls.at(-1)[0],1);assert.equal(audio.status.volume,1);
 console.log('PASS: indoor loop, media duck/recovery, outdoor/rain mix, continuous scene fades, pause/resume and single-source ownership.');
})().catch(e=>{console.error(e);process.exitCode=1;});
