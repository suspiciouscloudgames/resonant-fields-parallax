const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/blitz-game.js'),'utf8'),sandbox);const B=sandbox.window.BlitzGame;
const copy=x=>JSON.parse(JSON.stringify(x));
for(let seed=1;seed<=50;seed++){
 const a=B.create(seed),b=B.create(seed);assert.equal(B.groups(a.snapshot().board).length,0);assert(a.legalMoves().length>0);
 let t=0;for(let round=0;round<15;round++){
  const [from,to]=a.legalMoves()[round%a.legalMoves().length];
  assert(a.swap(from,to,t));assert(b.swap(from,to,t));for(let guard=0;guard<200&&a.snapshot().phase!=='idle';guard++){t=a.snapshot().phaseEnd;a.advance(t);b.advance(t);}t+=50;
  assert.deepEqual(copy(a.snapshot()),copy(b.snapshot()));assert.equal(a.snapshot().phase,'idle');assert.equal(B.groups(a.snapshot().board).length,0);assert(a.legalMoves().length>0);
 }
 assert(a.snapshot().score>0);assert.equal(a.swap(0,1,60000),false);
}
const invalid=B.create(910),initial=copy(invalid.snapshot().board),valid=new Set(invalid.legalMoves().map(([a,b])=>a+':'+b));
let pair;for(let a=0;a<63;a++)if(B.adjacent(a,a+1)&&!valid.has(a+':'+(a+1))){pair=[a,a+1];break;}
assert(pair);assert(invalid.swap(...pair,0));invalid.advance(500);assert.deepEqual(copy(invalid.snapshot().board),initial);assert.equal(invalid.snapshot().score,0);
assert.equal(invalid.swap(0,9,500),false);assert.equal(invalid.swap(7,8,500),false);
const base=()=>Array.from({length:64},(_,i)=>((i/8|0)*2+i%8)%7);
for(const [line,special] of [[[0,0,1,0],1],[[2,2,1,2,2],3]]){
 const board=base();line.forEach((v,i)=>board[i]=v);board[10]=line[0];const g=B.create(42,board);assert(g.swap(2,10,0));g.advance(390);assert(g.snapshot().board.some(v=>B.kind(v)===special));
}
const hyperBoard=base();hyperBoard[0]=24;const hyper=B.create(2,hyperBoard);assert(hyper.swap(0,1,0));hyper.advance(141);assert(hyper.snapshot().removed.length>=9);
const flameBoard=base();flameBoard[0]=8;flameBoard[1]=0;flameBoard[2]=1;flameBoard[10]=0;const flame=B.create(5,flameBoard);flame.swap(2,10,0);flame.advance(141);assert(flame.snapshot().removed.length>=5);assert.equal(flame.snapshot().event.type,'power');
console.log('PASS: 750 deterministic legal moves, cascades, scores, invalid swaps, board recovery, flame/hyper gems, and 60-second cutoff.');

// Deadline cashes out every remaining power, including a power caught in a chain.
for(const special of [8,16,24]){
 const board=base();board[27]=special;const g=B.create(91,board);
 const first=g.advance(60000);assert(first.ending);assert.equal(first.phase,'clear');assert(first.effects.some(e=>e.kind===B.kind(special)));assert(first.score>0);
 assert.equal(g.swap(0,1,60001),false);
 const final=g.advance(120000);assert.equal(final.phase,'ended');assert(final.endedAt>=60000);assert(final.board.every(v=>B.kind(v)===0));assert(final.score>=first.score);
 assert.deepEqual(copy(g.advance(150000)),copy(final));
}
const mixed=base();mixed[0]=8;mixed[1]=16;mixed[63]=24;
const endA=B.create(72,mixed),endB=B.create(72,mixed);
for(let t=0;t<=90000;t+=17)endA.advance(t);endA.advance(90000);endB.advance(90000);
assert.deepEqual(copy(endA.snapshot()),copy(endB.snapshot()));assert.equal(endA.snapshot().phase,'ended');
const last=B.create(12);last.swap(...last.legalMoves()[0],59950);last.advance(120000);assert.equal(last.snapshot().phase,'ended');
console.log('PASS: flame / star / hypercube cash-out, chained powers, post-deadline scores, no input after 60 seconds, deterministic ending across slow frames.');
