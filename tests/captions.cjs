const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/captions.js'),'utf8'),sandbox);
const C=sandbox.window.SceneCaptions;
assert(!JSON.stringify(C.stories).includes('어떤어떤'));
assert.equal(C.stories.dog.at(-1)[1],'하지만 그녀는 한 번도 혼자인 적이 없었다.');
assert.equal(C.stories.smoking.slice(3,5).map(row=>row[1]).join(' '),'반복형은 그리움, 기다림, 미련, 애정처럼 오래 지속되고 되풀이되는 감정과 연관된 유형이었다.');
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/exhibition-playback.js'),'utf8'),sandbox);
for(const def of sandbox.window.ExhibitionPlayback.definitions){
 const cue={...def,elapsed:0,phases: def.side==='outdoor'?[{state:'before',duration:35300+def.outsideDuration},{state:{rain:'rain_encounter',dog:'dog_encounter',police:'encounter'}[def.id],duration:1}]:[{state:'home',duration:def.duration}]};
 const before=JSON.stringify(cue),rows=C.sequence(cue);
 assert.equal(rows[0].at,0);assert.equal(C.sample(cue).text,rows[0].text);
 rows.forEach((row,i)=>{assert(row.until>row.at);assert(row.until<=cue.duration);if(i)assert(row.at>=rows[i-1].until);assert.equal(C.sample({...cue,elapsed:row.at}).text,row.text);});
 if(def.side==='outdoor'){
  const eventAt=35300+def.outsideDuration;
  assert.equal(C.sample({...cue,elapsed:eventAt}),null,'Event onset gets an uninterrupted visual beat');
  assert(rows.some(row=>row.at>=eventAt+6000));
 }
 assert.equal(JSON.stringify(cue),before,'Captions must not change the scene or phone state');
 assert.equal(C.sample({...cue,elapsed:def.duration}),null);
}
const measure={measureText:s=>({width:[...s].length})};assert.deepEqual(Array.from(C.wrap('가나다 라마바 사아자',measure,7)),['가나다 라마바','사아자']);
for(const state of ['emerge','pause','raise','outside','encounter','dog_encounter','rain_encounter'])assert(C.visible('portrait',state));
console.log('PASS: full narrative, scene-start captions, event pauses, split sentences, last line, bounded timing and no scene/phone mutations.');
