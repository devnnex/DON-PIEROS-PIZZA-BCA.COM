(() => {
  'use strict';
  const activeUrls=new WeakMap();
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
  async function createPdf(target,width=80){
    const paper=await prepare(target,width),doc=target.document;
    const PDF=window.jspdf?.jsPDF;
    if(!PDF)throw new Error('No se pudo cargar el generador de impresión. Actualiza la página.');
    const body=doc.body.cloneNode(true);
    body.querySelectorAll('[data-thermal-pdf-viewer]').forEach(node=>node.remove());
    const css=[...doc.querySelectorAll('style')].map(node=>node.textContent).join('\n');
    const styles=doc.createElement('style');styles.textContent=css;body.prepend(styles);
    const content=new XMLSerializer().serializeToString(body);
    const rect=doc.body.getBoundingClientRect(),pageHeight=Math.min(4800,paper.height);
    const pdf=new PDF({orientation:pageHeight>=paper.width?'portrait':'landscape',unit:'mm',format:[paper.width,pageHeight],compress:true});
    pdf.setProperties({title:doc.title||'Comprobante Don Pieros Pizza',creator:'Don Pieros Pizza'});
    // Capture at 300 dpi in small strips: long orders do not need a giant canvas.
    // The PDF contains only the receipt, never the browser's HTML date/URL footer.
    const scale=300/96,mmPerPixel=25.4/96;
    let offset=0,pageTop=0;
    while(offset<rect.height){
      const available=(pageTop+pageHeight)/mmPerPixel-offset;
      const sliceHeight=Math.min(1024,rect.height-offset,available);
      if(sliceHeight<.1){pageTop+=pageHeight;pdf.addPage([paper.width,pageHeight],pageHeight>=paper.width?'portrait':'landscape');continue;}
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${sliceHeight}"><foreignObject x="0" y="${-offset}" width="${rect.width}" height="${rect.height}">${content}</foreignObject></svg>`;
      const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(rect.width*scale);canvas.height=Math.ceil(sliceHeight*scale);
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      pdf.addImage(canvas,'PNG',0,offset*mmPerPixel-pageTop,paper.width,sliceHeight*mmPerPixel,undefined,'FAST');
      canvas.width=canvas.height=0;offset+=sliceHeight;
    }
    return {pdf,width:paper.width,height:paper.height};
  }
  async function print(target,width=80){
    const result=await createPdf(target,width),doc=target.document;
    result.pdf.autoPrint();
    const url=URL.createObjectURL(result.pdf.output('blob'));
    const previous=activeUrls.get(target);if(previous)URL.revokeObjectURL(previous);activeUrls.set(target,url);
    const viewer=doc.createElement('iframe');viewer.dataset.thermalPdfViewer='';viewer.title='Impresión del comprobante PDF';
    viewer.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;background:white;z-index:2147483647';
    viewer.src=url;doc.body.append(viewer);doc.body.dataset.thermalPdfReady='1';
    // Keep the URL valid while the preview/print dialog is open. Closing its host
    // releases it; a cancelled print can still be retried in the PDF viewer.
    target.addEventListener('unload',()=>{URL.revokeObjectURL(url);if(activeUrls.get(target)===url)activeUrls.delete(target);},{once:true});
    target.focus();return result;
  }
  window.DonPierosThermal={prepare,createPdf,print};
})();
