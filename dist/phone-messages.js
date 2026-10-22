/* Exhibition-only Messages UI. History belongs to the current exhibition loop; no SMS is sent. */
window.PhoneMessages=(()=>{
  function project(data,view,now=Date.now()){
    const items=data?.messages||[],ui=data?.ui||{},same=data?.sceneInstance===view.instance;
    const latest=[...items].reverse().find(i=>i.incoming),open=!!(same&&ui.open);
    const banner=!!(!open&&same&&view.mode!=='clock'&&latest&&latest.sceneInstance===view.instance&&latest.id>Math.max(ui.readThrough||0,ui.dismissed||0)&&now-latest.receivedAt<6000&&now>=latest.receivedAt);
    return {open,banner,items,latest,mode:open?'messages':view.mode,lock:!open&&view.mode==='clock'&&!!latest,hasMore:!!data?.hasMore,total:data?.total||items.length};
  }
  function create(options={}){
    let data=null,view={mode:'clock'},now=Date.now(),older=[],olderComplete=false,paintKey='',historyId=null;
    const root=document.createElement('div');root.className='pm-root';
    const person='<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="14" r="8" fill="currentColor"/><path d="M5 37c0-10 6-15 15-15s15 5 15 15" fill="currentColor"/></svg>';
    root.innerHTML=`<button class="pm-banner" aria-label="테스트 문자메시지 열기" hidden><span class="pm-app-icon"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="white" d="M27 14c0 6-5 10-11 10-2 0-3 0-5-1l-6 3 2-6c-2-2-3-4-3-6C4 8 9 4 16 4s11 4 11 10Z"/></svg></span><span class="pm-banner-copy"><span class="pm-banner-heading"><strong>테스트</strong><span>지금</span></span><span class="pm-preview">테스트</span></span></button>
      <section class="pm-messages" aria-label="테스트와의 문자메시지" hidden>
        <div class="pm-status"><span class="pm-clock"></span><span class="pm-indicators" aria-hidden="true">▂▄▆█ <svg viewBox="0 0 24 18"><path d="M2 5q10-8 20 0M6 9q6-5 12 0M10 13q2-2 4 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg><span class="pm-battery"></span></span></div>
        <header class="pm-header"><button class="pm-back" aria-label="게임으로 돌아가기"><span aria-hidden="true">‹</span> 게임</button><div class="pm-contact"><span class="pm-avatar">${person}</span><strong>테스트 <span aria-hidden="true">›</span></strong></div></header>
        <div class="pm-thread" role="log" aria-label="메시지 대화" aria-live="polite"><div class="pm-date">문자 메시지<br><span></span></div><button class="pm-older" hidden>이전 메시지</button><div class="pm-items"></div></div>
        <form class="pm-composer"><span class="pm-plus" aria-hidden="true">+</span><label class="pm-input-wrap"><span class="pm-sr">답장</span><input class="pm-input" placeholder="문자 메시지" maxlength="500" autocomplete="off" enterkeyhint="send"><button class="pm-send" type="submit" aria-label="답장 보내기" disabled>↑</button></label></form><div class="pm-home" aria-hidden="true"></div>
      </section>`;
    document.body.append(root);
    const find=s=>root.querySelector(s),banner=find('.pm-banner'),panel=find('.pm-messages'),input=find('.pm-input'),send=find('.pm-send'),items=find('.pm-items'),thread=find('.pm-thread');
    const lock=banner.cloneNode(true);lock.className='pm-banner pm-lock';root.append(lock);
    let previousOpen=false,lastItems='',lastClock='',canvasStates=[];
    function paint(){
      const state=project(data,view,now),keyPaint=[data?.ui?.revision,view.instance,view.mode,state.banner,state.open,state.latest?.id,state.items.length,Math.floor(now/60000),older.length].join(':');if(keyPaint===paintKey)return;paintKey=keyPaint;banner.hidden=!state.banner;lock.hidden=!state.lock;panel.hidden=!state.open;
      const label=view.mode==='game'?'게임':view.mode==='youtube'?'영상':'잠금화면';find('.pm-back').innerHTML='<span aria-hidden="true">‹</span> '+label;find('.pm-back').setAttribute('aria-label',label+'으로 돌아가기');
      for(const card of [banner,lock]){card.querySelector('.pm-preview').textContent=state.latest?.text||'';card.querySelector('.pm-banner-heading>span').textContent=state.latest?new Date(state.latest.receivedAt).toLocaleString('ko-KR',{...(state.latest.preset?{month:'numeric',day:'numeric'}:{}),hour:'numeric',minute:'2-digit',hour12:true}):'';card.setAttribute('aria-label',(state.latest?.text||'')+' 문자메시지 열기');}
      lock.querySelector('strong').textContent='메시지 · '+state.total;
      find('.pm-older').hidden=olderComplete||!state.hasMore;
      if(state.open!==previousOpen){
        if(state.open){canvasStates=Array.from(document.querySelectorAll('canvas'),c=>[c,c.inert]);canvasStates.forEach(([c])=>c.inert=true);find('.pm-back').focus({preventScroll:true});}
        else{canvasStates.forEach(([c,inert])=>c.inert=inert);input.blur();input.value='';send.disabled=true;}
        previousOpen=state.open;
      }
      const all=[...new Map([...older,...state.items].map(i=>[i.id,i])).values()].sort((a,b)=>a.id-b.id),key=all.map(i=>i.id).join(',');
      if(key!==lastItems){lastItems=key;items.replaceChildren();for(const item of all){const row=document.createElement('div');row.className='pm-row '+(item.incoming?'pm-incoming':'pm-outgoing');const bubble=document.createElement('div');bubble.className='pm-bubble';bubble.textContent=item.text;const stamp=document.createElement('time');stamp.dateTime=new Date(item.receivedAt).toISOString();stamp.textContent=new Date(item.receivedAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});row.append(stamp,bubble);items.append(row);}thread.scrollTop=thread.scrollHeight;}
      const date=new Date(now),clock=date.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
      if(clock!==lastClock){find('.pm-clock').textContent=clock;lastClock=clock;}
    }
    async function action(type,text){const instance=view.instance,next=await options.action?.(type,text);if(next&&instance===view.instance)data=next;paint();}
    banner.onclick=lock.onclick=()=>{if(suppressClick){suppressClick=false;return;}action('open');};
    let touchY=null,suppressClick=false;banner.addEventListener('pointerdown',e=>touchY=e.clientY);banner.addEventListener('pointerup',e=>{if(touchY!==null&&e.clientY-touchY< -20){suppressClick=true;action('dismiss');e.preventDefault();}touchY=null;});
    find('.pm-back').onclick=()=>action('back');
    input.addEventListener('input',()=>send.disabled=!input.value.trim());
    find('form').onsubmit=e=>{e.preventDefault();action('reply',input.value);input.value='';send.disabled=true;};
    find('.pm-older').onclick=async()=>{const requestedLoop=historyId,before=Math.min(...[...older,...(data?.messages||[])].map(i=>i.id));const result=await options.loadOlder?.(before);if(result&&historyId===requestedLoop&&result.loopId===historyId){older=[...result.items,...older];olderComplete=!result.hasMore;paintKey='';data={...data,hasMore:result.hasMore};lastItems='';paint();}};
    root.addEventListener('keydown',e=>{if(e.key==='Escape'&&project(data,view,now).open){e.preventDefault();action('back');}});
    return {update(next,current,time=Date.now()){if(next&&next.loopId!==historyId){historyId=next.loopId;older=[];olderComplete=false;lastItems='';paintKey='';input.value='';send.disabled=true;}data=next;view=current;now=time;paint();},get open(){return project(data,view,now).open;},get state(){return project(data,view,now);}};
  }
  return {project,create};
})();
