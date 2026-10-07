/* A single calendar-date boundary for booking inputs; history remains viewable. */
globalThis.WOLGYE_DATE_POLICY={
 today(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=type=>parts.find(p=>p.type===type).value;return part('year')+'-'+part('month')+'-'+part('day');},
 stamp(draft){return draft.year+'-'+String(draft.month).padStart(2,'0')+'-'+String(draft.day).padStart(2,'0');},
 valid(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const[y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d&&value>=this.today();},
 draft(value){const valid=this.valid(value)?value:this.today(),[year,month,day]=valid.split('-').map(Number);return {year,month,day};},
 ranges(draft){const[y,m,d]=this.today().split('-').map(Number),end=Math.max(2100,y+1);draft.year=Math.max(y,Math.min(end,draft.year));const firstMonth=draft.year===y?m:1;draft.month=Math.max(firstMonth,Math.min(12,draft.month));const firstDay=draft.year===y&&draft.month===m?d:1,lastDay=new Date(draft.year,draft.month,0).getDate();draft.day=Math.max(firstDay,Math.min(lastDay,draft.day));const range=(first,last)=>Array.from({length:last-first+1},(_,i)=>first+i);return {year:range(y,end),month:range(firstMonth,12),day:range(firstDay,lastDay)};}
};
