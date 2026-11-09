export const dayKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const shiftDay = (day, n) => new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
// 게시글 표시 기간: 오늘 포함 평일(월~금) 기준 RECENT_WEEKDAYS일. 토·일은 날짜 수에 넣지 않지만 그 사이 주말에 올라온 글도 표시합니다.
export const RECENT_WEEKDAYS = 7;
const isWeekend = day => [0,6].includes(new Date(day+'T00:00:00Z').getUTCDay());
export const recentStart = (today=dayKey(), weekdays=RECENT_WEEKDAYS) => { let day=today, count=isWeekend(today)?0:1; while(count<weekdays){ day=shiftDay(day,-1); if(!isWeekend(day)) count++; } return day; };
export const recent = (date, today=dayKey()) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= recentStart(today) && date <= today;
export const todayMeals = (meals, today=dayKey()) => meals.filter(x=>x.date===today&&['중식','석식'].includes(x.type));
export const weekDays = (today=dayKey()) => { const n=new Date(today+'T00:00:00Z').getUTCDay();const monday=shiftDay(today,-((n+6)%7));return Array.from({length:7},(_,i)=>shiftDay(monday,i)); };
