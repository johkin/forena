import { useEffect, useState } from "react";
import { z } from "zod";
import { EmailVerification, NativeAccountForm, OAuthConsent, type NativeAccountAction, type OAuthConsentData } from "../../src/components/native-account-form";
import { PasskeyList } from "../../src/components/passkey-list";
import { authRequest } from "./session";

export function NativeAccountPage({ action, code }: { action: NativeAccountAction | "verify"; code?: string | null }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function submit(value?: { email: string; password: string }) {
    if (pending) return;
    setPending(true); setError(undefined);
    try {
      const path = action === "register" ? "register" : action === "forgot" ? "password/reset-request" : action === "reset" ? "password/reset" : "email/verify";
      const body = action === "register" ? value : action === "forgot" ? { email: value?.email } : action === "reset" ? { code, password: value?.password } : { code };
      z.object({ ok: z.literal(true) }).parse(await authRequest(path, body));
      setMessage(action === "register" ? "Om adressen kan registreras får du ett mejl med en verifieringslänk. Har du redan ett konto kan du logga in eller återställa lösenordet." : action === "forgot" ? "Om adressen har ett aktivt konto får du en återställningslänk." : action === "reset" ? "Lösenordet är ändrat. Logga in med ditt nya lösenord." : "verified");
    } catch { setError("Begäran kunde inte slutföras. Kontrollera uppgifterna. Om länken har gått ut behöver du begära en ny."); }
    finally { setPending(false); }
  }
  return action === "verify" ? <EmailVerification onVerify={() => void submit()} pending={pending} verified={Boolean(message)} error={error} /> :
    <NativeAccountForm action={action} onSubmit={value => void submit(value)} pending={pending} message={message} error={error} />;
}

export function NativeConsentPage({ search }: { search: string }) {
  const [data, setData] = useState<OAuthConsentData>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/auth/oauth/consent${search}`, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Consent unavailable");
        const data = z.object({ clientId: z.string(), clientName: z.string(), state: z.string(), scope: z.literal("mcp:read"), resource: z.string(), csrfParameter: z.literal("_csrf"), csrfToken: z.string() }).strict().parse(await response.json());
        if (!abort.signal.aborted) setData(data);
      }).catch(() => { if (!abort.signal.aborted) setError("Åtkomstförfrågan är ogiltig eller har gått ut. Starta anslutningen igen från klienten."); });
    return () => abort.abort();
  }, [search]);
  return <OAuthConsent data={data} pending={!data && !error} error={error} />;
}

export function NativePasskeyList({ accountId, revision }: { accountId: string; revision: boolean }) {
  const [items, setItems] = useState<{ id: string; label: string }[]>();
  const [error, setError] = useState<string>();
  const [change, setChange] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/auth/passkeys", { credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "X-Forena-Account": accountId }, signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Passkeys unavailable");
        const items = z.array(z.object({ id: z.string(), label: z.string() })).parse(await response.json());
        if (!abort.signal.aborted) { setItems(items); setError(undefined); }
      }).catch(() => { if (!abort.signal.aborted) setError("Dina passkeys kunde inte hämtas."); });
    return () => abort.abort();
  }, [accountId, revision, change]);
  async function remove(id: string) {
    try {
      const response = await fetch(`/api/auth/passkeys/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "X-Forena-Request": "1", "X-Forena-Account": accountId } });
      if (!response.ok) throw new Error("Removal failed");
      setChange(value => value + 1);
    } catch { setError("Passkey kunde inte tas bort. Försök igen."); }
  }
  return <PasskeyList items={items} pending={!items && !error} error={error} onRemove={id => void remove(id)} />;
}
