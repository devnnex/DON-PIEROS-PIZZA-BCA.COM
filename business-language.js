(() => {
  'use strict';
  const technical=/supabase|postgrest|\bpgrst\w*|apps?\s*script|google\s*sheets|\bsheets\b|\bindexeddb\b|\blocalstorage\b|\bjson\b|\bsql\b|\brpc\b|\bbackend\b|\bfrontend\b|\bstorage\b|\burl\b|anon[_ -]?key|apikey|\bjwt\b|\bapi\s*key\b|https?:\/\/|script\.google|\/rest\/v1\/|\/storage\/v1\/|\b(?:config|app)\.js\b|\bcode\.gs\b|row.level.security|violates.*constraint|duplicate key|column .*does not exist|relation .*does not exist|schema cache|unexpected token|syntaxerror|typeerror|referenceerror|failed to fetch|networkerror|network request failed/i;
  function message(value,fallback='No pudimos completar la operación. Actualiza e inténtalo de nuevo.') {
    const text=String(value?.message ?? value ?? '').trim();
    if(!text)return fallback;
    if(!technical.test(text))return text;
    if(/failed to fetch|networkerror|network request failed|load failed|timeout|aborterror/i.test(text))return 'No pudimos conectar. Revisa internet y vuelve a intentarlo.';
    if(/sesion|sesión|jwt|token.*expir/i.test(text))return 'No pudimos verificar tu sesión. Vuelve a iniciar sesión.';
    if(/configur|implementa|conecta|actualiza|migration|migraci[oó]n|function.*not exist|pgrst202|schema cache/i.test(text))return 'Esta función necesita revisión. Contacta al responsable del negocio.';
    return fallback;
  }
  window.DonPierosLanguage=Object.freeze({message});
})();
