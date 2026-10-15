function appendNote(root,text,cls='offer-note'){const p=document.createElement('p');p.className=cls;p.textContent=text;root.appendChild(p);return p;}
function releaseSource(root,label,url){const safe=RewindModel.safeLink(url);if(!safe)return;const a=document.createElement('a');a.href=safe;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;root.appendChild(a);}
function renderAvailability(movie,status,context={}) {
  const wrap=document.createElement('div');wrap.className='availability';
  if(status.stale)appendNote(wrap,'Could not refresh. Previous availability may have changed.','lookup-warning');
  if(status.previousLabel&&status.previousLabel!==status.label)appendNote(wrap,'Previously: '+status.previousLabel);
  const all=ReleaseModel.compactOffers(status.offers),cost=ReleaseModel.cost(status.offers,rentalBudget,status.stale);
  const chosen=all.filter(o=>o.kind==='physical'||o.kind==='free'||o.kind==='subscription'&&o.included||o.kind==='rent'&&['apple','amazon'].includes(ReleaseModel.storeKey(o.provider)));
  if(!chosen.length&&cost.offer)chosen.push(cost.offer);
  const rows=(root,offers)=>{for(const o of offers){const row=document.createElement('div');row.className='offer-row';const name=document.createElement(o.link?'a':'span');name.textContent=o.provider;if(o.link){name.href=o.link;name.target='_blank';name.rel='noopener noreferrer';}const price=document.createElement('strong');price.textContent=o.kind==='physical'?(o.format||'Physical copy')+' · owned':o.kind==='subscription'?(o.included?'Included':'Subscription'):o.kind==='free'?'Free'+(o.adSupported?' with ads':''):typeof o.price==='number'?(o.kind==='buy'?'Buy ':'Rent ')+'$'+o.price.toFixed(2)+(o.format?' · '+o.format:''):(o.kind==='buy'?'Buy':o.kind==='rent'?'Rent':'Viewing option')+' · price not supplied';row.append(name,price);root.appendChild(row);}};
  const heading=document.createElement('h4');heading.textContent='Where to watch';wrap.appendChild(heading);rows(wrap,chosen.slice(0,3));
  if(!all.length)appendNote(wrap,'No confirmed viewing option yet.');
  const remaining=all.filter(o=>!chosen.slice(0,3).includes(o));
  if(remaining.length){const more=document.createElement('details');more.className='source-disclosure viewing-options';const summary=document.createElement('summary');summary.textContent='More viewing options · '+remaining.length;more.appendChild(summary);rows(more,remaining);wrap.appendChild(more);}
  if(status.checkedAt)appendNote(wrap,(status.stale?'Previous check · ':'Checked · ')+new Date(status.checkedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),'checked-note');
  const journey=renderReleaseTimeline(movie,status,context);if(journey.nodeType===11){if(ReleaseModel.rentalForecast(movie,status,context.movies||[],discoveryWindow().today,rentalBudget))wrap.appendChild(renderRentalForecast(movie,status,context));}else wrap.appendChild(journey);
  const sources=document.createElement('details');sources.className='source-disclosure release-sources';const summary=document.createElement('summary');summary.textContent='Sources & price history';sources.append(summary,renderReleaseEvidence(movie,status,context));
  if(status.priceWarning)appendNote(sources,status.priceWarning,'lookup-warning');appendNote(sources,'US listings: JustWatch. '+(status.priceSources?.length?'Price sources: '+status.priceSources.join(' / ')+'.':'No current dollar quote supplied.'));if(status.quoteCheckedAt)appendNote(sources,'Prices checked '+new Date(status.quoteCheckedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'. Store checkout is final.');wrap.appendChild(sources);
  return wrap;
}
function renderRentalForecast(movie,status,context={}){
  const root=document.createElement('section');root.className='rental-forecast';const heading=document.createElement('h4');heading.textContent='Worth waiting?';root.append(heading);
  const pref=ReleaseModel.preference(movie.alert),threshold=pref.mode==='rental'?pref.maxPrice:rentalBudget;
  const announced=(status.announcements||[]).filter(a=>a.kind==='price'&&Number.isFinite(a.price)&&a.price<=threshold&&a.date).sort((a,b)=>a.date.localeCompare(b.date))[0];
  if(announced){appendNote(root,'$'+announced.price.toFixed(2)+' on '+announced.provider+' · '+formatFilmDate(announced.date),'forecast-date');appendNote(root,'Announced price change. Check the store when the date arrives.');releaseSource(root,announced.source||'Announcement source',announced.sourceUrl);return root;}
  const cost=ReleaseModel.cost(status.offers,threshold,status.stale);
  if(!status.stale&&['free','cheap'].includes(cost.band))return document.createDocumentFragment();
  if(!status.offers?.some(o=>o.kind==='rent'))return document.createDocumentFragment();
  const e=ReleaseModel.rentalForecast(movie,status,context.movies||[],discoveryWindow().today,threshold);
  if(!e){appendNote(root,cost.price===null?'Rental price not checked yet.':'No scheduled sale to wait for.','forecast-date');appendNote(root,cost.price===null?'A current rental quote is needed before estimating a drop.':'This is outside the premium rental period we can estimate. We’ll keep checking your price.');return root;}
  const timing=ReleaseModel.forecastTiming(e,discoveryWindow().today);
  appendNote(root,'Cheaper rental estimate: '+timing.text,'forecast-date');
  if(status.stale)appendNote(root,'The last price check predates this view. Refresh to see whether the rental has fallen.');
  else if(timing.daysAway<0)appendNote(root,'The estimated date has passed. The latest checked rental is still above your limit; no lower price has been verified.');
  if(e.kind==='provisional'){
    appendNote(root,'Low confidence · based on the '+e.anchorLabel+' ('+formatFilmDate(e.anchor)+') and a typical 2–4 week premium rental period. One rough date, not a studio announcement.'+(e.targetSupported?'':' A regular rental could still exceed your $'+threshold.toFixed(2)+' limit.'));releaseSource(root,e.sourceLabel,e.sourceUrl);return root;
  }
  appendNote(root,'Estimated at or below $'+e.threshold.toFixed(2)+' on '+e.provider+(e.format?' · '+e.format:'')+'.');
  appendNote(root,e.confidence+' confidence · '+e.samples+' films · '+e.basis+'.','forecast-basis');appendNote(root,'Median and middle 60% of observed drop timings, measured from the first premium-price check. Checks can lag the actual change. Production-company matching is not verified US-distributor matching. This estimate will not trigger an alert.');return root;
}
function renderReleaseEvidence(movie,status,context={}){
  const root=document.createElement('section');root.className='release-timeline';const heading=document.createElement('h4');heading.textContent='Date sources & pricing';root.appendChild(heading);
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
  if(!priceAnnouncements.length){const pref=ReleaseModel.preference(movie.alert);const forecast=ReleaseModel.rentalForecast(movie,status,context.movies||[],today,pref.mode==='rental'?pref.maxPrice:rentalBudget);if(forecast?.kind==='provisional')row('Provisional cheaper rental',ReleaseModel.forecastTiming(forecast,today).text+'. Broad premium-rental timing, not observed film-specific drops.'+(status.stale?' Price needs a fresh check.':forecast.likely<today?' Estimated date passed; no lower price verified.':''),'Estimate',forecast.sourceLabel,forecast.sourceUrl);else if(forecast)row('Expected cheaper rental',`At or below $${forecast.threshold.toFixed(2)} on ${forecast.provider}${forecast.format?' · '+forecast.format:''}, estimated ${ReleaseModel.forecastTiming(forecast,today).text}. Based on ${forecast.samples} other films with comparable store/format price checks. Dates are observations, not exact change times.`+(status.stale?' Price needs a fresh check.':forecast.likely<today?' Estimated date passed; no drop verified.':''),'Estimate');else row('Cheaper rental','No announced reduction date. '+(quotes.length?'Price history does not yet support a date estimate.':'No current price quote to compare.'),'Unknown');}
  const history=(movie.priceHistory||[]).filter(r=>r.kind==='rent').slice(-8);if(history.length){const h=document.createElement('h4');h.textContent='Your recent rental checks';root.appendChild(h);for(const r of history)appendNote(root,`${new Date(r.at).toLocaleDateString('en-US',{month:'short',day:'numeric'})} · ${r.provider}${r.format?' · '+r.format:''} · $${r.price.toFixed(2)}`);}
  if(status.datesUnavailable)appendNote(root,'Release dates could not be refreshed. Previous dates may have changed.','lookup-warning');
  if(status.announcementUnavailable)appendNote(root,'Announcement feed could not be refreshed.','lookup-warning');
  if(status.calendarWarning)appendNote(root,status.calendarWarning);
  appendNote(root,'Selected verified announcements, not a complete streaming calendar. Estimates never trigger an email.');
  return root;
}

function renderReleaseTimeline(movie,status,context={}){
 const today=discoveryWindow().today,pref=ReleaseModel.preference(movie.alert),journey=ReleaseModel.releaseJourney(movie,status,today,{...context,budget:rentalBudget,threshold:pref.mode==='rental'?pref.maxPrice:rentalBudget,receipts:context.receipts||hubState.changeReceipts});
 if(!journey)return document.createDocumentFragment();
 const root=document.createElement('section');root.className='visual-release release-journey';const heading=document.createElement('h4');heading.textContent='Release journey';root.appendChild(heading);
 const line=document.createElement('ol');line.className='release-milestones';line.setAttribute('aria-label','Release journey');
 for(const point of journey.events){const item=document.createElement('li');item.className='release-milestone'+(point.kind==='price-drop'?' price-drop':'');item.dataset.kind=point.kind;const time=document.createElement('time');time.dateTime=point.date;time.textContent=formatFilmDate(point.date);const content=document.createElement('div'),label=document.createElement('strong'),badge=document.createElement('small');label.textContent=point.label;badge.className='journey-certainty';badge.textContent=point.certainty;content.append(label,badge);if(point.note)appendNote(content,point.note,'journey-note');if(point.source)releaseSource(content,'Source ↗',point.source);item.append(time,content);line.appendChild(item);}
 if(journey.events.length)root.appendChild(line);
 if(journey.forecast){const f=journey.forecast,box=document.createElement('section');box.className='journey-next estimated'+(f.missed?' missed':'');const title=document.createElement('h5');title.textContent=f.label;const date=document.createElement('p');date.className='journey-prediction';date.textContent=f.text;box.append(title,date);appendNote(box,f.note,'journey-note');if(f.source)releaseSource(box,'Estimate basis ↗',f.source);root.appendChild(box);}
 if(journey.undated.length){const notes=document.createElement('div');notes.className='journey-unknowns';for(const point of journey.undated){const row=document.createElement('p'),label=document.createElement('strong');label.textContent=point.label+': ';row.append(label,document.createTextNode(point.note));notes.appendChild(row);}root.appendChild(notes);}
 return root;
}
