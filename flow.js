/* Destinations, actions and sources have separate homes. */
(()=>{
 const by=id=>document.getElementById(id),make=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b;};
 const nav=document.createElement('nav');nav.className='discover-intents';nav.setAttribute('aria-label','Discover');
 const hint=document.createElement('p');hint.className='flow-note';
 const intro=by('discovery-intro');intro.before(nav,hint);document.querySelector('.hub-mode-buttons').hidden=true;
 let intent='explore';
 const mark=next=>{intent=next;nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.discoverIntent===next)));hint.textContent=next==='pick'?'The Oracle reads the moment. Surprise me tunes into something unexpected.':'Find something to watch, or something worth waiting for.';};
 const show=next=>{mark(next);document.querySelector('[data-find-mode='+(next==='pick'?'oracle':'shelf')+']').click();intro.hidden=true;by('discovery-stages').hidden=next!=='explore';if(next==='explore')document.querySelector('[data-discovery-stage=recent]').click();by('pick-film').textContent='PICK A FILM';};
 for(const [key,label] of [['pick','Pick a film'],['explore','Explore']]){const b=make(label,()=>show(key));b.dataset.discoverIntent=key;nav.append(b);}
 const adjust=document.createElement('details');adjust.className='pick-adjust';const adjustLabel=document.createElement('summary');adjustLabel.textContent='Adjust this pick';adjust.append(adjustLabel);
 const sourceLabel=document.createElement('label');sourceLabel.textContent='Choose from';const source=document.createElement('select');source.id='picker-source';source.setAttribute('aria-label','Film recommendation source');
 for(const [value,label] of [['all','My films + connected discoveries'],['watchlist','My tracked films only'],['physical','My physical shelf only']]){const o=document.createElement('option');o.value=value;o.textContent=label;source.append(o);}sourceLabel.append(source);adjust.append(sourceLabel,by('picker-cost').closest('.picker-controls'));by('picker-priorities').hidden=true;by('hub-picker').insertBefore(adjust,document.querySelector('.picker-actions'));
 source.onchange=()=>{if(by('picker-cost').value==='physical')by('picker-cost').value='budget';document.querySelector('[data-find-mode=oracle]').click();by('pick-film').textContent='PICK A FILM';intro.hidden=true;};
 const surprise=make('Surprise me',()=>{document.querySelector('.surprise-command').click();mark('pick');intro.hidden=true;by('discovery-stages').hidden=true;});surprise.className='text-action';document.querySelector('.picker-actions').append(surprise);
 by('picker-heading').textContent='The Oracle';document.querySelector('[data-discovery-stage=recent]').textContent='Available now';document.querySelector('[data-discovery-stage=coming]').textContent='Coming soon';document.querySelector('[data-discovery-stage=circuit]').textContent='Festival & limited';
 by('choose-tonight').onclick=()=>{document.querySelector('[data-tab=discover]').click();show('pick');by('pick-film').focus();};
 const settings=document.querySelector('[data-tab=import]');settings.textContent='⚙';settings.setAttribute('aria-label','Settings');settings.title='Settings';settings.classList.add('header-settings');document.querySelector('.counter-inner').append(settings);
 const saved=document.querySelector('.header-saved');saved.classList.add('collection-link');document.querySelector('.watchlist-toolbar').prepend(saved);const labelSaved=()=>saved.textContent='Collection';window.addEventListener('rewind:state',labelSaved);window.addEventListener('rewind:card-rendered',labelSaved);labelSaved();
 document.querySelector('[data-tab=watchlist]').textContent='MY FILMS';document.querySelector('#tab-watchlist .panel-head h2').textContent='My films';
 const shelf=by('physical-shelf');by('tab-watchlist').append(shelf);
 const collectionNav=document.createElement('nav');collectionNav.className='collection-switch';collectionNav.setAttribute('aria-label','My film collection');
 const selectCollection=kind=>{document.querySelector('[data-tab=watchlist]').click();document.querySelector('#film-drawer').close();collectionNav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.collection===kind)));for(const selector of ['.counter-welcome','#tonight-shelf','#watchlist-scope-note','#watch-now-section','#paid-section','#waiting-section','#watchlist-load-status','#watchlist-import-review','#watchlist-updates','#card-options','.watchlist-scope','#watchlist-more']){const e=document.querySelector(selector);if(e)e.hidden=kind==='physical';}shelf.hidden=kind!=='physical';by('watchlist-count').hidden=kind==='physical';if(kind==='physical')Hub.renderPhysicalShelf();};
 for(const [kind,label] of [['tracked','Tracked films'],['physical','Physical shelf']]){const b=make(label,()=>selectCollection(kind));b.dataset.collection=kind;b.setAttribute('aria-pressed',String(kind==='tracked'));collectionNav.append(b);}document.querySelector('.drawer-head').after(collectionNav);
 document.querySelector('#signal-shelf .signal-head button').onclick=()=>show('explore');
 window.addEventListener('rewind:signal',e=>{mark(e.detail==='surprise'?'pick':'explore');intro.hidden=true;by('discovery-stages').hidden=true;});
 show('explore');
})();
