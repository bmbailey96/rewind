/* Section browsing changes the view, never the saved collection. */
window.WatchlistBrowser=(()=>{
 let section=null,sort='default',returnY=0,returnSection=null;
 const ids={included:'rw-arrived',cheap:'rw-available',premium:'rw-coming',theater:'rw-theater',upcoming:'rw-upcoming',waiting:'rw-waiting',unchecked:'rw-unchecked',development:'rw-development'};
 const toolbar=document.createElement('div');toolbar.className='watchlist-section-tools';toolbar.hidden=true;
 const back=document.createElement('button');back.textContent='← Back to Watchlist';back.className='secondary';
 const label=document.createElement('label');label.textContent='Sort ';const select=document.createElement('select');select.setAttribute('aria-label','Sort this watchlist section');
 for(const [value,text] of [['default','Recommended order'],['added','Recently saved'],['price','Price'],['az','A–Z']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}label.append(select);const empty=document.createElement('p');empty.className='offer-note';empty.textContent='No titles match this section. Try another search or return to Watchlist.';empty.hidden=true;toolbar.append(back,label,empty);
 document.getElementById('rw-arrived-section').before(toolbar);
 const move=fn=>(window.requestAnimationFrame||window.setTimeout)(()=>{fn();});
 back.onclick=()=>{const focus=returnSection;section=null;sort='default';select.value=sort;repaintWatchlist();move(()=>{window.scrollTo?.(0,returnY);document.querySelector('#'+focus+'-section .section-show-all')?.focus({preventScroll:true});});};
 select.onchange=()=>{sort=select.value;repaintWatchlist();};
 function decorate(page){
  empty.hidden=!section||page.rows.length>0;
  toolbar.hidden=!section||document.getElementById('tab-watchlist').dataset.collection==='physical';
  for(const [group,id] of Object.entries(ids)){
   const shelf=document.getElementById(id+'-section');if(!shelf)continue;
   shelf.querySelector('.section-show-all')?.remove();
   const count=page.counts[group]||0,shown=page.rows.filter(r=>r.stage.group===group).length;
   if(!section&&count>shown){const button=document.createElement('button');button.className='secondary section-show-all';button.textContent='Show all '+count;button.setAttribute('aria-label','Show all '+count+' '+shelf.querySelector('h3').firstChild.textContent.trim()+' titles');button.onclick=()=>{returnY=window.scrollY;returnSection=id;section=group;sort='default';select.value=sort;repaintWatchlist();move(()=>{toolbar.scrollIntoView?.({block:'start'});back.focus({preventScroll:true});});};shelf.append(button);}
  }
 }
 window.addEventListener('rewind:card-rendered',()=>{if(document.getElementById('tab-watchlist').dataset.collection==='physical')toolbar.hidden=true;});
 return {options:()=>({section,sort}),decorate};
})();
