(() => {
  'use strict';
  if(document.body.dataset.page!=='admin')return;
  const $=id=>document.getElementById(id),normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let state={query:'',source:'all',stage:'all',sort:'newest'};
  try{Object.assign(state,JSON.parse(sessionStorage.getItem('dp-reception-filters-v2')||'{}'));}catch(_){}
  const fields={query:'receptionSearch',source:'receptionSource',stage:'receptionStage',sort:'receptionSort'};
  function matches(source,record){
    if(state.source!=='all'&&state.source!==source)return false;
    const stage=source==='online'||record.source==='staff_walk_in'?({nueva:'pending',atendiendo:'preparing',lista:'ready'}[record.status]||'pending'):source==='table'?(record.accepted_at?'preparing':'pending'):'pending';
    if(state.stage!=='all'&&stage!==state.stage)return false;
    const text=[record.customerName,record.payer_name,record.phone,record.id,record.individual_number,record.waiterName,record.waiter_name,record.notes,record.message,record.table?.table_name,record.table?.table_number,record.restaurant_tables?.table_name,record.restaurant_tables?.table_number,...(record.items||record.session_items||[]).map(line=>[line.name||line.item_name,line.notes,...(line.selections||[]),...(line.waiter_options?.labels||[])].join(' '))].join(' ');
    return normalize(text).includes(normalize(state.query).trim());
  }
  function compare(a,b){const date=row=>Date.parse(row.createdAt||row.created_at||row.opened_at||'')||0,direction=state.sort==='newest'?-1:1;return direction*(date(a)-date(b)||(Number(a.sequence)||0)-(Number(b.sequence)||0))||String(a.id).localeCompare(String(b.id));}
  function refresh(){
    for(const [id,source] of [['dp-dashboard-orders','online'],['dp-table-comandas','table'],['individualSalesPanel','individual'],['alertsPanel','requests'],['requestsHeading','requests']]){
      const node=$(id);if(node)node.classList.toggle('reception-filter-hidden',state.source!=='all'&&state.source!==source);
    }
    const tables=$('tablesGrid');if(tables)tables.classList.toggle('reception-filter-hidden',!['all','table'].includes(state.source));
    const tablesPanel=document.querySelector('.dashboard-tables-panel');if(tablesPanel){tablesPanel.classList.toggle('reception-filter-hidden',!['all','table','individual'].includes(state.source));tablesPanel.querySelector('.section-head')?.classList.toggle('reception-filter-hidden',state.source==='individual');}
    try{sessionStorage.setItem('dp-reception-filters-v2',JSON.stringify(state));}catch(_){}
    window.DonPierosAdmin?.refreshReception?.();window.dispatchEvent(new Event('donpieros-reception-filter'));
  }
  for(const [key,id] of Object.entries(fields)){const node=$(id);if(!node)continue;node.value=state[key];node.addEventListener(key==='query'?'input':'change',()=>{state[key]=node.value;refresh();});}
  $('receptionReset')?.addEventListener('click',()=>{state={query:'',source:'all',stage:'all',sort:'newest'};for(const [key,id] of Object.entries(fields))$(id).value=state[key];refresh();});
  window.DonPierosReceptionBoard={matches,compare,getState:()=>({...state})};refresh();
})();
