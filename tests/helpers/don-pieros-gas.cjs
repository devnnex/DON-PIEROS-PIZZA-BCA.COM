const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
function harness(options={}){
 const sheets=new Map(),props=new Map(),cache=new Map(),reads=[];let locked=false;
 class Range{
  constructor(sheet,row,col,rows=1,cols=1){Object.assign(this,{sheet,row,col,rows,cols});}
  getValues(){reads.push({sheet:this.sheet.name,row:this.row,rows:this.rows,cols:this.cols});return Array.from({length:this.rows},(_,r)=>Array.from({length:this.cols},(_,c)=>this.sheet.rows[this.row+r-1]?.[this.col+c-1]??''));}
  getDisplayValues(){return this.getValues().map(row=>row.map(String));}
  getValue(){return this.getValues()[0][0];}
  setValues(values){values.forEach((row,r)=>row.forEach((value,c)=>{this.sheet.rows[this.row+r-1]??=[];this.sheet.rows[this.row+r-1][this.col+c-1]=value;}));return this;}
  setValue(v){return this.setValues([[v]]);}
  clearContent(){return this.setValues(Array.from({length:this.rows},()=>Array(this.cols).fill('')));}
  createTextFinder(value){const range=this;const finder={matchEntireCell(){return finder;},findNext(){for(let r=0;r<range.rows;r++)for(let c=0;c<range.cols;c++)if(String(range.sheet.rows[range.row+r-1]?.[range.col+c-1]??'')===String(value))return {getRow:()=>range.row+r};return null;}};return finder;}
  setFontWeight(){return this;}setBackground(){return this;}setFontColor(){return this;}
 }
 class Sheet{
  constructor(name){this.name=name;this.rows=[];}
  getName(){return this.name;}getLastRow(){return this.rows.length;}getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));}
  getMaxColumns(){return Math.max(26,this.getLastColumn());}insertColumnsAfter(){}
  getRange(...args){return new Range(this,...args);}getDataRange(){return new Range(this,1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()));}
  setFrozenRows(){}autoResizeColumns(){}appendRow(row){this.rows.push([...row]);}deleteRow(n){this.rows.splice(n-1,1);}
 }
 const book={getId:()=> '1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E',getUrl:()=> 'https://docs.google.com/spreadsheets/d/test',getSheetByName:name=>sheets.get(name),insertSheet:name=>{const sheet=new Sheet(name);sheets.set(name,sheet);return sheet;},setSpreadsheetTimeZone(){}};
 const properties={getProperty:key=>props.get(key)||null,setProperty:(key,value)=>{props.set(key,String(value));return properties;},deleteProperty:key=>props.delete(key)};
 const context=vm.createContext({console,Date,Math,Number,Array,Object,JSON,String,Boolean,Map,Set,isFinite,
  SpreadsheetApp:{openById:id=>{if(id!==book.getId())throw Error('Wrong spreadsheet');return book;},flush(){}},
  PropertiesService:{getScriptProperties:()=>properties},
  CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,v)=>cache.set(key,v),remove:key=>cache.delete(key)})},
  LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},waitLock:()=>{if(locked)throw Error('Busy');locked=true;},releaseLock:()=>{locked=false;}})},
  Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:()=> '20261027',computeDigest:(_,value)=>[...crypto.createHash('sha256').update(String(value)).digest()],DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1}},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({value,setMimeType(){return this;}})},
  Session:{getScriptTimeZone:()=> 'America/Bogota'},
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../../appscript/Code.gs'),'utf8'),context);
 // Test only the integration's access rules, without external account requests.
 context.validateSupabaseUser_=token=>{if(token==='boss')return{id:'boss-id',full_name:'Jefe',role:'boss'};if(token==='waiter')return{id:'waiter-id',full_name:'Mesero',role:'waiter'};if(token==='limited')return{id:'limited-id',role:'admin',permissions:['income']};throw Error('Sesión requerida.');};
 const call=(action,payload={},token='boss')=>JSON.parse(JSON.stringify(context.apiRequest(JSON.stringify({action,payload,authToken:token,origin:'http://localhost:5500'}))));
 if(!options.seedMenu)props.set('DP_INITIAL_MENU_LOADED','1');
 context.ensureSystemReady_();
 const save=(kind,item)=>{const result=call('dp_save_catalog',{kind,item});if(!result.ok)throw Error(result.error);return result.item;};
 const product=()=>save('products',{name:'Pizza prueba',category:'Pizzas',price:25000,available:true,modifiers:[]});
 const order=(p,overrides={})=>({requestId:crypto.randomUUID(),customerName:'Cliente prueba',phone:'3102241444',fulfillment:'pickup',paymentId:'efectivo',subtotal:25000,deliveryFee:0,items:[{productId:p.id,quantity:1,unitPrice:p.price,selectionIds:{}}],...overrides});
 return {context,sheets,props,cache,reads,call,save,product,order,book};
}
module.exports={harness};
