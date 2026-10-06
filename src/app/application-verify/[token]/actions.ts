"use server";

import { redirect } from "next/navigation";
import { verifyMembershipEmail } from "@/lib/membership/verification";

export async function confirmApplicationEmail(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  let organizationSlug;
  try { organizationSlug = await verifyMembershipEmail(token); }
  catch {
    redirect(`/application-verify/${encodeURIComponent(token)}?error=1`);
  }
  redirect(`/o/${encodeURIComponent(organizationSlug)}/join?sent=1`);
}
