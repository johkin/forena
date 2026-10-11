"use client";
import { useState } from "react";

export function shiftCalendarDate(value:string, days:number) {
  const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);
}
export function monthCells(month:string) {
  const [year,number]=month.split("-").map(Number);
  const first=new Date(Date.UTC(year,number-1,1,12));
  const offset=(first.getUTCDay()+6)%7;
  const count=new Date(Date.UTC(year,number,0)).getUTCDate();
  return Array.from({length:Math.ceil((offset+count)/7)*7},(_,index)=>index<offset||index>=offset+count?null:`${month}-${String(index-offset+1).padStart(2,"0")}`);
}
/** Local dates only; UTC here prevents a browser timezone from moving calendar days. */
export function ActivityDatePicker({name,value,onChange}:{name:string;value:string;onChange:(value:string)=>void}) {
  const [month,setMonth]=useState(value.slice(0,7));
  const label=new Intl.DateTimeFormat("sv-SE",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${month}-01T12:00:00Z`));
  const cells=monthCells(month);
  function move(direction:number) {const date=new Date(`${month}-01T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+direction);setMonth(date.toISOString().slice(0,7));}
  function select(date:string){setMonth(date.slice(0,7));onChange(date);}
  return <div className="activity-date-picker" role="group" aria-label="Aktivitetsdatum">
    <input type="hidden" name={name} value={value}/>
    <div className="activity-calendar-heading"><strong>{label}</strong><div><button className="icon-button" type="button" aria-label="Föregående månad" onClick={()=>move(-1)}>‹</button><button className="icon-button" type="button" aria-label="Nästa månad" onClick={()=>move(1)}>›</button></div></div>
    <div className="activity-calendar-weekdays" aria-hidden="true">{["M","T","O","T","F","L","S"].map((day,index)=><span key={index}>{day}</span>)}</div>
    <div className="activity-calendar-days">{cells.map((date,index)=>date ? <button key={date} type="button" aria-label={new Intl.DateTimeFormat("sv-SE",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`))} aria-pressed={date===value} tabIndex={date===value || (!value.startsWith(month) && date.endsWith("-01")) ? 0 : -1} onClick={()=>select(date)} onKeyDown={event=>{
      const days=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[event.key];
      if(days){event.preventDefault();const next=shiftCalendarDate(date,days);select(next);requestAnimationFrame(()=>document.getElementById(`${name}-${next}`)?.focus());}
    }} id={`${name}-${date}`}>{Number(date.slice(-2))}</button> : <span key={index}/>)}</div>
    <label className="activity-calendar-selected">Valt datum<input type="date" value={value} onChange={event=>{if(event.target.value)select(event.target.value);}}/></label>
  </div>;
}
