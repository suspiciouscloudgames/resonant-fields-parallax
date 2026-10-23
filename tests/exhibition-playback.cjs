const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const scope={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/exhibition-playback.js'),'utf8'),scope);
const frames=[],engine={
  exhibitionClip(side,number,c){return [{state:c.id==='youtube'?'read':c.id==='game'?'gaming':side,duration:c.duration}];},
  renderExhibition(...args){frames.push(args);},
};
const player=scope.window.ExhibitionPlayback.create(engine);
assert.equal(player.cycleMilliseconds,960000);
assert.equal(player.started,false);player.advance(123);assert.equal(frames.length,0);
const expected=[['smoking',45000,'clock'],['rain',115000,'clock'],['youtube',100000,'youtube'],['police',185000,'clock'],['game',190000,'game'],['dog',325000,'clock']];
for(let cycle=0;cycle<3;cycle++){
  let start=cycle*960000;
  for(let i=0;i<6;i++){
    const [id,duration,mode]=expected[i];
    for(const offset of [0,1799,1800,4000,duration-1]){
      const f=player.sample(start+offset);assert.equal(f.id,id);assert.equal(f.clipTime,offset);
      assert.equal(f.phone.mode,offset<1800?'clock':mode);assert.equal(f.phone.sceneLock,offset<1800);assert.equal(f.captionVisible,true);
      assert.equal(f.captionScreen,i%2?'portrait':'landscape');
    }
    assert.equal(player.sample(start+duration).id,expected[(i+1)%6][0]);start+=duration;
  }
}
player.start(1000);player.advance(5000);assert.equal(player.status.elapsed,4000);
player.advance(5000);player.advance(4000);assert.equal(player.status.elapsed,4000);
player.pause(true,5000);player.advance(10000);assert.equal(player.status.elapsed,4000);
player.pause(false,10000);player.advance(14000);assert.equal(player.status.elapsed,8000);
player.advance(935001000);assert.equal(player.status.current.id,'dog');
player.start(0);
for(const offset of [19999,20000,24000,59999,60000]){player.advance(445000+offset);assert.equal(player.status.current.gameTime,offset-1800);assert.equal(player.status.current.phone.paused,false);}
console.log('PASS: natural-speed 16m nominal loops, all scene boundaries, captions, phone modes, shared clock, pause, long stalls.');
