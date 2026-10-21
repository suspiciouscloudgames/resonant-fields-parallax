const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/captions.js'),'utf8'),sandbox);
const {text,visible}=sandbox.window.SceneCaptions;assert.equal(text,'테스트');
for(const state of ['enter','sit','cigarette','smoke','tablet','read','gaming','stow','stand','exit']){assert(visible('landscape',state));assert(!visible('portrait',state));}
for(const state of ['emerge','pause','raise','outside','encounter','dog_encounter','rain_encounter','ended']){assert(visible('portrait',state));assert(!visible('landscape',state));}
for(const state of ['idle','loading','wait'])for(const id of ['landscape','portrait'])assert(!visible(id,state));
console.log('PASS: current Korean caption, all three outdoor events, independent indoor/outdoor captions.');
