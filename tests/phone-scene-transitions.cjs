const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const s={window:{}};vm.createContext(s);
for(const [file,name] of [['blitz-game','BlitzGame'],['blitz-session','BlitzSession'],['exhibition-playback','ExhibitionPlayback'],['phone-messages','PhoneMessages']]){vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/'+file+'.js'),'utf8'),s);s[name]=s.window[name];}
let game,instance;
const p=s.ExhibitionPlayback.create({
 exhibitionClip(side,number,c){
  if(c.id==='youtube')return [{state:'tablet',duration:1800},{state:'read',duration:96000},{state:'stow',duration:1100},{state:'home',duration:1100}];
  if(c.id==='game')return [{state:'tablet',duration:1800},{state:'gaming',duration:c.duration-2900},{state:'stow',duration:1100}];
  return [{state:'outside',duration:c.duration}];
 },
 gameSession(id,t){if(instance!==id){instance=id;game=s.BlitzSession.create(id);}return game.advance(t);},
 renderExhibition(){}
});
function project(cue,open=false){const view={...cue.phone,instance:cue.instance||'fixture'};return s.PhoneMessages.project({sceneInstance:view.instance,ui:{open,conversationId:'daughter'},messages:[{id:1,incoming:true,conversationId:'daughter',sceneInstance:view.instance,receivedAt:1000,text:'이전 씬 문자'}]},view,1001);}
const youtubeStart=160000,gameStart=445000;
const playing=p.sample(youtubeStart+50000);assert.equal(playing.phone.mode,'youtube');assert(project(playing).banner);assert(project(playing,true).open);
for(const offset of [97800,98000,98899,98900,99999]){
 const cue=p.sample(youtubeStart+offset);assert.equal(cue.phone.mode,'clock');
 assert(cue.phone.sceneLock,`YouTube exit must stay locked at ${offset}ms (${cue.phase})`);
 for(const open of [false,true]){const ui=project(cue,open);assert(!ui.lock&&!ui.banner&&!ui.open,'No old cards or late message panel during exit');}
}
for(const offset of [0,500,1799]){const ui=project(p.sample(260000+offset),true);assert(!ui.lock&&!ui.banner&&!ui.open);}
assert(project(p.sample(260000+1800)).lock,'Normal lock-screen history remains available after the transition');
// Use the real three-round engine; follow its actual settlement-complete time.
p.start(0);p.advance(gameStart+1800);assert.equal(p.status.current.phone.mode,'game');
let end;
for(let t=gameStart+1800;t<gameStart+230000;t+=50){p.advance(t);if(p.status.current.phase==='stow'){end=gameStart+p.status.current.duration;break;}}
assert(end,'The actual game must reach its closing animation');
for(const t of [end-1000,end-1]){p.advance(t);const cue=p.status.current;assert.equal(cue.id,'game');assert(cue.phone.sceneLock);assert(!project(cue,true).open&&!project(cue).lock&&!project(cue).banner);}
p.advance(end);assert.equal(p.status.current.id,'dog');assert(p.status.current.phone.sceneLock);assert(!project(p.status.current).lock);
console.log('PASS: YouTube closing/home and actual three-round game exit suppress old notifications and late open state continuously through the next scene lock; active-scene messages remain available.');
