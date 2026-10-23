"""Durable local message history and replayable events owned by the dual-display PC."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import time

KOREA=timezone(timedelta(hours=9))
CONVERSATIONS={'daughter':'딸','neighbor':'저장되지 않은 번호'}
PRESET_MESSAGES=[('우리 아들 우리 아들 좀 하지 마세요.', True), ('내가 어떻게 부르든말든', False), ('우리 딸 한 적은 한 번도 없으면서.', True)]

class ExhibitionStore:
    def __init__(self,path=None):
        if path:
            Path(path).parent.mkdir(parents=True,exist_ok=True)
        self.db=sqlite3.connect(str(path) if path else ':memory:',check_same_thread=False)
        self.db.row_factory=sqlite3.Row
        schedule=json.loads((Path(__file__).parent/'dist/scene-messages.json').read_text(encoding='utf-8'))
        self.history_count=len(PRESET_MESSAGES)+sum(len(rows) for name,rows in schedule.items() if name!='dog')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, delivery_key TEXT UNIQUE, text TEXT NOT NULL, received_at INTEGER NOT NULL, incoming INTEGER NOT NULL, scene_id TEXT, scene_number INTEGER, scene_instance TEXT);
          CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT UNIQUE, type TEXT NOT NULL, occurred_at INTEGER NOT NULL, payload TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
        ''')
        columns={r['name'] for r in self.db.execute('PRAGMA table_info(messages)')}
        if 'is_preset' not in columns:
            self.db.execute('ALTER TABLE messages ADD COLUMN is_preset INTEGER NOT NULL DEFAULT 0')
        if 'conversation_id' not in columns:
            self.db.execute("ALTER TABLE messages ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'daughter'")
            self.db.execute("UPDATE messages SET conversation_id='neighbor' WHERE scene_number=6 AND is_preset=0")
        # These are existing conversations, not new incoming-message events.
        afternoon=(datetime.now()-timedelta(days=7)).replace(hour=14,minute=0,second=0,microsecond=0)
        with self.db:
            for i,(text,incoming) in enumerate(PRESET_MESSAGES):
                self.db.execute('INSERT OR IGNORE INTO messages(delivery_key,text,received_at,incoming,scene_id,scene_number,scene_instance,is_preset) VALUES(?,?,?,?,?,?,?,1)',
                    ('preset:'+str(i),text,int((afternoon+timedelta(minutes=i*7)).timestamp()*1000),int(incoming),'preset',0,'preset'))
        if self.meta('presetConversationVersion')!=2:
            with self.db:
                self.db.execute("DELETE FROM messages WHERE is_preset=1 AND delivery_key NOT IN ("+",".join("?" for _ in PRESET_MESSAGES)+")",tuple('preset:'+str(i) for i in range(len(PRESET_MESSAGES))))
                for i,(text,incoming) in enumerate(PRESET_MESSAGES):
                    self.db.execute("UPDATE messages SET text=?,incoming=?,conversation_id='daughter' WHERE delivery_key=? AND is_preset=1",(text,int(incoming),'preset:'+str(i)))
                self.db.execute('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)',('presetConversationVersion','2'))
        self.db.commit()
        if self.meta('messageDateAnchor') is None:self.set_meta('messageDateAnchor',int(time.time()*1000))
    def begin_loop(self,loop_id,scene,now=None):
        if self.meta('loopId')==loop_id:return False
        now=int(now if now is not None else time.time()*1000)
        read_through=self.db.execute('SELECT COALESCE(MAX(id),0) FROM messages WHERE is_preset=1').fetchone()[0]
        with self.db:
            self.db.execute('DELETE FROM messages WHERE is_preset=0')
            for key,value in [('messageDateAnchor',now),('loopId',loop_id),('readThrough',read_through),('readThroughByConversation',{'daughter':read_through,'neighbor':0})]:
                self.db.execute('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)',(key,json.dumps(value)))
            self.db.execute('INSERT OR IGNORE INTO events(event_key,type,occurred_at,payload) VALUES(?,?,?,?)',
                ('loop:'+loop_id+':messages.reset','messages.reset',now,json.dumps({'loopId':loop_id,'presetCount':len(PRESET_MESSAGES),'scene':self.scene(scene)},ensure_ascii=False)))
        return True
    def emit(self,event_type,payload,key=None,now=None):
        now=int(now if now is not None else time.time()*1000)
        if key and self.db.execute('SELECT 1 FROM events WHERE event_key=?',(key,)).fetchone():return None
        with self.db:
            cursor=self.db.execute('INSERT OR IGNORE INTO events(event_key,type,occurred_at,payload) VALUES(?,?,?,?)',(key,event_type,now,json.dumps(payload,ensure_ascii=False)))
        return cursor.lastrowid if cursor.rowcount else None
    def message(self,text,incoming,scene,key=None,now=None,conversation_id=None):
        now=int(now if now is not None else time.time()*1000)
        conversation_id=conversation_id or ('neighbor' if scene.get('index')==5 else 'daughter')
        if conversation_id not in CONVERSATIONS:raise ValueError('Unknown conversation')
        if key and self.db.execute('SELECT 1 FROM messages WHERE delivery_key=?',(key,)).fetchone():return None
        with self.db:
            cur=self.db.execute('INSERT OR IGNORE INTO messages(delivery_key,text,received_at,incoming,scene_id,scene_number,scene_instance,conversation_id) VALUES(?,?,?,?,?,?,?,?)',(key,text,now,int(incoming),scene.get('id'),scene.get('index',0)+1,scene.get('instance'),conversation_id))
        if not cur.rowcount:return None
        item=self.messages(limit=1)['items'][0]
        self.emit('message.received' if incoming else 'message.replied',{'message':item,'scene':self.scene(scene)},key='message:'+str(item['id']),now=now)
        return item
    @staticmethod
    def scene(scene):
        return {k:scene.get(k) for k in ('id','index','step','cycle','instance','side','elapsed','duration')}
    def display_time(self,row):
        # Arrival time remains real for notification expiry, vibration and event replay.
        if not row['is_preset'] and row['scene_number']==6:return row['received_at']
        if row['is_preset']:
            ordinal=int(row['delivery_key'].split(':')[-1])
        else:
            delivered=self.db.execute('SELECT COUNT(*) FROM messages WHERE is_preset=0 AND delivery_key IS NOT NULL AND scene_number!=6 AND id<=?',(row['id'],)).fetchone()[0]
            ordinal=len(PRESET_MESSAGES)+max(0,delivered-1)
        weeks=max(1,self.history_count-ordinal)
        anchor=datetime.fromtimestamp(self.meta('messageDateAnchor')/1000,KOREA)
        # Stable afternoon times, 13:00 through 15:59, unaffected by refresh/restart.
        minute=(ordinal*37+17)%180
        stamp=(anchor-timedelta(weeks=weeks)).replace(hour=13+minute//60,minute=minute%60,second=0,microsecond=0)
        return int(stamp.timestamp()*1000)
    def item(self,row):
        if row is None:return None
        contact=CONVERSATIONS[row['conversation_id']]
        return {'id':row['id'],'text':row['text'],'receivedAt':row['received_at'],'displayAt':self.display_time(row),'incoming':bool(row['incoming']),'sceneId':row['scene_id'],'sceneNumber':row['scene_number'],'sceneInstance':row['scene_instance'],'preset':bool(row['is_preset']),'scripted':bool(row['delivery_key']) and not bool(row['is_preset']),'conversationId':row['conversation_id'],'sender':contact if row['incoming'] else '나','contactName':contact}
    def messages(self,before=None,limit=100,conversation_id=None):
        if conversation_id is not None and conversation_id not in CONVERSATIONS:raise ValueError('Unknown conversation')
        where='1=1' if conversation_id is None else 'conversation_id=?'
        args=() if conversation_id is None else (conversation_id,)
        rows=self.db.execute('SELECT * FROM messages WHERE '+where+' AND id<? ORDER BY id DESC LIMIT ?',args+(before if before is not None else 9223372036854775807,limit)).fetchall()
        items=[self.item(r) for r in reversed(rows)]
        total=self.db.execute('SELECT COUNT(*) FROM messages WHERE '+where,args).fetchone()[0]
        more=bool(items and self.db.execute('SELECT 1 FROM messages WHERE '+where+' AND id<? LIMIT 1',args+(items[0]['id'],)).fetchone())
        return {'items':items,'total':total,'hasMore':more,'loopId':self.meta('loopId'),'conversationId':conversation_id}
    def conversations(self,read_through=None):
        result=[]
        for key,title in CONVERSATIONS.items():
            latest=self.db.execute('SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1',(key,)).fetchone()
            if latest is None:continue
            incoming=self.db.execute('SELECT * FROM messages WHERE conversation_id=? AND incoming=1 ORDER BY id DESC LIMIT 1',(key,)).fetchone()
            total=self.db.execute('SELECT COUNT(*) FROM messages WHERE conversation_id=?',(key,)).fetchone()[0]
            unread=self.db.execute('SELECT COUNT(*) FROM messages WHERE conversation_id=? AND incoming=1 AND is_preset=0 AND id>?',(key,(read_through or {}).get(key,0))).fetchone()[0]
            result.append({'id':key,'title':title,'latest':self.item(latest),'latestIncoming':self.item(incoming),'total':total,'unread':unread})
        return result
    def events(self,after=0,limit=100):
        rows=self.db.execute('SELECT * FROM events WHERE id>? ORDER BY id LIMIT ?',(after,limit)).fetchall()
        return [{'schemaVersion':1,'id':r['id'],'source':'dual-display','type':r['type'],'occurredAt':r['occurred_at'],'payload':json.loads(r['payload'])} for r in rows]
    def cursor(self):return self.db.execute('SELECT COALESCE(MAX(id),0) FROM events').fetchone()[0]
    def meta(self,key,default=None):
        row=self.db.execute('SELECT value FROM meta WHERE key=?',(key,)).fetchone()
        return json.loads(row[0]) if row else default
    def set_meta(self,key,value):
        with self.db:self.db.execute('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)',(key,json.dumps(value)))
    def close(self):self.db.close()
