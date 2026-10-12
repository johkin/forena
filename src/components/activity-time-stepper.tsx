"use client";
import { useRef, useState } from "react";
export function stepActivityTime(value:string,direction:1|-1) {
 const [hour,minute]=value.split(":").map(Number);
 const wrapped=(hour*60+minute+direction*15+1440)%1440;
 return `${String(Math.floor(wrapped/60)).padStart(2,"0")}:${String(wrapped%60).padStart(2,"0")}`;
}
export function ActivityTimeStepper({name,label,value,onChange}:{name:string;label:string;value:string;onChange:(value:string)=>void}) {
 const [editing,setEditing]=useState(false);
 const input=useRef<HTMLInputElement>(null);
 function edit() { setEditing(true); requestAnimationFrame(()=>{input.current?.focus();try { input.current?.showPicker(); } catch { /* Focusing opens the platform keyboard when a picker is unavailable. */ }}); }
 return <div className="activity-time-stepper" role="group" aria-label={label}><span className="eyebrow">{label}</span><input type="hidden" name={name} value={value}/>{editing ? <input ref={input} className="activity-exact-time" type="time" aria-label={label} value={value} step={60} onChange={event=>{if(event.target.value)onChange(event.target.value);}} onBlur={()=>setEditing(false)}/> : <div className="activity-time-controls"><button type="button" aria-label={`${label}, femton minuter tidigare`} onClick={()=>onChange(stepActivityTime(value,-1))}>−</button><button className="activity-time-value" type="button" aria-label={`${label}, välj klockslag ${value}`} onClick={edit}>{value}</button><button type="button" aria-label={`${label}, femton minuter senare`} onClick={()=>onChange(stepActivityTime(value,1))}>+</button></div>}</div>;
}
