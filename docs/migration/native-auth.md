# Egen autentisering i Spring Boot – försök

Detta körläge ersätter Supabase Auth för den nya React/Kotlin-appen.
Aktivera både frontendbygget och backend med `FORENA_AUTH_MODE=native`.
Det befintliga läget `supabase` finns kvar för jämförelse och återgång; det
sker ingen automatisk fallback mellan lägena. Försöket ändrar inga driftinställningar.

## Ansvar och flöden

Spring Security står för lösenordskodning (delegating encoder med BCrypt),
WebAuthn-verifiering genom `Webauthn4JRelyingPartyOperations`, JDBC-lagrade
engångstoken och OAuth Authorization Server. Egna controllers anpassar dessa
komponenter till appens JSON-API och befintliga React-komponenter.
Ingen egen verifiering av signaturer, attestation eller OAuth-koder införs.

Webben använder enbart Spring Session JDBC. Ett konto-ID och en sessionsversion
lagras som strängattribut; lösenord, leverantörstoken och serialiserade
SecurityContext-objekt lagras inte i webbsessionen. Varje anrop laddar aktuell
lokal kontostatus. Absolut livstid, inaktivitet, krypterat cookie-ID och
HttpOnly/Secure/SameSite=Lax följer tidigare sessionskonfiguration.

- `/register`: nytt lokalt konto, verifiering via mejl före första inloggning.
  Verifieringslänken binds till samma browserprofil som registreringen.
  Upprepad registrering av ett obekräftat konto ersätter det föreslagna lösenordet
  och gör äldre verifieringslänkar ogiltiga. Befintliga bekräftade konton ändras inte.
- `/login`: lösenord, passkey eller engångslänk. Magic link kräver samma
  browserprofil och en uttrycklig POST-bekräftelse på `/auth/callback`.
- `/password/forgot` och `/auth/reset`: återställning via tidsbegränsad länk.
  Nytt lösenord ökar kontots sessionsversion och avslutar tidigare webb- och
  OAuth-åtkomst. Även övriga gamla engångslänkar blir ogiltiga. Samtidiga
  återställningar använder villkorad uppdatering av sessionsversionen.
- `/account/security`: registrera, lista och ta bort egna passkeys.
  User verification krävs vid både registrering och inloggning.
- `/oauth/consent`: samma inloggade konto godkänner en MCP-klients läsåtkomst.

Registrering och länkbegäran lämnar neutrala bekräftelser. API-skrivningar kräver
kanonisk Origin och `X-Forena-Request: 1`. Befintliga klient-/e-post-/globalbudgetar
begränsar publika inloggningsförsök och OAuth-token-/introspektions-/revokeringsanrop. OAuth-consent använder dessutom Spring CSRF.
Kontroller för personåtkomst och föreningsroller ligger oförändrat i Kotlin.
Nya konton får inga sådana relationer automatiskt.

## OAuth och MCP

Authorization Server körs i samma backend. Klienter, godkännanden och grants
lagras med Spring Securitys JDBC-repositories. Försöket använder opaka
access-token med 15 minuters livstid. Token verifieras lokalt mot aktuell grant,
konto och sessionsversion; separat signeringsnyckel eller JWKS behövs inte.
Token lagras som känsliga credentials i de privata frameworktabellerna.

En klient provisioneras uttryckligen från konfiguration. Exakt redirect-URI,
PKCE och användarens godkännande krävs. Ingen öppen dynamisk klientregistrering
aktiveras. En konfidentiell klient har en slumpad klienthemlighet på 32–72 byte och kan använda roterande refresh-token;
en publik klient autentiserar utan klienthemlighet och behöver ny auktorisering
när access-token går ut. Webbinloggningen kan då återanvändas.

Resursen är exakt `${FORENA_WEB_ORIGIN}/api/mcp`, scope `mcp:read`.
Klienten skickar `resource` på både authorization- och tokenanrop.
Spring sköter kodutbyte, introspektion och återkallning. Webb-API:t accepterar
inte MCP-token, och MCP accepterar inte browsercookies som autentisering.

Metadata finns på `/.well-known/oauth-authorization-server` och
`/.well-known/oauth-protected-resource/api/mcp`. MCP-endpointen erbjuder ett
avgränsat read-only-verktyg, `list_my_activities`, med högst 50 aktiviteter
utan kontaktuppgifter, personnamn eller svarskommentarer. Det är ett separat
MCP-prov, inte full flytt av gamla Next-serverns verktyg. Vercels routing måste
skicka `/oauth2/*` och metadata till backend; `/oauth/consent` går till SPA:n.

## Lokal konfiguration

