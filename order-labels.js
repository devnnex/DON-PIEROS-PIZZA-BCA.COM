((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root.document)root.DonPierosOrderLabels=api;})(globalThis,()=>{
  'use strict';
  function compact(labels=[]){
    const result=[],flavors=[];let flavorPosition=-1;
    for(const raw of labels){
      const label=String(raw||'').trim().replace(/^(?:Elige\s+(?:el\s+)?)?Tama[ñn]o\s*:/i,'Tamaño:');if(!label)continue;
      const match=label.match(/^(?:elige\s+2\s+sabores(?:\s*\(mitad\s+y\s+mitad\))?|sabores\s*\(mitad\s+y\s+mitad\)|sabor(?:es)?\s+pizza\s+combinada)\s*:\s*(.+)$/i);
      if(match){if(flavorPosition<0){flavorPosition=result.length;result.push('');}for(const name of match[1].split(' / '))if(!flavors.includes(name.trim()))flavors.push(name.trim());}
      else if(!result.includes(label))result.push(label);
    }
    if(flavorPosition>=0)result[flavorPosition]='Sabores (mitad y mitad): '+flavors.join(' / ');
    return result;
  }
  return {compact};
});
