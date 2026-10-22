const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const s={window:{}};vm.createContext(s);for(const f of ['blitz-game','blitz-session']){vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/'+f+'.js'),'utf8'),s);s[f==='blitz-game'?'BlitzGame':'BlitzSession']=s.window[f==='blitz-game'?'BlitzGame':'BlitzSession'];}
const B=s.BlitzSession,a=B.create('same'),b=B.create('same');
assert.equal(B.minimumDuration,187100);
assert.equal(a.advance(59999).stage,'play');assert.equal(a.advance(60000).stage,'score');assert.equal(a.advance(60900).transition.kind,'out');assert.equal(a.advance(61900).transition.kind,'in');assert.equal(a.state.roundNumber,2);assert(!a.swap(0,1,62000));assert.equal(a.advance(63100).elapsed,0);assert.equal(a.state.stage,'play');assert.equal(a.advance(123099).elapsed,59999);
for(let t=123100;t<187100;t+=17)a.advance(t);
assert(a.advance(187100).complete);assert.equal(a.state.roundResults.length,3);assert.equal(a.state.roundNumber,3);assert.equal(a.state.completeAt,187100);assert.equal(b.advance(999999).completeAt,a.state.completeAt);
// Force a real power gem in each round, exercising engine settlement without timing mocks.
const original=s.BlitzGame.create;s.BlitzGame.create=seed=>{const board=Array.from({length:64},(_,i)=>((i/8|0)*2+i%8)%7);board[27]=24;return original(seed,board);};
const powers=B.create('powers'),slow=B.create('powers');for(let t=0;t<220000;t+=17)slow.advance(t);const result=powers.advance(220000);assert(result.complete);assert(result.completeAt>187100);assert(result.roundResults.every(r=>r.score>0));assert.equal(result.completeAt,slow.state.completeAt);assert(!powers.swap(0,1,220001));
console.log('PASS: three full 60s rounds, settlement scores, board fall/refill, no popup/fourth round, deterministic completion; power-session '+result.completeAt+'ms');
