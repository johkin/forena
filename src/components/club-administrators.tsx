import { createClient } from "@/lib/supabase/server";
import { clubAdministratorsSchema } from "@/lib/club-administrators";
import { becomeClubAdministrator, removeClubAdministrator, inviteClubAdministrator, cancelClubAdministratorInvitation } from "@/app/system/club-administrator-actions";
import { ConfirmSubmit } from "./confirm-submit";

export async function ClubAdministrators({ organizationId }: { organizationId: string }) {
  const supabase = await createClient();
  const [response, auth] = await Promise.all([supabase.rpc("system_club_admins", { target: organizationId }), supabase.auth.getUser()]);
  if (response.error || auth.error || !auth.data.user) throw new Error("Klubbadministratörerna kunde inte hämtas.");
  const { administrators, invitations } = clubAdministratorsSchema.parse(response.data);
  const identity = <input type="hidden" name="organizationId" value={organizationId}/>;
  const isAdministrator = administrators.some(admin => admin.userId === auth.data.user.id);
  return <section className="club-admin-section"><h2>Klubbadministratörer</h2><p>Systemadministratörer kan alltid hantera klubbens administratörer. Klubbadministratörer kan hantera medlemsansökningar och klubbens administration. Rollen ger ingen systemadministration.</p>
    {!isAdministrator ? <form action={becomeClubAdministrator}>{identity}<button type="submit" className="primary">Gör mig till klubbadministratör</button></form> : <p>Du är klubbadministratör.</p>}
    {administrators.length ? <div className="system-admin-list">{administrators.map(admin => <article key={admin.userId} className="system-admin-row system-admin-person-row"><div><strong>{admin.email ?? "Okänd e-postadress"}</strong><small>{admin.role === "owner" ? "Klubbägare" : "Klubbadministratör"}</small></div><form action={removeClubAdministrator}>{identity}<input type="hidden" name="userId" value={admin.userId}/><ConfirmSubmit label="Ta bort administratörsroll" message={`Ta bort administratörsrollen för ${admin.email ?? "detta konto"}? Klubbmedlemskapet behålls.${administrators.length === 1 ? " Detta är klubbens sista administratör. Systemadministratören kan tilldela en ny." : ""}`}/></form></article>)}</div> : <p>Klubben saknar administratör. Lägg till dig själv eller bjud in den första administratören.</p>}
    <h3>Bjud in klubbadministratör</h3><form action={inviteClubAdministrator} className="application-form">{identity}<label>E-postadress<input name="email" type="email" required maxLength={254} autoComplete="email"/></label><button type="submit" className="primary">Skicka inbjudan</button></form><p>Mottagaren måste logga in med samma verifierade e-postadress och acceptera inom sju dagar. En ny inbjudan till samma adress ersätter den tidigare.</p>
    <h3>Inbjudningar</h3>{invitations.length ? <div className="system-admin-list">{invitations.map(invite => <article key={invite.id} className="system-admin-row system-admin-person-row"><div><strong>{invite.email}</strong><small>{invite.status === "failed" ? "Mejlet kunde inte skickas" : invite.status === "expired" ? "Utgången" : invite.sent ? "Skickad · väntar på accept" : "Väntar på utskick"}</small></div><form action={cancelClubAdministratorInvitation}>{identity}<input type="hidden" name="invitationId" value={invite.id}/><button type="submit" className="secondary">Avbryt inbjudan</button></form></article>)}</div> : <p>Inga väntande inbjudningar.</p>}
  </section>;
}
