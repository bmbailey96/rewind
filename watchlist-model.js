(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WatchlistModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function addedAt(row){const date=row.addedDate||row.Date||row['Added Date'];return /^\d{4}-\d{2}-\d{2}$/.test(date||'')?Date.parse(date+'T12:00:00Z'):null;}
 // Recent is a release window, never an import/addition-date window.
 // Use the catalog's dated release; unknown or future dates stay in All.
 function recentRelease(film,today){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today||''))return false;
  const date=film?.release_date||film?.primary_release_date||film?.usReleaseDate||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const valid=new Date(date+'T00:00:00Z');
  if(!Number.isFinite(valid.getTime())||valid.toISOString().slice(0,10)!==date)return false;
  const [year,month,day]=today.split('-').map(Number);
  const lastDay=new Date(Date.UTC(year-1,month,0)).getUTCDate();
  const cutoff=new Date(Date.UTC(year-1,month-1,Math.min(day,lastDay))).toISOString().slice(0,10);
  return date>=cutoff&&date<=today;
 }
 function recentReleases(films,today,isWatched=()=>false){
  return (films||[]).filter(film=>recentRelease(film,today)&&!isWatched(film));
 }

 // A release follow is independent of inclusion in the permanent watchlist.
 // Legacy "Rewind watchlist" records were saved through an explicit user action.
 // Never infer a follow from an imported Letterboxd title or a release year.
 function backfillReleaseFollows(films){
  let changed=0;
  for(const movie of films||[]){
   if(typeof movie.followRelease==='boolean')continue;
   if(movie.source==='Rewind watchlist'&&Number.isFinite(movie.addedAt)&&movie.addedAt>0){
    movie.followRelease=true;movie.followReleaseAt=movie.addedAt;movie.followReleaseOrigin='legacy-manual';changed++;
   }else if(movie.releaseFile&&/^Rewind (?:discover|calendar)$/.test(movie.source||'')){
    movie.followRelease=true;movie.followReleaseAt=movie.addedAt||Date.now();movie.followReleaseOrigin='legacy-release';changed++;
   }
  }
  return changed;
 }
 function followsRelease(movie){return movie?.followRelease===true;}
 function upcomingHome(movie,status,today){
  const possibilities=[];
  for(const a of status?.announcements||[])if(['digital','subscription'].includes(a.kind)&&/^\d{4}-\d{2}-\d{2}$/.test(a.date||'')&&a.date>today){
   possibilities.push({date:a.date,label:a.provider||'Digital release',source:'announced'});
  }
  if(status?.digitalDate&&status.digitalDate>today)possibilities.push({date:status.digitalDate,label:'Digital release',source:'listed'});
  const us=status?.details?.release_dates?.results?.find(r=>r.iso_3166_1==='US')?.release_dates||
    movie?.detailsSnapshot?.release_dates?.results?.find(r=>r.iso_3166_1==='US')?.release_dates||[];
  for(const entry of us)if(entry.type===4){
   const d=String(entry.release_date||'').slice(0,10);
   if(/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>today)possibilities.push({date:d,label:'Digital release',source:'listed'});
  }
  return possibilities.sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
 }
 function theatricalDate(movie,status,today){
  const us=status?.details?.release_dates?.results?.find(r=>r.iso_3166_1==='US')?.release_dates||
   movie?.detailsSnapshot?.release_dates?.results?.find(r=>r.iso_3166_1==='US')?.release_dates||[];
  const dates=us.filter(r=>[2,3].includes(r.type)).map(r=>String(r.release_date||'').slice(0,10)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d));
  const d=dates.sort()[0];if(!d)return null;
  const ref=Date.parse(today+'T12:00:00Z'),when=Date.parse(d+'T12:00:00Z');
  // A date is not evidence a specific theater is still playing the film.
  return when>=ref-60*86400000&&when<=ref+180*86400000?d:null;
 }
 function releaseStage(movie,status,today,budget=7.99,receipts=[]){
  const fresh=!!status&&!status.stale&&Number.isFinite(status.checkedAt)&&Date.now()-status.checkedAt>=0&&Date.now()-status.checkedAt<24*3600000;
  const offers=fresh?(status.offers||[]).filter(o=>o.kind!=='physical'):[];
  const free=offers.some(o=>o.kind==='free'||o.kind==='subscription'&&o.included);
  const rental=offers.some(o=>o.kind==='rent');
  const buy=offers.some(o=>o.kind==='buy');
  if(free||rental||buy){
   const arrival=(receipts||[]).filter(r=>r.movieId===movie.id&&r.at&&Date.now()-r.at<=14*86400000&&Date.now()>=r.at)
    .some(r=>r.type==='included'&&offers.some(o=>(o.kind==='free'||o.kind==='subscription'&&o.included)&&o.provider===r.provider)||
      r.type==='price'&&r.from>budget&&r.to<=budget&&offers.some(o=>o.kind==='rent'&&o.provider===r.provider&&o.format===r.format&&o.price===r.to));
   return {group:arrival?'arrived':'available',date:null,sortAt:arrival?Math.max(...receipts.filter(r=>r.movieId===movie.id).map(r=>r.at||0)):0};
  }
  const home=upcomingHome(movie,status,today);
  if(home)return {group:'coming',date:home.date,label:home.label};
  const theater=theatricalDate(movie,status,today);
  if(theater)return {group:'theater',date:theater,label:'US theatrical release listing'};
  return {group:'waiting',date:null};
 }
 function releaseWatchPage(results,{limit=24,model,budget=7.99,filter='all',today,receipts=[]}){
  const order={arrived:0,available:1,coming:2,theater:3,waiting:4};
  const rows=results.map(r=>({...r,stage:releaseStage(r.entry,r.status,today,budget,receipts),cost:model.cost(r.status?.offers,budget,r.status?.stale)}))
   .filter(r=>filter==='all'||r.cost.band===filter);
  rows.sort((a,b)=>order[a.stage.group]-order[b.stage.group]||
   (['coming','theater'].includes(a.stage.group)?String(a.stage.date||'').localeCompare(String(b.stage.date||'')):0)||
   (a.stage.group==='arrived'?(b.stage.sortAt||0)-(a.stage.sortAt||0):0)||
   (a.stage.group==='available'?Number(b.cost.band==='free')-Number(a.cost.band==='free'):0)||
   (b.entry.pinned?1:0)-(a.entry.pinned?1:0)||
   (b.entry.addedAt||0)-(a.entry.addedAt||0)||a.entry.title.localeCompare(b.entry.title));
  return {rows:rows.slice(0,limit),total:rows.length};
 }

 function merge(existing,films){const byId=new Map(existing.map(f=>[f.id,f]));for(const f of films)if(f.id&&!byId.has(f.id))byId.set(f.id,{...f,addedAt:addedAt(f),importedAt:Date.now(),pinned:false,manualNote:'',lastStatusCode:null,lastStatusLabel:null,statusChangedAt:null});return [...byId.values()];}
 function titleKey(title){return String(title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
 function sourceKey(film){return titleKey(film.sourceTitle||film.title)+'|'+(film.year||String(film.release_date||'').slice(0,4));}
 function releaseYears(data){return [...new Set((data.results||[]).flatMap(country=>(country.release_dates||[]).filter(r=>[1,2,3].includes(r.type)&&/^\d{4}-/.test(r.release_date||'')).map(r=>r.release_date.slice(0,4))))];}
 function match(row,candidates){const hits=new Map();for(const film of candidates||[])if(film.id&&(String(film.release_date||'').slice(0,4)===String(row.year)||(film.catalogReleaseYears||[]).includes(String(row.year)))&&[film.title,film.original_title].some(t=>titleKey(t)===titleKey(row.title)))hits.set(film.id,film);return hits.size===1?[...hits.values()][0]:null;}
 function actionable(movie,status,receipts,budget,at=Date.now()){
  if(!status||status.stale||!status.checkedAt||at-status.checkedAt<0||at-status.checkedAt>86400000)return null;
  const offers=status.offers||[];return [...(receipts||[])].filter(r=>r.movieId===movie.id&&r.at<=at&&at-r.at<=14*86400000).sort((a,b)=>b.at-a.at).find(r=>r.type==='price'&&typeof r.from==='number'&&typeof r.to==='number'&&r.to<r.from&&offers.some(o=>o.kind==='rent'&&o.provider===r.provider&&o.format===r.format&&o.price===r.to)&&status.quoteCheckedAt&&at-status.quoteCheckedAt>=0&&at-status.quoteCheckedAt<=86400000||r.type==='included'&&offers.some(o=>o.provider===r.provider&&(o.kind==='free'||o.kind==='subscription'&&o.included)))||null;
 }
 function freshSnapshot(movie,at=Date.now()){const s=movie.availabilitySnapshot,age=at-(s?.checkedAt||0);if(!s||s.stale||!s.checkedAt||age<0||age>=6*3600000)return false;return !(s.offers||[]).some(o=>['rent','buy'].includes(o.kind)&&typeof o.price==='number')||!!s.quoteCheckedAt&&at-s.quoteCheckedAt>=0&&at-s.quoteCheckedAt<6*3600000;}
 function genreIds(movie){return movie.genre_ids?.length?movie.genre_ids:(movie.meta?.genres||movie.detailsSnapshot?.genres||movie.genres||[]).map(g=>typeof g==='number'?g:g.id).filter(Number.isFinite);}
 function rewindAdditions(movies,keys=[]){const imported=new Set(keys);return movies.filter(m=>m.id&&!m.letterboxdWatchlist&&!/Letterboxd watchlist/i.test(m.source||'')&&!imported.has(sourceKey(m)));}
 function exportCSV(movies,keys=[]){const field=value=>'"'+String(value??'').replace(/"/g,'""')+'"';return 'tmdbID,Title,Year\r\n'+rewindAdditions(movies,keys).map(m=>[m.id,field(m.title),String(m.release_date||'').slice(0,4)].join(',')).join('\r\n')+'\r\n';}
 function page(results,{sort='cost',filter='all',budget=7.99,limit=60,model}){const ranks={free:0,cheap:1,premium:2,unknown:3,buy:4,waiting:5};const rows=results.map(r=>({...r,cost:model.cost(r.status.offers,budget,r.status.stale)})).filter(r=>filter==='all'||filter===r.cost.band);const compare={changed:(a,b)=>(b.entry.statusChangedAt||0)-(a.entry.statusChangedAt||0),added:(a,b)=>(b.entry.addedAt||0)-(a.entry.addedAt||0),release:(a,b)=>String(b.entry.release_date||'').localeCompare(a.entry.release_date||''),az:(a,b)=>a.entry.title.localeCompare(b.entry.title)};rows.sort((a,b)=>Number(!!b.entry.pinned)-Number(!!a.entry.pinned)||(sort==='cost'?ranks[a.cost.band]-ranks[b.cost.band]||(a.cost.price??Infinity)-(b.cost.price??Infinity):(compare[sort]||compare.changed)(a,b))||a.entry.title.localeCompare(b.entry.title));return {rows:rows.slice(0,limit),total:rows.length};}
 return {addedAt,recentRelease,recentReleases,backfillReleaseFollows,followsRelease,upcomingHome,theatricalDate,releaseStage,releaseWatchPage,merge,titleKey,sourceKey,match,releaseYears,page,actionable,freshSnapshot,genreIds,rewindAdditions,exportCSV};
});
