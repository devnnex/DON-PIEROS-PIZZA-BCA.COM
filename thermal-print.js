(() => {
  'use strict';
  async function prepare(target,width=80){
    const doc=target.document;width=width===58?58:80;
    const style=doc.createElement('style');style.dataset.thermalPaper='';
    style.textContent=`html,body{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}html{margin:0!important;padding:0!important}body{box-sizing:border-box!important;width:${width}mm!important;margin:0!important;padding:2mm!important;box-shadow:none!important}*{box-sizing:border-box}@page{margin:0;@top-left{content:none}@top-center{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-center{content:none}@bottom-right{content:none}}`;
    doc.head.append(style);await (doc.fonts?.ready||Promise.resolve());
    await Promise.all([...doc.images].map(img=>img.decode?.().catch(()=>{})));
    await new Promise(resolve=>target.requestAnimationFrame(()=>resolve()));
    // body height is content height. scrollHeight of html includes the viewport
    // and would make a short receipt as long as the popup's entire screen.
    const height=Math.max(20,Math.ceil(doc.body.getBoundingClientRect().height*25.4/96)+1);
    style.textContent+=`@page{size:${width}mm ${height}mm;margin:0}`;
    doc.body.dataset.thermalHeight=String(height);return {width,height};
  }
  window.DonPierosThermal={prepare};
})();
