const {field}=require('./movie-news.cjs');
const sourceURL='https://letterboxd.com/bmbailey124/rss/';
const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?s:null;
function parse(xml,at=Date.now()){
 if(!/<rss\b/.test(xml)||!/https:\/\/letterboxd\.com\/bmbailey124\//.test(xml))throw Error('Unexpected feed');
 const records=[];for(const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)){const x=m[1],id=Number(field(x,'tmdb:movieId')),title=field(x,'letterboxd:filmTitle'),year=field(x,'letterboxd:filmYear'),entryId=field(x,'guid'),url=field(x,'link'),ratingText=field(x,'letterboxd:memberRating'),rating=ratingText===''?null:Number(ratingText),publishedAt=Date.parse(field(x,'pubDate')),watchedAt=date(field(x,'letterboxd:watchedDate'));
  if(!Number.isInteger(id)||id<=0||!title||!/^\d{4}$/.test(year)||!entryId||!url.startsWith('https://letterboxd.com/bmbailey124/film/')||!Number.isFinite(publishedAt)||publishedAt>at+300000)continue;
  if(!watchedAt&&rating===null)continue;
  records.push({entryId,id,title,year,letterboxdURL:url,publishedAt:new Date(publishedAt).toISOString(),watchedAt,rewatch:field(x,'letterboxd:rewatch').toLowerCase()==='yes',liked:field(x,'letterboxd:memberLike').toLowerCase()==='yes',...(Number.isFinite(rating)&&rating>0&&rating<=5?{rating}:{} )});
 }return records;
}
async function refresh(previous={},fetcher=fetch,at=Date.now()){
 try{const r=await fetcher(sourceURL,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/rss+xml,application/xml,text/xml'}});if(!r.ok)throw Error();const xml=await r.text();if(xml.length>3000000)throw Error();const fresh=parse(xml,at),records=new Map((previous.records||[]).map(r=>[r.entryId,r]));for(const r of fresh)records.set(r.entryId,r);return {schema:1,profile:'bmbailey124',sourceURL,connected:true,stale:false,checkedAt:at,attemptedAt:at,records:[...records.values()].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,2000)};}catch{return {...previous,schema:1,profile:'bmbailey124',sourceURL,connected:!!previous.checkedAt,stale:true,attemptedAt:at,records:previous.records||[],message:'The public diary feed could not refresh. Previous records are retained.'};}
}
module.exports={parse,refresh,sourceURL};
