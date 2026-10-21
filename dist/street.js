/* Preserve the approved artwork rather than redrawing its pavement and ink. */
window.SceneStreet=(()=>{
  const W=240,H=384;
  function build(room,source,scale=3,reference){
    const canvas=document.createElement('canvas');canvas.width=W*scale;canvas.height=H*scale;
    const c=canvas.getContext('2d',{alpha:false});c.imageSmoothingEnabled=false;
    c.drawImage(room,0,0,canvas.width,canvas.height);
    c.save();c.scale(scale,scale);c.beginPath();c.rect(124,80,98,169);c.clip();
    // The supplied earlier composition is the authoritative exterior, including
    // the original car positions, fine pavement bands, trees and streetlamps.
    c.drawImage(reference,0,0,W,H);c.restore();
    // Opaque cloud masses at three depths, irregular in size and spacing.
    const clouds=document.createElement('canvas');clouds.width=W;clouds.height=H;
    const cloud=clouds.getContext('2d');cloud.fillStyle='#fafafa';cloud.fillRect(0,0,W,H);
    const mass=(tone,points)=>{
      cloud.fillStyle=tone;
      for(let y=83;y<155;y++){
        const edges=[];
        for(let i=0,j=points.length-1;i<points.length;j=i++){
          const [ax,ay]=points[j],[bx,by]=points[i];
          if((ay<=y+.5&&by>y+.5)||(by<=y+.5&&ay>y+.5))edges.push(ax+(y+.5-ay)*(bx-ax)/(by-ay));
        }
        edges.sort((a,b)=>a-b);for(let i=0;i+1<edges.length;i+=2){const x=Math.ceil(edges[i]);cloud.fillRect(x,y,Math.ceil(edges[i+1])-x,1);}
      }
    };
    mass('#c1c1c1',[[124,83],[222,83],[222,93],[214,93],[214,97],[202,97],
      [202,99],[186,99],[186,104],[175,104],[175,102],[161,102],[161,106],
      [148,106],[148,104],[133,104],[133,101],[124,101]]);
    mass('#dedede',[[124,101],[141,101],[141,105],[158,105],[158,108],[173,108],
      [173,106],[188,106],[188,109],[181,109],[181,112],[164,112],[164,115],
      [151,115],[151,112],[134,112],[134,114],[124,114]]);
    mass('#c1c1c1',[[221,113],[210,113],[210,115],[198,115],[198,118],[186,118],
      [186,121],[180,121],[180,124],[192,124],[192,128],[209,128],[209,126],
      [221,126]]);
    mass('#dedede',[[181,124],[194,124],[194,127],[217,127],[217,130],
      [221,130],[221,134],[205,134],[205,132],[186,132],[186,130],[174,130],[174,127],[181,127]]);
    mass('#d3d3d3',[[125,129],[138,129],[138,126],[150,126],[150,129],[161,129],
      [161,132],[171,132],[171,135],[156,135],[156,137],[141,137],[141,135],[125,135]]);
    mass('#e7e7e7',[[146,146],[157,146],[157,144],[170,144],[170,147],[181,147],
      [181,149],[199,149],[199,152],[178,152],[178,153],[159,153],[159,150],[146,150]]);
    cloud.fillStyle='#fafafa';[[157,92,13,1],[164,94,7,2],[130,108,9,1],
      [203,120,9,1],[198,122,4,1],[147,132,8,1],[173,149,11,1]].forEach(b=>cloud.fillRect(...b));
    const cloudPixels=cloud.getImageData(0,0,W,H).data;
    const sky=c.getImageData(0,0,canvas.width,canvas.height);
    for(let y=83*scale;y<177*scale;y++)for(let x=125*scale;x<220*scale;x++){
      const i=(y*canvas.width+x)*4,light=(sky.data[i]+sky.data[i+1]+sky.data[i+2])/3;
      const value=light>225?cloudPixels[(Math.floor(y/scale)*W+Math.floor(x/scale))*4]:154;
      const tone=[value,value,value];
      sky.data[i]=tone[0];sky.data[i+1]=tone[1];sky.data[i+2]=tone[2];sky.data[i+3]=255;
    }
    c.putImageData(sky,0,0);
    const foreground=document.createElement('canvas');foreground.width=canvas.width;foreground.height=canvas.height;
    const f=foreground.getContext('2d'),pixels=c.getImageData(0,0,canvas.width,canvas.height),ink=f.createImageData(canvas.width,canvas.height);
    const parts=[[143,183,6,2],[145,185,2,9],[149,186,7,3],[153,189,3,20],[161.3,194.9,5.2,1.5],[164,196.3,1,31.5],[163.7,227.3,1.7,1.4]];
    for(const [x,y,w,h] of parts)for(let py=Math.round(y*scale);py<Math.round((y+h)*scale);py++)for(let px=Math.round(x*scale);px<Math.round((x+w)*scale);px++){
      const i=(py*canvas.width+px)*4;if(pixels.data[i]>195)continue;
      ink.data.set(pixels.data.subarray(i,i+3),i);ink.data[i+3]=255;
    }
    f.putImageData(ink,0,0);
    return {canvas,foreground,scale};
  }
  return {build};
})();
