// Roxy's public calendar uses venue wall times with an incorrect fixed UTC offset.
// Preserve the posted clock time and resolve it in America/Denver, including DST.
const SOURCE='https://www.theroxytheater.org/showtimes/';
function mountainInstant(wall){
 const parts=wall.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);if(!parts)return null;
 const target=Date.parse(parts[1]+'T'+parts[2]+'Z');if(!Number.isFinite(target))return null;let stamp=target;
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<3;i++){const p=Object.fromEntries(fmt.formatToParts(stamp).map(p=>[p.type,p.value]));const shown=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);stamp+=target-shown;}
 return new Date(stamp).toISOString();
}
function officialURL(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname==='www.theroxytheater.org'?u.href:null;}catch{return null;}}
function parseCalendar(body,at=Date.now()){
 if(!Array.isArray(body.events))throw Error('Invalid Roxy calendar');
 const rows=new Map();for(const e of body.events){
  const url=officialURL(e.show_url),wall=String(e.start||''),date=wall.slice(0,10),startsAt=mountainInstant(wall);
  if(!url||!e.title||!startsAt||e.allDay)continue;
  let item=rows.get(url);if(!item){item={id:'roxy:'+new URL(url).pathname,title:String(e.title),venueId:'roxy',venue:'Roxy Theater',location:'Missoula',source:'Roxy Theater official calendar',url,poster:officialURL(e.image),dates:[],ranges:[],screenings:[]};rows.set(url,item);}
  const time=new Date(startsAt).toLocaleTimeString('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'2-digit'}).toLowerCase().replace(' ','');
  if(item.screenings.some(s=>s.startsAt===startsAt))continue;
  item.screenings.push({date,time,startsAt,url,format:[e.format,e.ocap?'Open captions':null,e.subbed?'Subtitled':null,e.annex?'Annex':e.garden?'Garden':null].filter(Boolean).join(' · ')});item.dates.push(date);
 }
 for(const item of rows.values()){item.dates=[...new Set(item.dates)].sort();item.screenings.sort((a,b)=>a.startsAt.localeCompare(b.startsAt));item.start=item.dates[0];item.end=item.dates.at(-1);item.dateLabel=item.dates.length+' listed days';}
 return {items:[...rows.values()],checkedAt:at,stale:false,sourceURL:SOURCE};
}
async function refresh(week,fetcher=fetch){const end=new Date(week+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+13);const url='https://www.theroxytheater.org/wp-json/gecko-theme/v1/calendar-events?'+new URLSearchParams({start_date:week,end_date:end.toISOString().slice(0,10)});const r=await fetcher(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});if(!r.ok)throw Error('Roxy calendar unavailable');return parseCalendar(await r.json());}
module.exports={parseCalendar,mountainInstant,refresh,SOURCE};
