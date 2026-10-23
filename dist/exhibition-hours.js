/* Daily exhibition hours in Korea, independent of the computer's time zone. */
window.ExhibitionHours=(()=>{
  const opening=12*60+45,closing=18*60;
  function isOpen(now=Date.now()){
    const korea=new Date(now+9*60*60*1000),minute=korea.getUTCHours()*60+korea.getUTCMinutes();
    return minute>=opening&&minute<closing;
  }
  function setSleeping(value){
    document.documentElement.classList.toggle('exhibition-sleep',!!value);
    if(value&&document.activeElement instanceof HTMLElement)document.activeElement.blur();
  }
  const style=document.createElement('style');
  style.textContent=`html.exhibition-sleep,html.exhibition-sleep body{background:#000!important;cursor:none!important}
    html.exhibition-sleep body>*{visibility:hidden!important;pointer-events:none!important}
    html.exhibition-sleep.operator-exit-open #exit-menu,html.exhibition-sleep.operator-exit-open #exit-menu *{visibility:visible!important;pointer-events:auto!important}`;
  document.head.appendChild(style);
  // Hide startup frames outside opening hours, before the renderer is ready.
  if(/\/(?:phone|exhibition|local-test)\.html$/.test(location.pathname)||new URLSearchParams(location.search).get('exhibition')==='1')setSleeping(!isOpen());
  return {isOpen,setSleeping,opening,closing,timeZone:'Asia/Seoul'};
})();
