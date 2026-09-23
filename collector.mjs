import {load} from 'cheerio';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {dayKey,shiftDay,recent,todayMeals} from './public/date.mjs';
export const schoolInfo='https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=8a51e0e3-7675-451e-8dfc-64f72264cef0';
const school='https://goejeonghs.djsch.kr';
const directory=resolve(process.env.DATA_DIR || 'data');
const cacheFile=resolve(directory,'board.json');
const empty=()=>({meals:[],events:[],notices:[],competitions:[],sources:{}});
export async function readCache(){try{return JSON.parse(await readFile(cacheFile,'utf8'));}catch{return empty();}}
async function request(url,options={}){for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return r;}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,1000*2**attempt));}}}
export function parseList(html,boardID,menu,today=dayKey()){
 const $=load(html), map=new Map();
 $('tr').each((_,row)=>{const a=$(row).find('a[onclick*="goView"]').first();const args=a.attr('onclick')?.match(/goView\('([^']+)'\s*,\s*'([^']+)'/);if(!args)return;const date=$(row).text().match(/\d{4}-\d{2}-\d{2}/)?.[0];if(!date)return;
 const id=args[2]; map.set(id,{id,date,title:a.attr('title')||a.text().trim(),url:school+`/boardCnts/view.do?boardID=${boardID}&boardSeq=${id}&lev=0&statusYN=W&page=1&pSize=10&s=goejeonghs&m=${menu}&opType=N`});});
 return {all:[...map.values()],selected:[...map.values()].filter(x=>recent(x.date,today))};
}
export function parseDetail(html){const $=load(html);const box=$('.viewBox');if(!box.length)throw Error('본문 구조를 확인할 수 없습니다');box.find('script,style').remove();box.find('br').replaceWith('\n');box.find('p,div,li,tr').append('\n');
 const text=box.text().split('\n').map(x=>x.replace(/[\t\r ]+/g,' ').trim()).filter(Boolean).join('\n');
 const attachments=[];$('.fieldBox a[href*="fileDown.do"]').each((_,a)=>attachments.push({name:$(a).text().trim(),url:new URL($(a).attr('href'),school).href}));
 return {body:text || '이 게시글은 이미지 또는 첨부파일로 제공됩니다. 원문에서 확인해 주세요.',attachments};
}
async function board(boardID,menu){let items=[], recognized=false;for(let page=1;page<=30;page++){
 const html=await (await request(school+`/boardCnts/list.do?boardID=${boardID}&m=${menu}&s=goejeonghs&page=${page}`)).text();const parsed=parseList(html,boardID,menu);recognized ||= parsed.all.length>0;
 if(!parsed.all.length){if(!recognized)throw Error('게시판 목록 구조를 확인할 수 없습니다');break;}items.push(...parsed.selected);
 if(parsed.all.some(x=>x.date<shiftDay(dayKey(),-6)))break;
 if(page===30)throw Error('게시판 조회 페이지 한도 초과');
 }
 const unique=[...new Map(items.map(x=>[x.id,x])).values()];
 for(const item of unique){const html=await(await request(item.url)).text();Object.assign(item,parseDetail(html));}
 return unique.sort((a,b)=>b.date.localeCompare(a.date));
}
async function info(kind){const today=dayKey(), compact=x=>x.replaceAll('-','');
 const params=new URLSearchParams({sdSchulCode:'7430237',atptOfcdcScCode:'G10'});
 if(kind==='meals'){params.set('mlsvFromYmd',compact(today));params.set('mlsvToYmd',compact(today));}
 else {params.set('aaFromYmd',compact(shiftDay(today,-31)));params.set('aaToYmd',compact(shiftDay(today,40)));}
 const endpoint=kind==='meals'?'getMealInfoApiUrl':'getSchoolScheduleApiUrl';
 const response=await request('https://www.schoolinfo.go.kr/'+endpoint+'.do',{method:'POST',body:params,headers:{Referer:schoolInfo}});
 let target=(await response.text()).trim().replace(/^"|"$/g,'');
 const url=new URL(target);if(!['open.neis.go.kr','www.schoolinfo.go.kr'].includes(url.hostname))throw Error('학교알리미 응답 주소 변경');
 // The schoolinfo page returns the public NEIS data URL; never expose it (or its key) to clients/logs.
 if(url.protocol==='http:')url.protocol='https:';
 const json=await(await request(url)).json(); const key=kind==='meals'?'mealServiceDietInfo':'SchoolSchedule';
 const rows=json[key]?.find(x=>Array.isArray(x.row))?.row;
 if(!rows){if(json.RESULT?.CODE==='INFO-200')return [];throw Error('학교알리미 데이터 응답 오류');}
 const date=v=>String(v).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
 if(kind==='meals')return rows.map(r=>({date:date(r.MLSV_YMD),type:r.MMEAL_SC_NM,items:load('<div>'+r.DDISH_NM.replace(/<br\s*\/?\s*>/gi,'\n')+'</div>')('div').text().split('\n').map(s=>s.trim()).filter(Boolean)})).filter(r=>r.date===today&&['중식','석식'].includes(r.type));
 return [...new Map(rows.map(r=>[r.AA_YMD+r.EVENT_NM,{date:date(r.AA_YMD),title:r.EVENT_NM,detail:r.EVENT_CNTNT||''}])).values()];
}
let running;
export function collect(){if(running)return running;running=run().finally(()=>running=null);return running;}
async function run(){const data=await readCache();const jobs={meals:()=>info('meals'),events:()=>info('events'),notices:()=>board('49782','0301'),competitions:()=>board('49793','0208')};
 for(const [key,job] of Object.entries(jobs)){try{data[key]=await job();data.sources[key]={lastSuccess:new Date().toISOString(),error:null};console.log(key+': '+data[key].length);}catch{data.sources[key]={...data.sources[key],error:'수집 지연 — 마지막 정상 자료를 표시합니다',lastAttempt:new Date().toISOString()};console.log(key+': 수집 실패');}}
 data.meals=todayMeals(data.meals);await mkdir(directory,{recursive:true});await writeFile(cacheFile+'.tmp',JSON.stringify(data,null,2));await rename(cacheFile+'.tmp',cacheFile);return data;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await collect();
