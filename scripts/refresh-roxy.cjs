const fs=require('node:fs/promises'),path=require('node:path'),{refresh}=require('../lib/roxy-cinema.cjs');
(async()=>{
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Denver'});
 const feed=await refresh(today,fetch,90);
 // A malformed/empty upstream calendar must not erase a useful checked snapshot.
 if(!feed.items.length)throw Error('Roxy returned no dated events; keeping the existing snapshot');
 await fs.writeFile(path.join(__dirname,'../roxy-snapshot.json'),JSON.stringify(feed,null,2)+'\n');
 console.log('Updated Roxy snapshot: '+feed.items.length+' titles, '+feed.items.reduce((n,item)=>n+item.screenings.length,0)+' screenings.');
})().catch(err=>{console.error(err.message);process.exitCode=1;});
