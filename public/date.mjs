export const dayKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const shiftDay = (day, n) => new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const recent = (date, today=dayKey()) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= shiftDay(today,-6) && date <= today;
export const todayMeals = (meals, today=dayKey()) => meals.filter(x=>x.date===today&&['중식','석식'].includes(x.type));
export const weekDays = (today=dayKey()) => { const n=new Date(today+'T00:00:00Z').getUTCDay();const monday=shiftDay(today,-((n+6)%7));return Array.from({length:7},(_,i)=>shiftDay(monday,i)); };
