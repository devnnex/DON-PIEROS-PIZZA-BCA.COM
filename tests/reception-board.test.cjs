const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function board(saved={}){
 const storage=new Map(Object.entries(saved)),nodes=new Map();
 for(const id of ['receptionSearch','receptionSource','receptionStage','receptionSort','receptionReset'])nodes.set(id,{value:'',listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}});
 const window={dispatchEvent(){}},context=vm.createContext({window,document:{body:{dataset:{page:'admin'}},getElementById:id=>nodes.get(id),querySelector:()=>null},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},Event:class{}});
 vm.runInContext(fs.readFileSync(require.resolve('../reception-board.js'),'utf8'),context);
 return {api:window.DonPierosReceptionBoard,nodes,storage};
}
test('recepcion muestra primero las nuevas llegadas y editar o aceptar mesas no cambia el orden',()=>{
 const {api,nodes,storage}=board({'dp-reception-filters':JSON.stringify({sort:'oldest'})});
 const old={id:'old',created_at:'2026-10-31T19:00:00Z',updated_at:'2026-10-31T22:00:00Z',accepted_at:'2026-10-31T22:00:00Z'},recent={id:'recent',createdAt:'2026-10-31T15:00:00-05:00'};
 assert.equal(api.getState().sort,'newest','Migra el valor antiguo al nuevo orden predeterminado.');
 assert.deepEqual([old,recent].sort(api.compare).map(row=>row.id),['recent','old']);
 nodes.get('receptionSort').value='oldest';nodes.get('receptionSort').listeners.change();
 assert.deepEqual([recent,old].sort(api.compare).map(row=>row.id),['old','recent']);
 assert.equal(board(Object.fromEntries(storage)).api.getState().sort,'oldest','Conserva una eleccion explicita al recargar.');
 nodes.get('receptionReset').listeners.click();assert.equal(api.getState().sort,'newest');
 const a={id:'a',createdAt:recent.createdAt,sequence:2},b={id:'b',createdAt:recent.createdAt,sequence:3};
 assert.deepEqual([a,b].sort(api.compare).map(row=>row.sequence),[3,2],'El turno resuelve llegadas en el mismo instante.');
});
