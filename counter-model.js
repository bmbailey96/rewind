(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./release-model'));else root.CounterModel=factory(root.ReleaseModel);})(typeof globalThis!=='undefined'?globalThis:this,function(Release){
 const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 function quote(o){return o&&o.kind==='rent'&&typeof o.price==='number'&&Number.isFinite(o.price)&&o.price>=0;}
 function createAside(movie,mode,at,offer,budget,scope='all'){
  const record={id:movie.id,title:movie.title,mode,at,scope};
  if(mode==='week')record.until=at+7*86400000;
  if(mode==='price'){record.price=quote(offer)?offer.price:null;record.key=quote(offer)?Release.quoteIdentity(offer):null;record.budget=budget;}
  return record;
 }
 function asideActive(record,status,at,day){
  if(record.mode==='visit')return true;
  if(record.mode==='week')return at<record.until;
  if(record.mode==='tonight')return record.untilDate>day;
  if(record.mode==='forever')return true;
  if(record.mode!=='price')return false;
  if(!status||status.stale||at-(status.quoteCheckedAt||status.checkedAt||0)>24*3600000)return true;
  return !(status.offers||[]).some(o=>quote(o)&&(record.key?Release.quoteIdentity(o)===record.key&&o.price<record.price:o.price<=record.budget));
 }
 function setAside(movie,status,records,context,at,day){return (records||[]).some(r=>r.id===movie.id&&(r.scope!=='oracle'||context==='oracle')&&asideActive(r,status,at,day));}
 function mergeHiddenFilms(local,remote,restores){const records=[];for(const item of [...(local||[]),...(remote||[])]){if(!item||typeof item.title!=='string')continue;const key=item.id?'tmdb:'+item.id:'title:'+item.title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')+':'+(item.year||'');const prior=records.find(r=>r.key===key);if(!prior)records.push({...item,key});else if((item.createdAt||0)>(prior.createdAt||0))Object.assign(prior,item);}
  return records.filter(item=>!(restores||[]).some(r=>(r.key===item.key||r.listingId&&r.listingId===item.listingId||(r.id&&item.id?Number(r.id)===Number(item.id):r.title&&norm(r.title)===norm(item.title)&&(!r.year||!item.year||r.year===item.year)))&&r.at>=(item.createdAt||0)));
 }
 function changes(before,after,at){
  if(!before||before.stale||!after||after.stale)return [];
  const changes=[],old=before.offers||[],next=after.offers||[],key=o=>o.kind+':'+Release.storeKey(o.provider);
  for(const offer of next){
   if(quote(offer)){const prior=old.find(o=>quote(o)&&Release.quoteIdentity(o)===Release.quoteIdentity(offer));if(prior&&offer.price<prior.price)changes.push({type:'price',key:Release.quoteIdentity(offer),text:Release.storeLabel(offer.provider)+' rental fell from $'+prior.price.toFixed(2)+' to $'+offer.price.toFixed(2)+(offer.format?' · '+offer.format:''),from:prior.price,to:offer.price,provider:offer.provider,format:offer.format,quotedAt:after.quoteCheckedAt,source:after.priceSources?.join(' / ')||'Store quote',url:offer.link});}
   if(['subscription','free'].includes(offer.kind)&&!old.some(o=>key(o)===key(offer)))changes.push({type:'included',key:key(offer),text:offer.kind==='free'?'Now listed free on '+offer.provider:offer.included?'Now included with '+offer.provider:'Now listed on '+offer.provider+' · separate subscription',provider:offer.provider,source:'TMDB US providers',url:after.link});
  }
  for(const offer of old)if(['subscription','free'].includes(offer.kind)&&!next.some(o=>key(o)===key(offer)))changes.push({type:'removed',key:key(offer),text:'No longer listed '+(offer.kind==='free'?'free on ':'with ')+offer.provider,source:'TMDB US providers',url:after.link});
  for(const item of after.announcements||[])if(item.date&&!before.announcements?.some(old=>old.kind===item.kind&&old.provider===item.provider&&old.date===item.date))changes.push({type:'announcement',key:item.kind+':'+item.provider+':'+item.date,text:(item.provider||'Digital release')+' arrival announced for '+item.date,source:item.source||'Release announcement',url:item.sourceUrl});
  const unique=[...new Map(changes.map(r=>[r.type+':'+r.key,r])).values()];return unique.map(r=>({...r,at,beforeCheckedAt:before.checkedAt,checkedAt:after.checkedAt}));
 }
 return {createAside,asideActive,setAside,mergeHiddenFilms,changes};
});
