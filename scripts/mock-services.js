
// Mock services for local testing: OpenAI-compatible AI, Telegram Bot API, RSS feed.
const http=require('node:http');
const port=Number(process.argv[2]||9911);
http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{
  res.setHeader('access-control-allow-origin','*');res.setHeader('access-control-allow-headers','*');
  if(req.method==='OPTIONS'){res.end();return;}
  if(req.url.includes('/chat/completions')){const j=JSON.parse(b||'{}');const q=(j.messages||[]).at(-1)?.content||'';
    let t='Mehnat ka phal meetha hota hai — aaj ek kadam aage badho! 🚀';
    if(/JSON/.test(q)) t='{"title":"My Termux Automation Trick 🔥","description":"Phone se automation!\\nFree & local.\\n#termux #automation #ai #yantraflow #nishu","tags":["termux","automation","ai"]}';
    else if(/Summarize/.test(q)) t='Summary: '+q.split('\n')[0].replace('Summarize: ','').slice(0,60)+' — short Hinglish summary.';
    else if(/Reel topic/.test(q)) t='Subah jaldi utho, sapne pure karo 💪\nConsistency hi asli talent hai.\nFollow karo daily motivation ke liye!\n#motivation #students #hinglish #reels #viral';
    else if(!/quote/i.test(q)) t='Termux ek Android app hai jo phone pe Linux terminal deta hai. Isse aap Node.js, Python sab chala sakte ho.';
    res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'x',model:'groq/llama-3.3-70b',choices:[{message:{role:'assistant',content:t}}],usage:{prompt_tokens:20,completion_tokens:30,total_tokens:50}}));return;}
  if(req.url.startsWith('/bot')){res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result:{message_id:Math.floor(Math.random()*1000),chat:{id:123}}}));return;}
  if(req.url.startsWith('/rss')){res.setHeader('content-type','application/rss+xml');res.end(`<?xml version="1.0"?><rss><channel><title>Mock News</title>
<item><title>ISRO launches new satellite</title><link>https://example.com/1</link><description><![CDATA[<p>ISRO ne aaj naya satellite launch kiya.</p>]]></description><pubDate>Mon, 02 Nov 2026 08:00:00 GMT</pubDate></item>
<item><title>India wins the series 3-1</title><link>https://example.com/2</link><description>Team India ne series jeet li.</description></item>
<item><title>New AI tools for students</title><link>https://example.com/3</link><description>Free AI tools ki list.</description></item>
<item><title>Fourth item</title><link>https://example.com/4</link><description>x</description></item></channel></rss>`);return;}
  res.statusCode=404;res.end('{}');
});}).listen(port,'127.0.0.1',()=>console.log('mock on',port));
