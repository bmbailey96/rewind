function appendNote(root,text,cls='offer-note'){const p=document.createElement('p');p.className=cls;p.textContent=text;root.appendChild(p);return p;}
function releaseSource(root,label,url){const safe=RewindModel.safeLink(url);if(!safe)return;const a=document.createElement('a');a.href=safe;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;root.appendChild(a);}
function renderAvailability(movie,status,context={}) {
  const wrap=document.createElement('div');wrap.className='availability';
  if(status.stale)appendNote(wrap,'Could not refresh. Previous availability may have changed.','lookup-warning');
  if(status.previousLabel&&status.previousLabel!==status.label)appendNote(wrap,'Previously: '+status.previousLabel);
  const groups=[['Your subscriptions',o=>o.kind==='subscription'&&o.included],['Free streaming',o=>o.kind==='free'],['Rent',o=>o.kind==='rent'],['Buy',o=>o.kind==='buy'],['Other subscriptions / channels',o=>o.kind==='subscription'&&!o.included],['Cable login',o=>o.kind==='cable']];
  for(const [name,filter] of groups){const offers=ReleaseModel.compactOffers(status.offers).filter(filter);if(!offers.length)continue;const heading=document.createElement('h4');heading.textContent=name;wrap.appendChild(heading);
    offers.sort((a,b)=>Number(!['apple','amazon'].includes(ReleaseModel.storeKey(a.provider)))-Number(!['apple','amazon'].includes(ReleaseModel.storeKey(b.provider)))||(a.price??Infinity)-(b.price??Infinity)||a.provider.localeCompare(b.provider));
    for(const offer of offers){const row=document.createElement('div');row.className='offer-row';const provider=document.createElement(offer.link?'a':'span');provider.textContent=offer.provider;if(offer.link){provider.href=offer.link;provider.target='_blank';provider.rel='noopener noreferrer';}const amount=document.createElement('span');amount.className='offer-price';amount.textContent=offer.kind==='subscription'?(offer.included?'Included':'Separate subscription'):offer.kind==='free'?(offer.adSupported?'Free with ads':'Free'):offer.kind==='cable'?'Cable account':offer.price===null?'Price not supplied':`$${offer.price.toFixed(2)}`;if(offer.format)amount.textContent+=' · '+offer.format;row.append(provider,amount);wrap.appendChild(row);if(offer.channel)appendNote(wrap,'Add-on channel; not included with the base service.');}
  }
  if(!(status.offers||[]).length)appendNote(wrap,'No confirmed US viewing offer in this check.');
  wrap.appendChild(renderReleaseTimeline(movie,status,context));
  const source='US listings: JustWatch'+(status.quoteCheckedAt?' + Watchmode. Quotes checked '+new Date(status.quoteCheckedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'.':'. Dollar prices require the price connection in Settings.');
  appendNote(wrap,source);if(status.priceWarning)appendNote(wrap,status.priceWarning,'lookup-warning');
  if(status.checkedAt)appendNote(wrap,'Availability checked '+new Date(status.checkedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),'checked-note');
  return wrap;
}
function renderReleaseTimeline(movie,status,context={}){
  const root=document.createElement('section');root.className='release-timeline';const heading=document.createElement('h4');heading.textContent='Release timeline';root.appendChild(heading);
  const today=discoveryWindow().today;const details=status.details||movie.detailsSnapshot;const stage=ReleaseModel.stages(details,today);
  const row=(label,text,certainty,sourceLabel,sourceUrl)=>{const item=document.createElement('div');item.className='timeline-item';const name=document.createElement('strong');name.textContent=label;item.appendChild(name);const badge=document.createElement('span');badge.className='certainty '+certainty.toLowerCase();badge.textContent=certainty;item.appendChild(badge);appendNote(item,text,'timeline-text');if(sourceUrl)releaseSource(item,sourceLabel,sourceUrl);root.appendChild(item);return item;};
  const tmdbUrl=`https://www.themoviedb.org/movie/${movie.id}/releases`;
  if(stage.limited)row('Limited theatrical',formatFilmDate(stage.limited),'Listed','TMDB US dates',tmdbUrl);
  if(stage.wide){const elapsed=ReleaseModel.days(stage.wide,today);row('Wide theatrical',formatFilmDate(stage.wide)+(elapsed>=0?` · ${elapsed} days since US release`:''),'Listed','TMDB US dates',tmdbUrl);}
  if(!stage.limited&&!stage.wide)row('Theatrical window','No US theatrical date listed.','Unknown');
  else appendNote(root,'The end of the theater run is not published here. Digital availability can overlap with screenings.');
  const announcements=status.announcements||[];
  const digitalAnnouncement=announcements.find(a=>a.kind==='digital');const digital=digitalAnnouncement?.date||stage.digital;
  if(digital){const anchor=stage.wide||stage.limited;const gap=anchor?ReleaseModel.days(anchor,digital):null;row('Digital rent / buy',formatFilmDate(digital)+(gap!==null&&gap>=0?` · ${gap} days after theatrical release`:'')+'. A digital date does not confirm a rental price or subscription. ',digitalAnnouncement?'Announced':'Listed',digitalAnnouncement?.source||'TMDB US dates',digitalAnnouncement?.sourceUrl||tmdbUrl);}
  else if((status.offers||[]).some(o=>['rent','buy'].includes(o.kind)))row('Digital rent / buy','Available in the offers above. First release date not supplied.','Observed');
  else {const estimate=ReleaseModel.digitalEstimate(details||{},context.details||[],today);if(estimate)row('Expected digital window',formatFilmDate(estimate.start)+' to '+formatFilmDate(estimate.end)+`. Based on ${estimate.samples} recently browsed films with listed US theatrical and digital dates (middle 60% of observed gaps). Broad comparison, not a studio promise.`+(estimate.overdue?' This window has passed without a verified listing.':''),'Estimate');else row('Digital rent / buy','Date not announced. Not enough comparable US releases to estimate a window.','Unknown');}
  const included=(status.offers||[]).filter(o=>o.kind==='subscription'&&o.included);
  if(included.length)row('Subscription streaming','Currently listed on '+[...new Set(included.map(o=>o.provider))].join(', ')+'.','Observed');
  const subscriptions=announcements.filter(a=>a.kind==='subscription');
  for(const a of subscriptions){const n=a.date?ReleaseModel.days(today,a.date):null;const text=a.date?`${a.provider} · ${formatFilmDate(a.date)}`+(n>0?` · in ${n} day${n===1?'':'s'}`:!(status.offers||[]).some(o=>o.kind==='subscription'&&RewindModel.serviceKey(o.provider)===RewindModel.serviceKey(a.provider))?' · announced date reached; current availability not verified':''):`${a.provider} announced; date to be confirmed`;row('Subscription announcement',text,'Announced',a.source,a.sourceUrl);appendNote(root,'Announcement checked '+formatFilmDate(a.checkedAt)+'.');}
  const seen=new Set(subscriptions.map(a=>`${RewindModel.serviceKey(a.provider)}:${a.date}`));
  for(const c of status.calendar||[]){if(c.region&&c.region!=='US')continue;if(!c.source_name||!ReleaseModel.date(c.source_release_date)||!RewindModel.SERVICE_CHOICES.some(name=>RewindModel.serviceKey(name)===RewindModel.serviceKey(c.source_name)))continue;const key=RewindModel.serviceKey(c.source_name)+':'+c.source_release_date;if(seen.has(key))continue;seen.add(key);row('Upcoming service listing',c.source_name+' · '+formatFilmDate(c.source_release_date)+'. Calendar listing; check current US offers when the date arrives.','Listed','Watchmode release calendar','https://api.watchmode.com/docs');}
  if(!included.length&&!subscriptions.length&&!seen.size)row('Subscription streaming','No service-specific release date announced in the connected sources.','Unknown');
  for(const a of announcements.filter(a=>a.kind==='theatrical'))row('Theatrical announcement',a.date?formatFilmDate(a.date):'Date to be confirmed','Announced',a.source,a.sourceUrl);
  const quotes=(status.offers||[]).filter(o=>o.kind==='rent'&&typeof o.price==='number').sort((a,b)=>a.price-b.price);
  if(quotes.length){const cheapest=quotes[0];row('Current rental quote',`$${cheapest.price.toFixed(2)} on ${cheapest.provider}${cheapest.format?' · '+cheapest.format:''}`+(status.stale?' · previous check':''),'Observed');}
  const change=ReleaseModel.latestPriceChange(movie.priceHistory,status.offers);if(change)row('Observed rental price drop',`$${change.from.toFixed(2)} → $${change.to.toFixed(2)} on ${change.provider}${change.format?' · '+change.format:''}. Observed ${new Date(change.at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}.`,'Observed');
  const priceAnnouncements=announcements.filter(a=>a.kind==='price'&&typeof a.price==='number');
  for(const a of priceAnnouncements)row('Announced price change',`$${a.price.toFixed(2)} on ${a.provider}${a.date?' from '+formatFilmDate(a.date):' · date to be confirmed'}`,'Announced',a.source,a.sourceUrl);
  if(!priceAnnouncements.length){const pref=ReleaseModel.preference(movie.alert);const forecast=ReleaseModel.priceEstimate(movie,status.offers,context.movies||[],today,pref.mode==='rental'?pref.maxPrice:9.99);if(forecast)row('Expected cheaper rental',`At or below $${forecast.threshold.toFixed(2)} on ${forecast.provider}${forecast.format?' · '+forecast.format:''}, roughly ${formatFilmDate(forecast.start)} to ${formatFilmDate(forecast.end)}. Based on ${forecast.samples} other films with comparable store/format price checks. Dates are observations, not exact change times.`+(forecast.overdue?' Estimate window passed; no drop verified.':''),'Estimate');else row('Cheaper rental','No announced reduction date. '+(quotes.length?'Price history does not yet support a date estimate.':'No current price quote to compare.'),'Unknown');}
  const history=(movie.priceHistory||[]).filter(r=>r.kind==='rent').slice(-8);if(history.length){const h=document.createElement('h4');h.textContent='Your recent rental checks';root.appendChild(h);for(const r of history)appendNote(root,`${new Date(r.at).toLocaleDateString('en-US',{month:'short',day:'numeric'})} · ${r.provider}${r.format?' · '+r.format:''} · $${r.price.toFixed(2)}`);}
  if(status.datesUnavailable)appendNote(root,'Release dates could not be refreshed. Previous dates may have changed.','lookup-warning');
  if(status.announcementUnavailable)appendNote(root,'Announcement feed could not be refreshed.','lookup-warning');
  if(status.calendarWarning)appendNote(root,status.calendarWarning);
  appendNote(root,'Selected verified announcements, not a complete streaming calendar. Estimates never trigger an email.');
  return root;
}
