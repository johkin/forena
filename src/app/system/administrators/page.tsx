import { createClient } from "@/lib/supabase/server";
import { cancelSystemAdminInvite, inviteSystemAdmin } from "../actions";

type Props = {
  searchParams: Promise<{ invited?: string; joined?: string; cancelled?: string; error?: string }>;
};

export default async function SystemAdministratorsPage({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createClient();

  const [{ data: admins }, { data: invites }] = await Promise.all([
    supabase.rpc("list_platform_admins"),
    supabase
      .from("platform_admin_invites")
      .select("id, email, status, source, sent_at, expires_at, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const pending = (invites ?? []).filter((invite) => invite.status === "pending");

  return (
    <main className="application-page">
      <div className="application-card">
        <div className="application-page-heading">
          <div>
            <p className="eyebrow">System</p>
            <h1>Administratörer</h1>
            <p>Systemadministratörer är plattformsroller och är helt separerade från roller i en förening.</p>
          </div>
        </div>

        {query.invited ? <p className="auth-message">Inbjudan skickades till {query.invited}.</p> : null}
        {query.joined ? <p className="auth-message">Systemadministrationen är aktiverad för ditt konto.</p> : null}
        {query.cancelled ? <p className="auth-message">Inbjudan avbröts.</p> : null}
        {query.error ? <p className="auth-error">{query.error}</p> : null}

        <section className="form-section">
          <h2>Bjud in systemadministratör</h2>
          <form action={inviteSystemAdmin} className="system-admin-invite-form">
            <label>
              E-postadress
              <input name="email" type="email" autoComplete="email" required placeholder="admin@example.com" />
            </label>
            <button type="submit" className="primary">Skicka inbjudan</button>
          </form>
          <p className="form-help">Mottagaren måste logga in med exakt samma verifierade e-postadress. Inbjudan ger ingen klubbroll.</p>
        </section>

        <section className="form-section">
          <h2>Aktiva systemadministratörer</h2>
          <div className="system-admin-list">
            {(admins ?? []).length ? (admins ?? []).map((admin) => (
              <div className="system-admin-row system-admin-person-row" key={admin.user_id}>
                <div>
                  <strong>{admin.email ?? "Okänd e-postadress"}</strong>
                  <small>system_admin</small>
                </div>
                <span>Aktiverad {new Date(admin.created_at).toLocaleDateString("sv-SE")}</span>
              </div>
            )) : <p className="form-help">Inga systemadministratörer finns ännu.</p>}
          </div>
        </section>

        <section className="form-section">
          <h2>Väntande inbjudningar</h2>
          <div className="system-admin-list">
            {pending.length ? pending.map((invite) => (
              <div className="system-admin-row system-admin-person-row" key={invite.id}>
                <div>
                  <strong>{invite.email}</strong>
                  <small>{invite.source === "bootstrap" ? "Initial bootstrap" : "Inbjuden av systemadmin"}</small>
                </div>
                <span>{invite.sent_at ? "E-post skickad" : "Väntar på e-post"} · går ut {new Date(invite.expires_at).toLocaleDateString("sv-SE")}</span>
                <form action={cancelSystemAdminInvite}>
                  <input type="hidden" name="id" value={invite.id} />
                  <button className="secondary" type="submit">Avbryt</button>
                </form>
              </div>
            )) : <p className="form-help">Inga väntande inbjudningar.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
