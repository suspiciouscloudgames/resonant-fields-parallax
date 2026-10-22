"""Durable local message history and replayable events owned by the dual-display PC."""
import json
from pathlib import Path
import sqlite3
import time

class ExhibitionStore:
    def __init__(self,path=None):
        if path:
            Path(path).parent.mkdir(parents=True,exist_ok=True)
        self.db=sqlite3.connect(str(path) if path else ':memory:',check_same_thread=False)
        self.db.row_factory=sqlite3.Row
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, delivery_key TEXT UNIQUE, text TEXT NOT NULL, received_at INTEGER NOT NULL, incoming INTEGER NOT NULL, scene_id TEXT, scene_number INTEGER, scene_instance TEXT);
          CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT UNIQUE, type TEXT NOT NULL, occurred_at INTEGER NOT NULL, payload TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
        ''')
        self.db.commit()
    def emit(self,event_type,payload,key=None,now=None):
        now=int(now if now is not None else time.time()*1000)
        if key and self.db.execute('SELECT 1 FROM events WHERE event_key=?',(key,)).fetchone():return None
        with self.db:
            cursor=self.db.execute('INSERT OR IGNORE INTO events(event_key,type,occurred_at,payload) VALUES(?,?,?,?)',(key,event_type,now,json.dumps(payload,ensure_ascii=False)))
        return cursor.lastrowid if cursor.rowcount else None
    def message(self,text,incoming,scene,key=None,now=None):
        now=int(now if now is not None else time.time()*1000)
        if key and self.db.execute('SELECT 1 FROM messages WHERE delivery_key=?',(key,)).fetchone():return None
        with self.db:
            cur=self.db.execute('INSERT OR IGNORE INTO messages(delivery_key,text,received_at,incoming,scene_id,scene_number,scene_instance) VALUES(?,?,?,?,?,?,?)',(key,text,now,int(incoming),scene.get('id'),scene.get('index',0)+1,scene.get('instance')))
        if not cur.rowcount:return None
        item=self.messages(limit=1)['items'][0]
        self.emit('message.received' if incoming else 'message.replied',{'message':item,'scene':self.scene(scene)},key='message:'+str(item['id']),now=now)
        return item
    @staticmethod
    def scene(scene):
        return {k:scene.get(k) for k in ('id','index','step','cycle','instance','side','elapsed','duration')}
    def messages(self,before=None,limit=100):
        rows=self.db.execute('SELECT * FROM messages WHERE id<? ORDER BY id DESC LIMIT ?',(before if before is not None else 9223372036854775807,limit)).fetchall()
        items=[{'id':r['id'],'text':r['text'],'receivedAt':r['received_at'],'incoming':bool(r['incoming']),'sceneId':r['scene_id'],'sceneNumber':r['scene_number'],'sceneInstance':r['scene_instance']} for r in reversed(rows)]
        total=self.db.execute('SELECT COUNT(*) FROM messages').fetchone()[0]
        more=bool(items and self.db.execute('SELECT 1 FROM messages WHERE id<? LIMIT 1',(items[0]['id'],)).fetchone())
        return {'items':items,'total':total,'hasMore':more}
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
