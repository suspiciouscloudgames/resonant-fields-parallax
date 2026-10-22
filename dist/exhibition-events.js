/* Subscriber for other installations. The dual-display PC remains the authority. */
window.ExhibitionEvents={subscribe({url=location.origin,key,after=0,onEvent,onStatus=()=>{}}){
  const endpoint=new URL('/api/events/stream',url);endpoint.searchParams.set('key',key);endpoint.searchParams.set('after',after);
  let cursor=after;const source=new EventSource(endpoint);
  source.onopen=()=>onStatus('connected');source.onerror=()=>onStatus('reconnecting');
  source.onmessage=event=>{const data=JSON.parse(event.data);if(data.schemaVersion!==1||data.id<=cursor)return;cursor=data.id;onEvent(data);};
  return {close(){source.close();onStatus('closed');},get cursor(){return cursor;}};
}};
