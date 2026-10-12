"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clubAdminInvitationPath } from "@/lib/club-administrators";
export async function acceptClubAdministratorInvitation(form: FormData) {
  const token = String(form.get("token") ?? "");
  const destination = clubAdminInvitationPath(token);
  if (!destination) redirect("/login?error=Ogiltig+inbjudan");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(destination)}`);
  const { data, error } = await supabase.rpc("accept_club_admin_invite", { invitation_token_hash: createHash("sha256").update(token).digest("hex") });
  const result = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }).safeParse(data);
  if (error || !result.success) redirect(`${destination}?error=${encodeURIComponent("Inbjudan kunde inte accepteras. Logga in med rätt verifierade e-postadress. Länken kan ha gått ut eller avbrutits.")}`);
  revalidatePath("/", "layout");
  redirect(`/o/${result.data.slug}/admin/sections?adminJoined=1`);
}
