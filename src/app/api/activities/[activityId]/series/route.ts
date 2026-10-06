import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
const schema=z.object({preview:z.boolean(),token:z.string().optional(),changes:z.object({title:z.string().trim().min(1).max(160),description:z.string().max(20000).optional(),location:z.string().max(500).optional(),activityTypeId:z.uuid().optional(),startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),gatheringAt:z.iso.datetime({offset:true}).nullable()})});
export async function POST(request:Request,{params}:{params:Promise<{activityId:string}>}) {
  const body=schema.safeParse(await request.json().catch(()=>null));
  if(!body.success)return NextResponse.json({error:"Ogiltiga aktivitetsuppgifter."},{status:400});
  const supabase=await createClient();
  const {data:auth}=await supabase.auth.getUser();
  if(!auth.user)return NextResponse.json({error:"Logga in för att redigera serien."},{status:401});
  const {data,error}=await supabase.rpc("edit_activity_series_from",{target_activity_id:(await params).activityId,changes:body.data.changes,preview_only:body.data.preview,expected_token:body.data.token});
  if(error)return NextResponse.json({error:["23514","40001","42501"].includes(error.code)?error.message:"Serien kunde inte uppdateras."},{status:error.code==="42501"?403:error.code==="40001"?409:400});
  return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
}
