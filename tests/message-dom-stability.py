"""Existing notification cards and message rows must survive live updates."""
import importlib.util,json,sys,tempfile,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('launcher',ROOT/'exhibition-launcher.py');L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
folder=Path(tempfile.mkdtemp(prefix='message-dom-'));process=cdp=None
try:
 process,cdp=L.connect_browser('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',folder/'chrome','about:blank',['--headless=new'])
 target=cdp.call('Target.createTarget',{'url':'about:blank'})['targetId'];session=L.target_session(cdp,target)
 def ev(code):return cdp.evaluate(session,code)
 ev("document.head.innerHTML='<style>'+"+json.dumps((ROOT/'dist/phone-messages.css').read_text())+"+'</style>'")
 ev((ROOT/'dist/phone-messages.js').read_text())
 ev("""window.animations=[];document.addEventListener('animationstart',e=>{if(e.animationName==='pm-lock-arrive')animations.push(e.target.pmKey)});
 window.fixture={loopId:'test',sceneInstance:'a',ui:{revision:1,open:false,conversationId:null},messages:[{id:1,incoming:true,text:'기존 문자',receivedAt:1000,sceneInstance:'a',conversationId:'daughter'}]};
 window.view={mode:'clock',instance:'a'};window.ui=PhoneMessages.create();ui.update(fixture,view,1001);
 window.original=document.querySelector('.pm-lock-card');""")
 L.wait_for(lambda:ev('animations.length===1'))
 ev("fixture.ui.revision++;ui.update(fixture,view,61001)")
 assert ev("document.querySelector('.pm-lock-card')===original&&animations.length===1")
 ev("fixture.messages.push({id:2,incoming:true,text:'새 문자',receivedAt:62000,sceneInstance:'a',conversationId:'daughter'});fixture.ui.revision++;ui.update(fixture,view,62001)")
 L.wait_for(lambda:ev('animations.length===2'))
 assert ev("document.querySelectorAll('.pm-lock-card')[1]===original&&animations.filter(k=>k==='test:1').length===1")
 ev("fixture.ui.open=true;fixture.ui.conversationId='daughter';fixture.ui.revision++;ui.update(fixture,view,62002);window.row=document.querySelector('.pm-row')")
 ev("fixture.messages.push({id:3,incoming:true,text:'대화 추가',receivedAt:63000,sceneInstance:'a',conversationId:'daughter'});fixture.ui.revision++;ui.update(fixture,view,63001)")
 assert ev("document.querySelector('.pm-row')===row&&document.querySelectorAll('.pm-row').length===3&&document.querySelectorAll('.pm-bubble')[2].textContent==='대화 추가'")
 ev("fixture.messages=[];fixture.loopId='next';fixture.ui.open=false;fixture.ui.revision++;ui.update(fixture,view,64000)")
 assert ev("document.querySelectorAll('.pm-lock-card').length===0&&document.querySelectorAll('.pm-row').length===0")
 print('PASS: minute/revision refresh preserves old cards; only newly arrived card animates; thread append preserves existing rows; loop reset clears history.')
finally:
 if cdp:
  try:cdp.call('Browser.close')
  except Exception:pass
  cdp.close()
 if process:
  try:process.wait(timeout=5)
  except Exception:process.terminate()
 shutil.rmtree(folder,ignore_errors=True)