Använd en avsedd testdatabas. Befintlig Liquibase-bootstrap och separata
owner-/runtime-konton gäller. Migration 012 skapar lokala konton och Spring
Securitys tabeller i privata `forena`. Ingen koppling till `auth.users` behövs.

Backend behöver följande utöver ordinarie JDBC-/migrationskonfiguration:

```dotenv
FORENA_AUTH_MODE=native
FORENA_WEB_SESSION_ENABLED=true
FORENA_WEB_ORIGIN=http://localhost:3000
FORENA_WEB_SESSION_SECURE=false
# Sätt en base64-kodad 32-byte-nyckel i hemlighetshanteringen:
FORENA_WEB_SESSION_KEY=
FORENA_PASSKEY_RP_ID=localhost
FORENA_AUTH_MAIL_FROM=Förena <auth@example.test>
FORENA_SMTP_HOST=localhost
FORENA_SMTP_PORT=1025
FORENA_SMTP_AUTH=false
FORENA_SMTP_REQUIRE_TLS=false
# Valfritt OAuth-prov; välj en exakt redirect för den egna testklienten:
FORENA_OAUTH_CLIENT_ID=
FORENA_OAUTH_CLIENT_REDIRECT=
FORENA_OAUTH_CLIENT_SECRET=
```

SMTP utan obligatorisk TLS tillåts bara på loopback. I drift används verifierad
avsändardomän, riktig SMTP-host, obligatorisk TLS och SMTP-credentials i
runtime-hemlighetshanteringen. Använd tjänstens SPF/DKIM/DMARC-konfiguration.
Använd inga produktionsadresser i tester. En lokal mejlfångare kan visa länkarna.

Frontend byggs med `FORENA_AUTH_MODE=native npm run frontend:build`.
Dess publika config innehåller lägesnamn och versions-ID, inga Supabase-nycklar
eller SMTP-credentials. Läget måste stämma överens med backendens läge.

## Mejl och driftgränser

Verifiering, magic link och lösenordsåterställning använder separata texter i
samma utskickstjänst. Engångslänkar gäller i tio minuter. En beständig outbox
skrivs i samma transaktion som token; länken är krypterad med runtime-nyckeln.
En schemalagd worker tar radlås med SKIP LOCKED, försöker högst fem gånger och
raderar länken efter bekräftad leverans eller utgången giltighet. SMTP-accept
följd av processkrasch kan ge ett dubblettmejl; ingen exactly-once-garanti ges.

Workern kör bara när backendprocessen kör. Drift med skalning till noll behöver
ett verifierat sätt att hålla workern aktiv eller väcka/köra den. Mejlleverans,
SPF/DKIM/DMARC och faktisk plattformsrouting måste provas före driftaktivering.

Befintliga Supabase-konton och lösenord importeras inte. E-postlikhet ger ingen
identitetskoppling. Flytt av konton kräver separat identifierad och testad migrering
med bevarade verksamhetskopplingar. Administration för kontospärr/borttagning,
e-postbyte, säkerhetsnotiser, fler OAuth-klienter och full MCP-funktionsparitet
behöver färdigställas före en full produktionsersättning. Lokala spärrar genom
`account.enabled` verkställs redan för både webb och MCP.

JVM-körning är försöksmiljön. GraalVM/AOT väljer villkorade auth-beans vid
bygget, så ett tidigare Supabase-native-image kan inte växlas till egen Auth
med bara en runtime-variabel. Releaseverktyget blockerar därför publicering
med native Auth tills separat AOT-/native-image-verifiering är gjord. Ingen
Vercel- eller annan driftpublicering ingår i det lokala försöket.

## Verifiering

`NativeAuthTest` använder riktig HTTP, lokal PostgreSQL och Spring Authorization
Server utan Supabase issuer/nycklar. SMTP ersätts med en kontrollerad testtransport.
Proven täcker kontolivscykel, versionerade engångslänkar, cookie-sessioner,
OAuth/PKCE/consent, MCP och lokala spärrar. Testet exporterar även
`backend/target/native-openapi.json`, separat från Supabase-lägets kontrakt.

Browserprovet använder riktiga WebAuthn-ceremonier med en virtuell credential och
verklig Spring-verifiering. Kör Vite preview på port 3002 efter native-bygget:

```sh
FORENA_NATIVE_BROWSER_TEST=true backend/mvnw -f backend/pom.xml -Dtest=NativeAuthTest test
```

Testet har en lokal testbrygga för HTTPS-origin, SMTP-länkar och testbudget.
Testhjälparna finns bara i testprocessen, aldrig i produktions-API:t.
