// Startup reports settled tasks, not guessed network percentages. Background
// data can finish while someone reads without rebuilding their current shelf.
(function(){
 const tasks=new Map([['saved','Saved films'],['collection','Your collection'],['taste','Taste profile'],['screenings','Screening dates']].map(([id,label])=>[id,{label,state:'pending'}]));
 const panel=document.createElement('aside');panel.id='rewind-startup';panel.className='startup-progress';panel.setAttribute('aria-label','Loading Rewind');
 const label=document.createElement('p');label.id='startup-label';label.setAttribute('role','status');label.setAttribute('aria-live','polite');
 const bar=document.createElement('progress');bar.setAttribute('aria-labelledby','startup-label');panel.append(label,bar);
 const updates=document.createElement('button');updates.id='rewind-pending-updates';updates.className='pending-film-updates';updates.type='button';updates.hidden=true;updates.textContent='Updated films ready · Show updates';
 document.body.append(panel,updates);
 const pending=new Map();let finished=false,hideTimer,applying=false;
 function paint(){const rows=[...tasks.values()],settled=rows.filter(t=>t.state!=='pending').length;bar.max=rows.length;bar.value=settled;const next=rows.find(t=>t.state==='pending');
  label.textContent=next?'Loading '+next.label.toLowerCase()+' · '+settled+' of '+rows.length:rows.some(t=>t.state==='delayed')?'Saved films ready · some updates delayed':'Rewind is ready';
  if(!next&&!finished){finished=true;clearTimeout(slowTimer);hideTimer=setTimeout(()=>{panel.hidden=true;},rows.some(t=>t.state==='delayed')?3500:700);}
 }
 function begin(id,label){if(!tasks.has(id))tasks.set(id,{label,state:'pending'});paint();}
 function finish(id,state='done'){const task=tasks.get(id);if(task)task.state=state;paint();}
 function track(id,promise,label){begin(id,label||tasks.get(id)?.label||id);Promise.resolve(promise).then(()=>finish(id),()=>finish(id,'delayed'));}
 function reading(){return !!document.querySelector('#tab-watchlist.active')&&(window.scrollY>160||!!document.querySelector('dialog[open]'));}
 function defer(key,draw){if(applying||!reading())return false;pending.set(key,draw);updates.hidden=false;return true;}
 async function apply(){applying=true;const card=[...document.querySelectorAll('#tab-watchlist .rental-card')].find(el=>{const r=el.getBoundingClientRect();return r.bottom>80&&r.top<innerHeight;});const id=card?.dataset.movieId,offset=card?.getBoundingClientRect().top;
  const jobs=[...pending.values()];pending.clear();updates.hidden=true;
  for(const draw of jobs){try{await draw();}catch{}}
  if(id){const current=document.querySelector('#tab-watchlist .rental-card[data-movie-id="'+id+'"]');if(current){const difference=current.getBoundingClientRect().top-offset;if(Math.abs(difference)>1)window.scrollBy(0,difference);}}
  applying=false;
 }
 updates.onclick=()=>apply();
 document.addEventListener('close',()=>{if(!reading()&&pending.size)apply();},true);
 let scrollTimer;window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);if(window.scrollY<100&&pending.size&&!document.querySelector('dialog[open]'))scrollTimer=setTimeout(()=>{if(window.scrollY<100)apply();},120);},{passive:true});
 const slowTimer=setTimeout(()=>{for(const task of tasks.values())if(task.state==='pending')task.state='delayed';paint();},20000);
 window.RewindStartup={begin,track,finish,defer};paint();
})();
