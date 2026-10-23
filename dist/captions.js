/* Typography is rendered at display resolution, independently of the pixel-art master. */
window.SceneCaptions=(()=>{
  const stories={
  "smoking": [
    [
      0,
      "그녀가 만들어낸 감응장은 두 곳이었다."
    ],
    [
      6,
      "하나는 집 안에, 다른 하나는 거리에 있었다."
    ],
    [
      12,
      "두 곳의 감응장은 같은 반복형으로 기록되어 있었다."
    ],
    [
      18,
      "반복형은 그리움, 기다림, 미련, 애정처럼"
    ],
    [
      24,
      "오래 지속되고 되풀이되는 감정과 연관된 유형이었다."
    ],
    [
      30,
      "문제는 그곳에서 발견된 반려체가"
    ],
    [
      36,
      "반복형에 속하지 않는다는 것이었다."
    ]
  ],
  "rain": [
    [
      0,
      "그녀는 비가 오는 날에도 같은 자리에 섰다."
    ],
    [
      "event+6",
      "비가 거세지면 거리는 텅 비었다."
    ],
    [
      "event+14",
      "누군가 우연히 이 자리에서 점점 커지고 있는 반려체를 발견했다."
    ],
    [
      "event+22",
      "이곳의 반려체는 주변에 생긴 다른 반려체를 흡수하고 있었다."
    ],
    [
      "event+30",
      "기존의 반려체 유형에는 어디에도 속하지 않는 특성이었다."
    ]
  ],
  "youtube": [
    [
      0,
      "그녀가 매일 지켜보는 곳은 수천 킬로미터 떨어져 있었다."
    ],
    [
      16,
      "영상은 끝없이 새로 올라왔다."
    ],
    [
      32,
      "그녀는 모든 사람들에게"
    ],
    [
      40,
      "그곳에서 일어나는 일을 설명하고 싶어 했다."
    ],
    [
      57,
      "반려체는 의자와 화분 사이에 머물렀고 점점 커지고 있었다."
    ],
    [
      75,
      "아마도 벽을 넘어 이웃들의 반려체들을 흡수하고 있었을 것이다."
    ]
  ],
  "police": [
    [
      0,
      "그녀의 첫 피켓은 행주를 이어 붙여 만든 것이었다."
    ],
    [
      10,
      "집에서 큰 종이를 찾을 수 없었기 때문이다."
    ],
    [
      20,
      "피켓에는 거친 말들이 빼곡히 적혀 있었다."
    ],
    [
      "event+24",
      "분노에 찬 사람들이 욕설을 하면서 다가가면"
    ],
    [
      "event+34",
      "아무 반응 없이 가만히 서 있는 작은 노인이 있을 뿐이었다."
    ],
    [
      "event+49",
      "그녀가 위협받을 때마다 반려체는 더욱 커졌던 것 같다."
    ],
    [
      "event+65",
      "얼마나 거대해졌는지 도보 2분 거리의 건물 오피스 6층에서도"
    ],
    [
      "event+75",
      "누군가의 검출기로 그것을 관측할 수 있었다."
    ]
  ],
  "game": [
    [
      0,
      "그녀는 10년 전 딸이 알려준 게임 하나만 했다."
    ],
    [
      35,
      "몇 년 동안 모은 골드는"
    ],
    [
      43,
      "딸이 뭔가를 업데이트하면서 다 날아갔다."
    ],
    [
      80,
      "그래도 그녀는 다시 게임을 열었다."
    ],
    [
      125,
      "반려체는 그녀의 곁에서 게임의 리듬에 맞춰 자라났다."
    ]
  ],
  "dog": [
    [
      0,
      "아무도 그 개가 어디서 왔는지 알지 못했다."
    ],
    [
      20,
      "그녀와 개는 서로를 알아보게 된 뒤에"
    ],
    [
      29,
      "늘 같은 장소 같은 시간에 만났다."
    ],
    [
      "event+12",
      "그럴 때 반려체는 성장을 멈추고 그들을 바라보았다."
    ],
    [
      "event+30",
      "간혹 이 자리에 선 사람들은"
    ],
    [
      "event+39",
      "한 번도 본 적 없는 반려체를 경이롭게 바라보았다."
    ],
    [
      "event+61",
      "검출기가 없던 그녀는 한 번도 자신의 반려체를 본 적이 없었다."
    ],
    [
      "end-14",
      "하지만 그녀는 한 번도 혼자인 적이 없었다."
    ]
  ]
};
  const text=stories.smoking[0][1];
  const indoor=new Set(['enter','sit','cigarette','smoke','smokeHold','tablet','read','gaming','stow','stand','exit','return_enter','return_sit','home','plant_walk','plant_care','plant_back','plant_sit']);
  const outdoor=new Set(['emerge','pause','raise','outside','lower','encounter','dog_encounter','rain_encounter','ended']);
  const cache=new Map(),fontMM=7;
  const visible=(id,state)=>(id==='landscape'?indoor:outdoor).has(state);
  function sequence(cue){
    let eventStart=0;
    for(const phase of cue.phases||[]){if(['encounter','rain_encounter','dog_encounter'].includes(phase.state))break;eventStart+=phase.duration;}
    const rows=(stories[cue.id]||[]).map(([anchor,text])=>({text,at:
      typeof anchor==='number'?anchor*1000:anchor.startsWith('event+')?eventStart+Number(anchor.slice(6))*1000:cue.duration-Number(anchor.slice(4))*1000}));
    return rows.map((row,i)=>({...row,until:Math.min(cue.duration,rows[i+1]?.at??cue.duration,
      row.at+(i===rows.length-1&&cue.id==='dog'?14000:Math.max(6000,Math.ceil(row.text.length/7+2)*1000)))}));
  }
  function sample(cue){
    if(!cue)return null;
    return sequence(cue).find(row=>cue.elapsed>=row.at&&cue.elapsed<row.until)||null;
  }
  // Break at word boundaries; only split a word if it exceeds the entire line.
  function wrap(text,measure,maxWidth){
    const lines=[];let line='';
    for(const word of text.split(/\s+/)){
      const candidate=line?line+' '+word:word;
      if(measure.measureText(candidate).width<=maxWidth){line=candidate;continue;}
      if(line){lines.push(line);line='';}
      for(const char of word){if(line&&measure.measureText(line+char).width>maxWidth){lines.push(line);line='';}line+=char;}
    }
    if(line)lines.push(line);return lines;
  }
  function layout(id,width,height,content=text){
    const key=[id,width,height,content].join(':');if(cache.has(key))return cache.get(key);
    const [mmW,mmH]=id==='portrait'?[100,165]:[165,100],sx=width/mmW,sy=height/mmH;
    const font=`600 ${fontMM}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
    const measure=document.createElement('canvas').getContext('2d');measure.font=font;
    const padding=3,margin=4,lineHeight=9.8;
    const lines=wrap(content,measure,mmW-margin*2-padding*2);
    const mmWidth=Math.min(mmW-margin*2,Math.max(...lines.map(line=>measure.measureText(line).width))+padding*2);
    const mmHeight=lines.length*lineHeight+padding*2;
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(mmWidth*sx);canvas.height=Math.ceil(mmHeight*sy);
    const c=canvas.getContext('2d',{alpha:false});
    c.fillStyle='#292b28';c.fillRect(0,0,canvas.width,canvas.height);
    c.fillStyle='#73766d';c.fillRect(0,0,canvas.width,Math.max(1,Math.round(.25*sy)));
    // Draw directly at native pixel density. Font edge shades are baked into
    // this opaque plate; no low-resolution glyph upscaling or translucent overlay.
    c.scale(sx,sy);c.font=font;c.textBaseline='top';c.fillStyle='#eeeDE6';
    lines.forEach((line,i)=>c.fillText(line,padding,padding+i*lineHeight));
    const result={canvas,x:Math.round(margin*sx),y:id==='portrait'?Math.round(margin*sy):height-Math.round(margin*sy)-canvas.height,w:canvas.width,h:canvas.height,fontMM,lines};
    if(cache.size>24)cache.clear();cache.set(key,result);return result;
  }
  function paint(target,id,status){
    if(status.captionVisible===false)return;
    if(status.captionScreen?id!==status.captionScreen:!visible(id,status.state))return;
    const current=status.cue?sample(status.cue):{text};if(!current)return;
    const caption=layout(id,target.width,target.height,current.text),c=target.getContext('2d');
    c.drawImage(caption.canvas,caption.x,caption.y);
  }
  function drawRegion(ctx,id,status,r){
    if(!visible(id,status.state))return;
    const caption=layout(id,Math.max(1,Math.round(r.w)),Math.max(1,Math.round(r.h)));
    ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();
    ctx.drawImage(caption.canvas,Math.round(r.x)+caption.x,Math.round(r.y)+caption.y);ctx.restore();
  }
  return {text,stories,sequence,sample,wrap,visible,layout,paint,drawRegion};
})();
