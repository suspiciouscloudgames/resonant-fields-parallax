"""Displayed story dates must not change actual notification arrival times."""
import json,sys,tempfile
from datetime import datetime,timedelta
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from exhibition_store import ExhibitionStore,KOREA
schedule=json.loads((Path(__file__).resolve().parents[1]/'dist/scene-messages.json').read_text())
now=int(datetime(2026,10,23,18,30,tzinfo=KOREA).timestamp()*1000)
with tempfile.TemporaryDirectory() as folder:
 path=Path(folder)/'messages.sqlite3'
 store=ExhibitionStore(path)
 store.begin_loop('dates',{},now=now)
 history=store.messages()['items']
 for index,name in enumerate(['smoking','rain','youtube','police','game','dog']):
  scene={'id':name,'index':index,'instance':name}
  for n,message in enumerate(schedule[name]):
   arrival=now+index*100000+n*1000
   item=store.message(message['text'],True,scene,now=arrival)
   assert item['receivedAt']==arrival
   if name=='dog':assert item['displayAt']==arrival
   else:history.append(item)
 stamps=[datetime.fromtimestamp(m['displayAt']/1000,KOREA) for m in history]
 assert all(13<=d.hour<16 for d in stamps)
 assert all((b.date()-a.date()).days==7 for a,b in zip(stamps,stamps[1:]))
 assert stamps[-1].date()==datetime.fromtimestamp(now/1000,KOREA).date()-timedelta(days=7)
 saved=store.messages();store.close();store=ExhibitionStore(path)
 assert store.messages()==saved
 assert store.conversations()[1]['latest']['displayAt']==store.conversations()[1]['latest']['receivedAt']
 assert store.messages(limit=4)['items']==saved['items'][-4:]
 store.close()
print('PASS: weekly historical dates, afternoon range, live final-scene timestamps, real arrivals, restart and pagination.')
