const crypto=require('node:crypto'),M=require('../movie-news-model.js');
const google=q=>'https://news.google.com/rss/search?'+new URLSearchParams({q,hl:'en-US',gl:'US',ceid:'US:en'});
const SOURCES=[
 {name:'The Hollywood Reporter',url:'https://www.hollywoodreporter.com/c/movies/movie-news/feed/',hosts:['www.hollywoodreporter.com','hollywoodreporter.com']},
 {name:'IndieWire',url:'https://www.indiewire.com/feed/',hosts:['www.indiewire.com','indiewire.com']},
 {name:'Horror reporting',url:google('(site:dreadcentral.com OR site:bloody-disgusting.com) (announces OR director OR "test screening" OR acquisition OR restoration) when:30d'),aggregated:true},
 {name:'Studio announcements',url:google('(site:a24films.com OR site:neonrated.com OR site:searchlightpictures.com) (film OR movie OR announces OR director) when:30d'),aggregated:true},
 {name:'Evil Dead reports',url:google('"Evil Dead Wrath" when:60d'),aggregated:true},
 {name:'Projects to watch',url:google('("Evil Dead Wrath" OR "Chronovisor" OR "Daniels") (film OR movie OR screening) when:60d'),aggregated:true},
 {name:'Filmmaker projects',url:google('(site:hollywoodreporter.com OR site:indiewire.com OR site:deadline.com OR site:variety.com) ("new film" OR "next film" OR "directing" OR "acquires" OR "test screening") when:30d'),aggregated:true},
 {name:'Stranger films',url:google('("found footage" OR "surreal" OR "experimental film" OR "folk horror" OR "microbudget") (announces OR director OR acquisition OR premiere OR restoration) when:30d'),aggregated:true}
];
const publishers=['hollywoodreporter.com','indiewire.com','deadline.com','variety.com','dreadcentral.com','bloody-disgusting.com','a24films.com','neonrated.com','searchlightpictures.com','thewrap.com','screendaily.com','theplaylist.net','fangoria.com','filmmakermagazine.com'];
function decode(s){return String(s||'').replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/,'$1').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):'';}).replace(/&(?:amp|lt|gt|quot|apos|rsquo|lsquo|rdquo|ldquo|nbsp);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&rsquo;':'’','&lsquo;':'‘','&rdquo;':'”','&ldquo;':'“','&nbsp;':' '})[x]);}
const field=(xml,name)=>decode(xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i'))?.[1]||'').trim();
function safeURL(s,hosts){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:null;}catch{return null;}}
const imageHosts=[...publishers,'wp.com','pmc.com','pmcimagery.com','wordpress.com','imgix.net','svdcdn.com'];
function articleImage(html){for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){const attrs={};for(const a of tag[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attrs[a[1].toLowerCase()]=decode(a[2]);if(['og:image','twitter:image'].includes(attrs.property||attrs.name)){const url=safeURL(attrs.content,imageHosts);if(url)return url;}}return null;}
async function enrichImages(items,previous,fetcher,at){const old=new Map((previous.items||[]).map(i=>[i.id,i]));const todo=items.filter(i=>!i.aggregated).slice(0,12);let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<todo.length){const item=todo[next++],prior=old.get(item.id);if(prior?.imageURL){item.imageURL=prior.imageURL;item.imageCheckedAt=prior.imageCheckedAt;continue;}if(at-(prior?.imageCheckedAt||0)<86400000)continue;item.imageCheckedAt=at;try{if(!safeURL(item.url,publishers))continue;const r=await fetcher(item.url,{signal:AbortSignal.timeout(4000),redirect:'error'});if(!r.ok)continue;const html=await r.text();if(html.length>2000000)continue;item.imageURL=articleImage(html)||undefined;}catch{}}}));}
function parseFeed(xml,source,at=Date.now()){
 if(!/<rss\b|<feed\b/i.test(xml))throw Error('Not a news feed');
 const rows=[];for(const chunk of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
  const item=chunk[1],raw=field(item,'title'),sourceTag=item.match(/<source\s[^>]*url=["']([^"']+)/i)?.[1],publisherURL=source.aggregated?safeURL(decode(sourceTag||''),publishers):source.url;
  if(source.aggregated&&!publisherURL)continue;
  const publisher=source.aggregated?field(item,'source'):source.name;
  const headline=raw.replace(source.aggregated?new RegExp(' - '+publisher.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'):/\b\B/,'').replace(/<[^>]*>/g,'').trim().slice(0,300);
  const url=safeURL(field(item,'link'),source.aggregated?['news.google.com']:source.hosts),stamp=Date.parse(field(item,'pubDate'));
  if(!headline||!url||!Number.isFinite(stamp)||stamp>at+300000||at-stamp>60*86400000)continue;
  const official=!source.aggregated&&/a24films|neonrated|searchlightpictures/.test(new URL(url).hostname);
  rows.push({id:crypto.createHash('sha256').update(url).digest('hex').slice(0,24),headline,project:M.project(headline),source:publisher||source.name,url,publisherURL,aggregated:!!source.aggregated,publishedAt:new Date(stamp).toISOString(),status:M.kind(headline,official)});
 }return rows.slice(0,60);
}
async function refresh(previous={},fetcher=fetch,at=Date.now()){
 const checks=await Promise.allSettled(SOURCES.map(async source=>{const r=await fetcher(source.url,{signal:AbortSignal.timeout(9000),headers:{'User-Agent':'Rewind personal film news reader','Accept':'application/rss+xml, application/xml, text/xml'}});if(!r.ok)throw Error('Feed unavailable');const xml=await r.text();if(xml.length>2000000)throw Error('Feed too large');return parseFeed(xml,source,at);}));
 const sources=SOURCES.map((s,i)=>({name:s.name,url:s.url,checkedAt:checks[i].status==='fulfilled'?at:previous.sources?.find(p=>p.name===s.name)?.checkedAt||null,unavailable:checks[i].status==='rejected',items:checks[i].status==='fulfilled'?checks[i].value.length:0}));
 const curated=[{id:'evil-dead-wrath-screening-20260921',headline:'Evil Dead Wrath: a test-screening rumor surfaces',project:'Evil Dead Wrath',source:'Dread Central',url:'https://www.dreadcentral.com/news/589424/is-a-fan-favorite-evil-dead-character-returning-in-evil-dead-wrath/',publisherURL:'https://www.dreadcentral.com/',aggregated:false,publishedAt:'2026-09-21',datePrecision:'day',status:'rumor',feed:'Verified source lead',checkedAt:Date.parse('2026-10-12')}];
 const fresh=checks.flatMap((r,i)=>r.status==='fulfilled'?r.value.map(item=>({...item,feed:SOURCES[i].name,checkedAt:at})):[]),rows=new Map();
 for(const item of [...fresh,...curated,...(previous.items||[])])if(at-Date.parse(item.publishedAt)<=60*86400000&&!rows.has(item.id))rows.set(item.id,item);
 const items=[...rows.values()].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,240);if(checks.some(c=>c.status==='fulfilled'))await enrichImages(items,previous,fetcher,at);
 return {schema:2,checkedAt:checks.some(c=>c.status==='fulfilled')?at:previous.checkedAt||null,attemptedAt:at,stale:checks.every(c=>c.status==='rejected'),sources,items};
}
module.exports={decode,field,SOURCES,parseFeed,refresh,safeURL,articleImage};
