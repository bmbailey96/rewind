(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StorageModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const refreshable=new Set(['cast','images','videos','translations','production_countries','spoken_languages','watchmodeCache','storePriceCache','oracle','discoveryFit','profileFit']);
 function compact(value,key=''){
  if(key==='production_companies')return (Array.isArray(value)?value:[]).filter(c=>Number.isFinite(c.id)).map(c=>({id:c.id,name:c.name}));
  if(key==='release_dates'&&value?.results)return {results:value.results.map(country=>({iso_3166_1:country.iso_3166_1,release_dates:(country.release_dates||[]).map(r=>({type:r.type,release_date:r.release_date}))}))};
  if(Array.isArray(value)){if(key==='crew')return value.filter(c=>['Director','Writer','Screenplay','Story'].includes(c.job)).map(c=>({id:c.id,name:c.name,job:c.job}));return value.map(v=>compact(v));}
  if(!value||typeof value!=='object')return value;
  const out={};for(const [k,v] of Object.entries(value)){if(refreshable.has(k))continue;if(k==='release_dates'&&v?.results){out[k]={results:v.results.map(country=>({iso_3166_1:country.iso_3166_1,release_dates:(country.release_dates||[]).map(r=>({type:r.type,release_date:r.release_date}))}))};}else if(k==='meta'||k==='detailsSnapshot'){ out[k]={};for(const field of ['id','title','release_date','runtime','overview','genres','genre_ids','keywords','credits','poster_path','backdrop_path','release_dates','production_companies'])if(v?.[field]!=null)out[k][field]=compact(v[field],field);}else out[k]=compact(v,k);}return out;
 }
 const failures=new Map();
 const failure=key=>failures.get(key)||null;
 const keys=['rewind-watchlist-v1','rewind-hub-v1','rewind-sync-base-v1'];
 const prefix='rwz1:';
 // Bounded LZW over UTF-8 bytes. Local storage counts UTF-16 units; one code per
 // phrase keeps repeated catalog fields small without dropping personal records.
 function encode(text){
  const bytes=unescape(encodeURIComponent(text)),dictionary=new Map();let next=256,phrase='',codes=[];
  for(const char of bytes){const joined=phrase+char;if(phrase===''||dictionary.has(joined)){phrase=joined;continue;}codes.push(phrase.length===1?phrase.charCodeAt(0):dictionary.get(phrase));if(next<65535)dictionary.set(joined,next++);phrase=char;}
  if(phrase)codes.push(phrase.length===1?phrase.charCodeAt(0):dictionary.get(phrase));let packed=prefix;for(let i=0;i<codes.length;i+=8192)packed+=String.fromCharCode(...codes.slice(i,i+8192));return packed.length<text.length?packed:text;
 }
 function decode(text){
  if(!text.startsWith(prefix))return text;const codes=text.slice(prefix.length),dictionary=Array.from({length:256},(_,i)=>String.fromCharCode(i));if(!codes)return '';let next=256,previous=dictionary[codes.charCodeAt(0)];if(previous===undefined)throw Error('Invalid saved record');const parts=[previous];
  for(let i=1;i<codes.length;i++){const code=codes.charCodeAt(i),entry=dictionary[code]??(code===next?previous+previous[0]:undefined);if(entry===undefined)throw Error('Invalid saved record');parts.push(entry);if(next<65535)dictionary[next++]=previous+entry[0];previous=entry;}return decodeURIComponent(escape(parts.join('')));
 }
 function read(storage,key,fallback=null){const text=storage.getItem(key);return text?JSON.parse(decode(text)):fallback;}
 function migrate(storage,compress=false){for(const key of keys){try{const text=storage.getItem(key);if(!text||!compress&&text.startsWith(prefix))continue;const small=JSON.stringify(compact(JSON.parse(decode(text)))),value=compress||text.startsWith(prefix)||small.length>=100000?encode(small):small;if(value.length<text.length)storage.setItem(key,value);}catch{ /* Keep the existing record if storage is blocked or a write fails. */ }}}
 function save(storage,key,value){
  try{const small=JSON.stringify(compact(value));
   try{const previous=storage.getItem(key)||'';storage.setItem(key,previous.startsWith(prefix)||small.length>=100000?encode(small):small);failures.delete(key);return true;}
   catch(error){if(error.name!=='QuotaExceededError'&&error.name!=='NS_ERROR_DOM_QUOTA_REACHED')throw error;migrate(storage,true);storage.setItem(key,encode(small));failures.delete(key);return true;}
  }catch(error){failures.set(key,error.name||'StorageError');return false;}
 }
 function syncContent(value){const text=JSON.stringify(value);return text.length<500000?text:JSON.stringify({format:'rewind-packed-v1',payload:encode(text)});}
 function parseSync(text){const value=JSON.parse(text);if(value?.format!=='rewind-packed-v1')return value;if(typeof value.payload!=='string')throw Error('Invalid sync payload');return JSON.parse(decode(value.payload));}
 return {failure,compact,migrate,save,read,encode,decode,syncContent,parseSync};
});
