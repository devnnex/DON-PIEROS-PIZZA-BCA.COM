((root,factory)=>{
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document)root.DonPierosIndividualSync=api;
})(globalThis,()=>{
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const content=session=>{const value=copy(session);delete value.shared_version;delete value.individual_number;return JSON.stringify(value);};
  function create({storage,key,rpc,changed,notify,canSync=()=>true}){
    let pending={};try{pending=JSON.parse(storage.getItem(key)||'{}');}catch(_){}
    const versions=new Map(),confirmed=new Map(),latest=new Map(),jobs=new Map(),conflicts=new Map(Object.entries(pending).filter(([,op])=>op.conflict).map(([id,op])=>[id,op.conflict]));
    let timer=null;
    const persist=()=>storage.setItem(key,JSON.stringify(pending));
    function queue(session,kind='save'){
      if(session.web_order_id||(!session.session_items?.length&&kind==='save'))return;
      const current=pending[session.id];
      if(kind==='save'&&(current?.kind===kind&&content(current.session)===content(session)||!current&&confirmed.get(session.id)===content(session)))return;
      // Keep the operation ID across network retries, but give a changed draft its own ID.
      pending[session.id]={session:copy(session),kind,operationId:globalThis.crypto.randomUUID(),version:current?.version??versions.get(session.id)??session.shared_version??0};
      persist();schedule();
    }
    function schedule(delay=400){if(timer||!canSync())return;timer=setTimeout(()=>{timer=null;void flush().catch(()=>{});},delay);timer.unref?.();}
    async function send(id){
      if(jobs.has(id)){await jobs.get(id);if(pending[id])return send(id);return;}
      if(conflicts.has(id))throw Error('Esta venta cambió en otro equipo. Revisa la comanda antes de continuar.');
      const job=(async()=>{
        while(pending[id]){
          const operation=pending[id];
          const {data,error}=await rpc('dp_save_individual_sale',{p_id:id,p_operation_id:operation.operationId,p_version:operation.version,p_action:operation.kind,p_session:operation.session});
          if(error)throw Error(error.message||String(error));
          if(!data?.ok){if(data?.conflict){operation.conflict=data.current||{};conflicts.set(id,operation.conflict);persist();}throw Error(data?.error||'La comanda cambió en otro equipo.');}
          versions.set(id,data.version);
          latest.set(id,{...data,id,session:operation.session,at:Date.now()});
          if(pending[id]===operation){delete pending[id];if(operation.kind==='save')confirmed.set(id,content({...operation.session,individual_number:data.number}));}
          else {pending[id].version=data.version;pending[id].session.individual_number=data.number;}
          persist();changed?.(id,data,operation.session);
        }
      })();
      jobs.set(id,job);
      try{await job;}finally{jobs.delete(id);}
    }
    async function flush(id){
      if(!canSync())throw Error('Se necesita conexión para confirmar la comanda compartida.');
      try{if(id)await send(id);else await Promise.all(Object.keys(pending).map(send));}
      catch(error){notify?.(error.message);if(Object.keys(pending).some(id=>!conflicts.has(id)))schedule(5000);throw error;}
    }
    function reconcile(entries,local=[],{readStartedAt=0}={}){
      if(!Array.isArray(entries))return local;
      const rows=new Map(),remote=new Map(entries.map(row=>[row.id,row]));
      for(const [id,saved] of latest)if((remote.has(id)&&remote.get(id).version<saved.version)||(!remote.has(id)&&readStartedAt&&saved.at>=readStartedAt))remote.set(id,saved);
      for(const entry of remote.values()){
        versions.set(entry.id,entry.version);
        latest.set(entry.id,entry);
        if(entry.status==='open'){
          const session={...entry.session,id:entry.id,individual_number:entry.number,shared_version:entry.version,local_only:true};
          confirmed.set(entry.id,content(session));rows.set(entry.id,session);
        }
      }
      for(const session of local){
        if(session.web_order_id)continue;
        // La carta puede estar abierta antes de agregar el primer producto.
        if(!remote.has(session.id)&&!session.shared_version&&!session.session_items?.length){rows.set(session.id,session);continue;}
        // Migrate older browser-only sales, while respecting server tombstones.
        if(!remote.has(session.id)&&!session.shared_version&&!pending[session.id])queue(session);
      }
      for(const [id,operation] of Object.entries(pending)){
        if(operation.kind==='save')rows.set(id,operation.session);else rows.delete(id);
      }
      schedule();return [...rows.values()];
    }
    async function close(session,operationId){
      await flush(session.id);
      if(confirmed.has(session.id)&&confirmed.get(session.id)!==content(session))throw Error('La comanda cambió. Ábrela de nuevo antes de cobrar.');
      const {data,error}=await rpc('dp_save_individual_sale',{p_id:session.id,p_operation_id:operationId,p_version:versions.get(session.id)??session.shared_version??0,p_action:'close',p_session:session});
      if(error||!data?.ok)throw Error(error?.message||data?.error||'No se pudo confirmar el cobro compartido.');
      versions.set(session.id,data.version);latest.set(session.id,{...data,id:session.id,session,at:Date.now()});changed?.(session.id,data,session);return data;
    }
    function resolveConflict(id){const row=conflicts.get(id);if(!row)return null;delete pending[id];conflicts.delete(id);persist();return row.status==='open'?{...row.session,shared_version:row.version,individual_number:row.number}:null;}
    return {queue,flush,reconcile,close,getConflict:id=>conflicts.get(id),resolveConflict,hasPending:id=>!!pending[id],version:id=>versions.get(id)};
  }
  return {create};
});
