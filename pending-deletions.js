(() => {
  'use strict';
  if(document.body.dataset.page!=='admin')return;
  const config=window.DON_PIEROS_CONFIG||{};
  const prefix='dp_deletions_v1:'+encodeURIComponent(config.appsScriptUrl+'|'+config.supabaseUrl)+':';
  const handlers=new Map(),running=new Set();
  const owner=()=>window.DonPierosAdmin?.getUser()?.id||'';
  const keyFor=(user,kind,id)=>prefix+encodeURIComponent(user)+':'+kind+':'+encodeURIComponent(id);
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}};
  function list(kind){
    const user=owner();if(!user)return [];
    const keys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix+encodeURIComponent(user)+':'))keys.push(key);}
    return keys.map(key=>({key,...read(key)})).filter(row=>row.id&&(!kind||row.kind===kind));
  }
  function changed(record){
    if(record.owner===owner())window.dispatchEvent(new CustomEvent('donpieros-deletions-change',{detail:record}));
  }
  function write(key,record){
    // Persist before hiding anything. Pending records have no expiry and survive
    // reloads, connection loss and a browser restart; no auth token is stored.
    localStorage.setItem(key,JSON.stringify(record));changed(record);return record;
  }
  function enqueue(kind,id,payload){
    const user=owner();if(!user)throw Error('Inicia sesión para retirar el pedido.');
    const key=keyFor(user,kind,id),previous=read(key);
    if(previous?.state==='pending')return previous;
    const record=write(key,{owner:user,kind,id,payload,state:'pending',attempts:0,nextAt:0,createdAt:Date.now()});
    setTimeout(tick,0);return record;
  }
  function hidden(kind,id,version=0){
    const user=owner();if(!user)return false;
    const record=read(keyFor(user,kind,id));if(!record)return false;
    if(record.state==='pending')return true;
    if(kind==='waiter-comanda'&&Number(version)>Number(record.confirmedVersion||0))return false;
    return Date.now()-record.completedAt<86400000;
  }
  async function process(record){
    const key=record.key,handler=handlers.get(record.kind);running.add(key);
    try{
      const result=await handler(record.payload,patch=>{
        const current=read(key);if(!current||current.state!=='pending')return;
        record=write(key,{...current,payload:{...current.payload,...patch}});
      });
      const current=read(key);
      if(current?.state==='pending')write(key,{...current,state:'done',confirmedVersion:result?.version||0,completedAt:Date.now()});
    }catch(_){
      const current=read(key);
      if(current?.state==='pending'){
        const attempts=(current.attempts||0)+1;
        try{write(key,{...current,attempts,nextAt:Date.now()+Math.min(30000,1000*2**Math.min(attempts-1,5))});}catch(_){}
      }
    }finally{running.delete(key);}
  }
  function tick(){
    if(!owner()||!window.DonPierosAdmin?.getToken()||navigator.onLine===false)return;
    for(const record of list()){
      if(record.state==='done'){
        if(Date.now()-record.completedAt>86400000)localStorage.removeItem(record.key);
        continue;
      }
      if(running.size>=2)break;
      if(record.nextAt<=Date.now()&&!running.has(record.key)&&handlers.has(record.kind))void process(record);
    }
  }
  window.DonPierosDeletions={enqueue,hidden,list,pending:(kind,id)=>read(keyFor(owner(),kind,id))?.state==='pending',register(kind,handler){handlers.set(kind,handler);setTimeout(tick,0);},tick};
  setInterval(tick,1000);
  for(const event of ['online','focus','donpieros-session-change'])window.addEventListener(event,tick);
  window.addEventListener('storage',event=>{
    if(!event.key?.startsWith(prefix))return;
    const record=read(event.key);if(record)changed(record);tick();
  });
})();
