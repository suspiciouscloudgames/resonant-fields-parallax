const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const s={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/blitz-game.js'),'utf8'),s);const B=s.window.BlitzGame;
for(let seed=1;seed<=25;seed++){
 const host=B.create(seed);let time=0;
 for(let turn=0;turn<20;turn++){
  const snapshot=JSON.parse(JSON.stringify(host.snapshot())),phone=B.fromSnapshot(snapshot),[a,b]=host.legalMoves()[turn%host.legalMoves().length];
  assert(host.swap(a,b,time));assert(phone.swap(a,b,time));
  for(const dt of [0,70,140,250,380,500,800,1500,3000]){
   const real=host.advance(time+dt),predicted=phone.advance(time+dt);
   for(const key of ['board','score','multiplier','revision','phase','removed','falls','simulation'])assert.equal(JSON.stringify(predicted[key]),JSON.stringify(real[key]),key+' seed '+seed);
  }
  time+=3100;if(time>54000)break;
 }
}
console.log('PASS: phone prediction matches host swaps, clears, cascades, random refills, scores and revisions across 450 moves.');
