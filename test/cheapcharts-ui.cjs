const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://bekind-rewind.netlify.app',runScripts:'outside-only'}),w=dom.window;w.AbortSignal=AbortSignal;
 w.RewindModel={safeLink:url=>/^https:/.test(url)?url:null};let calls=0,fail=false;
 w.fetch=async()=>{calls++;return {ok:!fail,json:async()=>({id:10,checkedAt:Date.now(),entries:['Apple TV','Prime Video'].map((provider,i)=>({provider,kind:'buy',region:'US',currency:'USD',price:14.99,previousPrice:7.99,link:'https://www.cheapcharts.com/us/'+(i?'amazon':'itunes')+'/movies/1'}))})};};
 w.eval(fs.readFileSync(__dirname+'/../availability-ui.js','utf8'));
 assert.equal(calls,0,'Loading the script makes no price-history requests');
 const root=w.renderEarlierPriceHistory({id:10});w.document.body.append(root);await new Promise(r=>setTimeout(r,10));
 assert.equal(calls,1);assert.equal(root.querySelectorAll('.earlier-price-row').length,1,'Matching prior prices share one row');assert.equal(root.querySelectorAll('a').length,2,'Each store keeps its attribution link');assert.match(root.textContent,/\$7.99 previously to buy/);assert.match(root.textContent,/Dates and video quality are not supplied/);assert.doesNotMatch(root.textContent,/lowest|rental drop/i);assert.equal(root.querySelectorAll('time').length,0,'Undated prices never acquire invented timeline dates');
 w.document.body.append(w.renderEarlierPriceHistory({id:10}));await new Promise(r=>setTimeout(r,10));assert.equal(calls,1,'Reopening uses the session cache');
 fail=true;const failure=w.renderEarlierPriceHistory({id:11});w.document.body.append(failure);await new Promise(r=>setTimeout(r,10));assert.match(failure.textContent,/unavailable right now/);
 w.document.body.append(w.renderEarlierPriceHistory({id:11}));await new Promise(r=>setTimeout(r,10));assert.equal(calls,2,'Failures have a short retry cache');
 dom.window.close();console.log('Earlier prices UI: no startup requests, cached popup lookup, grouped purchase-only prices, attribution, honest unknown dates and outage state passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
