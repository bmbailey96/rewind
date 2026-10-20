// Read only public film URLs. Never accept account pages or arbitrary redirect hosts.
function filmURL(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)return null;
  if(u.hostname==='boxd.it'&&/^\/[A-Za-z0-9]+\/?$/.test(u.pathname))return u;
  if(['letterboxd.com','www.letterboxd.com'].includes(u.hostname)&&/^\/film\/[a-z0-9-]+\/?$/.test(u.pathname))return u;
 }catch{}return null;
}
async function identity(value,fetcher=fetch){
 let url=filmURL(value);if(!url)throw Error('A public Letterboxd film URL is required');
 for(let redirects=0;redirects<5;redirects++){
  const response=await fetcher(url.href,{redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Accept:'text/html','User-Agent':'Mozilla/5.0 (compatible; Rewind/1.0; +https://bekind-rewind.netlify.app/)'}});
  if([301,302,303,307,308].includes(response.status)){const next=filmURL(new URL(response.headers.get('location'),url).href);if(!next)throw Error('Unexpected film redirect');url=next;continue;}
  if(!response.ok||!['letterboxd.com','www.letterboxd.com'].includes(url.hostname)||!url.pathname.startsWith('/film/'))throw Error('Public film page unavailable');
  const html=await response.text();if(html.length>2000000)throw Error('Film page too large');
  const movies=[...new Set([...html.matchAll(/(?:themoviedb\.org\/movie\/|data-tmdb-id=["'])(\d+)/g)].map(m=>Number(m[1])))];
  // A TV page can also carry data-tmdb-id. Its explicit media link takes precedence.
  const series=[...new Set([...html.matchAll(/themoviedb\.org\/tv\/(\d+)/g)].map(m=>Number(m[1])))];
  if(series.length===1)return {id:series[0],mediaType:'tv',sourceURL:url.href};
  if(movies.length===1)return {id:movies[0],mediaType:'movie',sourceURL:url.href};
  throw Error('No unique linked catalog record');
 }
 throw Error('Too many film redirects');
}
module.exports={filmURL,identity};
