import test from 'node:test';
import assert from 'node:assert/strict';
import {dayKey,recent,recentStart,weekDays,todayMeals} from '../public/date.mjs';
import {parseList,parseDetail} from '../collector.mjs';
test('최근 평일 7일: 주말은 날짜 수에서 제외, 주말 글은 포함',()=>{
 // 2026-11-09 월요일: 지난주 월요일(11-02)과 그 전 금요일(10-30)까지 포함, 10-29(목)는 제외
 assert.equal(recentStart('2026-11-09'),'2026-10-30');
 assert.equal(recent('2026-11-02','2026-11-09'),true);assert.equal(recent('2026-10-30','2026-11-09'),true);assert.equal(recent('2026-10-29','2026-11-09'),false);
 assert.equal(recent('2026-11-07','2026-11-09'),true);assert.equal(recent('2026-10-31','2026-11-09'),true);
 assert.equal(recent('2026-11-10','2026-11-09'),false);assert.equal(recent('2026-11-09','2026-11-09'),true);
 // 2026-09-23 수요일: 09-15(화)까지
 assert.equal(recentStart('2026-09-23'),'2026-09-15');
 // 주말 당일: 오늘(토)은 세지 않고 평일 7일 → 2026-11-14(토) 기준 11-05(목)부터, 오늘 올라온 글도 포함
 assert.equal(recentStart('2026-11-14'),'2026-11-05');assert.equal(recent('2026-11-14','2026-11-14'),true);
 assert.equal(recentStart('2026-11-15'),'2026-11-05');
});
test('한국 자정과 월 경계',()=>{assert.equal(dayKey(new Date('2026-09-23T15:00:00Z')),'2026-09-24');assert.equal(recent('2026-08-25','2026-09-02'),true);assert.equal(recent('2026-08-24','2026-09-02'),false);assert.deepEqual(weekDays('2026-09-27'),['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27']);});
test('오늘 중식과 석식만 허용: 조식·어제·내일 제외',()=>{const meals=[{date:'2026-09-23',type:'중식'},{date:'2026-09-23',type:'석식'},{date:'2026-09-23',type:'조식'},{date:'2026-09-22',type:'석식'},{date:'2026-09-24',type:'중식'}];assert.deepEqual(todayMeals(meals,'2026-09-23'),meals.slice(0,2));assert.deepEqual(todayMeals(meals,'2026-09-25'),[]);});
test('게시판 고유번호 중복 제거와 날짜 필터',()=>{const row=(id,date)=>`<tr><td><a title="안내" onclick="goView('49782','${id}')">안내</a></td><td>${date}</td></tr>`;const result=parseList('<table>'+row('1','2026-09-23')+row('1','2026-09-23')+row('2','2026-09-14')+'</table>','49782','0301','2026-09-23');assert.equal(result.selected.length,1);assert.equal(result.all.length,2);});
test('본문에서 스크립트 제거, 줄바꿈과 첨부 보존',()=>{const result=parseDetail('<div class="viewBox"><p>첫 줄 &amp; 안내</p><p>둘째 줄</p><script>bad()</script></div><div class="fieldBox"><a href="/boardCnts/fileDown.do?x=1">안내.pdf</a></div>');assert.equal(result.body,'첫 줄 & 안내\n둘째 줄');assert.equal(result.attachments[0].name,'안내.pdf');assert.throws(()=>parseDetail('<p>점검 중</p>'));});
