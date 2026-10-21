const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/blitz-game.js'),'utf8'),sandbox);const B=sandbox.window.BlitzGame;
const copy=x=>JSON.parse(JSON.stringify(x));
for(let seed=1;seed<=50;seed++){
 const a=B.create(seed),b=B.create(seed);assert.equal(B.groups(a.snapshot().board).length,0);assert(a.legalMoves().length>0);
 for(let round=0;round<15;round++){
  const t=round*3000,[from,to]=a.legalMoves()[round%a.legalMoves().length];
  assert(a.swap(from,to,t));assert(b.swap(from,to,t));a.advance(t+2500);b.advance(t+2500);
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
 const board=base();line.forEach((v,i)=>board[i]=v);board[10]=line[0];const g=B.create(42,board);assert(g.swap(2,10,0));g.advance(340);assert(g.snapshot().board.some(v=>B.kind(v)===special));
}
const hyperBoard=base();hyperBoard[0]=24;const hyper=B.create(2,hyperBoard);assert(hyper.swap(0,1,0));hyper.advance(141);assert(hyper.snapshot().removed.length>=9);
const flameBoard=base();flameBoard[0]=8;flameBoard[1]=0;flameBoard[2]=1;flameBoard[10]=0;const flame=B.create(5,flameBoard);flame.swap(2,10,0);flame.advance(141);assert(flame.snapshot().removed.length>=5);assert.equal(flame.snapshot().event.type,'power');
console.log('PASS: 750 deterministic legal moves, cascades, scores, invalid swaps, board recovery, flame/hyper gems, and 60-second cutoff.');
