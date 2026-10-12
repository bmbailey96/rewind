/* The public diary is incremental evidence, not a mirror of the watchlist. */
const LetterboxdDiary=(()=>{
 const by=id=>document.getElementById(id);let pending=null,lastCheck=0;
 const fingerprint=r=>[r.rating??'',r.liked?1:0,r.watchedAt||'',r.rewatch?1:0].join('|');
 async function sync(manual=false){
  if(pending)return pending;const status=by('letterboxd-diary-status'),toggle=by('letterboxd-diary-auto');toggle.checked=hubState.letterboxdAuto!==false;
  if(!manual&&!toggle.checked){status.textContent='Automatic diary imports paused. Your existing records are retained.';return;}
  status.textContent='Checking your public Letterboxd diary…';by('letterboxd-diary-check').disabled=true;
  pending=(async()=>{await Hub.loadTasteBaseline();const r=await fetch('/.netlify/functions/letterboxd-diary',{cache:'no-cache'});if(!r.ok)throw Error();const feed=await r.json();if(!Array.isArray(feed.records)||!feed.connected)throw Error();const receipts=new Map((hubState.letterboxdEntries||[]).map(r=>[r.id,r.fingerprint])),groups=new Map();
   for(const row of feed.records){if(!groups.has(row.id))groups.set(row.id,[]);groups.get(row.id).push(row);}
   let changed=false,unmatched=0;
   await mapLimited([...groups.values()],3,async rows=>{rows.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));const row=rows[0];if(!rows.some(r=>receipts.get(r.entryId)!==fingerprint(r)))return;
    seenSet.add(seenKey(row.title,row.year));changed=true;
    if(!hubState.ignoredTaste.includes(row.id)){
     const old=hubState.taste.find(m=>m.id===row.id),positive=(row.rating||0)>=4||row.liked||row.rewatch||old?.owned;let meta=old?.meta;
     if(positive&&!meta?.credits?.crew?.length){try{const full=await fetchMovieDetails(row.id);if(HubModel.norm(full.title)!==HubModel.norm(row.title)||String(full.release_date||'').slice(0,4)!==row.year){unmatched++;return;}meta={genres:full.genres,credits:full.credits,keywords:full.keywords};}catch{unmatched++;return;}}
     const record={id:row.id,title:row.title,year:row.year,letterboxdURL:row.letterboxdURL,source:'Letterboxd public diary',watchedAt:row.watchedAt||old?.watchedAt,rewatches:Math.max(old?.rewatches||0,rows.length,row.rewatch?2:1),...(row.rating!==undefined?{rating:row.rating}:{}),...(row.liked?{favorite:true}:{}),...(meta?{meta}:{} )};
     hubState.taste=HubModel.mergeRecords(hubState.taste,[record]);
    }
    for(const entry of rows)receipts.set(entry.entryId,fingerprint(entry));
   });
   hubState.letterboxdEntries=[...receipts].slice(-2000).map(([id,fingerprint])=>({id,fingerprint}));hubState.letterboxdCheckedAt=feed.checkedAt;
   if(changed){Hub.renderTaste?.();saveSeenSet();persistHubState();scheduleSync();window.dispatchEvent(new Event('rewind:state'));}
   const checked=new Date(feed.checkedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Denver'});
   status.textContent='Connected to bmbailey124 · checked '+checked+' MT'+(feed.stale?' · previous feed check':'')+(unmatched?' · '+unmatched+' catalog matches pending':'')+'. Recent diary activity is automatic; full watchlist changes still need an export.';lastCheck=Date.now();
  })().catch(()=>{status.textContent='Your diary could not refresh. Existing imports are retained. Try Check now later.';}).finally(()=>{pending=null;by('letterboxd-diary-check').disabled=false;});return pending;
 }
 by('letterboxd-diary-check').onclick=()=>sync(true);by('letterboxd-diary-auto').onchange=e=>{hubState.letterboxdAuto=e.target.checked;persistHubState();scheduleSync();sync();};
 window.addEventListener('focus',()=>{if(Date.now()-lastCheck>1800000)sync();});sync();return {sync};
})();
