/* Two local exhibition conversations, synchronized with the character's handset. */
window.PhoneMessages=(()=>{
  const contacts=[{id:'daughter',title:'딸'},{id:'neighbor',title:'저장되지 않은 번호'}];
  const presets=[{"text": "우리 아들 우리 아들 좀 하지 마세요.", "incoming": true}, {"text": "내가 어떻게 부르든말든", "incoming": false}, {"text": "우리 딸 한 적은 한 번도 없으면서.", "incoming": true}];
  const contact=id=>contacts.find(c=>c.id===id)||contacts[0];
  function project(data,view,now=Date.now()){
    const items=data?.messages||[],ui=data?.ui||{},same=data?.sceneInstance===view.instance;
    const conversations=(data?.conversations||contacts.map(c=>{const rows=items.filter(i=>(i.conversationId||'daughter')===c.id);return {...c,latest:rows.at(-1),latestIncoming:[...rows].reverse().find(i=>i.incoming),total:rows.length,unread:0};})).filter(c=>c.latest);
    const latest=conversations.map(c=>c.latestIncoming).filter(Boolean).sort((a,b)=>b.id-a.id)[0],open=!!(same&&ui.open&&!view.sceneLock),conversationId=ui.conversationId??null;
    const through=ui.readThroughByConversation?.[latest?.conversationId]??ui.readThrough??0;
    const banner=!!(!view.sceneLock&&same&&(view.mode!=='clock'||open)&&!(open&&conversationId===(latest?.conversationId||'daughter'))&&latest&&latest.sceneInstance===view.instance&&latest.id>Math.max(through,ui.dismissed||0)&&now-latest.receivedAt<6000&&now>=latest.receivedAt);
    const unread=items.filter(i=>i.incoming&&!i.preset&&i.id>(ui.readThroughByConversation?.[i.conversationId]??ui.readThrough??0)).reverse();
    return {open,banner,items,latest,lockItems:unread.length?unread:(latest?[latest]:[]),conversations,conversationId,conversation:contact(conversationId),threadItems:items.filter(i=>(i.conversationId||'daughter')===conversationId),
      mode:open?'messages':view.mode,lock:!view.sceneLock&&!open&&view.mode==='clock'&&!!latest,hasMore:data?.hasMoreByConversation?.[conversationId]??!!data?.hasMore,total:data?.total??items.length};
  }
  function create(options={}){
    let data=null,view={mode:'clock'},now=Date.now(),older=[],olderComplete=false,paintKey='',historyId=null,selectedThread=null;
    const root=document.createElement('div');root.className='pm-root';
    const person='<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="14" r="8" fill="currentColor"/><path d="M5 37c0-10 6-15 15-15s15 5 15 15" fill="currentColor"/></svg>';
    root.innerHTML=`<button class="pm-banner" aria-label="문자메시지 열기" hidden><span class="pm-app-icon"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="white" d="M27 14c0 6-5 10-11 10-2 0-3 0-5-1l-6 3 2-6c-2-2-3-4-3-6C4 8 9 4 16 4s11 4 11 10Z"/></svg></span><span class="pm-banner-copy"><span class="pm-banner-heading"><strong></strong><span></span></span><span class="pm-preview"></span></span></button>
      <section class="pm-messages" aria-label="메시지" hidden>
        <div class="pm-status"><span class="pm-clock"></span><span class="pm-indicators" aria-hidden="true">▂▄▆█ <svg viewBox="0 0 24 18"><path d="M2 5q10-8 20 0M6 9q6-5 12 0M10 13q2-2 4 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg><span class="pm-battery"></span></span></div>
        <header class="pm-header"><button class="pm-back"><span aria-hidden="true">‹</span> 메시지</button><div class="pm-contact"><span class="pm-avatar">${person}</span><strong></strong></div></header>
        <div class="pm-inbox" hidden><h1>메시지</h1><div class="pm-conversations" aria-label="대화 목록"></div></div>
        <div class="pm-thread" role="log" aria-label="메시지 대화" aria-live="polite"><div class="pm-date">문자 메시지</div><button class="pm-older" hidden>이전 메시지</button><div class="pm-items"></div><p class="pm-empty" hidden>아직 메시지가 없습니다</p></div>
        <form class="pm-composer"><span class="pm-plus" aria-hidden="true">+</span><label class="pm-input-wrap"><span class="pm-sr">답장</span><input class="pm-input" placeholder="문자 메시지" maxlength="500" autocomplete="off" enterkeyhint="send"><button class="pm-send" type="submit" aria-label="답장 보내기" disabled>↑</button></label></form><div class="pm-home" aria-hidden="true"></div>
      </section>`;
    document.body.append(root);
    const find=s=>root.querySelector(s),banner=find('.pm-banner'),panel=find('.pm-messages'),input=find('.pm-input'),send=find('.pm-send'),items=find('.pm-items'),thread=find('.pm-thread');
    const locks=document.createElement('div');locks.className='pm-lock-list';locks.setAttribute('aria-label','받은 문자 미리보기');root.append(locks);
    // Keep existing cards/rows mounted: replacing them restarts arrival animations.
    function reconcile(parent,entries,keyOf,create,update){
      const keys=new Set(entries.map(keyOf)),existing=new Map(Array.from(parent.children,node=>[node.pmKey,node]));
      for(const [key,node] of existing)if(!keys.has(key))node.remove();
      let cursor=parent.firstElementChild;
      for(const entry of entries){
        const key=keyOf(entry);let node=existing.get(key);
        if(!node){node=create(entry);node.pmKey=key;}
        update(node,entry);
        if(node!==cursor)parent.insertBefore(node,cursor);
        cursor=node.nextElementSibling;
      }
    }
    let previousOpen=false,lastItems='',canvasStates=[],suppressClick=false,touchY=null;
    const shownAt=item=>item.displayAt??item.receivedAt;
    const threadStamp=time=>'('+new Date(time).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',weekday:'long'})+') '+new Date(time).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});
    const dayKey=time=>new Date(time).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
    const stamp=(time,date=false)=>new Date(time).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',...(date?{month:'numeric',day:'numeric'}:{}),hour:'numeric',minute:'2-digit',hour12:true});
    function paint(){
      const state=project(data,view,now),keyPaint=[data?.ui?.revision,view.instance,view.mode,view.sceneLock,state.banner,state.open,state.conversationId,state.latest?.id,state.items.length,Math.floor(now/60000),older.length].join(':');
      if(keyPaint===paintKey)return;paintKey=keyPaint;
      const changedThread=selectedThread!==state.conversationId;
      if(changedThread){selectedThread=state.conversationId;older=[];olderComplete=false;lastItems='';input.value='';send.disabled=true;}
      banner.hidden=!state.banner;locks.hidden=!state.lock;panel.hidden=!state.open;
      const inThread=!!state.conversationId,baseLabel=view.mode==='game'?'게임':view.mode==='youtube'?'영상':'잠금화면',label=inThread?'메시지':baseLabel;
      find('.pm-back').innerHTML='<span aria-hidden="true">‹</span> '+label;find('.pm-back').setAttribute('aria-label',label+'으로 돌아가기');
      find('.pm-back').hidden=!inThread&&view.mode==='clock';
      panel.classList.toggle('pm-is-inbox',!inThread);panel.setAttribute('aria-label',inThread?state.conversation.title+'와의 문자메시지':'메시지 목록');
      panel.classList.toggle('pm-clock-inbox',!inThread&&view.mode==='clock');
      find('.pm-contact').hidden=!inThread;find('.pm-contact strong').textContent=state.conversation.title;
      find('.pm-inbox').hidden=inThread;thread.hidden=!inThread;find('form').hidden=!inThread;
      function paintCard(card,item){const name=item?.sender||contact(item?.conversationId).title;card.querySelector('strong').textContent=name;card.querySelector('.pm-preview').textContent=item?.text||'';card.querySelector('.pm-banner-heading>span').textContent=item?stamp(shownAt(item),item.preset||item.sceneNumber!==6):'';card.setAttribute('aria-label',name+' · '+(item?.text||'')+' 문자메시지 열기');}
      paintCard(banner,state.latest);
      reconcile(locks,state.lockItems,item=>historyId+':'+item.id,()=>{
        const card=banner.cloneNode(true);card.className='pm-banner pm-lock-card';return card;
      },(card,item)=>{card.hidden=!state.lock;paintCard(card,item);card.onclick=()=>action('open',null,item.conversationId||'daughter');});
      const list=find('.pm-conversations');list.replaceChildren();
      for(const conversation of [...state.conversations].sort((a,b)=>(b.latest?.receivedAt||0)-(a.latest?.receivedAt||0))){
        const row=document.createElement('button');row.className='pm-conversation';row.dataset.conversation=conversation.id;row.setAttribute('aria-label',conversation.title+' 대화 열기');
        row.innerHTML='<span class="pm-unread" aria-hidden="true"></span><span class="pm-list-avatar" aria-hidden="true">'+person+'</span><span class="pm-list-copy"><span class="pm-list-heading"><strong></strong><time></time><span aria-hidden="true">›</span></span><span class="pm-list-preview"></span></span>';
        row.querySelector('strong').textContent=conversation.title;
        row.querySelector('.pm-unread').hidden=!conversation.unread;
        const latest=conversation.latest;row.querySelector('time').textContent=latest?new Date(shownAt(latest)).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'}):'';
        row.querySelector('.pm-list-preview').textContent=latest?(latest.incoming?'':'나: ')+latest.text:'아직 메시지가 없습니다';
        row.onclick=()=>action('select',null,conversation.id);list.append(row);
      }
      find('.pm-older').hidden=olderComplete||!state.hasMore;
      const opened=state.open&&!previousOpen;
      if(state.open!==previousOpen){
        if(state.open){canvasStates=Array.from(document.querySelectorAll('canvas'),c=>[c,c.inert]);canvasStates.forEach(([c])=>c.inert=true);find('.pm-back').focus({preventScroll:true});}
        else{canvasStates.forEach(([c,inert])=>c.inert=inert);input.blur();input.value='';send.disabled=true;}
        previousOpen=state.open;
      }
      const all=[...new Map([...older,...state.threadItems].map(i=>[i.id,i])).values()].sort((a,b)=>a.id-b.id),key=state.conversationId+':'+all.map(i=>i.id).join(',');
      if(key!==lastItems){const scroll=thread.scrollTop,nearEnd=thread.scrollHeight-thread.clientHeight-scroll<64,previousCount=items.children.length;lastItems=key;let previousTime=null;
        reconcile(items,all,item=>historyId+':'+item.id,()=>{
          const row=document.createElement('div');row.append(document.createElement('time'));const bubble=document.createElement('div');bubble.className='pm-bubble';row.append(bubble);return row;
        },(row,item)=>{
          row.className='pm-row '+(item.incoming?'pm-incoming':'pm-outgoing');row.querySelector('.pm-bubble').textContent=item.text;
          const time=row.querySelector('time'),at=shownAt(item),separated=previousTime===null||dayKey(at)!==dayKey(previousTime)||at-previousTime>=300000;
          time.dateTime=new Date(at).toISOString();time.textContent=threadStamp(at);time.hidden=!separated;row.classList.toggle('pm-separated',separated);previousTime=at;
        });thread.scrollTop=scroll;
        if(!opened&&!changedThread&&nearEnd&&all.length>previousCount){const firstNew=items.children[previousCount];thread.scrollTop=firstNew.offsetTop-thread.offsetTop-16;}
      }
      if(opened||changedThread)thread.scrollTop=all.some(i=>i.text.length>120)?0:thread.scrollHeight;
      find('.pm-empty').hidden=all.length>0;
      find('.pm-clock').textContent=new Date(now).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
    }
    async function action(type,text,conversationId){if(view.sceneLock)return;const instance=view.instance,next=await options.action?.(type,text,conversationId);if(next&&instance===view.instance)data=next;paint();}
    banner.onclick=()=>{if(suppressClick){suppressClick=false;return;}action('open',null,project(data,view,now).latest?.conversationId||'daughter');};
    banner.addEventListener('pointerdown',e=>touchY=e.clientY);banner.addEventListener('pointerup',e=>{if(touchY!==null&&e.clientY-touchY< -20){suppressClick=true;action('dismiss');e.preventDefault();}touchY=null;});
    const back=()=>{const state=project(data,view,now);if(state.conversationId)return action('list');if(view.mode!=='clock')return action('back');};find('.pm-back').onclick=back;
    input.addEventListener('input',()=>send.disabled=!input.value.trim());
    find('form').onsubmit=e=>{e.preventDefault();action('reply',input.value,project(data,view,now).conversationId);input.value='';send.disabled=true;};
    find('.pm-older').onclick=async()=>{const requestedLoop=historyId,conversationId=selectedThread,before=Math.min(...[...older,...project(data,view,now).threadItems].map(i=>i.id));const result=await options.loadOlder?.(before,conversationId);if(result&&historyId===requestedLoop&&result.loopId===historyId&&conversationId===selectedThread){older=[...result.items,...older];olderComplete=!result.hasMore;paintKey='';lastItems='';paint();}};
    root.addEventListener('keydown',e=>{if(e.key==='Escape'&&project(data,view,now).open){e.preventDefault();back();}});
    return {update(next,current,time=Date.now()){if(next&&next.loopId!==historyId){historyId=next.loopId;older=[];olderComplete=false;lastItems='';paintKey='';input.value='';send.disabled=true;}data=next;view=current;now=time;paint();},get open(){return project(data,view,now).open;},get state(){return project(data,view,now);}};
  }
  return {project,create,contacts,presets};
})();
