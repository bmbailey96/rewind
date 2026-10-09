(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StorageModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const refreshable=new Set(['cast','images','videos','translations','production_companies','production_countries','spoken_languages','watchmodeCache','storePriceCache','oracle','discoveryFit','profileFit']);
 function compact(value,key=''){
  if(Array.isArray(value)){if(key==='crew')return value.filter(c=>['Director','Writer','Screenplay','Story'].includes(c.job)).map(c=>({id:c.id,name:c.name,job:c.job}));return value.map(v=>compact(v));}
  if(!value||typeof value!=='object')return value;
  const out={};for(const [k,v] of Object.entries(value)){if(refreshable.has(k))continue;if(k==='meta'){out.meta={};for(const field of ['id','title','release_date','runtime','overview','genres','genre_ids','keywords','credits','poster_path','backdrop_path','release_dates'])if(v?.[field]!=null)out.meta[field]=compact(v[field],field);}else out[k]=compact(v,k);}return out;
 }
 const keys=['rewind-watchlist-v1','rewind-hub-v1','rewind-sync-base-v1'];
 function migrate(storage){for(const key of keys){const text=storage.getItem(key);if(!text)continue;try{const small=JSON.stringify(compact(JSON.parse(text)));if(small.length<text.length)storage.setItem(key,small);}catch{ /* Existing saved data remains available if migration cannot write. */ }}}
 function save(storage,key,value){const small=compact(value);try{storage.setItem(key,JSON.stringify(small));return true;}catch(error){if(error.name!=='QuotaExceededError'&&error.name!=='NS_ERROR_DOM_QUOTA_REACHED')throw error;migrate(storage);try{storage.setItem(key,JSON.stringify(small));return true;}catch{return false;}}}
 return {compact,migrate,save};
});
