"""Paired LAN discovery; no pairing key is disclosed in responses."""
import json
import hmac
import hashlib
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
                nonce=request.get('nonce');proof=request.get('proof')
                if not isinstance(nonce,str) or not 1<=len(nonce)<=64:continue
                expected=hmac.new(self.key.encode(),('discover:'+nonce).encode(),hashlib.sha256).hexdigest()
                if not isinstance(proof,str) or not secrets.compare_digest(proof,expected):continue
                signature=hmac.new(self.key.encode(),('reply:'+nonce+':'+str(self.http_port)).encode(),hashlib.sha256).hexdigest()
                reply={'service':'resonant-fields','nonce':nonce,'port':self.http_port,'proof':signature}
                self.socket.sendto(json.dumps(reply).encode('utf-8'),address)
            except (socket.timeout,ValueError,UnicodeError,AttributeError,TypeError):pass
            except OSError:
                if self.stopping:return

    def close(self):
        self.stopping=True;self.socket.close()
