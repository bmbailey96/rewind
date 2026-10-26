/* Saved reports share the undated shelf without inventing catalog identities. */
window.SavedProjects=(()=>{
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 function rows(){const type=RewindMedia.filter(),query=document.getElementById('watchlist-search')?.value.trim().toLowerCase()||'';return (hubState.newsFollows||[]).filter(r=>!r.movieId&&(type==='all'||(r.mediaType||'movie')===type)&&(!query||[r.title,r.headline].some(t=>String(t||'').toLowerCase().includes(query)))).map(r=>({entry:{id:'project:'+r.id,title:r.title,mediaType:r.mediaType||'movie',project:r,pinned:!!r.pinned,rewindSaved:true,addedAt:r.savedAt||r.addedAt||0},status:{offers:[]}}));}
 function card(r){
  const card=el('article',null,'rental-card compact-film-card saved-project-card');card.dataset.mediaType=r.mediaType||'movie';card.dataset.projectId=r.id;
  const poster=el('div','NO POSTER ON FILE','card-poster poster-missing');const image=HubModel.safeLink(r.poster||r.posterURL);if(image){const img=el('img',null,'card-poster');img.src=image;img.alt=r.title+' poster';img.loading='lazy';img.onerror=()=>img.replaceWith(poster);card.append(img);}else card.append(poster);
  card.append(el('h3',r.title+(r.season?' · season '+r.season:''),'card-title'),el('p',null,'card-meta'));card.querySelector('.card-meta').append(RewindMedia.typeBadge({mediaType:r.mediaType||'movie'}));
  const pin=el('button',null,'poster-pin');pin.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 4 4v2h-5v6l-1 2-1-2v-6H6v-2l4-4z"/></svg>';pin.setAttribute('aria-label',(r.pinned?'Unpin ':'Pin ')+r.title);pin.setAttribute('aria-pressed',String(!!r.pinned));pin.onclick=()=>{r.pinned=!r.pinned;persistHubState();scheduleSync();repaintWatchlist();};card.append(pin);
  card.append(el('p','DATE UNANNOUNCED','new-tag'),el('p',r.productionStatus||r.headline||'Saved announcement. Release date unannounced.','offer-note'));
  const source=HubModel.safeLink(r.sourceURL);if(source){const a=el('a','Read announcement ↗','film-details-trigger');a.href=source;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
  const remove=el('button','Remove saved project','text-action');remove.onclick=()=>{hubState.newsFollows=(hubState.newsFollows||[]).filter(x=>x.id!==r.id);persistHubState();scheduleSync();repaintWatchlist();window.dispatchEvent(new Event('rewind:state'));showToast('Removed from watchlist.',()=>{hubState.newsFollows=[...(hubState.newsFollows||[]),r];persistHubState();scheduleSync();repaintWatchlist();window.dispatchEvent(new Event('rewind:state'));});};card.append(remove);return card;
 }
 for(const name of ['rewind:state','rewind:tv-state','rewind:media-filter','rewind:saved-search'])window.addEventListener(name,()=>repaintWatchlist());
 setTimeout(()=>repaintWatchlist(),0);return {rows,card};
})();
