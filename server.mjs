import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {collect,readCache} from './collector.mjs';
import {dayKey,recent} from './public/date.mjs';
const files={'/':'index.html','/app.mjs':'app.mjs','/date.mjs':'date.mjs','/style.css':'style.css'};
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(path==='/api/board'){const d=await readCache();d.notices=d.notices.filter(x=>recent(x.date));d.competitions=d.competitions.filter(x=>recent(x.date));d.today=dayKey();d.meals=d.meals.filter(x=>x.date===d.today&&['중식','석식'].includes(x.type));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(d));return;}
 if(!files[path]){res.writeHead(404);res.end('Not found');return;}
 res.setHeader('Content-Type',types[extname(files[path])]);res.end(await readFile(resolve('public',files[path])));
 }catch{res.writeHead(500);res.end('Temporary error');}}).listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log('학교 보드: http://localhost:'+(process.env.PORT||3000)));
if(process.env.DISABLE_COLLECT!=='1'){collect().catch(console.error);setInterval(()=>collect().catch(console.error),30*60*1000);}
