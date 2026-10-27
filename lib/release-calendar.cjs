const PUBLIC_TMDB_KEY='000802da6224e125437187b196cde898';
const M=require('../calendar-export-model.js');
const announcements=require('../release-announcements.json');
const mountainDay=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const ids=rows=>[...new Set((rows||[]).filter(x=>Number.isSafeInteger(x)&&x>0))].slice(0,1000);
function members(body){return [...ids(body.movies).map(id=>({key:'movie:'+id,type:'movie',id,...(typeof body.movieTitles?.[id]==='string'?{title:body.movieTitles[id].slice(0,300)}:{})})),...(body.series||[]).filter(s=>Number.isSafeInteger(s.id)&&s.id>0).slice(0,200).map(s=>({key:'tv:'+s.id,type:'tv',id:s.id,seasons:ids(s.seasons).filter(n=>n<=100)}))];}
async function refresh(owner,fetcher=fetch,at=Date.now(),limit=40){if(!owner?.enabled)return owner;
let local=owner.local;
if(!local||at-(local.checkedAt||0)>3600000){try{const r=await fetcher('https://transmissionalbum.netlify.app/.netlify/functions/rewind-cinema',{signal:AbortSignal.timeout(10000)});if(r.ok){const data=await r.json();if(Array.isArray(data.local?.items)&&!data.local.stale&&Number.isFinite(data.local.checkedAt)&&data.local.checkedAt<=at&&at-data.local.checkedAt<36*3600000)local={items:data.local.items,checkedAt:data.local.checkedAt};}}catch{}}
const today=mountainDay(at),verifiedLocal=local&&Number.isFinite(local.checkedAt)&&local.checkedAt<=at&&at-local.checkedAt<36*3600000?local.items||[]:[],cache={...(owner.cache||{})},due=owner.members.filter(m=>at-(cache[m.key]?.checkedAt||0)>6*3600000).sort((a,b)=>(cache[a.key]?.checkedAt||0)-(cache[b.key]?.checkedAt||0)||Number(b.type==='tv')-Number(a.type==='tv')).slice(0,limit);let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<due.length){const m=due[next++];try{const url=new URL('https://api.themoviedb.org/3/'+m.type+'/'+m.id);url.searchParams.set('api_key',process.env.TMDB_API_KEY||PUBLIC_TMDB_KEY);if(m.type==='movie')url.searchParams.set('append_to_response','release_dates');const r=await fetcher(url,{signal:AbortSignal.timeout(6000)});if(!r.ok)continue;const d=await r.json();if(d.id!==m.id)continue;if(m.type==='tv'){for(const season of d.seasons||[]){if(!m.seasons?.length||!m.seasons.includes(season.season_number))continue;const seasonURL=new URL('https://api.themoviedb.org/3/tv/'+m.id+'/season/'+season.season_number);seasonURL.searchParams.set('api_key',process.env.TMDB_API_KEY||PUBLIC_TMDB_KEY);try{const sr=await fetcher(seasonURL,{signal:AbortSignal.timeout(6000)});if(sr.ok){const sd=await sr.json();if(sd.season_number===season.season_number&&Array.isArray(sd.episodes))season.episodes=sd.episodes;else if(cache[m.key]?.events?.some(e=>e.title.includes(' · episodes ' )))throw Error('Incomplete episode data');}else throw Error('Season lookup failed');}catch{if(cache[m.key]?.events?.some(e=>e.title.includes(' · episodes ' )))throw Error('Keep previous episode schedule');}}}const events=m.type==='tv'?M.tvEvents(d,m.seasons,today):M.movieEvents({...d,announcements:(announcements.announcements||[]).filter(a=>a.tmdbId===m.id&&a.region==='US')},today,verifiedLocal);const retained=new Map((cache[m.key]?.events||[]).filter(e=>e.date<today).map(e=>[e.key,e]));for(const e of events)if(!(e.key.endsWith(':kalispell')&&retained.has(e.key)))retained.set(e.key,e);cache[m.key]={checkedAt:at,title:d.title||d.name,events:[...retained.values()]};}catch{}}}));for(const m of owner.members.filter(m=>m.type==='movie')){
 const c=cache[m.key]||{title:m.title,events:[]},title=c.title||m.title||(c.events||[])[0]?.title?.split(' · ')[0];
 if(!title)continue;
 const event=M.localMovieEvent({id:m.id,title},verifiedLocal,today),past=(c.events||[]).find(e=>e.key.endsWith(':kalispell')&&e.date<today);
 const rest=(c.events||[]).filter(e=>!e.key.endsWith(':kalispell'));
 cache[m.key]={...c,title,events:[...rest,...(past?[past]:event?[event]:[])]};
}
const keys=new Set(owner.members.map(m=>m.key));return {...owner,local,cache:Object.fromEntries(Object.entries(cache).filter(([key])=>keys.has(key))),checkedAt:at};}
function exclusions(raw){return {movie:String(raw?.movie||'').slice(0,10000),tv:String(raw?.tv||'').slice(0,10000)};}
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function excluded(e,raw){const type=e.key.startsWith('tv:')?'tv':'movie';return String(raw?.[type]||'').split('\n').some(line=>{const [title,season]=line.split('|').map(x=>x.trim());return norm(title).length>=2&&(' '+norm(e.title.split(' · ')[0])+' ').includes(' '+norm(title)+' ')&&(!season||e.key.includes(':season:'+Number(season)+':')||e.key.endsWith(':season:'+Number(season)));});}
function events(owner){
 const now=Date.now(),today=mountainDay(now),localFresh=Number.isFinite(owner?.local?.checkedAt)&&owner.local.checkedAt<=now&&now-owner.local.checkedAt<36*3600000;
 const cache={...(owner?.cache||{})};for(const m of owner?.members||[])cache[m.key]={title:m.title,...(cache[m.key]||{})};
 return Object.entries(cache).flatMap(([key,c])=>{
  const rows=(c.events||[]).filter(e=>(!e.key.startsWith('movie:')||M.eligibleMovieEvent(e))&&(!e.key.endsWith(':kalispell')||e.date<today||localFresh));
  if(key.startsWith('movie:')){
   const title=c.title||(c.events||[])[0]?.title?.split(' · ')[0];
   const local=localFresh&&title&&M.localMovieEvent({id:Number(key.split(':')[1]),title},owner.local?.items||[],today);
   if(local&&!rows.some(e=>e.key===local.key))rows.push(local);
  }
  return rows.filter(e=>!excluded(e,owner?.exclusions)).map(e=>({...e,description:e.description+' Last source check: '+new Date((e.key.endsWith(':kalispell')?owner.local?.checkedAt||c.checkedAt:c.checkedAt)||Date.now()).toISOString().slice(0,10)+'.'}));
 });
}
module.exports={members,refresh,events,exclusions};
