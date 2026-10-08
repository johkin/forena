"use client";
import { useEffect,useState } from "react";
import { disciplineFieldEditors,type DisciplineFieldsProps } from "@/disciplines/ui-registry";
/** Unknown disciplines have no editor; never fall back to another package. */
export function DisciplineFields(props: DisciplineFieldsProps & { disciplineKey?: string }) {
  const target = new URLSearchParams({teamId:props.teamId,scope:props.scope,...(props.activityId?{activityId:props.activityId}:{}),...(props.personId?{personId:props.personId}:{})}).toString();
  const [resolved,setResolved]=useState<{target:string;key:string|null;error:boolean}|null>(null);
  useEffect(() => {
    if (props.disciplineKey) return;
    const controller=new AbortController();
    fetch(`/api/discipline-fields?${target}`,{signal:controller.signal})
      .then(async response => response.ok ? response.json() : Promise.reject(new Error("Failed to resolve discipline")))
      .then(data => { if (!controller.signal.aborted) setResolved({target,key:data?.disciplineKey ?? null,error:false}); })
      .catch(() => { if (!controller.signal.aborted) setResolved({target,key:null,error:true}); });
    return () => controller.abort();
  },[target,props.disciplineKey]);
  const current=resolved?.target===target ? resolved : null;
  if (!props.disciplineKey && current?.error) return <p role="alert">Disciplinuppgifterna kunde inte hämtas. Försök att öppna vyn igen.</p>;
  const key=props.disciplineKey ?? current?.key;
  const Editor=key ? disciplineFieldEditors[key] : undefined;
  return Editor ? <Editor key={`${props.teamId}:${key}`} {...props}/> : null;
}
