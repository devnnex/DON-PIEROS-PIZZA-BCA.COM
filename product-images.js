(() => {
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function example(product={}) {
    const name=normalize(product.name),category=normalize(product.category);let photo='pizza-clasica';
    if(/panzerotti/.test(name))photo='panzerotti';
    else if(/lasana|bolonesa/.test(name))photo='lasana';
    else if(/cerveza|club colombia|aguila/.test(name))photo='cerveza';
    else if(/limonada/.test(name))photo='limonada';
    else if(/jugo|naranjada/.test(name))photo='jugo';
    else if(/gaseosa/.test(name)||category==='bebidas')photo='gaseosa';
    else if(/fruta|hawaiana|durazno|ciruela|loca/.test(name))photo='pizza-hawaiana';
    else if(/vegetal|verdura|campesina/.test(name))photo='pizza-vegetales';
    else if(/champinon|pamplonita/.test(name))photo='pizza-champinones';
    else if(/porcion/.test(category))photo='pizza-porcion';
    else if(/carne|peperoni|salami|mexicana|chorizo/.test(name))photo='pizza-carnes';
    return './images/ejemplos/'+photo+'.webp';
  }
  function hasOwn(product={}) {return Boolean(String(product.image_url||'').trim());}
  function resolve(product={}) {return hasOwn(product)?String(product.image_url).trim():example(product);}
  window.DonPierosImages=Object.freeze({example,resolve,hasOwn});
})();
