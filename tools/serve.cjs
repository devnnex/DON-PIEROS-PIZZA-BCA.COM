const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.PORT)||4173;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)||/\/(?:supabase|appscript|tests|tools|node_modules)\//.test(pathname)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end('No encontrado');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);});
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
