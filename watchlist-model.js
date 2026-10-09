(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WatchlistModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function addedAt(row){const date=row.addedDate||row.Date||row['Added Date'];return /^\d{4}-\d{2}-\d{2}$/.test(date||'')?Date.parse(date+'T12:00:00Z'):null;}
 function recent(film,now=Date.now()){const d=new Date(now);d.setUTCMonth(d.getUTCMonth()-6);return !!film.addedAt&&film.addedAt>=d.getTime();}
 function merge(existing,films){const byId=new Map(existing.map(f=>[f.id,f]));for(const f of films)if(f.id&&!byId.has(f.id))byId.set(f.id,{...f,addedAt:addedAt(f),importedAt:Date.now(),pinned:false,manualNote:'',lastStatusCode:null,lastStatusLabel:null,statusChangedAt:null});return [...byId.values()];}
 return {addedAt,recent,merge};
});
