const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const scope={window:{},BlitzSession:{IN:1200,OUT:1000}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/blitz-presentation.js'),'utf8'),scope);
const p=scope.window.BlitzPresentation.create();
const game={round:'a:1',stage:'play',phase:'fall',board:[1,2,3],transition:null};
let last=0;
for(let now=0;now<=1000;now+=16){
 const raw=now-(Math.floor(now/80)%2?110:15),s=p.sample(game,raw,0,now,false);
 if(now){assert(s.elapsed>last);assert(s.elapsed-last<=16*1.151);}
 assert.equal(s.game,game);last=s.elapsed;
}
assert.equal(p.sample(game,1000,0,1016,true).elapsed,last);
assert.equal(p.sample(game,1000,0,1516,true).elapsed,last,'Pause must freeze even after a long frame');
assert(p.sample(game,1000,0,1532,false).elapsed>last);
assert.equal(p.sample({...game,round:'a:2'},10,0,1548,false).elapsed,10,'New rounds reset their clock');
p.reset();let snapshot=0,previous=-1;
const entry={...game,round:'a:3',stage:'entry',transition:{kind:'in',progress:0}};
for(let now=0;now<=1200;now+=16){
 if(now%160===0)snapshot=now;
 entry.transition.progress=snapshot/1200;
 const s=p.sample(entry,0,now-snapshot,now,false);
 assert.equal(s.elapsed,0,'Countdown must remain at 60 seconds during entry');
 assert(s.game.transition.progress>previous);previous=s.game.transition.progress;
 assert.equal(entry.transition.progress,snapshot/1200,'Host snapshot must not be modified');
}
const settled=p.sample(entry,0,800,1600,false);assert.equal(settled.game.transition.progress,1);
assert.equal(p.sample(entry,0,900,1800,true).game.transition.progress,1);
console.log('PASS: monotonic refill time, bounded clock correction, pause/resume, round resets, per-frame entry, snapshot immutability and transition clamp.');
