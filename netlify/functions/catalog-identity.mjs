import catalog from '../../lib/letterboxd-catalog.cjs';
export default async request=>{
 if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET'}});
 const uri=new URL(request.url).searchParams.get('uri');if(!catalog.filmURL(uri))return Response.json({error:'Public film URL required'},{status:400});
 try{return Response.json(await catalog.identity(uri),{headers:{'Cache-Control':'public, max-age=86400'}});}
 catch(error){return Response.json({error:'Film identity unavailable',retryable:/unavailable|fetch|timeout|aborted/i.test(error.message)},{status:502,headers:{'Cache-Control':'public, max-age=60'}});}
};
