const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');const s={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/phone-messages.js'),'utf8'),s);const P=s.window.PhoneMessages.project;
const d={sceneInstance:'a',ui:{open:false,readThrough:0,dismissed:0},messages:[{id:1,incoming:true,text:'1씬 테스트',receivedAt:1000,sceneInstance:'a'}]};
assert(P(d,{mode:'clock',instance:'a'},1001).lock);assert(!P(d,{mode:'clock',instance:'a'},1001).banner);
for(const mode of ['game','youtube']){assert(P(d,{mode,instance:'a'},1001).banner);assert(!P(d,{mode,instance:'a'},7000).banner);d.ui.open=true;assert.equal(P(d,{mode,instance:'a'},1001).mode,'messages');d.ui.open=false;}
d.ui.open=true;assert(!P(d,{mode:'clock',instance:'b'},1001).open);assert.equal(P(d,{mode:'clock',instance:'b'},1001).items.length,1);d.ui.open=false;d.ui.readThrough=1;assert(!P(d,{mode:'game',instance:'a'},1001).banner);assert(P(d,{mode:'clock',instance:'b'},999999).lock);
console.log('PASS: wall-clock banner expiry, persistent lock cards/history, scene-isolated Messages, shared pixel/mobile projection');
