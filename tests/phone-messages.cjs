const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');const s={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/phone-messages.js'),'utf8'),s);const P=s.window.PhoneMessages.project;
const d={sceneInstance:'a',ui:{open:false,readThrough:0,dismissed:0},messages:[{id:1,incoming:true,text:'1씬 테스트',receivedAt:1000,sceneInstance:'a'}]};
assert(P(d,{mode:'clock',instance:'a'},1001).lock);assert(!P(d,{mode:'clock',instance:'a'},1001).banner);
for(const mode of ['game','youtube']){assert(P(d,{mode,instance:'a'},1001).banner);assert(!P(d,{mode,instance:'a'},7000).banner);d.ui.open=true;assert.equal(P(d,{mode,instance:'a'},1001).mode,'messages');d.ui.open=false;}
d.ui.open=true;assert(!P(d,{mode:'clock',instance:'b'},1001).open);assert.equal(P(d,{mode:'clock',instance:'b'},1001).items.length,1);d.ui.open=false;d.ui.readThrough=1;assert(!P(d,{mode:'game',instance:'a'},1001).banner);assert(P(d,{mode:'clock',instance:'b'},999999).lock);
console.log('PASS: wall-clock banner expiry, persistent lock cards/history, scene-isolated Messages, shared pixel/mobile projection');
const threads={sceneInstance:'six',ui:{open:true,conversationId:'neighbor',readThroughByConversation:{daughter:5,neighbor:0}},messages:[{id:5,text:'지난주',incoming:false,conversationId:'daughter'},{id:6,text:'5씬 테스트',incoming:true,conversationId:'daughter',receivedAt:1000,sceneInstance:'five'},{id:7,text:'6씬 테스트',incoming:true,conversationId:'neighbor',sender:'저장되지 않은 번호',receivedAt:2000,sceneInstance:'six'}]};
let state=P(threads,{mode:'clock',instance:'six'},2001);assert.equal(state.conversations.length,2);assert.equal(state.threadItems.length,1);assert.equal(state.threadItems[0].id,7);assert.equal(state.conversation.title,'저장되지 않은 번호');threads.ui.conversationId='daughter';assert(P(threads,{mode:'clock',instance:'six'},2001).banner);assert.equal(P(threads,{mode:'clock',instance:'six'},2001).threadItems.length,2);threads.ui.conversationId=null;assert.equal(P(threads,{mode:'clock',instance:'six'},2001).threadItems.length,0);threads.ui.open=false;assert.equal(P(threads,{mode:'clock',instance:'six'},2001).latest.sender,'저장되지 않은 번호');
console.log('PASS: two conversation projections, filtered thread messages, sender labels and inbox navigation.');

assert.equal(P(d,{mode:'clock',instance:'a'},1001).conversations.length,1);
threads.messages=threads.messages.filter(m=>m.conversationId==='daughter');
assert.deepEqual(Array.from(P(threads,{mode:'clock',instance:'six'},2001).conversations,c=>c.id),['daughter']);
console.log('PASS: an empty unknown-number thread is absent until its first message and disappears after reset.');
