/* Destinations, actions and sources have separate homes. */
(()=>{
 const by=id=>document.getElementById(id),make=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b;};
 const nav=document.createElement('nav');nav.className='discover-intents';nav.setAttribute('aria-label','Discover');
 const hint=document.createElement('p');hint.className='flow-note';
 const intro=by('discovery-intro');intro.before(nav,hint);document.querySelector('.hub-mode-buttons').hidden=true;
 let intent='explore',pickMethod='oracle',oracleSource='all';
 const mark=next=>{intent=next;hint.hidden=next==='news'||next==='surprise';document.querySelectorAll('[data-discover-intent]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.discoverIntent===next||next==='surprise'&&b.dataset.discoverIntent==='pick')));hint.textContent=next==='news'?'Announcements, discoveries, and reports worth keeping an eye on.':next==='pick'?'One film for right now. Your taste, this hour, and a little outside interference.':next==='surprise'?'One unexpected discovery connected to your taste.':'Find something new to follow. Saved and watched films stay off this shelf.';};
 const show=next=>{mark(next);const mode=next==='pick'?pickMethod:next==='news'?'news':'shelf';document.querySelector('[data-find-mode='+mode+']').click();intro.hidden=true;by('discovery-stages').hidden=next!=='explore';if(methods)methods.hidden=next!=='pick';
 if(next==='pick'){
  const selection=by('picker-source');
  if(selection){if(pickMethod==='roulette'){if(selection.value!=='watchlist')oracleSource=selection.value;selection.value='watchlist';selection.closest('label').hidden=true;by('picker-order').value='shuffle';by('picker-priorities').hidden=true;}else{selection.closest('label').hidden=false;selection.value=oracleSource;}}
  by('pick-film').textContent=pickMethod==='oracle'?'ASK THE ORACLE':'PICK RANDOMLY';
 }};
 for(const [key,label] of [['explore','Browse'],['pick','Pick for me'],['news','News'],['surprise','Surprise discovery']]){const b=make(label,()=>key==='surprise'?document.querySelector('.surprise-command').click():show(key));b.dataset.discoverIntent=key;if(key==='surprise'){b.className='secondary';document.querySelector('.picker-actions').append(b);}else nav.append(b);}
 const methods=document.createElement('div');methods.className='picker-methods';methods.setAttribute('role','group');methods.setAttribute('aria-label','How to choose a film');
 for(const [mode,label] of [['oracle','Best match'],['roulette','Random draw']]){const control=make(label,()=>{pickMethod=mode;paintMethods();show('pick');});control.dataset.pickMethod=mode;methods.append(control);}
 const paintMethods=()=>{for(const control of methods.children)control.setAttribute('aria-pressed',String(control.dataset.pickMethod===pickMethod));};paintMethods();
 methods.hidden=true;by('hub-picker').insertBefore(methods,by('picker-heading').nextSibling);
 const adjust=document.createElement('details');adjust.className='pick-adjust';const adjustLabel=document.createElement('summary');adjustLabel.textContent='Adjust this pick';adjust.append(adjustLabel);
 const sourceLabel=document.createElement('label');sourceLabel.textContent='Choose from';const source=document.createElement('select');source.id='picker-source';source.setAttribute('aria-label','Film recommendation source');
 for(const [value,label] of [['all','Watchlist + connected discoveries'],['watchlist','My watchlist only'],['physical','My physical shelf only']]){const o=document.createElement('option');o.value=value;o.textContent=label;source.append(o);}const updateShelfChoice=()=>{const option=source.querySelector('[value=physical]');option.hidden=!Hub.hasPhysicalShelf();if(option.hidden&&source.value==='physical')source.value='all';};window.addEventListener('rewind:state',updateShelfChoice);updateShelfChoice();sourceLabel.append(source);adjust.append(sourceLabel,by('picker-cost').closest('.picker-controls'));by('picker-priorities').hidden=true;by('hub-picker').insertBefore(adjust,document.querySelector('.picker-actions'));
 source.onchange=()=>{oracleSource=source.value;if(by('picker-cost').value==='physical')by('picker-cost').value='budget';show('pick');};
 by('picker-results').after(document.querySelector('.picker-actions'),by('picker-feedback'),document.querySelector('.aside-management'));
 by('picker-heading').textContent='The Oracle';document.querySelector('[data-discovery-stage=recent]').textContent='Recent releases';document.querySelector('[data-discovery-stage=coming]').textContent='Coming soon';document.querySelector('[data-discovery-stage=circuit]').textContent='Festival & limited';
 by('choose-tonight').onclick=()=>{document.querySelector('[data-tab=discover]').click();show('pick');by('pick-film').focus();};
 const settings=document.querySelector('[data-tab=import]');settings.textContent='⚙';settings.setAttribute('aria-label','Settings');settings.title='Settings';settings.classList.add('header-settings');document.querySelector('.counter-inner').append(settings);
 const saved=document.querySelector('.header-saved');saved.classList.add('collection-link');document.querySelector('#tab-watchlist > .panel-head').append(saved);const labelSaved=()=>{saved.textContent='My Shelf';saved.setAttribute('aria-label','Open my physical shelf');};window.addEventListener('rewind:state',labelSaved);window.addEventListener('rewind:card-rendered',labelSaved);labelSaved();
 const filters=by('card-options'),filterToggle=make('Filters',()=>{filters.open=!filters.open;filterToggle.setAttribute('aria-expanded',String(filters.open));});filterToggle.id='watchlist-filter-toggle';filterToggle.className='collection-link';filterToggle.setAttribute('aria-controls','card-options');filterToggle.setAttribute('aria-expanded','false');filters.before(filterToggle);filters.querySelector('summary').hidden=true;filters.addEventListener('toggle',()=>filterToggle.setAttribute('aria-expanded',String(filters.open)));
 document.querySelector('[data-tab=watchlist]').textContent='WATCHLIST';document.querySelector('#tab-watchlist .panel-head h2').textContent='Watchlist';
 const shelf=by('physical-shelf');by('tab-watchlist').append(shelf);
 const collectionNav=document.createElement('nav');collectionNav.className='collection-switch';collectionNav.setAttribute('aria-label','My collection');
 const selectCollection=kind=>{by('tab-watchlist').dataset.collection=kind;document.querySelector('#tab-watchlist .panel-head h2').textContent=kind==='physical'?'My Shelf':'Watchlist';document.querySelector('[data-tab=watchlist]').click();document.querySelector('#film-drawer').close();collectionNav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.collection===kind)));for(const selector of ['#tonight-shelf','#watchlist-scope-note','#watch-now-section','#paid-section','#waiting-section','#rw-arrived-section','#rw-available-section','#rw-coming-section','#rw-theater-section','#rw-waiting-section','#rw-upcoming-section','#rw-development-section','#rw-unchecked-section','.watchlist-section-tools','#watchlist-suggestions','.watchlist-primary','.watchlist-price-help','#card-check-status','#release-watch-empty','#rw-recovery','#filter-empty','#watchlist-load-status','#watchlist-import-review','#watchlist-updates','.card-toolbar','.watchlist-scope','#watchlist-more']){const e=document.querySelector(selector);if(e)e.hidden=kind==='physical';}shelf.hidden=kind!=='physical';by('watchlist-count').hidden=kind==='physical';if(kind==='physical')Hub.renderPhysicalShelf();else repaintWatchlist();};
 saved.onclick=()=>selectCollection('physical');
 const backToTracked=make('← Watchlist',()=>selectCollection('tracked'));backToTracked.className='text-action';shelf.prepend(backToTracked);
 if(by('watchlist-shelf-shortcut')){by('watchlist-shelf-shortcut').hidden=true;by('watchlist-shelf-shortcut').onclick=()=>selectCollection('physical');}
 for(const [kind,label] of [['tracked','Watchlist'],['physical','My Shelf']]){const b=make(label,()=>selectCollection(kind));b.dataset.collection=kind;b.setAttribute('aria-pressed',String(kind==='tracked'));collectionNav.append(b);}document.querySelector('.drawer-head').after(collectionNav);
 document.querySelector('#signal-shelf .signal-head button').onclick=()=>show('explore');
 window.addEventListener('rewind:signal',e=>{mark(e.detail==='surprise'?'surprise':'explore');intro.hidden=true;by('discovery-stages').hidden=true;});
 // Keep the saved page about titles and availability; optional tools stay behind disclosures.
 const primary=document.createElement('div');primary.className='watchlist-primary';primary.setAttribute('role','group');primary.setAttribute('aria-label','Watchlist search, filters and sorting');
 const typeFilters=document.querySelector('#tab-watchlist > .media-type-filters');
 const savedSearch=document.createElement('input');savedSearch.type='search';savedSearch.id='watchlist-search';savedSearch.placeholder='Search saved titles…';savedSearch.setAttribute('aria-label','Search saved titles');
 let searchTimer;savedSearch.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{searchSavedTitles();window.dispatchEvent(new Event('rewind:saved-search'));},120);});
 const field=(text,control,cls)=>{const label=document.createElement('label');label.className='watchlist-field '+cls;const title=document.createElement('span');title.textContent=text;label.append(title,control);return label;};
 const availability=document.createElement('select');availability.id='watchlist-availability';availability.setAttribute('aria-label','Filter watchlist by availability');
 for(const [value,label] of [['all','All availability'],['free','Included / free'],['cheap','At my price'],['premium','Over my price'],['waiting','Not available yet']]){const option=document.createElement('option');option.value=value;option.textContent=label;availability.append(option);}
 availability.onchange=()=>document.querySelector('[data-cost-filter='+availability.value+']').click();
 const syncAvailability=()=>{availability.value=document.querySelector('[data-cost-filter][aria-pressed=true]')?.dataset.costFilter||'all';};
 window.addEventListener('rewind:card-rendered',syncAvailability);
 const sort=by('sort-select');sort.hidden=false;sort.replaceChildren();for(const [value,label] of [['cost','Recommended'],['price','Price: low to high'],['changed','Recent changes'],['added','Recently saved'],['release','Release date'],['az','Title A–Z']]){const option=document.createElement('option');option.value=value;option.textContent=label;sort.append(option);}sort.value='cost';
 const budget=by('rental-budget');budget.hidden=false;budget.setAttribute('aria-label','Rental price limit in dollars');budget.inputMode='decimal';
 primary.append(typeFilters,savedSearch,field('Availability',availability,'availability-field'),field('Sort by',sort,'sort-field'),field('Rental limit ($)',budget,'budget-field'));
 document.querySelector('#tab-watchlist > .panel-head').after(primary);
 // Keep price-policy explanation accessible without placing daily controls in Settings.
 const priceNotes=document.querySelector('#card-options .card-controls .offer-note');
 if(priceNotes){const help=document.createElement('details');help.className='watchlist-price-help';const title=document.createElement('summary');title.textContent='How prices and availability work';help.append(title,priceNotes);primary.after(help);}
 document.querySelector('#card-options .cost-filters').hidden=true;
 filters.hidden=true;filterToggle.hidden=true;
 const checkTools=document.querySelector('#card-options .card-toolbar');checkTools.classList.add('watchlist-check');primary.append(checkTools);const scanProgress=by('card-check-status');primary.after(scanProgress);by('refresh-card-btn').textContent='Check next 12';

 const suggestions=document.createElement('details');suggestions.id='watchlist-suggestions';const summary=document.createElement('summary');summary.textContent='Three picks for tonight';suggestions.append(summary,by('tonight-shelf'));by('watchlist-more').before(suggestions);document.querySelector('.counter-welcome').hidden=true;
 // Price filters, sorting and rental limit now live together above the Watchlist.
 const settingsPanel=by('tab-import');for(const item of document.querySelectorAll('#tab-tv > details'))settingsPanel.append(item);
 show('explore');
})();
