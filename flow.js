/* One navigation level for intent; selection sources stay inside their flow. */
(()=>{
 const by=id=>document.getElementById(id),modes=document.querySelector('.hub-mode-buttons');
 const make=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b;};
 const nav=document.createElement('nav');nav.className='discover-intents';nav.setAttribute('aria-label','Discover');
 let intent='explore';
 const choices=document.createElement('div');choices.className='picker-methods';choices.setAttribute('aria-label','How to choose');
 const hint=document.createElement('p');hint.className='flow-note';
 const oldIntro=by('discovery-intro');oldIntro.before(nav,hint);modes.hidden=true;
 const stageBar=by('discovery-stages');
 const sources=document.createElement('div');sources.className='picker-sources';sources.setAttribute('aria-label','Collection');
 const surprise=document.querySelector('.surprise-command');
 const show=(next,mode)=>{
  intent=next;document.querySelectorAll('[data-discover-intent]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.discoverIntent===next)));
  hint.textContent=next==='pick'?'One good film, or a shelf of unexpected possibilities.':next==='coming'?'Find a film early. Track it here, follow its release on the calendar.':'Search for a film, or explore recent releases.';
  choices.hidden=next!=='pick';sources.hidden=next!=='pick';
  document.querySelector('[data-find-mode='+mode+']').click();
  oldIntro.hidden=true;
  stageBar.hidden=next!=='coming';
  if(next==='explore')document.querySelector('[data-discovery-stage=recent]').click();
  if(next==='coming')document.querySelector('[data-discovery-stage=coming]').click();
 };
 for(const [key,label,mode] of [['pick','Pick for me','oracle'],['explore','Explore','shelf'],['coming','Coming soon','shelf']]){const b=make(label,()=>show(key,mode));b.dataset.discoverIntent=key;nav.append(b);}
 const now=make('Now',()=>show('pick','oracle')),random=make('Surprise me',()=>{choices.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===random)));surprise.click();stageBar.hidden=true;oldIntro.hidden=true;});
 choices.append(now,random);nav.after(choices,sources);
 for(const [label,mode] of [['From my watchlist','roulette'],['My physical shelf','physical']])sources.append(make(label,()=>show('pick',mode)));
 document.querySelectorAll('[data-find-mode]').forEach(b=>b.addEventListener('click',()=>{if(intent==='pick'){now.setAttribute('aria-pressed',String(b.dataset.findMode==='oracle'));random.setAttribute('aria-pressed','false');sources.querySelectorAll('button').forEach((s,i)=>s.setAttribute('aria-pressed',String(b.dataset.findMode===(i?'physical':'roulette'))));}}));
 document.querySelector('[data-discovery-stage=recent]').hidden=true;
 document.querySelector('[data-discovery-stage=coming]').textContent='Announced releases';
 document.querySelector('[data-discovery-stage=circuit]').textContent='Festival & limited';
 by('choose-tonight').onclick=()=>{document.querySelector('[data-tab=discover]').click();show('pick','oracle');};
 const saved=document.querySelector('.header-saved');saved.textContent='OPEN COLLECTION';saved.classList.add('collection-link');document.querySelector('.counter-welcome').append(saved);
 window.addEventListener('rewind:state',()=>{saved.textContent='OPEN COLLECTION';});
 window.addEventListener('rewind:card-rendered',()=>{saved.textContent='OPEN COLLECTION';});
 show('explore','shelf');
})();
