"use client";
import { useEffect, useRef, useState } from "react";

export function shiftCalendarDate(value:string, days:number) {
  const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);
}
export function weekDates(value:string) {
  const day=new Date(`${value}T12:00:00Z`).getUTCDay();
  const monday=shiftCalendarDate(value,-((day+6)%7));
  return Array.from({length:7},(_,index)=>shiftCalendarDate(monday,index));
}
/** Local dates only; UTC here prevents a browser timezone from moving calendar days. */
export function ActivityDatePicker({name,value,onChange}:{name:string;value:string;onChange:(value:string)=>void}) {
  const [week,setWeek]=useState(value);
  const cells=weekDates(week);
  const formatter=new Intl.DateTimeFormat("sv-SE",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
  const label=formatter.formatRange(new Date(`${cells[0]}T12:00:00Z`),new Date(`${cells[6]}T12:00:00Z`));
  const strip=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const container=strip.current;
    const selected=container?.querySelector<HTMLButtonElement>("button[aria-pressed=true]");
    if(container && selected && (selected.offsetLeft<container.scrollLeft || selected.offsetLeft+selected.offsetWidth>container.scrollLeft+container.clientWidth)) {
      container.scrollTo({left:Math.max(0,selected.offsetLeft+selected.offsetWidth-container.clientWidth)});
    }
  },[week,value]);
  function move(direction:number) {setWeek(shiftCalendarDate(week,direction*7));}
  function select(date:string){setWeek(date);onChange(date);}
  return <div className="activity-date-picker" role="group" aria-label="Aktivitetsdatum">
    <input type="hidden" name={name} value={value}/>
    <div className="activity-calendar-heading"><strong>{label}</strong><div><button className="icon-button" type="button" aria-label="Föregående vecka" onClick={()=>move(-1)}>‹</button><button className="icon-button" type="button" aria-label="Nästa vecka" onClick={()=>move(1)}>›</button></div></div>
    <div className="activity-week-strip" ref={strip}>{cells.map((date,index)=><button key={date} type="button" aria-label={new Intl.DateTimeFormat("sv-SE",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`))} aria-pressed={date===value} tabIndex={date===value || (!cells.includes(value) && index===0) ? 0 : -1} onClick={()=>select(date)} onKeyDown={event=>{
      const days=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[event.key];
      if(days){event.preventDefault();const next=shiftCalendarDate(date,days);select(next);requestAnimationFrame(()=>document.getElementById(`${name}-${next}`)?.focus());}
    }} id={`${name}-${date}`}><span>{["M","T","O","T","F","L","S"][index]}</span><strong>{Number(date.slice(-2))}</strong></button>)}</div>
    <details className="activity-date-alternative"><summary>Välj annat datum</summary>
    <label className="activity-calendar-selected">Valt datum<input type="date" value={value} onChange={event=>{if(event.target.value)select(event.target.value);}}/></label>
    </details>
  </div>;
}
