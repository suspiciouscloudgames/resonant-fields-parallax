/* The seek bar is the only interactive control on the exhibition video screen. */
window.VideoControls=(()=>{
  function create(onSeek){
    const root=document.createElement('div');root.className='video-timeline';root.hidden=true;
    root.innerHTML='<label><span class="video-sr">영상 타임라인</span><input type="range" min="0" max="95.23" step="0.1" value="0" aria-label="영상 타임라인"></label><div class="video-times"><output>0:00</output><span>1:35</span></div><span class="video-error" role="status" hidden>연결을 확인해 주세요</span>';
    document.body.append(root);const slider=root.querySelector('input'),output=root.querySelector('output'),end=root.querySelector('.video-times span'),error=root.querySelector('.video-error');
    let view=null,dragging=false,pending=false,serial=0,round=null;
    const format=n=>Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
    function show(value){slider.value=value;output.textContent=format(value);slider.style.setProperty('--progress',100*value/Number(slider.max)+'%');}
    slider.addEventListener('pointerdown',()=>{dragging=true;DeviceScreen.unlockVideo();});
    slider.addEventListener('input',()=>{dragging=true;show(Number(slider.value));DeviceScreen.previewVideo(Number(slider.value));});
    function cancel(){dragging=false;DeviceScreen.previewVideo(null);}
    slider.addEventListener('pointercancel',cancel);slider.addEventListener('blur',()=>{if(!pending)cancel();});
    slider.addEventListener('change',async()=>{
      if(!view||view.mode!=='youtube')return cancel();
      dragging=false;pending=true;error.hidden=true;const id=++serial,position=Number(slider.value);
      DeviceScreen.unlockVideo();
      try{const seek=await onSeek(position,view.round);if(id===serial)DeviceScreen.setVideoSeek(seek);}
      catch{if(id===serial)error.hidden=false;}
      finally{if(id===serial){pending=false;DeviceScreen.previewVideo(null);}}
    });
    return {update(next){view=next;const active=next.mode==='youtube';root.hidden=!active;
      if(!active||round!==next.round){serial++;pending=false;dragging=false;error.hidden=true;DeviceScreen.previewVideo(null);round=next.round;}
      if(active){const duration=DeviceScreen.videoDuration;slider.max=duration;end.textContent=format(duration);if(!dragging&&!pending)show(DeviceScreen.videoPosition(next));}
    }};
  }
  return {create};
})();
