// Read only the member's documented public RSS surface. No login or page scraping.
const URL='https://letterboxd.com/bmbailey124/rss/';
export default async request=>{
 if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET'}});
 try{const r=await fetch(URL,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/rss+xml,application/xml,text/xml'}});if(!r.ok)return Response.json({connected:false,sourceURL:URL,message:'The public Letterboxd feed is unavailable from this server.',sourceStatus:r.status},{headers:{'Cache-Control':'public,max-age=1800'}});const xml=await r.text();if(!/<rss\b/i.test(xml)||xml.length>3000000)throw Error();return new Response(xml,{headers:{'Content-Type':'application/rss+xml; charset=utf-8','Cache-Control':'public,max-age=1800'}});}catch{return Response.json({connected:false,sourceURL:URL,message:'The public Letterboxd feed could not be reached.'},{headers:{'Cache-Control':'public,max-age=1800'}});}
};
