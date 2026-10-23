const fs=require('fs'),vm=require('vm'),assert=require('assert');
let sleeping;
const context={window:{},Date,URLSearchParams,HTMLElement:class{},location:{pathname:'/exhibition.html',search:''},document:{createElement:()=>({}),head:{appendChild(){}},documentElement:{classList:{toggle:(name,value)=>{sleeping=value;}}},activeElement:null}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../dist/exhibition-hours.js','utf8'),context);
const hours=context.window.ExhibitionHours;
for(const [time,expected] of [['2026-10-23T12:44:59.999+09:00',false],['2026-10-23T12:45:00+09:00',true],['2026-10-23T17:59:59.999+09:00',true],['2026-10-23T18:00:00+09:00',false],['2026-10-24T00:00:00+09:00',false],['2026-10-24T12:45:00+09:00',true]])assert.equal(hours.isOpen(Date.parse(time)),expected,time);
hours.setSleeping(true);assert.equal(sleeping,true);hours.setSleeping(false);assert.equal(sleeping,false);
console.log('PASS: daily Korean opening/closing boundaries, next day and blackout state');
