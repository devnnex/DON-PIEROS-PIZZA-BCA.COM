const fs=require('node:fs'),path=require('node:path');
const assets=[
 ['pizza-clasica','1692737580547-b45bb4a02356','https://unsplash.com/photos/xIqVfW8XUt4'],
 ['pizza-hawaiana','1671572580758-fd91620a1c6d','https://unsplash.com/s/photos/hawaiian-pizza'],
 ['pizza-carnes','1607929298871-fbdcf7e84852','https://unsplash.com/photos/x_QDFM3tzgA'],
 ['pizza-vegetales','1552539618-7eec9b4d1796','https://unsplash.com/photos/yDKHJxfiWDk'],
 ['pizza-champinones','1670952606267-f8389525e83b','https://unsplash.com/photos/FjyJ5D15j7c'],
 ['pizza-porcion','1578301807752-33631801f8aa','https://unsplash.com/photos/Iu2ViXjg014'],
 ['lasana','1709429790175-b02bb1b19207','https://unsplash.com/photos/flEUTTwGlJQ'],
 ['panzerotti','1641244999574-5afea228bd26','https://unsplash.com/photos/n8rriW9qMo4'],
 ['jugo','1600271886742-f049cd451bba','https://unsplash.com/photos/kkrXVKK-jhg'],
 ['limonada','1623084921164-4a8c5c37a912','https://unsplash.com/s/photos/lemonade'],
 ['cerveza','1583744513233-4721ae67a891','https://unsplash.com/photos/3egTNnU4nlw'],
 ['gaseosa','1636144832475-0d81f893354d','https://unsplash.com/photos/zJnhOqGDru0']
];
(async()=>{
 fs.mkdirSync('images/ejemplos',{recursive:true});
 await Promise.all(assets.map(async([name,id,page])=>{
  const url=`https://images.unsplash.com/photo-${id}?fm=webp&fit=crop&crop=entropy&w=800&h=700&q=78`;
  const response=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error(name+': HTTP '+response.status);
  const data=Buffer.from(await response.arrayBuffer());if(data.length<3000||!String(response.headers.get('content-type')).startsWith('image/'))throw Error(name+': imagen no válida');
  fs.writeFileSync(path.join('images/ejemplos',name+'.webp'),data);console.log(name+': '+Math.round(data.length/1024)+' KB');
 }));
 fs.writeFileSync('images/ejemplos/FUENTES.md','# Fotografías de referencia\n\nFotografías de ejemplo de Unsplash; no son fotografías del negocio. Se usan localmente como respaldo visual mientras el administrador carga sus fotos propias.\n\n'+assets.map(([name,id,page])=>`- ${name}.webp: [Fuente original](${page})`).join('\n')+'\n');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
