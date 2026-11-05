(() => {
  'use strict';
  function sizeOption(value){
    const text=String(value??''),escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const match=text.match(/^((?:Elige\s+el\s+)?Tama[ñn]o\s*:\s*)(Super\s+maxi|Maxi|Mediana|Mini|Pizzeta)\b(.*)$/i);
    return {isSize:!!match,html:match?escape(match[1])+`<b class="size-name">${escape(match[2])}</b>`+escape(match[3]).replace(/(\d+\s*[x×]\s*\d+\s*cm)/gi,'<span class="size-dimensions">$1</span>'):escape(text)};
  }
  const sizeStyle='.size-option{margin-left:-4px!important}.size-option .size-name{font-size:calc(1em + 2px);font-weight:900!important}.size-dimensions{white-space:nowrap;display:inline-block}';
  async function prepare(target,width=80){
    const doc=target.document;width=width===58?58:80;
    const style=doc.createElement('style');style.dataset.thermalPaper='';
    style.textContent=`html,body{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}html{margin:0!important;padding:0!important}body{box-sizing:border-box!important;width:${width}mm!important;margin:0!important;padding:2mm!important;box-shadow:none!important}*{box-sizing:border-box}@page{margin:0;@top-left{content:none}@top-center{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-center{content:none}@bottom-right{content:none}}`;
    doc.head.append(style);
    await Promise.race([doc.fonts?.ready||Promise.resolve(),new Promise(resolve=>setTimeout(resolve,700))]);
    doc.querySelectorAll('.size-name').forEach(size=>{
      const block=size.closest('.kitchen-item,article')||size.parentElement;
      const otherSizes=[...block.querySelectorAll('*')].filter(node=>!node.closest('.size-name'))
        .map(node=>parseFloat(target.getComputedStyle(node).fontSize)||0);
      const largest=Math.max(parseFloat(target.getComputedStyle(block).fontSize)||0,...otherSizes);
      size.style.setProperty('font-size',`${largest+2}px`,'important');
    });
    await Promise.race([Promise.all([...doc.images].map(img=>img.decode?.().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,700))]);
    await Promise.race([new Promise(resolve=>target.requestAnimationFrame(()=>resolve())),new Promise(resolve=>setTimeout(resolve,120))]);
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
    // Incrustar el PNG evita perder el logo al convertir el recibo a PDF.
    const originals=[...doc.body.querySelectorAll('img')];
    body.querySelectorAll('img').forEach((img,index)=>{
      const source=originals[index];if(!source?.naturalWidth)return;
      try{const canvas=doc.createElement('canvas');canvas.width=source.naturalWidth;canvas.height=source.naturalHeight;
        canvas.getContext('2d').drawImage(source,0,0);img.src=canvas.toDataURL('image/png');}catch(_){}
    });
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
    const doc=target.document;target.focus();
    const paper=await prepare(target,width);
    const control=doc.createElement('div');control.dataset.thermalPrintControl='';
    const readyLabel=/factura|comprobante|recibo/i.test(doc.title||'')?'Comprobante listo para imprimir':'Comanda lista para imprimir';
    control.innerHTML='<span>'+readyLabel+'</span><button type="button">Imprimir</button>';
    const style=doc.createElement('style');style.textContent='[data-thermal-print-control]{position:sticky;top:0;z-index:2147483646;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;background:#17191f;color:#fff;font:600 16px Arial,sans-serif}[data-thermal-print-control] button{border:0;border-radius:8px;padding:12px 24px;background:#e7b84b;color:#17191f;font:800 16px Arial,sans-serif;cursor:pointer}@media print{[data-thermal-print-control]{display:none!important}}';
    doc.head.append(style);doc.body.prepend(control);doc.body.dataset.thermalPrintReady='1';target.focus();
    return new Promise((resolve,reject)=>{
      let finished=false;
      const finish=()=>{if(finished)return;finished=true;resolve(paper);};
      target.addEventListener('beforeunload',finish,{once:true});
      control.querySelector('button').addEventListener('click',()=>{
        const button=control.querySelector('button');button.disabled=true;button.textContent='Abriendo impresión…';
        try{target.focus();target.print();finish();}catch(error){button.disabled=false;button.textContent='Imprimir';reject(error);}
      });
    });
  }
  window.DonPierosThermal={prepare,createPdf,print,sizeOption,sizeStyle};
})();
