(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MediaModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const clean=s=>String(s||'').replace(/\s*\((?:UK, )?\d{4}\)$/,'').trim();
 const verified=[
 ['The Haunting of Bly Manor',2020],['The Outsider',2020],['I May Destroy You',2020],['The Good Lord Bird',2020],['Under the Banner of Heaven',2022],['The Penguin',2024],
 ['The Haunting of Hill House',2018],['Midnight Mass',2021],['The Fall of the House of Usher',2023],['The Night Of',2016],['Adolescence',2025],['Baby Reindeer',2024],['Mare of Easttown',2021],['The Curse',2023],['Devs',2020],['Maniac',2018],['Brand New Cherry Flavor',2021],["Garth Marenghi's Darkplace",2004],['Dopesick',2021],['Task',2025],['A Murder at the End of the World',2023]
 ];
 function seriesForFilm(m){const year=String(m?.year||m?.release_date||m?.detailsSnapshot?.release_date||'').slice(0,4);return verified.find(([title,y])=>norm(title)===norm(m?.title)&&String(y)===year)?.[0]||null;}
 const type=m=>m?.mediaType==='tv'||m?.media_type==='tv'||String(m?.id||'').startsWith('tv:')||seriesForFilm(m)?'tv':'movie';
 const accepts=(m,value='all')=>value==='all'||type(m)===(value==='tv'?'tv':'movie');
 function nextSeason(group,seasons,today){const catalog=(seasons||[]).filter(s=>s.number>0).sort((a,b)=>a.number-b.number);const complete=new Set((group.seasons||[]).filter(r=>r.status==='watched'&&!r.partial).map(r=>r.season));const numbers=[...new Set([1,...catalog.map(s=>s.number),...(group.seasons||[]).map(r=>r.season)])].sort((a,b)=>a-b);for(const number of numbers){if(complete.has(number))continue;const meta=catalog.find(s=>s.number===number),answer=group.seasons?.find(r=>r.season===number);return {number,date:meta?.date||null,partial:!!answer?.partial,scope:answer?.scope||'',hasAired:meta?.date?meta.date<=today:null};}return null;}
 function positiveRecords(group){const rated=(group.seasons||[]).filter(r=>r.status==='watched'&&!r.partial&&r.rating!==null&&r.rating!==undefined);return rated.length?rated.filter(r=>r.rating>=4):(group.legacy||[]).filter(r=>r.status==='watched'&&!r.partial&&(r.rating>=4||r.owned||r.favorite||r.rewatches>1));}
 const genreMap={10759:12,10765:878,10768:10752};
 const movieGenres=genres=>(genres||[]).map(g=>{const id=typeof g==='number'?g:g.id;return genreMap[id]||id;}).filter(id=>![10762,10763,10764,10766,10767].includes(id));
 return {norm,clean,verified,seriesForFilm,type,accepts,nextSeason,positiveRecords,movieGenres};
});
