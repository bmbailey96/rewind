(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArtworkModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 function title(s){return String(s||'').replace(/’/g,"'").replace(/^Guillermo del Toro['’]s\s+/i,'').replace(/\s+\d+(?:st|nd|rd|th)\s+Anniversary.*$/i,'').replace(/:\s*Encore$/i,'').replace(/\s*\((?:Telugu|English|Hindi|Tamil).*?\)/i,'').replace(/:\s*Early Access.*$/i,'').replace(/\s+Special Screening$/i,'').replace(/^Avengers Endgame$/i,'Avengers: Endgame').trim();}
 function choose(results,event,at=Date.now()){
  const matches=results.filter(m=>norm(title(m.title))===norm(title(event.title)));
  const id=event.film?.id||event.tmdbId;if(id)return matches.find(m=>Number(m.id)===Number(id))||null;
  if(matches.length===1)return matches[0];
  const year=event.year||(/\b(19\d{2}|20\d{2})\b/.exec(event.title)||[])[1];
  if(year){const exact=matches.filter(m=>m.release_date?.startsWith(String(year)));if(exact.length===1)return exact[0];}
  if(event.kind==='local'&&!/anniversary|encore|classic/i.test(event.title)){const recent=matches.filter(m=>{const d=Date.parse(m.release_date);return Number.isFinite(d)&&Math.abs(at-d)<500*86400000;});if(recent.length===1)return recent[0];}
  return null;
 }
 function sourcePoster(event,rows){const row=rows.find(r=>norm(title(r.title))===norm(title(event.title)));if(!row?.poster)return null;let u;try{u=new URL(row.poster);}catch{return null;}if(u.protocol!=='https:')return null;const tokens=title(event.title).toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>=4&&!['with','from','anniversary','screening','access','early','movie','party'].includes(t));const path=norm(u.pathname);return tokens.length&&tokens.some(t=>path.includes(t))?row.poster:null;}
 return {norm,title,choose,sourcePoster};
});
