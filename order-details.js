((root,factory)=>{
  const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document){root.DonPierosOrderDetails=api;setInterval(()=>api.updateCountdowns(root.document),1000);root.addEventListener('focus',()=>api.updateCountdowns(root.document));for(const event of ['pointerdown','keydown'])root.addEventListener(event,()=>api.unlockClock(),{passive:true});}
})(globalThis,(root)=>{
  'use strict';
  let audioContext=null,clockInterval=0,clockUntil=0;
  function stopClock(){if(clockInterval)root.clearInterval(clockInterval);clockInterval=0;clockUntil=0;}
  function clockTick(){
    if(Date.now()>=clockUntil){stopClock();return;}
    if(audioContext?.state!=='running')return;
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime;
    oscillator.type='triangle';oscillator.frequency.value=Math.floor(Date.now()/500)%2?1100:800;
    gain.gain.setValueAtTime(0.0001,now);gain.gain.exponentialRampToValueAtTime(0.2,now+0.003);gain.gain.exponentialRampToValueAtTime(0.0001,now+0.07);
    oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(now);oscillator.stop(now+0.08);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  function unlockClock(){
    try{const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)return;if(!audioContext)audioContext=new Audio();if(audioContext.state==='suspended')void audioContext.resume().catch(()=>{});}catch(_){}
  }
  function syncClock(doc){
    const now=Date.now();let until=0;
    doc.querySelectorAll('[data-order-deadline]').forEach(node=>{const limit=Number(node.dataset.orderDeadline)||0;if(limit>0&&now>=limit&&now<limit+60000)until=Math.max(until,limit+60000);});
    if(!until){stopClock();return;}clockUntil=until;
    if(audioContext?.state==='running'&&!clockInterval){clockTick();clockInterval=root.setInterval(clockTick,500);}
  }
  function readTime(value){
    let time='',startedAt='';const notes=String(value||'').split(/\r?\n/).filter(line=>{let match=line.match(/^Tiempo estimado:[ \t]*(.*)$/i);if(match){time=match[1].trim();return false;}match=line.match(/^Tiempo asignado:[ \t]*(.*)$/i);if(match){startedAt=match[1].trim();return false;}return true;}).join('\n').trim();
    return {time,notes,startedAt};
  }
  function withTime(notes,time,startedAt){const old=readTime(notes),value=String(time||'').trim().replace(/[\r\n]+/g,' ');return [old.notes,value?`Tiempo estimado: ${value}`:'',value?`Tiempo asignado: ${startedAt||(old.time===value&&old.startedAt)||new Date().toISOString()}`:''].filter(Boolean).join('\n');}
  function durationMs(value){
    const text=String(value||'').toLowerCase().trim().replace(/,/g,'.');let minutes=0;
    for(const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(horas?|h|minutos?|min|m)\b/g))minutes+=Number(match[1])*(/^h/.test(match[2])?60:1);
    if(!minutes&&/^\d+(?:\.\d+)?$/.test(text))minutes=Number(text);
    return Number.isFinite(minutes)&&minutes>0?minutes*60000:0;
  }
  function deadline(notes,fallback){const info=readTime(notes),start=Date.parse(info.startedAt||fallback||''),duration=durationMs(info.time);return duration&&Number.isFinite(start)?start+duration:0;}
  function updateNode(node,now=Date.now()){
    const limit=Number(node.dataset.orderDeadline)||0,time=node.dataset.orderEstimate||'',overdue=limit>0&&now>=limit;
    node.classList.toggle('order-time-expired',overdue);
    const label=node.querySelector(':scope > .order-time-label');if(label){const next=`Tiempo estimado: ${time}${limit?overdue?' · Tiempo cumplido':` · Faltan ${Math.max(1,Math.ceil((limit-now)/60000))} min`:''}`;if(label.textContent!==next)label.textContent=next;}
  }
  function decorate(node,notes,fallback){
    if(!node)return;const info=readTime(notes);let label=node.querySelector(':scope > .order-time-label');
    if(!info.time){label?.remove();delete node.dataset.orderDeadline;delete node.dataset.orderEstimate;node.classList.remove('order-time-expired');return;}
    if(!label){label=node.ownerDocument.createElement('small');label.className='order-time-label';node.append(label);}
    node.dataset.orderDeadline=String(deadline(notes,fallback));node.dataset.orderEstimate=info.time;updateNode(node);
  }
  function updateArrival(node,now=Date.now()){node.classList.toggle('order-arrival-new',now<Number(node.dataset.orderArrivalUntil));}
  function decorateArrival(node,createdAt,enabled=true,duration=120000){
    if(!node)return;const start=Date.parse(createdAt||'');
    if(!enabled||!Number.isFinite(start)){delete node.dataset.orderArrivalUntil;node.classList.remove('order-arrival-new');return;}
    node.dataset.orderArrivalUntil=String(start+duration);updateArrival(node);
  }
  function updateCountdowns(doc){doc.querySelectorAll('[data-order-deadline]').forEach(node=>updateNode(node));doc.querySelectorAll('[data-order-arrival-until]').forEach(node=>updateArrival(node));syncClock(doc);}
  function sizeFirst(doc,selector,items=[]){
    doc.querySelectorAll(selector).forEach((block,index)=>{
      const name=block.querySelector('h3,div>strong,strong');if(!name)return;
      const options=[...block.querySelectorAll('.size-option')];
      for(const option of options){const line=doc.createElement('p');line.className='size-option';line.innerHTML=option.innerHTML;const list=option.parentElement;option.remove();name.before(line);if(list.tagName==='UL'&&!list.children.length)list.remove();}
      if(!options.length){const item=items[index]||{},saved=item.packagingSize||(/pizzeta/i.test(item.name||item.item_name||'')?'Pizzeta':''),fallback=/^(Mini|Mediana|Maxi|Super maxi|Pizzeta)$/i.test(saved)?saved:'';if(fallback){const line=doc.createElement('p'),size=doc.createElement('b');line.className='size-option';size.className='size-name';size.textContent=fallback;line.append('Tamaño: ',size);name.before(line);}}
    });
  }
  function prepareComanda(doc,selector,items,notes){
    sizeFirst(doc,selector,items);const info=readTime(notes),paragraph=doc.querySelector('.notes p');
    if(paragraph){paragraph.textContent=info.notes;if(!info.notes)paragraph.closest('.notes').remove();}
    else if(info.notes){const section=doc.createElement('section');section.className='notes';const title=doc.createElement('b'),text=doc.createElement('p');title.textContent='Observaciones';text.textContent=info.notes;section.append(title,text);doc.querySelector('header,.fulfillment,h2')?.after(section);}
    const first=doc.querySelector(selector),observations=doc.querySelector('.notes');
    if(first&&observations)first.before(observations);
    const style=doc.createElement('style');
    style.textContent='.comanda-underline{color:#000!important;font-weight:900!important;text-decoration-line:underline!important;text-decoration-color:#218653!important;text-decoration-thickness:2px!important;text-underline-offset:3px!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}';
    doc.head.append(style);
    const underline=node=>{const text=doc.createElement('span');text.className='comanda-underline';text.textContent=node.textContent;node.replaceChildren(text);};
    doc.querySelectorAll('.notes p,.line-notes').forEach(underline);
    doc.querySelectorAll('.fulfillment,p').forEach(node=>{if(/^Domicilio(?:\s|$|[·:])/i.test(node.textContent.trim()))underline(node);});
    doc.querySelectorAll(selector).forEach((block,index)=>{
      const item=items?.[index]||{},packing=root.DonPierosPackaging?.read(item.waiter_line_notes??item.notes);
      const fulfillment=item.waiter_options?.fulfillment||item.options?.fulfillment||item.fulfillment||packing?.fulfillment;
      if(fulfillment==='delivery'){
        const line=[...block.querySelectorAll('p')].find(node=>/^Domicilio(?:\s|$|[·:])/i.test(node.textContent.trim()))||doc.createElement('p');
        if(!line.textContent){line.textContent='Domicilio';underline(line);}
        block.querySelector('h3,div>strong,strong')?.after(line);
      }
    });
    if(info.time){const line=doc.createElement('p');line.className='estimated-print';line.textContent='Tiempo estimado: '+info.time;doc.querySelector('header,.fulfillment,h2')?.after(line);}
  }
  function sizeParts(labels=[],fallback=''){
    const sizes=[],others=[];
    for(const label of labels)(/^(?:Elige\s+(?:el\s+)?)?Tama[ñn]o\s*:/i.test(String(label))?sizes:others).push(String(label));
    if(!sizes.length&&fallback)sizes.push('Tamaño: '+fallback);
    return {sizes,others};
  }
  function groupComandaItems(items=[]){
    const nameKey=value=>String(value||'').trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const rows=(items||[]).map(item=>{
      const packing=root.DonPierosPackaging?.read(item.waiter_line_notes??item.notes??item.packing?.notes)||{notes:item.waiter_line_notes??item.notes??item.packing?.notes??''};
      const name=String(item.item_name||item.name||item.product||'Producto').trim();
      const labels=(item.waiter_options?.labels||item.options?.labels||item.selections||[]).filter(label=>!['Para llevar','Domicilio','En el local','Para comer en el local'].includes(String(label)));
      const fulfillment=item.waiter_options?.fulfillment||item.options?.fulfillment||item.fulfillment||packing.fulfillment||'';
      const signature=JSON.stringify([nameKey(name),labels,fulfillment,item.packagingSize||packing.size||'',Number(item.unit_price??item.unitPrice)||0]);
      return {item,name,notes:String(packing.notes||''),signature};
    });
    const namesWithNotes=new Set(rows.filter(row=>row.notes).map(row=>nameKey(row.name)));
    const grouped=[],bySignature=new Map();
    rows.forEach(row=>{
      const key=nameKey(row.name);
      if(row.notes||namesWithNotes.has(key)){grouped.push(row.item);return;}
      const existing=bySignature.get(row.signature);
      if(existing)existing.quantity=(Number(existing.quantity)||0)+(Number(row.item.quantity)||0);
      else{const copy={...row.item};grouped.push(copy);bySignature.set(row.signature,copy);}
    });
    return grouped;
  }
  function completeTableItems(session,comandas=[]){
    if(!session||session.status!=='open')return [];
    const items=[...new Map((session.session_items||[]).filter(item=>item.status!=='cancelled'&&Number(item.quantity)>0).map(item=>[item.id,{...item,pending:false}])).values()];
    const consumed=new Set(items.map(item=>item.waiter_comanda_id).filter(Boolean));
    for(const order of comandas){
      if(order.session_id!==session.id||order.table_id!==session.table_id||order.accepted_at||consumed.has(order.id))continue;
      for(const item of order.items||[])if(item.status!=='cancelled'&&Number(item.quantity)>0)items.push({...item,pending:true});
    }
    return items;
  }
  return {readTime,withTime,sizeParts,durationMs,deadline,decorate,decorateArrival,updateCountdowns,unlockClock,sizeFirst,prepareComanda,groupComandaItems,completeTableItems};
});
