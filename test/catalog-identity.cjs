const assert=require('node:assert/strict'),C=require('../lib/letterboxd-catalog.cjs');
for(const url of ['http://boxd.it/abcd','https://evil.test/film/abc/','https://letterboxd.com/brandon/','https://letterboxd.com/film/abc/?secret=token','https://user:pass@boxd.it/abc','https://letterboxd.com:8443/film/abc/'])assert.equal(C.filmURL(url),null);
(async()=>{
 let calls=0;const film=await C.identity('https://boxd.it/abcd',async url=>{calls++;return url.includes('boxd.it')?{status:302,headers:{get:()=> 'https://letterboxd.com/film/aftersun/'}}:{ok:true,text:async()=>'<a href="https://www.themoviedb.org/movie/965150">TMDB</a><div data-tmdb-id="965150">'};});assert.equal(film.id,965150);assert.equal(film.mediaType,'movie');assert.equal(calls,2);
 const tv=await C.identity('https://letterboxd.com/film/normal-people/',async()=>({ok:true,text:async()=>'<div data-tmdb-id="89905"><a href="https://www.themoviedb.org/tv/89905">'}));assert.equal(tv.mediaType,'tv');assert.equal(tv.id,89905);
 await assert.rejects(()=>C.identity('https://boxd.it/abcd',async()=>({status:302,headers:{get:()=> 'http://127.0.0.1/admin'}})),/Unexpected/);
 await assert.rejects(()=>C.identity('https://letterboxd.com/film/abc/',async()=>({ok:true,text:async()=>'<a href="https://www.themoviedb.org/movie/1">One</a><a href="https://www.themoviedb.org/movie/2">Two</a>'})),/No unique/);
 await assert.rejects(()=>C.identity('https://letterboxd.com/brandon/',async()=>{throw Error('Should not fetch');}),/public Letterboxd/);
 const handler=(await import('../netlify/functions/catalog-identity.mjs')).default;
 assert.equal((await handler(new Request('https://example.com/?uri=https://evil.test/'))).status,400);
 assert.equal((await handler(new Request('https://example.com/',{method:'POST'}))).status,405);
 console.log('Catalog links: authoritative film IDs, TV separation, safe hosts, account rejection, redirect limits and ambiguous-page refusal passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
