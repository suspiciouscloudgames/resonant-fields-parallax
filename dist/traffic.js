/* Opaque pixel traffic projected along the same rays as its road markings. */
window.SceneTraffic=(()=>{
  const W=240,H=384;
  // This polygon follows the existing road verge, behind the streetlamps.
  const road=[[142,182],[154,184],[222,200],[222,249],[175,249]];
  const lamps=[[143,183,6,2],[145,185,2,9],[149,186,7,3],[153,189,3,20],[162,194,6,6],[163,200,3,30],[164,229,3,3]];
  // Calibrate road motion from the visitors' 4.5-second approach, in final scene coordinates.
  const approach={projection:{x:100,y:40,originX:110,originY:50,scaleX:1.25*98/116,scaleY:1.25*169/200},from:184,to:218,duration:4500};
  const cruise=(approach.to-approach.from)*approach.projection.scaleY/(approach.duration/1000);
  // Four perspective paths beside the curb; no sideways sweep across the road.
  const pullOverLane={nearX:211};
  // Keep the curb approach clear; through traffic uses the adjacent road paths.
  const lanes=[{nearX:246,speed:cruise*.98},{nearX:280,speed:cruise*.97},{nearX:314,speed:cruise},{nearX:348,speed:cruise*1.03,direction:-1}];
  const laneDividers=[263,297,331];
  const heading=lane=>{const x=lanes[lane].nearX-142,y=78,n=Math.hypot(x,y);return [x/n,y/n];};
  const models=[
    {name:'sedan',w:24,h:20,length:.85,pace:1},
    {name:'compact',w:20,h:18,length:.7,pace:1.04},
    {name:'suv',w:25,h:23,length:.95,pace:.98},
    {name:'bus',w:34,h:40,length:1.55,pace:.95,bodyHeightScale:2.5},
    {name:'truck',w:32,h:27,length:1.4,pace:.96}
  ];
  // Shared by ordinary traffic and scripted parked/emergency vehicles.
  const vehicleSizeAt=(y,type=0)=>models[type].w*Math.max(0,(y-180)/78);
  const STEP=1/30,WARMUP=900;
  let tick=-1,streams=[];
  const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  function reset(){tick=-1;streams=lanes.map((lane,i)=>({cars:[],serial:0,next:i*.65}));}
  function stepAway(stream,laneIndex,seconds){
    const lane=lanes[laneIndex],entryY=238,last=stream.cars[stream.cars.length-1];
    const seed=stream.serial*13+laneIndex*197,type=Math.floor(random(seed+1)*models.length),model=models[type];
    const entryHeight=vehicleSizeAt(entryY,type)*(model.aspects?.[laneIndex]||model.h/model.w);
    // Enter beyond the right edge and recede into the vanishing point. Reserve
    // space for the following car's body, since its rear is now nearest to us.
    if(seconds>=stream.next&&(!last||entryY-last.y>entryHeight+3)){
      const desired=lane.speed*model.pace*(.94+random(seed+2)*.12);
      stream.cars.push({id:laneIndex+'-'+stream.serial++,lane:laneIndex,type,y:entryY,speed:last?Math.min(desired,last.speed):desired,desired,shade:Math.floor(random(seed+3)*3)});
      stream.next=seconds+2.6+random(seed+4)*.6;
    }
    let leader=null;
    for(const car of stream.cars){
      car.previousY=car.y;
      let target=car.desired,limit=Infinity;
      if(leader){
        const model=models[car.type],height=vehicleSizeAt(car.y,car.type)*(model.aspects?.[laneIndex]||model.h/model.w);
        const gap=car.y-leader.y,safe=height+2;
        target=Math.min(target,Math.max(0,leader.speed+(gap-safe-car.speed*1.8)*.9));
        limit=Math.max(0,(gap-safe)/STEP);
      }
      car.speed+=Math.max(-2*STEP,Math.min(1.5*STEP,target-car.speed));
      car.speed=Math.min(car.speed,limit);car.y-=car.speed*STEP;leader=car;
    }
    stream.cars=stream.cars.filter(car=>car.y>180.3);
  }
  function step(){
    tick++;const seconds=tick*STEP;
    streams.forEach((stream,laneIndex)=>{
      const lane=lanes[laneIndex];
      if(lane.direction===-1){stepAway(stream,laneIndex,seconds);return;}
      const last=stream.cars[stream.cars.length-1];
      if(seconds>=stream.next&&(!last||last.y>198)){
        const serial=stream.serial++,seed=serial*13+laneIndex*197;
        const type=Math.floor(random(seed+1)*models.length),model=models[type];
        const desired=lane.speed*model.pace*(.94+random(seed+2)*.12);
        stream.cars.push({id:laneIndex+'-'+serial,lane:laneIndex,type,y:182,speed:last?Math.min(desired,last.speed):desired,desired,shade:Math.floor(random(seed+3)*3)});
        stream.next=seconds+2.6+random(seed+4)*.6;
      }
      // Cruise at the approach's average screen pace. No inverse-depth speed explosion.
      // A slower leader only changes speed gradually, with room for its whole silhouette.
      let leader=null;
      for(const car of stream.cars){
        car.previousY=car.y;
        let target=car.desired,limit=Infinity;
        if(leader){
          const model=models[leader.type],height=vehicleSizeAt(leader.y,leader.type)*(model.aspects?.[laneIndex]||model.h/model.w);
          const gap=leader.y-car.y,safe=height+2;
          const rearSpeed=leader.speed*(1-height/(leader.y-180));
          target=Math.min(target,Math.max(0,rearSpeed+(gap-safe-car.speed*1.8)*.9));
          limit=Math.max(0,(gap-safe)/STEP);
        }
        car.speed+=Math.max(-2*STEP,Math.min(1.5*STEP,target-car.speed));
        car.speed=Math.min(car.speed,limit);
        car.y+=car.speed*STEP;
        leader=car;
      }
      stream.cars=stream.cars.filter(car=>{
        const p=(car.y-180)/78,model=models[car.type],w=vehicleSizeAt(car.y,car.type),h=w*(model.aspects?.[laneIndex]||model.h/model.w);
        return 142+(lane.nearX-142)*p-w/2<=224&&car.y-h<=251;
      });
    });
  }
  function sample(time){
    const position=Math.max(0,time)/1000/STEP,target=Math.floor(position)+WARMUP;
    if(tick<0||target<tick)reset();
    while(tick<target)step();
    // Interpolate a fixed simulation step, keeping the tyre contact point on
    // one straight perspective lane. No separate bobbing or size oscillation.
    const fraction=position-Math.floor(position);
    return streams.flatMap(stream=>stream.cars.map(car=>{
      const y=car.previousY+(car.y-car.previousY)*fraction,p=(y-180)/78,lane=lanes[car.lane],model=models[car.type];
      return {...car,p,direction:lane.direction||1,kind:model.name,x:142+(lane.nearX-142)*p,y:180+78*p,w:vehicleSizeAt(180+78*p,car.type),h:vehicleSizeAt(180+78*p,car.type)*(model.aspects?.[car.lane]||model.h/model.w)};
    })).sort((a,b)=>a.y-b.y);
  }
  function polygon(c,points,color){
    c.fillStyle=color;
    for(let y=Math.floor(Math.min(...points.map(p=>p[1])));y<Math.ceil(Math.max(...points.map(p=>p[1])));y++){
      const xs=[];
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length];
        if((a[1]<=y+.5&&b[1]>y+.5)||(b[1]<=y+.5&&a[1]>y+.5))xs.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      xs.sort((a,b)=>a-b);
      for(let i=0;i+1<xs.length;i+=2){const x=Math.ceil(xs[i]-.5),end=Math.ceil(xs[i+1]-.5);c.fillRect(x,y,end-x,1);}
    }
  }
  function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function create(source,density=1,reference){
    const fleets=lanes.map((lane,laneIndex)=>{
    const [forwardX,forwardY]=heading(laneIndex),away=lane.direction===-1;
    const fleet=models.map((model,type)=>[0,1,2].map(shade=>{
      if(type<3&&!away){
        const original=surface(82,69),o=original.getContext('2d');o.imageSmoothingEnabled=false;
        polygon(o,[[7,16],[10,5],[24,0],[47,2],[56,10],[70,11],[77,24],[81,44],[76,58],[65,66],[30,62],[14,50],[3,34],[0,21]],'#fff');
        o.globalCompositeOperation='source-in';o.drawImage(source,727,867,82,69,0,0,82,69);o.globalCompositeOperation='source-over';
        const car=surface(type===1?72:82,type===2?77:69),cc=car.getContext('2d');cc.imageSmoothingEnabled=false;
        cc.drawImage(original,0,0,car.width,car.height);
        const ink=cc.getImageData(0,0,car.width,car.height),shift=[0,24,-19][shade];
        for(let i=0;i<ink.data.length;i+=4)if(ink.data[i+3]){
          for(let k=0;k<3;k++)ink.data[i+k]=Math.max(28,Math.min(222,ink.data[i+k]+shift));
          ink.data[i+3]=255;
        }
        cc.putImageData(ink,0,0);model.aspects ||= [];model.aspects[laneIndex]=car.height/car.width;
        return car;
      }
      const tile=surface(160,160),c=tile.getContext('2d');
      const paint=[151,187,112][shade],tone=n=>`rgb(${n},${n},${Math.max(0,n-3)})`;
      // Shared road-facing projection: longitudinal axis heads down/right,
      // transverse axis spans the lane, and height is independent of the bonnet.
      // The long bus is normalized by its projected width. Raise its cabin
      // independently so that normalization does not flatten it into a car.
      // Keep the wheel/base geometry and road contact point unchanged.
      const project=([u,v,z])=>{
        const height=z<=5?z:5+(z-5)*(model.bodyHeightScale||(away?(type<3?2.5:1.6):1));
        return [80+u*forwardX+v,110+u*forwardY+v*.08-height*.8];
      };
      const face=(points,color)=>polygon(c,points.map(project),typeof color==='number'?tone(color):color);
      const box=(a,b,w,base,top,color)=>{
        face([[a,-w,base],[b,-w,base],[b,-w,top],[a,-w,top]],color-30);
        face([[b,-w,base],[b,w,base],[b,w,top],[b,-w,top]],color-48);
        face([[a,-w,top],[a,w,top],[b,w,top],[b,-w,top]],color+22);
      };
      const length=[58,44,57,92,82][type],half=length/2,width=[13,12,14,15,15][type];
      for(const u of [-half*.65,half*.64])for(const v of [-width,width]){
        const [x,y]=project([u,v,3]);polygon(c,[[x-3,y-3],[x+2,y-4],[x+4,y],[x+3,y+6],[x-1,y+8],[x-4,y+4]],'#272825');
        polygon(c,[[x-1,y],[x+1,y-1],[x+2,y+3],[x,y+5]],'#767872');
      }
      box(-half,half,width,5,13,paint);
      if(type<3){
        const rear=away?-half+14:type===1?-half+3:-half+6,front=away?half-5:type===2?half-9:half-17,roof=type===2?27:22;
        const roofRear=rear+7,roofFront=front-5,rw=width-2;
        face([[rear,-width,13],[front,-width,13],[roofFront,-rw,roof],[roofRear,-rw,roof]],paint-19);
        face([[front,-width,13],[front,width,13],[roofFront,rw,roof],[roofFront,-rw,roof]],65);
        face([[roofRear,-rw,roof],[roofRear,rw,roof],[roofFront,rw,roof],[roofFront,-rw,roof]],paint+25);
        face([[rear+3,-width-.1,15],[front-3,-width-.1,15],[roofFront-1,-rw-.1,roof-2],[roofRear+1,-rw-.1,roof-2]],54);
        const pillar=(roofRear+roofFront)/2;
        face([[pillar,-width-.2,14],[pillar+2,-width-.2,14],[pillar+2,-rw-.2,roof],[pillar,-rw-.2,roof]],paint-10);
        face([[front+1,-width+1,13],[front+1,width-1,13],[half-2,width-1,13],[half-2,-width+1,13]],paint+14);
      }else if(type===3){
        box(-half+1,half-1,width,12,36,paint);
        // Long window band broken by repeated upright pillars reads as a bus.
        for(let u=-half+5;u<half-10;u+=13)face([[u,-width-.1,22],[u+10,-width-.1,22],[u+10,-width-.1,32],[u,-width-.1,32]],54);
        face([[half,-width+2,away?26:21],[half,width-2,away?26:21],[half,width-2,32],[half,-width+2,32]],49);
        face([[half,-8,33],[half,8,33],[half,8,35],[half,-8,35]],102);
        face([[-half+2,-width-.2,17],[half-3,-width-.2,17],[half-3,-width-.2,19],[-half+2,-width-.2,19]],paint-55);
      }else if(away){
        // The cargo doors, not the cab windshield, face the viewer as it recedes.
        box(-half,-12,width-1,12,27,paint-8);
        face([[-half+3,-width,19],[-16,-width,19],[-16,-width,25],[-half+3,-width,25]],60);
        box(-8,half,width,12,38,paint+6);
        face([[half,-.7,13],[half,.7,13],[half,.7,37],[half,-.7,37]],paint-55);
        for(const v of [-width+3,width-4])face([[half,v,15],[half,v+1,15],[half,v+1,35],[half,v,35]],paint-30);
      }else{
        // Separate long cargo body and short cab, rather than a car with a tall roof.
        box(-half,8,width,12,38,paint+6);
        box(12,half,width-1,12,27,paint-8);
        face([[half,-width+3,19],[half,width-3,19],[half,width-3,25],[half,-width+3,25]],48);
        face([[16,-width,19],[half-3,-width,19],[half-3,-width,25],[16,-width,25]],60);
        for(let u=-half+8;u<6;u+=12)face([[u,-width-.1,14],[u+1,-width-.1,14],[u+1,-width-.1,35],[u,-width-.1,35]],paint-25);
      }
      const nose=half+(type===3?0:.1);
      for(const v of [-width+2,width-6])face([[nose,v,8],[nose,v+4,8],[nose,v+4,11],[nose,v,11]],away?88:218);
      face([[nose,-width+2,5],[nose,width-2,5],[nose,width-2,7],[nose,-width+2,7]],73);
      face([[nose,-4,8],[nose,4,8],[nose,4,10],[nose,-4,10]],away?168:47);
      const pixels=c.getImageData(0,0,tile.width,tile.height).data;let left=tile.width,top=tile.height,right=0,bottom=0;
      for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++)if(pixels[(y*tile.width+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
      const cropped=surface(right-left+1,bottom-top+1);cropped.getContext('2d').drawImage(tile,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
      if(shade===0){model.aspects ||= [];model.aspects[laneIndex]=cropped.height/cropped.width;}
      return cropped;
    }));
    return fleet;
    });
    const fleet=fleets[0];
    // Pixel bounds measured in the supplied 1162 × 1840 reference. These
    // fragments restore the exact original printed cars, not a new composition.
    const referenceCars=[
      [970,1099,89,76],[893,1017,78,69],[826,968,57,38],
      [795,927,36,32],[765,920,31,29],[744,899,29,27],[718,876,28,27],
      [1040,1009,40,52],[1024,951,53,40],[913,947,59,35],
      [968,920,44,29],[875,908,35,24],[867,895,30,21],
      [832,887,25,20],[823,878,25,17]
    ];
    const staticCars=referenceCars.map(([x,y,w,h],i)=>({id:'print-'+i,x:(x+w/2)*W/1162,y:(y+h)*H/1840,w:w*W/1162,h:h*H/1840}));
    let originalRoom=null;
    const overlay=surface(W,H),oc=overlay.getContext('2d');oc.imageSmoothingEnabled=false;
    const layer=surface(W*density,H*density),lc=layer.getContext('2d');lc.imageSmoothingEnabled=false;
    const mask=surface(W*density,H*density);polygon(mask.getContext('2d'),road.map(([x,y])=>[x*density,y*density]),'#fff');
    function prepare(room,scale=1,lampLayer=null){
      overlay.width=W*scale;overlay.height=H*scale;oc.imageSmoothingEnabled=false;
      const poly=(context,points,color)=>polygon(context,points.map(([x,y])=>[x*scale,y*scale]),color);
      if(lampLayer)oc.drawImage(lampLayer,0,0);
      else {
      const r=room.getContext('2d'),before=r.getImageData(0,0,W,H),foreground=oc.createImageData(W,H);
      // Retain only actual lamp ink, not the baked-in cars behind it.
      for(const [x,y,w,h] of lamps)for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){
        const i=(py*W+px)*4;if(before.data[i]>195)continue;
        foreground.data.set(before.data.subarray(i,i+3),i);foreground.data[i+3]=255;
      }
      oc.putImageData(foreground,0,0);
      }
      const r=room.getContext('2d');originalRoom=surface(room.width,room.height);
      originalRoom.getContext('2d').drawImage(room,0,0);
      // Remove only the baked vehicle silhouettes. Keep all original road paint,
      // sidewalk joints and grain. Sample nearby pale asphalt in each row.
      const pixels=r.getImageData(0,0,room.width,room.height),before=new Uint8ClampedArray(pixels.data);
      for(const car of staticCars){
        const x0=Math.floor((car.x-car.w/2)*scale),x1=Math.ceil((car.x+car.w/2)*scale);
        const y0=Math.floor((car.y-car.h)*scale),y1=Math.ceil(car.y*scale);
        for(let y=y0;y<Math.min(y1,249*scale);y++){
          let donor=-1;
          for(let gap=1;gap<15*scale&&donor<0;gap++)for(const x of [x0-gap,x1+gap]){
            if(x<142*scale||x>=222*scale)continue;
            const j=(y*room.width+x)*4;
            if(before[j]>235&&before[j+1]>235&&before[j+2]>235){donor=j;break;}
          }
          for(let x=x0;x<x1&&x<222*scale;x++){
            const i=(y*room.width+x)*4;
            for(let k=0;k<3;k++)pixels.data[i+k]=donor<0?248:before[donor+k];
            pixels.data[i+3]=255;
          }
        }
      }
      r.putImageData(pixels,0,0);r.drawImage(overlay,0,0);

    }
    function draw(ctx,time,exclude=[],cars=sample(time)){
      lc.clearRect(0,0,layer.width,layer.height);
      for(const car of cars){
        // Frozen cars must not straddle a physical display edge.
        if(exclude.some(r=>car.x+car.w/2>r.x-1&&car.x-car.w/2<r.x+r.w+1&&car.y>r.y-1&&car.y-car.h<r.y+r.h+1))continue;
        const width=Math.max(1,Math.round(car.w*density)),height=Math.max(1,Math.round(car.h*density));
        // Round the road contact point once, then place the whole rigid sprite.
        // Rounding its top and height separately made the wheels hop by a pixel.
        const contactX=Math.round(car.x*density),contactY=Math.round(car.y*density);
        const x=contactX-Math.floor(width/2),y=contactY-height;
        lc.drawImage(fleets[car.lane||0][car.type][car.shade],x,y,width,height);
      }
      lc.globalCompositeOperation='destination-in';lc.drawImage(mask,0,0);lc.globalCompositeOperation='source-over';
      ctx.drawImage(layer,0,0,W,H);
      ctx.drawImage(overlay,0,0,W,H);
    }
    function drawStatic(ctx,exclude=[]){
      if(!originalRoom)return;
      const scale=originalRoom.width/W;
      for(const car of staticCars){
        if(exclude.some(r=>car.x+car.w/2>r.x-1&&car.x-car.w/2<r.x+r.w+1&&car.y>r.y-1&&car.y-car.h<r.y+r.h+1))continue;
        const x=Math.floor((car.x-car.w/2)*scale),y=Math.floor((car.y-car.h)*scale);
        const w=Math.ceil((car.x+car.w/2)*scale)-x,h=Math.ceil(car.y*scale)-y;
        ctx.drawImage(originalRoom,x,y,w,h,x/scale,y/scale,w/scale,h/scale);
      }
      ctx.drawImage(overlay,0,0,W,H);
    }
    return {prepare,draw,sample,fleet,fleets,staticCars,drawStatic};
  }
  return {create,sample,road,lanes,models,heading,laneDividers,vehicleSizeAt,approach,cruise,pullOverLane};
})();
