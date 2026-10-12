/* News stays a separate reading surface. Announced projects need not have catalog IDs. */
const MovieNews=(()=>{
 const by=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 let feed=null,loading=null,limit=12,active=false;
 const follows=()=>hubState.newsFollows||[],context=()=>({tracked:watchlist,taste:hubState.taste,follows:follows()});
 function save(){persistHubState();scheduleSync();window.dispatchEvent(new Event('rewind:state'));}
 function button(text,fn,cls='secondary'){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
 function link(text,url,cls){const a=el('a',text,cls);a.href=HubModel.safeLink(url)||'#';a.target='_blank';a.rel='noopener noreferrer';return a;}
 function followFor(item){return follows().find(f=>f.articleId===item.id||item.project&&MovieNewsModel.norm(f.title)===MovieNewsModel.norm(item.project));}
 function isTracked(item){return item.project&&watchlist.some(m=>MovieNewsModel.norm(m.title)===MovieNewsModel.norm(item.project));}
 async function catalogFilm(title,maker=null){try{const match=MovieNewsModel.catalogMatch(title,await searchMovies(title));if(!match)return null;const full=await fetchMovieDetails(match.id);if(MovieNewsModel.norm(full.title)!==MovieNewsModel.norm(title))return null;if(maker&&!(full.credits?.crew||[]).some(p=>['Director','Writer','Screenplay','Story'].includes(p.job)&&MovieNewsModel.norm(p.name)===MovieNewsModel.norm(maker)))return null;return {...match,...full};}catch{return null;}}
 async function track(item,b){
  b.disabled=true;b.textContent='Saving…';
  const record={id:'news:'+item.id,articleId:item.id,title:item.project||(item.fit.maker?item.fit.maker+' · next project':item.headline),filmTitle:item.project||null,filmMaker:item.fit.maker||null,maker:!item.project?item.fit.maker||null:null,sourceURL:item.url,source:item.source,addedAt:Date.now(),status:item.status,movieId:null,matchCheckedAt:Date.now()};
  try{
   if(item.project){const movie=await catalogFilm(item.project,item.fit.maker);if(movie){addToWatchlist(movie);record.movieId=movie.id;}}
   hubState.newsFollows=[...follows().filter(f=>f.articleId!==item.id&&(!item.project||MovieNewsModel.norm(f.title)!==MovieNewsModel.norm(item.project))),record];save();
   showToast(record.movieId?record.title+' tracked for news and viewing options':record.title+' followed. Catalog and release date are still unverified.');render();
  }catch{b.disabled=false;b.textContent=item.project?'TRACK FILM':'FOLLOW PROJECT';showToast('Could not save this project. Try again.');}
 }
 async function resolveFollowed(){let changed=false;for(const f of follows().filter(f=>f.filmTitle&&!f.movieId&&Date.now()-(f.matchCheckedAt||0)>86400000).slice(0,4)){f.matchCheckedAt=Date.now();const movie=await catalogFilm(f.filmTitle,f.filmMaker);if(movie){addToWatchlist(movie);f.movieId=movie.id;}changed=true;}if(changed)save();}
 function renderFollows(){
  const box=by('news-followed'),out=by('news-followed-list');out.replaceChildren();box.hidden=!follows().length;by('news-followed-count').textContent='Following '+follows().length+' project'+(follows().length===1?'':'s');
  for(const f of follows()){const row=el('div',null,'news-followed-row'),text=el('div');text.append(link(f.title,f.sourceURL),el('p',f.movieId?'Also tracked in My films.':f.status==='rumor'?'Following an unconfirmed report.':'Awaiting a verified catalog match.','offer-note'));
   row.append(text,button('Unfollow',()=>{const old=f;hubState.newsFollows=follows().filter(x=>x.id!==f.id);save();render();showToast('Removed project follow'+(f.movieId?'. My films is unchanged.':'.'),()=>{hubState.newsFollows=[...follows(),old];save();render();});},'text-action'));out.append(row);}
 }
 function render(){
  if(!feed)return;const grid=by('movie-news-grid');grid.replaceChildren();renderFollows();const picks=MovieNewsModel.select(feed.items,context());
  for(const item of picks.slice(0,limit)){
   const card=el('article',null,'movie-news-card'),date=el('time',new Date(item.publishedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:item.datePrecision==='day'?'UTC':'America/Denver'}));date.dateTime=item.publishedAt;
   const meta=el('p',null,'news-byline');meta.append(el('span',item.source),document.createTextNode(' · '),date);
   card.append(meta,el('p',MovieNewsModel.label(item.status),'news-certainty '+item.status),el('h3',item.headline));
   const summary=MovieNewsModel.summary(item);if(summary)card.append(el('p',summary,'news-summary'));card.append(el('p',item.fit.reason,'news-connection'));
   const actions=el('div',null,'news-actions');actions.append(link('Read report ↗',item.url,'news-read'));
   const known=followFor(item)||isTracked(item),b=button(known?'TRACKING':item.project?'TRACK FILM':'FOLLOW PROJECT',()=>track(item,b));b.disabled=!!known;actions.append(b);card.append(actions);
   if(item.aggregated)card.append(el('small','Indexed report. The link opens the publisher through Google News.','news-index-note'));
   grid.append(card);
  }
  if(!picks.length)grid.append(el('p','No current reports made a useful connection. Tracked films and filmmakers from your positive records get priority. The shelf can be quiet.','empty-note'));
  const more=by('movie-news-more');more.hidden=picks.length<=limit;more.textContent='MORE REPORTS';
  const sources=feed.sources||[],failed=sources.filter(s=>s.unavailable).length,checked=Number.isFinite(feed.checkedAt)?new Date(feed.checkedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Denver'})+' MT':'unknown';
  by('movie-news-status').textContent=picks.length+' reports for you · checked '+checked+(feed.stale||Date.now()-(feed.checkedAt||0)>6*3600000?' · previous check':'')+(failed?' · '+failed+' source'+(failed===1?'':'s')+' unavailable':'');
  const sourceList=by('movie-news-sources-list');sourceList.replaceChildren();for(const s of sources){const p=el('p');p.append(link(s.name,s.url),document.createTextNode(s.unavailable?' · unavailable on the last check':' · checked'));sourceList.append(p);}
 }
 async function load(force=false){
  active=true;by('movie-news-panel').hidden=false;if(loading)return loading;if(feed&&!force){render();return;}
  by('movie-news-status').textContent='Reading the film pages…';by('movie-news-refresh').disabled=true;
  loading=(async()=>{await Hub.loadTasteBaseline();try{const r=await fetch('/.netlify/functions/movie-news',{cache:'no-cache'});if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.items))throw Error();feed=data;}catch{try{const r=await fetch('movie-news-snapshot.json',{cache:'no-cache'});if(!r.ok)throw Error();feed={...await r.json(),stale:true};}catch{by('movie-news-status').textContent='News could not load. Your saved projects are still here.';renderFollows();}}if(active&&feed){render();resolveFollowed().catch(()=>{});}})().finally(()=>{loading=null;by('movie-news-refresh').disabled=false;});return loading;
 }
 function init(){
  const mode=document.querySelector('[data-find-mode=news]');mode.addEventListener('click',()=>load());
  document.querySelectorAll('[data-find-mode]').forEach(b=>{if(b!==mode)b.addEventListener('click',()=>{active=false;by('movie-news-panel').hidden=true;});});
  by('movie-news-refresh').onclick=()=>load(true);by('movie-news-more').onclick=()=>{limit+=12;render();};
  window.addEventListener('rewind:state',()=>{if(active)render();});
 }
 init();return {load,render};
})();
