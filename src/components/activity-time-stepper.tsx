"use client";
import { FiveMinuteTimeField } from "./five-minute-time-field";
export function stepActivityTime(value:string,direction:1|-1) {
 const [hour,minute]=value.split(":").map(Number);
 const total=hour*60+(direction===1?Math.floor(minute/5)*5+5:Math.ceil(minute/5)*5-5);
 const wrapped=(total+1440)%1440;return `${String(Math.floor(wrapped/60)).padStart(2,"0")}:${String(wrapped%60).padStart(2,"0")}`;
}
export function ActivityTimeStepper({name,label,value,onChange}:{name:string;label:string;value:string;onChange:(value:string)=>void}) {
 return <div className="activity-time-stepper" role="group" aria-label={label}><span className="eyebrow">{label}</span><input type="hidden" name={name} value={value}/><div className="activity-time-controls"><button type="button" aria-label={`${label}, fem minuter tidigare`} onClick={()=>onChange(stepActivityTime(value,-1))}>−</button><details><summary aria-label={`${label}, välj klockslag ${value}`}>{value}</summary><div className="activity-time-options"><FiveMinuteTimeField name={`${name}-custom`} label={label} defaultValue={value} value={value} onChange={onChange}/></div></details><button type="button" aria-label={`${label}, fem minuter senare`} onClick={()=>onChange(stepActivityTime(value,1))}>+</button></div></div>;
}
