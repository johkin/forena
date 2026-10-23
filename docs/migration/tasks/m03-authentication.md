# M03: Verifiera Spring-konton, webbsessioner och separata MCP-grants

Status 2026-10-23: egen autentisering infördes i PR #161. ADR-026 gör den till
den nya React/Kotlin-appens enda auth-lösning. Supabase är inte längre issuer
för denna app, men får fortsatt leverera PostgreSQL. Next-appen behåller sin auth.

Läs [AGENTS.md](../../../AGENTS.md), [autentisering](../authentication.md),
[Spring-komponenter](../spring-security.md), [säkerhetsarkitektur](../../security-architecture.md)
och [status](../status.md). De äldre [målmiljöproven](../target-auth-lifecycle.md)
gäller den borttagna adaptern och verifierar inte den nya runtime-koden.

## Ingår

Spring Securitys lösenords-, WebAuthn-, engångstoken- och logout-filter används
med lokala konton, verifierad e-post och versionsbundna sessioner. Registrering
och lösenordsåterställning följer kontoreglerna. Spring Authorization Server
hanterar JDBC-lagrade klienter, consent, PKCE, opaka access-token och revokering.
MCP och browser-API har separata credentials och inga fallback-vägar.

EmailSender, Resend REST och krypterad outbox bevaras. Local-profilen startar
PostgreSQL automatiskt, kör Liquibase med separat owner och använder loggsändare.
React/Vite behöver inga auth-/mejlcredentials eller val av auth-läge.

## Acceptans och verifiering

Prova registrering → browserbunden e-postverifiering → lösenord, passkeys och
magic link, samt reset och logout. Prova replay, fel browser, inaktivt konto,
versionsbyte, stulna råa databas-session-ID:n, absolut livstid, strikt Origin,
kontobindning och gemensamma DB-baserade rate limits. Logout ska fungera även
vid förbrukad loginbudget. Tekniska verifieringsfel ska stänga åtkomst säkert.

OAuth kräver exakt redirect/resource, PKCE och consent. Refresh och återkallning
ska fungera; MCP-token får aldrig användas som webbsession och MCP får inte
falla tillbaka till cookie. Konto-, person- och föreningsbehörighet kontrolleras
av backend, aldrig av användarredigerbar metadata eller klientens meny.

Verifiera riktig browser → Spring → PostgreSQL med virtuell WebAuthn.
Redovisa JVM, AOT och faktisk GraalVM-binär/container separat. CI:s native-prov
ska också använda verklig WebAuthn och OAuth, utan externa auth-/mejlanrop.
Aktuella resultat knyts till PR/commit. Behåll säkerhetsspärrar och Liquibase-historik.

## Avgränsning

Ingen produktionsaktivering, kontomigrering, destruktiv databasstädning eller
omkoppling av Next-appen ingår. Full MCP-verktygsparitet, administrationsflöden,
e-postbyte och säkerhetsnotiser har egna följduppgifter.
