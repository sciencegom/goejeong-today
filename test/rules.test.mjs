import test from 'node:test';
import assert from 'node:assert/strict';
import {dayKey,recent,weekDays,todayMeals} from '../public/date.mjs';
import {parseList,parseDetail} from '../collector.mjs';
test('최근 7일: 오늘 포함, 8일 전과 미래 제외',()=>{assert.equal(recent('2026-09-17','2026-09-23'),true);assert.equal(recent('2026-09-16','2026-09-23'),false);assert.equal(recent('2026-09-24','2026-09-23'),false);assert.equal(recent('2026-09-23','2026-09-23'),true);});
test('한국 자정과 월 경계',()=>{assert.equal(dayKey(new Date('2026-09-23T15:00:00Z')),'2026-09-24');assert.equal(recent('2026-08-27','2026-09-02'),true);assert.deepEqual(weekDays('2026-09-27'),['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27']);});
test('오늘 중식과 석식만 허용: 조식·어제·내일 제외',()=>{const meals=[{date:'2026-09-23',type:'중식'},{date:'2026-09-23',type:'석식'},{date:'2026-09-23',type:'조식'},{date:'2026-09-22',type:'석식'},{date:'2026-09-24',type:'중식'}];assert.deepEqual(todayMeals(meals,'2026-09-23'),meals.slice(0,2));assert.deepEqual(todayMeals(meals,'2026-09-25'),[]);});
test('게시판 고유번호 중복 제거와 날짜 필터',()=>{const row=(id,date)=>`<tr><td><a title="안내" onclick="goView('49782','${id}')">안내</a></td><td>${date}</td></tr>`;const result=parseList('<table>'+row('1','2026-09-23')+row('1','2026-09-23')+row('2','2026-09-16')+'</table>','49782','0301','2026-09-23');assert.equal(result.selected.length,1);assert.equal(result.all.length,2);});
test('본문에서 스크립트 제거, 줄바꿈과 첨부 보존',()=>{const result=parseDetail('<div class="viewBox"><p>첫 줄 &amp; 안내</p><p>둘째 줄</p><script>bad()</script></div><div class="fieldBox"><a href="/boardCnts/fileDown.do?x=1">안내.pdf</a></div>');assert.equal(result.body,'첫 줄 & 안내\n둘째 줄');assert.equal(result.attachments[0].name,'안내.pdf');assert.throws(()=>parseDetail('<p>점검 중</p>'));});
