/* Presentación de fechas del negocio. No cambia valores guardados ni filtros. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else{
    root.DonPierosDates=factory();
    const enhance=()=>{
      const nativeValue=Object.getOwnPropertyDescriptor(root.HTMLInputElement.prototype,'value');
      root.document.querySelectorAll('input[type="date"],input[type="datetime-local"]').forEach(input=>{
        if(input.dataset.prettyDate)return;
        input.dataset.prettyDate='1';
        const wrapper=root.document.createElement('span'),label=root.document.createElement('span');
        wrapper.className='dp-date-control';label.className='dp-date-label';label.setAttribute('aria-hidden','true');
        input.before(wrapper);wrapper.append(input,label);
        const render=()=>{
          const raw=nativeValue.get.call(input);
          const text=raw?(input.type==='date'?root.DonPierosDates.date(raw):root.DonPierosDates.dateTime(raw)):'Elige una fecha';
          label.textContent=text;input.title=text;input.setAttribute('aria-description',text);
        };
        // Only the presentation follows changes; the native field, its ISO value
        // and its calendar remain available for keyboard entry and filtering.
        Object.defineProperty(input,'value',{configurable:true,get(){return nativeValue.get.call(this);},set(value){nativeValue.set.call(this,value);render();}});
        input.addEventListener('input',render);input.addEventListener('change',render);
        input.form?.addEventListener('reset',()=>queueMicrotask(render));render();
      });
    };
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const zone='America/Bogota',formatters=new Map();
  function formatter(timeZone,time=false){
    const key=timeZone+':'+time;
    if(!formatters.has(key))formatters.set(key,new Intl.DateTimeFormat(time?'en-US':'es-CO',time
      ?{timeZone,hour:'numeric',minute:'2-digit',hour12:true}
      :{timeZone,weekday:'short',day:'numeric',month:'short',year:'numeric'}));
    return formatters.get(key);
  }
  function read(value){
    if(value==null||value==='')return null;
    const dateOnly=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
    const localDateTime=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value);
    const result=new Date(dateOnly?value+'T12:00:00-05:00':localDateTime?value+'-05:00':value);
    if(!Number.isFinite(result.getTime()))return null;
    if(dateOnly){
      const parts=Object.fromEntries(formatter(zone).formatToParts(result).map(part=>[part.type,part.value]));
      const months=['ene','feb','mar','abr','may','jun','jul','ago','sept','oct','nov','dic'];
      if(parts.year!==value.slice(0,4)||Number(parts.day)!==Number(value.slice(8))||months.indexOf(parts.month.replace(/\./g,''))+1!==Number(value.slice(5,7)))return null;
    }
    return result;
  }
  function date(value,timeZone=zone){
    const parsed=read(value);if(!parsed)return 'Sin fecha';
    const parts=Object.fromEntries(formatter(timeZone).formatToParts(parsed).map(part=>[part.type,part.value]));
    const weekday=parts.weekday.replace(/\./g,'');
    return `${weekday.charAt(0).toUpperCase()+weekday.slice(1)} ${parts.day} ${parts.month.replace(/\./g,'')} ${parts.year}`;
  }
  function time(value,timeZone=zone){
    const parsed=read(value);if(!parsed)return 'Sin hora';
    const parts=Object.fromEntries(formatter(timeZone,true).formatToParts(parsed).map(part=>[part.type,part.value]));
    return `${parts.hour}:${parts.minute} ${parts.dayPeriod.toUpperCase()}`;
  }
  function dateTime(value,timeZone=zone){return read(value)?`${date(value,timeZone)} - ${time(value,timeZone)}`:'Sin fecha';}
  return Object.freeze({date,time,dateTime,zone});
});
