"""Five immutable preset messages; only the active loop's received messages/replies survive."""
import datetime,json,sqlite3,sys,tempfile,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from exhibition_store import ExhibitionStore, PRESET_MESSAGES
with tempfile.TemporaryDirectory() as directory:
 path=Path(directory)/'messages.sqlite3'
 # Upgrade an existing pre-reset inbox, with the original table schema.
 db=sqlite3.connect(str(path));db.executescript('''CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT, delivery_key TEXT UNIQUE, text TEXT NOT NULL, received_at INTEGER NOT NULL, incoming INTEGER NOT NULL, scene_id TEXT, scene_number INTEGER, scene_instance TEXT);INSERT INTO messages(text,received_at,incoming) VALUES('old loop',1,1);''');db.close()
 store=ExhibitionStore(path);scene={'id':'smoking','index':0,'instance':'run:0','cycle':0}
 assert store.begin_loop('run:0',scene)
 presets=store.messages()['items'];assert len(presets)==5
 for m in presets:
  stamp=datetime.datetime.fromtimestamp(m['receivedAt']/1000)
  assert m['preset'] and m['conversationId']=='daughter'
  assert stamp.date()==datetime.datetime.now().date()-datetime.timedelta(days=7) and stamp.hour==14
 assert [(m['text'],m['incoming']) for m in presets]==PRESET_MESSAGES
 assert not any(e['type']=='message.received' for e in store.events())
 for i in range(6):
  scene={'id':str(i),'index':i,'instance':'run:'+str(i),'cycle':0}
  item=store.message(str(i+1)+'씬 테스트',True,scene,key=scene['instance'])
  assert item['conversationId']==('neighbor' if i==5 else 'daughter')
  assert item['sender']==('저장되지 않은 번호' if i==5 else '딸')
  assert store.message('duplicate',True,scene,key=scene['instance']) is None
 store.message('관객 답장',False,scene)
 assert store.messages()['total']==12
 assert store.messages(conversation_id='daughter')['total']==10
 assert store.messages(conversation_id='neighbor')['total']==2
 assert not store.begin_loop('run:0',scene)
 store.close();store=ExhibitionStore(path)
 assert store.messages()['total']==12 and not store.begin_loop('run:0',scene)
 # Repeated starts of the same cycle don't erase messages; the next cycle does.
 scene={'id':'smoking','index':0,'instance':'run:6','cycle':1}
 assert store.begin_loop('run:1',scene)
 assert store.messages()['items']==presets
 events=store.events();assert len([e for e in events if e['type']=='message.received'])==6
 assert len([e for e in events if e['type']=='messages.reset'])==2
 assert store.meta('readThrough')==presets[-1]['id']
 first=store.message('1씬 테스트',True,scene,key=scene['instance'])
 assert first['id']>presets[-1]['id'] and not first['preset']
 assert store.messages()['total']==6
 # Older pages belong to a loop, preventing a late request from reviving cleared messages.
 for i in range(110):store.message('답장 '+str(i),False,scene)
 page=store.messages();assert page['hasMore'] and page['loopId']=='run:1'
 assert store.messages(before=page['items'][0]['id'])['items'][:5]==presets
 store.begin_loop('new-run:0',{'id':'smoking','index':0,'instance':'new-run:0','cycle':0})
 assert store.messages()['items']==presets and not store.messages()['hasMore']
 store.close()
print('PASS: old database migration, five fixed week-old afternoon presets, same-loop restart persistence, scene/reply reset per loop, durable event replay and loop-scoped pagination.')
