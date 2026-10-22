const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../android-kiosk'),java=fs.readFileSync(path.join(root,'src/org/resonantfields/exhibition/MainActivity.java'),'utf8');
const expression=java.match(/MESSAGE_STATE="(.*)";/)[1];
const phone={connected:true,state:{instance:'run:1'},messages:{open:true,items:[{id:1,incoming:true,preset:true},{id:2,incoming:false},{id:3,incoming:true,sceneInstance:'run:1',receivedAt:50}]}};
const evaluate=()=>vm.runInNewContext(expression,{window:{PhoneView:phone}});
assert.equal(JSON.stringify(evaluate()),JSON.stringify(['run:1:3:50']));
phone.connected=false;assert.equal(evaluate(),null);
phone.connected=true;phone.state={};assert.equal(evaluate(),null,'Wait until the first UI frame has loaded history');
console.log('PASS: incoming only, preset/reply filtering, open inbox, offline and initial-frame gates.');
const jdk=process.env.EXHIBITION_JDK||'/Applications/Unity/Hub/Editor/2019.3.9f1/PlaybackEngines/AndroidPlayer/OpenJDK';
const output=fs.mkdtempSync(path.join(os.tmpdir(),'vibration-tracker-'));
try{
 cp.execFileSync(path.join(jdk,'bin/javac'),['-d',output,path.join(root,'src/org/resonantfields/exhibition/MessageArrivalTracker.java'),path.join(root,'tests/MessageArrivalTrackerTest.java')],{stdio:'inherit'});
 cp.execFileSync(path.join(jdk,'bin/java'),['-cp',output,'MessageArrivalTrackerTest'],{stdio:'inherit'});
}finally{fs.rmSync(output,{recursive:true,force:true});}
