function renderAvailability(movie,status) {
  const wrap=document.createElement('div');wrap.className='availability';
  if(status.stale){const note=document.createElement('p');note.className='lookup-warning';note.textContent='Could not refresh. Previous availability may have changed.';wrap.appendChild(note);}
  if(status.offers?.length) {
    const details=document.createElement('details');details.className='watch-options';
    const summary=document.createElement('summary');summary.textContent=`${status.offers.length} viewing option${status.offers.length===1?'':'s'} · services & prices`;details.appendChild(summary);
    const groups=[['Your subscriptions',o=>o.kind==='subscription'&&o.included],['Free streaming',o=>o.kind==='free'],['Rent',o=>o.kind==='rent'],['Buy',o=>o.kind==='buy'],['Other subscriptions / channels',o=>o.kind==='subscription'&&!o.included],['Cable login',o=>o.kind==='cable']];
    for(const [name,filter] of groups) {
      const offers=status.offers.filter(filter);if(!offers.length)continue;
      const heading=document.createElement('h4');heading.textContent=name;details.appendChild(heading);
      offers.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity)||a.provider.localeCompare(b.provider));
      for(const offer of offers) {
        const row=document.createElement('div');row.className='offer-row';
        const provider=document.createElement(offer.link?'a':'span');provider.textContent=offer.provider;
        if(offer.link){provider.href=offer.link;provider.target='_blank';provider.rel='noopener noreferrer';}
        const amount=document.createElement('span');amount.className='offer-price';
        amount.textContent=offer.kind==='subscription'?(offer.included?'Included':'Separate subscription'):offer.kind==='free'?(offer.adSupported?'Free with ads':'Free'):offer.kind==='cable'?'Cable account':offer.price===null?'Price not supplied':`$${offer.price.toFixed(2)}`;
        if(offer.format)amount.textContent+=' · '+offer.format;
        row.append(provider,amount);details.appendChild(row);
        if(offer.channel){const note=document.createElement('p');note.className='offer-note';note.textContent='Add-on channel; not included with the base service.';details.appendChild(note);}
      }
    }
    const source=document.createElement('p');source.className='offer-note';
    source.textContent='US listings: JustWatch'+(status.quoteCheckedAt?' + Watchmode. Quotes checked '+new Date(status.quoteCheckedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'.':'. This source does not supply prices. Verify the store before paying.');details.appendChild(source);
    if(status.priceWarning){const warning=document.createElement('p');warning.className='lookup-warning';warning.textContent=status.priceWarning;details.appendChild(warning);}
    wrap.appendChild(details);
  }
  if(status.digitalDate){const date=document.createElement('p');date.className='release-note';date.textContent='Digital date listed '+formatFilmDate(status.digitalDate)+'. Subscription date not confirmed.';wrap.appendChild(date);}
  if(status.checkedAt){const checked=document.createElement('p');checked.className='checked-note';checked.textContent='US availability checked '+new Date(status.checkedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});wrap.appendChild(checked);}
  return wrap;
}
