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
 // Coyote vs. Acme was seeded automatically in earlier builds, so its legacy origin is ambiguous.
 function backfillReleaseFollows(films){
  let changed=0;
  for(const movie of films||[]){
   if(typeof movie.followRelease==='boolean')continue;
   if(movie.source==='Rewind watchlist'&&movie.id!==1204680&&Number.isFinite(movie.addedAt)&&movie.addedAt>0){
    movie.followRelease=true;movie.followReleaseAt=movie.addedAt;movie.followReleaseOrigin='legacy-manual';changed++;
   }else if(movie.source==='Letterboxd watchlist'&&movie.letterboxdWatchlist===true&&movie.importedAt==null&&Number.isFinite(movie.addedAt)&&movie.addedAt>0&&movie.id!==1204680){
    // Earlier CSV imports overwrote source on manually saved Rewind films,
    // but preserved the original addedAt and did not set importedAt.
    movie.followRelease=true;movie.followReleaseAt=movie.addedAt;movie.followReleaseOrigin='legacy-manual-reclassified';changed++;
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
 function releaseOpening(movie,status){
  const us=(status?.details||movie?.detailsSnapshot)?.release_dates?.results?.find(r=>r.iso_3166_1==='US')?.release_dates||[];
  const dates=us.filter(r=>[2,3].includes(r.type)).map(r=>String(r.release_date||'').slice(0,10)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if(dates.length)return {date:dates[0],label:'US theatrical release',source:'listed'};
  const announced=(status?.announcements||[]).filter(a=>a.kind==='theatrical'&&/^\d{4}-\d{2}-\d{2}$/.test(a.date||'')).sort((a,b)=>a.date.localeCompare(b.date))[0];
  if(announced)return {date:announced.date,label:'US theatrical release',source:'announced'};
  const catalog=String(movie?.release_date||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(catalog)?{date:catalog,label:'Catalog release',source:'listed'}:null;
 }
 function releaseStage(movie,status,today,budget=7.99,receipts=[],model=null,local=null){
  // Previous quotes stay under their viewing option, with the check age shown.
  const offers=status?.offers||[],cost=model?.cost(offers,budget,false),home=upcomingHome(movie,status,today),opening=releaseOpening(movie,status);
  const fresh=!!status&&!status.stale&&Number.isFinite(status.checkedAt)&&Date.now()-status.checkedAt>=0&&Date.now()-status.checkedAt<24*3600000;
  let group='waiting';
  if(cost?.band==='free')group='included';
  else if(cost?.band==='cheap')group='cheap';
  else if(['premium','buy','unknown'].includes(cost?.band))group='premium';
  else if(local)group='theater';
  else if(opening?.date>today)group='upcoming';
  const arrival=fresh&&(receipts||[]).filter(r=>r.movieId===movie.id&&r.at&&Date.now()-r.at<=14*86400000&&Date.now()>=r.at)
   .some(r=>r.type==='included'&&offers.some(o=>(o.kind==='free'||o.kind==='subscription'&&o.included)&&o.provider===r.provider)||
    r.type==='price'&&r.from>budget&&r.to<=budget&&offers.some(o=>o.kind==='rent'&&o.provider===r.provider&&o.format===r.format&&o.price===r.to));
  return {group,date:group==='theater'?local.date:group==='upcoming'?opening.date:home?.date||null,opening,label:home?.label||null,home,local,newArrival:arrival,stale:!fresh&&cost?.offer?.kind!=='physical'};
 }
 function releaseWatchPage(results,{limit=24,model,budget=7.99,filter='all',today,receipts=[],localListing=()=>null}){
  const order={included:0,cheap:1,premium:2,theater:3,upcoming:4,waiting:5};
  const rows=results.map(r=>{
   const cost=model.cost(r.status?.offers,budget,false);
   return {...r,cost,stage:releaseStage(r.entry,r.status,today,budget,receipts,model,localListing(r.entry))};
  }).filter(r=>filter==='all'||filter==='free'&&r.stage.group==='included'||filter==='cheap'&&r.stage.group==='cheap'||filter==='premium'&&r.stage.group==='premium'||filter==='waiting'&&['waiting','upcoming','theater'].includes(r.stage.group));
  rows.sort((a,b)=>order[a.stage.group]-order[b.stage.group]||
   Number(!!b.entry.pinned)-Number(!!a.entry.pinned)||
   (a.stage.group==='premium'?({premium:0,buy:1,unknown:2}[a.cost.band]??2)-({premium:0,buy:1,unknown:2}[b.cost.band]??2):0)||
   (['cheap','premium'].includes(a.stage.group)?(a.cost.price??Infinity)-(b.cost.price??Infinity):0)||
   (['waiting','upcoming','theater'].includes(a.stage.group)?String(a.stage.date||'9999').localeCompare(String(b.stage.date||'9999')):0)||
   Number(!!b.stage.newArrival)-Number(!!a.stage.newArrival)||a.entry.title.localeCompare(b.entry.title));
  const counts={included:0,cheap:0,premium:0,theater:0,upcoming:0,waiting:0};
  for(const row of rows)counts[row.stage.group]++;
  return {rows:rows.slice(0,limit),total:rows.length,counts};
 }

 function merge(existing,films){const byId=new Map(existing.map(f=>[f.id,f]));for(const f of films)if(f.id&&!byId.has(f.id))byId.set(f.id,{...f,addedAt:addedAt(f),importedAt:Date.now(),pinned:false,manualNote:'',lastStatusCode:null,lastStatusLabel:null,statusChangedAt:null});return [...byId.values()];}
 function titleKey(title){return String(title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
 function sourceKey(film){return titleKey(film.sourceTitle||film.title)+'|'+(film.year||String(film.release_date||'').slice(0,4));}
 function releaseYears(data){return [...new Set((data.results||[]).flatMap(country=>(country.release_dates||[]).filter(r=>[1,2,3].includes(r.type)&&/^\d{4}-/.test(r.release_date||'')).map(r=>r.release_date.slice(0,4))))];}
 function match(row,candidates){const hits=new Map();for(const film of candidates||[])if(film.id&&(String(film.release_date||'').slice(0,4)===String(row.year)||(film.catalogReleaseYears||[]).includes(String(row.year)))&&[film.title,film.original_title,...(film.catalogAliases||[])].some(t=>titleKey(t)===titleKey(row.title)))hits.set(film.id,film);return hits.size===1?[...hits.values()][0]:null;}
 // Resolve catalog identity only. This never checks streaming or follows a release.
 async function resolveCatalog(row,lookup){
  const search=async params=>{const data=await lookup('/search/movie',params);const candidates=[...(data.results||[])];for(let page=2;page<=Math.min(5,data.total_pages||1);page++)candidates.push(...((await lookup('/search/movie',{...params,page})).results||[]));return candidates;};
  let candidates=await search({query:row.title,primary_release_year:row.year}),film=match(row,candidates);
  if(!film){candidates=await search({query:row.title});film=match(row,candidates);}
  if(!film){const exact=candidates.filter(f=>[f.title,f.original_title].some(t=>titleKey(t)===titleKey(row.title))&&Math.abs(Number(String(f.release_date||'').slice(0,4))-Number(row.year))<=2);
   if(exact.length>0&&exact.length<=3){const verified=[];for(const candidate of exact){const releases=await lookup('/movie/'+candidate.id+'/release_dates',{});verified.push({...candidate,catalogReleaseYears:releaseYears(releases)});}candidates=verified;film=match(row,candidates);}
  }
  if(!film){
   const nearby=candidates.filter(f=>String(f.release_date||'').slice(0,4)===String(row.year)).slice(0,3),aliases=[];
   for(const candidate of nearby){const alt=await lookup('/movie/'+candidate.id+'/alternative_titles',{});aliases.push({...candidate,catalogAliases:(alt.titles||[]).map(a=>a.title)});}
   film=match(row,aliases);
  }
  if(film)return {state:'matched',film};
  const exact=candidates.filter(f=>[f.title,f.original_title].some(t=>titleKey(t)===titleKey(row.title))&&(String(f.release_date||'').slice(0,4)===String(row.year)||(f.catalogReleaseYears||[]).includes(String(row.year))));
  if(!exact.length){const series=await lookup('/search/tv',{query:row.title,first_air_date_year:row.year});const hits=(series.results||[]).filter(s=>String(s.first_air_date||'').slice(0,4)===String(row.year)&&[s.name,s.original_name].some(t=>titleKey(t)===titleKey(row.title)));
   if(hits.length===1)return {state:'review',reason:'TV series: Rewind’s availability checker currently handles films',candidates:[],series:{id:hits[0].id,title:hits[0].name}};
  }
  return {state:'review',reason:exact.length>1?'More than one possible film':'No verified title and year match',candidates:exact.slice(0,5).map(f=>({id:f.id,title:f.title,release_date:f.release_date,poster_path:f.poster_path||null}))};
 }
 function matchQueue(rows,at=Date.now()){
  return [...(rows||[])].filter(r=>!['review','unsupported'].includes(r.catalogMatch?.state)&&(!r.catalogMatch?.nextAttemptAt||r.catalogMatch.nextAttemptAt<=at))
   .sort((a,b)=>(a.catalogMatch?.lastAttemptAt||0)-(b.catalogMatch?.lastAttemptAt||0));
 }
 function matchSummary(rows){const counts={pending:0,retry:0,review:0,unsupported:0};for(const row of rows||[])counts[['review','retry','unsupported'].includes(row.catalogMatch?.state)?row.catalogMatch.state:'pending']++;return counts;}
 function actionable(movie,status,receipts,budget,at=Date.now()){
  if(!status||status.stale||!status.checkedAt||at-status.checkedAt<0||at-status.checkedAt>86400000)return null;
  const offers=status.offers||[];return [...(receipts||[])].filter(r=>r.movieId===movie.id&&r.at<=at&&at-r.at<=14*86400000).sort((a,b)=>b.at-a.at).find(r=>r.type==='price'&&typeof r.from==='number'&&typeof r.to==='number'&&r.to<r.from&&offers.some(o=>o.kind==='rent'&&o.provider===r.provider&&o.format===r.format&&o.price===r.to)&&status.quoteCheckedAt&&at-status.quoteCheckedAt>=0&&at-status.quoteCheckedAt<=86400000||r.type==='included'&&offers.some(o=>o.provider===r.provider&&(o.kind==='free'||o.kind==='subscription'&&o.included)))||null;
 }
 function freshSnapshot(movie,at=Date.now()){const s=movie.availabilitySnapshot,age=at-(s?.checkedAt||0);if(!s||s.stale||!s.checkedAt||age<0||age>=6*3600000)return false;return !(s.offers||[]).some(o=>['rent','buy'].includes(o.kind)&&typeof o.price==='number')||!!s.quoteCheckedAt&&at-s.quoteCheckedAt>=0&&at-s.quoteCheckedAt<6*3600000;}
 function genreIds(movie){return movie.genre_ids?.length?movie.genre_ids:(movie.meta?.genres||movie.detailsSnapshot?.genres||movie.genres||[]).map(g=>typeof g==='number'?g:g.id).filter(Number.isFinite);}
 function rewindAdditions(movies,keys=[]){const imported=new Set(keys);return movies.filter(m=>m.id&&!m.letterboxdWatchlist&&!/Letterboxd watchlist/i.test(m.source||'')&&!imported.has(sourceKey(m)));}
 function exportCSV(movies,keys=[]){const field=value=>'"'+String(value??'').replace(/"/g,'""')+'"';return 'tmdbID,Title,Year\r\n'+rewindAdditions(movies,keys).map(m=>[m.id,field(m.title),String(m.release_date||'').slice(0,4)].join(',')).join('\r\n')+'\r\n';}
 function page(results,{sort='cost',filter='all',budget=7.99,limit=60,model}){const ranks={free:0,cheap:1,premium:2,unknown:3,buy:4,waiting:5};const rows=results.map(r=>({...r,cost:model.cost(r.status.offers,budget,r.status.stale)})).filter(r=>filter==='all'||filter===r.cost.band);const compare={changed:(a,b)=>(b.entry.statusChangedAt||0)-(a.entry.statusChangedAt||0),added:(a,b)=>(b.entry.addedAt||0)-(a.entry.addedAt||0),release:(a,b)=>String(b.entry.release_date||'').localeCompare(a.entry.release_date||''),az:(a,b)=>a.entry.title.localeCompare(b.entry.title)};rows.sort((a,b)=>Number(!!b.entry.pinned)-Number(!!a.entry.pinned)||(sort==='cost'?ranks[a.cost.band]-ranks[b.cost.band]||(a.cost.price??Infinity)-(b.cost.price??Infinity):(compare[sort]||compare.changed)(a,b))||a.entry.title.localeCompare(b.entry.title));return {rows:rows.slice(0,limit),total:rows.length};}
 return {addedAt,recentRelease,recentReleases,backfillReleaseFollows,followsRelease,upcomingHome,theatricalDate,releaseOpening,releaseStage,releaseWatchPage,merge,titleKey,sourceKey,match,releaseYears,resolveCatalog,matchQueue,matchSummary,page,actionable,freshSnapshot,genreIds,rewindAdditions,exportCSV};
});
