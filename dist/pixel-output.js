/* Opaque, nearest-cell output. Crop coordinates stay in the shared wall space. */
window.PixelOutput=(()=>{
  const caches=new WeakMap();
  function hardenAlpha(canvas,region={x:0,y:0,w:canvas.width,h:canvas.height}){
    const ctx=canvas.getContext('2d'),pixels=ctx.getImageData(region.x,region.y,region.w,region.h),data=pixels.data;
    for(let i=3;i<data.length;i+=4)data[i]=data[i]<128?0:255;
    ctx.putImageData(pixels,region.x,region.y);
  }
  function paint(target,source,region,width,height,scale=1){
    width=Math.max(1,Math.round(width));height=Math.max(1,Math.round(height));
    if(target.width!==width||target.height!==height){target.width=width;target.height=height;}
    const ctx=target.getContext('2d',{alpha:false});
    const key=[width,height,source.width,source.height,region.x,region.y,region.w,region.h,scale].join(':');
    let cache=caches.get(target);
    if(!cache||cache.key!==key){
      const pixels=ctx.createImageData(width,height),columns=new Uint32Array(width),rows=new Uint32Array(height);
      for(let x=0;x<width;x++)columns[x]=Math.max(0,Math.min(source.width-1,Math.floor((region.x+(x+.5)*region.w/width)*scale)));
      for(let y=0;y<height;y++)rows[y]=Math.max(0,Math.min(source.height-1,Math.floor((region.y+(y+.5)*region.h/height)*scale)));
      cache={key,pixels,columns,rows,words:new Uint32Array(pixels.data.buffer)};caches.set(target,cache);
    }
    // Read only the used source area, rather than the full wall, on each output.
    const left=cache.columns[0],right=cache.columns[width-1],top=cache.rows[0],bottom=cache.rows[height-1],stride=right-left+1;
    const sample=source.getContext('2d').getImageData(left,top,stride,bottom-top+1),src=new Uint32Array(sample.data.buffer);
    for(let y=0;y<height;y++){
      const offset=y*width;
      if(y&&cache.rows[y]===cache.rows[y-1]){cache.words.copyWithin(offset,offset-width,offset);continue;}
      const row=(cache.rows[y]-top)*stride;
      for(let x=0;x<width;x++)cache.words[offset+x]=src[row+cache.columns[x]-left];
    }
    // The scene is already opaque. Enforce this also for any future source layers.
    for(let i=3;i<cache.pixels.data.length;i+=4)cache.pixels.data[i]=255;
    ctx.putImageData(cache.pixels,0,0);
  }
  return {paint,hardenAlpha};
})();
