# M03: Verifiera Supabase-identitet och skilj kanalgrants

Status: delvis implementerad (2026-10-19). Beroenden: M01. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

Webbsessionsverifiering, lokala JWKS-prov och onlineadapter för aktuell `/user`-
status finns i `backend/api`. Adapterns lokala fel-/revokeringsprov är gröna;
verklig Supabase-inloggning, passkey/MCP och driftad sessionsrevokering är ännu
inte verifierade. Se [målmiljö/Auth](../target-auth-lifecycle.md) och opt-in-provet
`TargetAuthIT`; hela M03 är fortfarande inte accepterad.

## Bakgrund och gemensamma beslut

Supabase förblir issuer. Lokal passkey-konfiguration är kommenterad och OAuth avstängt; driftens inställningar är inte verifierade. ADR-004 styr.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

src/lib/mcp/auth.ts, src/lib/mcp/oauth.ts, src/lib/mcp/consent.ts, src/lib/supabase/, src/components/passkey-enrollment.tsx, src/app/auth/callback/route.ts, backend/. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Inför Spring Security resource server och verifierad UserContext med konto, kanal och relevanta grants. Kartlägg verklig issuer/audience/algoritm/JWKS och claims med syntetisk testanvändare. Definiera policy för revokering/blockering, scopes, legacy HS och otillåten användning av MCP-token som webbsession. Dokumentera RP-ID/origins och MCP discovery utan att ändra serverägarskap.

## Acceptanskriterier

Giltig webbsession fungerar; fel signatur/algoritm/issuer/audience/exp/nbf och otillåtet klient-ID/scope/grant nekas. JWKS-cache, rotation och nätfel testas. MCP använder aldrig cookie-fallback. Ingen user_metadata ger rättigheter.

## Verifiering

JUnit med kontrollerad JWKS-server plus end-to-end med avsedd Supabase-testmiljö. Prova passkey, magic link, lösenord och MCP consent/token med syntetiska konton; redovisa blockerad leverantörskonfiguration separat.

## Lämnas till senare

Ingen egen OAuth/WebAuthn-server och inga verksamhetsbehörigheter från tokenrollen ensam. Inga produktionsdomänbyten.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
