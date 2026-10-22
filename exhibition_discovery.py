"""Paired LAN discovery; no pairing key is disclosed in responses."""
import json
import secrets
import socket
import threading


class Discovery:
    def __init__(self,key,http_port,port=8771):
        self.key=key;self.http_port=http_port;self.stopping=False
        self.socket=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
        self.socket.bind(('0.0.0.0',port));self.socket.settimeout(.5)

    def start(self):
        threading.Thread(target=self.run,daemon=True).start()

    def run(self):
        while not self.stopping:
            try:
                data,address=self.socket.recvfrom(2048)
                request=json.loads(data.decode('utf-8'))
                if request.get('service')!='resonant-fields':continue
                key=request.get('key');nonce=request.get('nonce')
                if not isinstance(key,str) or not secrets.compare_digest(key,self.key):continue
                if not isinstance(nonce,str) or not 1<=len(nonce)<=64:continue
                reply={'service':'resonant-fields','nonce':nonce,'port':self.http_port}
                self.socket.sendto(json.dumps(reply).encode('utf-8'),address)
            except (socket.timeout,ValueError,UnicodeError,AttributeError,TypeError):pass
            except OSError:
                if self.stopping:return

    def close(self):
        self.stopping=True;self.socket.close()
