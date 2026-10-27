(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReleaseModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const DAY=86400000;
  const date=x=>{if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(x))return null;const day=x.slice(0,10),parsed=new Date(day+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===day?day:null;};
  const days=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/DAY);
  const addDays=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
  function datesFor(details){return details?.release_dates?.results?.find(r=>r.iso_3166_1==='US')?.release_dates || [];}
  function stages(details,today){const dates=datesFor(details);const first=type=>dates.filter(r=>type.includes(r.type)).map(r=>date(r.release_date)).filter(Boolean).sort()[0]||null;return {limited:first([2]),wide:first([3]),digital:first([4]),physical:first([5]),today};}
  function quantile(xs,p){const a=[...xs].sort((x,y)=>x-y);return a[Math.floor((a.length-1)*p)];}
  function windowFor(anchor,samples,today){if(!anchor||samples.length<5)return null;const low=quantile(samples,.2),high=quantile(samples,.8);const start=addDays(anchor,low),end=addDays(anchor,high);return {start,end,samples:samples.length,low,high,overdue:end<today};}
  function digitalEstimate(details,comparables,today){const own=stages(details,today);if(own.digital||!own.wide&&!own.limited)return null;const anchor=own.wide||own.limited;if(anchor>today)return null;
    const ids=new Set();const samples=[];for(const d of comparables){if(!d||d.id===details.id||ids.has(d.id))continue;ids.add(d.id);const s=stages(d,today),a=s.wide||s.limited;if(a&&s.digital&&s.digital<=today&&days(a,today)<=730){const n=days(a,s.digital);if(n>=7&&n<=180)samples.push(n);}}
    return windowFor(anchor,samples,today);
  }
  function quoteIdentity(o){return `${o.kind}:${String(o.provider).toLowerCase().replace(/[^a-z0-9]/g,'')}:${o.format||''}`;}
  function recordQuotes(history,offers,checkedAt){const next=Array.isArray(history)?history.filter(r=>Number.isFinite(r.price)&&r.price>=0&&Number.isFinite(r.at)):[];if(!Number.isFinite(checkedAt))return next;
    for(const o of offers||[]){if(!['rent','buy'].includes(o.kind)||typeof o.price!=='number'||!Number.isFinite(o.price)||o.price<0)continue;const key=quoteIdentity(o);if(!next.some(r=>r.key===key&&r.at===checkedAt))next.push({key,kind:o.kind,provider:o.provider,format:o.format||null,price:o.price,at:checkedAt});}
    return next.sort((a,b)=>a.at-b.at).slice(-240);
  }
  function latestPriceChange(history,offers){for(const o of offers||[]){if(o.kind!=='rent'||typeof o.price!=='number')continue;const rows=(history||[]).filter(r=>r.key===quoteIdentity(o)).sort((a,b)=>b.at-a.at);const previous=rows.find(r=>r.price!==o.price);if(previous&&previous.price>o.price)return {from:previous.price,to:o.price,provider:o.provider,format:o.format,at:rows[0]?.at};}return null;}
  function quoteDate(at){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));}
  function priceEstimate(movie,offers,comparables,today,threshold=9.99){
    const premium=(offers||[]).filter(o=>o.kind==='rent'&&Number.isFinite(o.price)&&o.price>=15&&o.price>threshold).sort((a,b)=>a.price-b.price)[0];if(!premium)return null;
    const key=quoteIdentity(premium),cutoff=Date.parse(today+'T23:59:59Z');
    const rowsFor=m=>(m.priceHistory||[]).filter(r=>r.key===key&&Number.isFinite(r.at)&&r.at<=cutoff&&Number.isFinite(r.price)).sort((a,b)=>a.at-b.at);
    const initial=rowsFor(movie).find(r=>r.price>=15);if(!initial)return null;
    const companyIds=new Set((movie.detailsSnapshot?.production_companies||[]).map(c=>c.id).filter(Boolean));
    const samples=[],companySamples=[],ids=new Set();
    for(const m of comparables||[]){
      if(m.id===movie.id||ids.has(m.id))continue;ids.add(m.id);
      const rows=rowsFor(m),first=rows.find(r=>r.price>=15),drop=first&&rows.find(r=>r.at>first.at&&r.price<=threshold),prior=drop&&rows.filter(r=>r.at<drop.at).at(-1);
      if(!prior||cutoff-first.at>730*DAY||drop.at-prior.at>10*DAY||drop.at-first.at>120*DAY)continue;
      const gap=Math.ceil((drop.at-first.at)/DAY);samples.push(gap);
      if((m.detailsSnapshot?.production_companies||[]).some(c=>companyIds.has(c.id)))companySamples.push(gap);
    }
    const matched=companySamples.length>=5,used=matched?companySamples:samples,anchor=quoteDate(initial.at),estimate=windowFor(anchor,used,today);
    return estimate?{...estimate,likely:addDays(anchor,quantile(used,.5)),provider:premium.provider,format:premium.format,threshold,confidence:matched&&used.length>=10?'Moderate':'Low',basis:matched?'shared production company, store and format':'same store and format',anchor,basisLabel:'Since the first premium-price check',companyMatched:matched}:null;
  }
  function matchingAnnouncements(feed,id){return (feed?.announcements||[]).filter(r=>r.tmdbId===id&&r.region==='US'&&['subscription','digital','theatrical','price'].includes(r.kind)&&r.sourceUrl&&/^https:\/\//.test(r.sourceUrl)&&(!r.date||date(r.date))&&(!r.expires||r.expires>=feed.today));}
  function rentalForecast(movie,status,comparables,today,threshold=7.99){
    const observed=priceEstimate(movie,status.offers,comparables,today,threshold);if(observed)return {...observed,kind:'observed'};
    const premium=(status.offers||[]).filter(o=>o.kind==='rent'&&Number.isFinite(o.price)&&o.price>=14.99&&o.price>threshold).sort((a,b)=>a.price-b.price)[0];if(!premium)return null;
    const announced=(status.announcements||[]).filter(a=>a.kind==='digital'&&date(a.date)&&a.date<=today).sort((a,b)=>a.date.localeCompare(b.date))[0];
    const digital=announced?.date||stages(status.details||movie.detailsSnapshot,today).digital;
    const first=(movie.priceHistory||[]).filter(r=>r.kind==='rent'&&Number.isFinite(r.at)&&r.at<=Date.parse(today+'T23:59:59Z')&&r.price>=14.99).sort((a,b)=>a.at-b.at)[0];
    const listed=digital&&digital<=today,anchor=listed?digital:first?quoteDate(first.at):null;if(!anchor)return null;
    // A published industry prior, not synthetic observations or a studio promise.
    const start=addDays(anchor,14),end=addDays(anchor,28);
    return {kind:'provisional',start,end,likely:addDays(anchor,21),overdue:end<today,anchor,anchorLabel:listed?'listed US digital release':'first premium rental check',provider:premium.provider,format:premium.format,threshold,confidence:'Low',samples:0,sourceUrl:'https://franchisere.substack.com/p/the-wednesday-charts-theatrical-windows-disney-universal-the-netflix-warner-bros-deal',sourceLabel:'FranchiseRe · Jan 28, 2026',basis:'Typical two-to-four-week premium rental period',targetSupported:threshold>=5.99};
  }
  function forecastTiming(estimate,today){
    const likely=date(estimate?.likely);if(!likely||!date(today))return null;
    const away=days(today,likely),when=new Date(likely+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',...(likely.slice(0,4)!==today.slice(0,4)?{year:'numeric'}:{}),timeZone:'UTC'});
    const relative=away>0?'in '+away+' day'+(away===1?'':'s'):away===0?'today':Math.abs(away)+' day'+(away===-1?'':'s')+' past estimate';
    return {date:likely,daysAway:away,when,relative,text:when+' · '+relative};
  }
  function releaseJourney(movie,status={},today,context={}){
    const valid=x=>{const d=date(x);return d&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d?d:null;};
    const cutoff=addDays(today,-365),details=(status.details?.release_dates?status.details:movie.detailsSnapshot?.release_dates?movie.detailsSnapshot:movie.meta||{}),us=datesFor(details);
    const announcements=status.announcements||[],file=movie.releaseFile||{},screenings=file.screenings||[];
    const usLaunch=us.filter(r=>[2,3,4].includes(r.type)).map(r=>valid(r.release_date)).filter(Boolean);
    const catalog=valid(movie.release_date||details.release_date),premieres=(details.release_dates?.results||[]).flatMap(country=>(country.release_dates||[]).filter(r=>r.type===1).map(r=>({...r,country:country.iso_3166_1,date:valid(r.release_date)}))).filter(r=>r.date).sort((a,b)=>a.date.localeCompare(b.date));
    const sourceDates=announcements.filter(a=>['theatrical','digital'].includes(a.kind)).map(a=>valid(a.date)).filter(Boolean);
    const relevant=[...usLaunch,...sourceDates,catalog,...screenings.map(r=>valid(r.date))].filter(Boolean).some(d=>d>=cutoff);
    if(!relevant)return null;
    // An old film with a new listed run gets the new cycle, not its entire century.
    const priorRun=us.filter(r=>[2,3].includes(r.type)).some(r=>valid(r.release_date)&&valid(r.release_date)<cutoff);
    const events=[],undated=[],safe=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:null;}catch{return null;}},tmdb='https://www.themoviedb.org/movie/'+movie.id+'/releases';
    const add=(kind,label,when,certainty,note,source)=>{const d=valid(when);if(!d||priorRun&&d<cutoff)return;events.push({kind,label,date:d,certainty,note:note||'',source:safe(source)});};
    const premiere=premieres.find(r=>!priorRun||r.date>=cutoff);
    if(premiere)add('premiere',/festival|\bfest\b|frightfest|sundance|cannes|tiff|fantasia|venice|berlin|toronto|sxsw|telluride|sitges/i.test(premiere.note||'')?'Festival premiere':'Premiere',premiere.date,'Listed',[premiere.note,premiere.country,!premiere.note?'Festival name not supplied':''].filter(Boolean).join(' · '),tmdb);
    for(const screening of screenings)if(/festival|\bfest\b|frightfest|sundance|cannes|tiff|fantasia|venice|berlin|toronto|sxsw|telluride|sitges/i.test(screening.label||''))add('festival',screening.label,screening.date,'Listed',screening.location,screening.sourceURL||file.sourceURL);
    for(const [type,label] of [[2,'Limited US theaters'],[3,priorRun?'New US theatrical run':'US theaters'],[4,'Digital rent / buy']]){
      const first=us.filter(r=>r.type===type&&valid(r.release_date)&&(!priorRun||valid(r.release_date)>=cutoff)).sort((a,b)=>a.release_date.localeCompare(b.release_date))[0];
      if(first)add(type===4?'digital':'theatrical',label,first.release_date,'Listed',first.note,tmdb);
    }
    for(const a of announcements){if(a.kind==='theatrical')add('theatrical','US theaters',a.date,'Announced','US release announcement',a.sourceUrl);if(a.kind==='digital')add('digital','Digital rent / buy',a.date,'Announced','A release date does not establish a rental price.',a.sourceUrl);if(a.kind==='subscription')add('streaming',a.provider||'Subscription streaming',a.date,'Announced','Check current offers when the date arrives.',a.sourceUrl);if(a.kind==='price'&&Number.isFinite(a.price))add('price-announcement','$'+a.price.toFixed(2)+' rental',a.date,'Announced',a.provider,a.sourceUrl);}
    for(const c of status.calendar||[])if((!c.region||c.region==='US')&&c.source_name)add('streaming',c.source_name,c.source_release_date,'Listed','Service release calendar', 'https://api.watchmode.com/docs');
    const now=context.at||Date.now(),quotes=(movie.priceHistory||[]).filter(r=>['rent','buy'].includes(r.kind)&&Number.isFinite(r.at)&&r.at<=now&&quoteDate(r.at)<=today&&typeof r.provider==='string'&&r.provider.trim()&&Number.isFinite(r.price)&&r.price>=0&&(!priorRun||r.at>=Date.parse(cutoff+'T00:00:00Z'))).sort((a,b)=>a.at-b.at);
    for(const kind of ['rent','buy']){const first=quotes.find(q=>q.kind===kind);if(first)add('quote','First saved '+(kind==='buy'?'purchase':'rental')+' quote',quoteDate(first.at), 'Observed','$'+first.price.toFixed(2)+' · '+first.provider+(first.format?' · '+first.format:'')+' · first check, not the release date',first.link);}
    const previous=new Map(),observed=new Set();
    for(const quote of quotes){const key=quote.kind+':'+storeKey(quote.provider)+':'+String(quote.format||'').toUpperCase(),before=previous.get(key);previous.set(key,quote);if(!before||!quote.format||!before.format||quote.at<=before.at||quote.price>=before.price)continue;
      const d=quoteDate(quote.at),identity=[key,d,before.price,quote.price].join(':');if(observed.has(identity))continue;observed.add(identity);
      add(quote.kind==='buy'?'purchase-drop':'price-drop',(quote.kind==='buy'?'Buy ':'')+'$'+before.price.toFixed(2)+' → $'+quote.price.toFixed(2),d,'Observed',quote.provider+(quote.format?' · '+quote.format:'')+' · observed in saved checks; the store may have changed earlier',quote.link);
    }
    for(const receipt of context.receipts||[])if(receipt.movieId===movie.id&&receipt.type==='price'&&Number.isFinite(receipt.at)&&receipt.at<=now&&quoteDate(receipt.at)<=today&&receipt.provider&&receipt.format&&Number.isFinite(receipt.from)&&Number.isFinite(receipt.to)&&receipt.to<receipt.from){const d=quoteDate(receipt.at),key='rent:'+storeKey(receipt.provider)+':'+String(receipt.format||'').toUpperCase(),identity=[key,d,receipt.from,receipt.to].join(':');if(observed.has(identity))continue;observed.add(identity);add('price-drop','$'+receipt.from.toFixed(2)+' → $'+receipt.to.toFixed(2),d,'Observed',receipt.provider+(receipt.format?' · '+receipt.format:'')+' · observed in saved checks',receipt.url);}
    const offers=status.offers||[],home=offers.some(o=>['rent','buy'].includes(o.kind)),subscriptions=[...new Set(offers.filter(o=>o.kind==='subscription').map(o=>o.provider))];
    if(home&&!events.some(e=>e.kind==='digital'))undated.push({label:'Digital date unknown',note:status.stale?'Home offers were listed at the previous check.':'A home offer is listed; its release date is not supplied.'});
    if(subscriptions.length&&!events.some(e=>e.kind==='streaming'))undated.push({label:'Streaming date unknown',note:subscriptions.join(' / ')+(status.stale?' · previous check':' · currently listed')});
    const current=cost(offers,context.budget??7.99,false),announcedNext=events.some(e=>e.kind==='price-announcement'&&e.date>=today);
    let forecast=null;if(current.band==='premium'&&!announcedNext){const e=rentalForecast(movie,status,context.movies||[],today,context.threshold??context.budget??7.99);if(e){const timing=forecastTiming(e,today);forecast={...timing,label:timing.daysAway<0?'Previous price estimate':'Next lower-rental estimate',note:(e.kind==='provisional'?'Low-confidence guess from typical premium-rental timing.':e.samples+' comparable observed drops · '+e.basis+'.')+(status.stale?' Current price needs a fresh check.':timing.daysAway<0?' No lower price verified.':' Not an announced reduction.'),source:safe(e.sourceUrl),missed:timing.daysAway<0};}}
    if(!forecast&&!announcedNext)undated.push({label:'Next price decrease',note:['free','cheap'].includes(current.band)?'No further drop predicted. Already within your limit.':'No supported estimate yet.'});
    const unique=new Map();for(const event of events){const key=[event.kind,event.date,['price-drop','purchase-drop','quote'].includes(event.kind)?event.label+':'+event.note.split(' · observed')[0]:event.kind==='streaming'?storeKey(event.label):event.kind==='festival'?event.label:''].join(':');const old=unique.get(key);if(!old||event.certainty==='Announced')unique.set(key,event);}
    const ordered=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
    // Keep the evidence intact; the visible journey tells the major changes once.
    const highlights=[],cuts=new Map();let digitalSeen=false;
    for(const event of ordered){
      if(event.kind==='quote')continue;
      if(event.kind==='digital'){if(digitalSeen)continue;digitalSeen=true;}
      if(['price-drop','purchase-drop'].includes(event.kind)){
        const amounts=event.label.match(/\d+\.\d{2}/g)||[];
        if(amounts.length!==2||Math.round((Number(amounts[0])-Number(amounts[1]))*100)<100)continue;
        const key=[event.kind,event.date,event.label].join(':');let cut=cuts.get(key);
        if(!cut){cut={...event,notes:[]};cuts.set(key,cut);highlights.push(cut);}
        const note=event.note.split(' · observed')[0],parts=note.split(' · '),provider=storeLabel(parts[0]);
        if(!cut.notes.includes(provider))cut.notes.push(provider);
        cut.note=cut.notes.join(' / ');continue;
      }
      highlights.push({...event,note:event.kind==='premiere'?event.note.replace(/ · Festival name not supplied/,''):['digital','streaming'].includes(event.kind)?'':event.note});
    }
    return {events:ordered,highlights,undated,forecast,recentSince:cutoff};
  }
  function group(status){if(status?.stale)return 'waiting';if((status?.offers||[]).some(o=>o.kind==='physical'||o.kind==='free'||o.kind==='subscription'&&o.included))return 'now';if((status?.offers||[]).some(o=>['rent','buy'].includes(o.kind)))return 'paid';return 'waiting';}
  function storeKey(name){const n=String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(['appletv','appletvstore','itunes'].includes(n))return 'apple';if(['amazon','amazonvideo','primevideo','amazonprimevideo'].includes(n))return 'amazon';return n;}
  function storeLabel(name){const key=storeKey(name);return key==='apple'?'Apple TV':key==='amazon'?'Prime Video':name;}
  function qualityRank(value){return /4k|uhd/i.test(value||'')?0:/hd/i.test(value||'')?1:/sd/i.test(value||'')?3:2;}
  function cost(offers,budget=7.99,stale=false){
    const all=offers||[];
    const physical=all.filter(o=>o.kind==='physical');if(physical.length)return {band:'free',badge:'ON YOUR SHELF',caption:[...new Set(physical.map(o=>o.format||'Physical copy'))].join(' / '),price:0,offer:physical[0],stale:false};
    const included=all.filter(o=>o.kind==='subscription'&&o.included);
    if(included.length)return {band:stale?'waiting':'free',badge:'INCLUDED',caption:[...new Set(included.map(o=>o.provider))].join(' · '),price:0,offer:included[0],stale};
    const free=all.filter(o=>o.kind==='free');if(free.length)return {band:stale?'waiting':'free',badge:'FREE',caption:free[0].provider+(free[0].adSupported?' · with ads':''),price:0,offer:free[0],stale};
    const rent=all.filter(o=>o.kind==='rent'),buy=all.filter(o=>o.kind==='buy');
    const quoted=rent.filter(o=>typeof o.price==='number'&&Number.isFinite(o.price)&&o.price>=0);
    // Compare HD/4K where supplied. An SD-only bargain should not mask an HD rental.
    const highQuality=quoted.filter(o=>qualityRank(o.format)<=1),usable=highQuality.length?highQuality:quoted;
    const preferred=usable.filter(o=>['apple','amazon'].includes(storeKey(o.provider)));
    const sort=(a,b)=>a.price-b.price||qualityRank(a.format)-qualityRank(b.format)||Number(storeKey(b.provider)==='apple')-Number(storeKey(a.provider)==='apple')||String(a.provider).localeCompare(String(b.provider));
    const chosen=[...(preferred.length?preferred:usable)].sort(sort)[0];
    if(chosen){const cheaper=[...usable].sort(sort).find(o=>o.price<chosen.price);const same=usable.filter(o=>o.price===chosen.price&&qualityRank(o.format)===qualityRank(chosen.format)&&['apple','amazon'].includes(storeKey(o.provider)));const names=[...new Set(same.map(o=>storeLabel(o.provider)))];return {band:stale?'waiting':chosen.price<=budget?'cheap':'premium',badge:'$'+chosen.price.toFixed(2),caption:'Rent · '+(names.length?names.join(' / '):storeLabel(chosen.provider))+(chosen.format?' · '+chosen.format:''),price:chosen.price,offer:chosen,cheaper,stale};}
    if(rent.length)return {band:stale?'waiting':'unknown',badge:'RENT',caption:'Price not checked',price:null,offer:rent.find(o=>['apple','amazon'].includes(storeKey(o.provider)))||rent[0],stale};
    if(buy.length){const quotes=buy.filter(o=>typeof o.price==='number'&&Number.isFinite(o.price)&&o.price>=0).sort(sort);return {band:stale?'waiting':'buy',badge:quotes.length?'$'+quotes[0].price.toFixed(2):'BUY',caption:'Purchase only · '+(quotes.length?storeLabel(quotes[0].provider):'no rental listed'),price:quotes[0]?.price??null,offer:quotes[0]||buy[0],stale};}
    return {band:'waiting',badge:'WAITING',caption:all.some(o=>o.kind==='subscription')?'Separate subscription needed':'No current offer',price:null,offer:null,stale};
  }
  function compactOffers(offers){const groups=new Map();for(const o of offers||[]){const key=[o.kind,storeKey(o.provider),o.channel,typeof o.price==='number'?o.price:'?',o.included].join(':');if(!groups.has(key))groups.set(key,{...o,provider:['rent','buy'].includes(o.kind)?storeLabel(o.provider):o.provider,formats:[]});const row=groups.get(key);if(o.format&&!row.formats.includes(o.format))row.formats.push(o.format);if(qualityRank(o.format)<qualityRank(row.format)){row.format=o.format;row.link=o.link||row.link;}}return [...groups.values()].map(o=>({...o,format:o.formats.sort((a,b)=>qualityRank(a)-qualityRank(b)).join(' / ')||null}));}
  function preference(raw){return {mode:['any','mine','rental'].includes(raw?.mode)?raw.mode:'any',maxPrice:typeof raw?.maxPrice==='number'&&Number.isFinite(raw.maxPrice)&&raw.maxPrice>=0&&raw.maxPrice<=100?raw.maxPrice:7.99};}
  return {date,days,addDays,datesFor,stages,digitalEstimate,quoteIdentity,recordQuotes,latestPriceChange,priceEstimate,rentalForecast,forecastTiming,releaseJourney,matchingAnnouncements,group,preference,storeKey,storeLabel,qualityRank,cost,compactOffers};
});
