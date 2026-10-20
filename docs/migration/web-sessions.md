# Webbsessioner i Kotlin (#135)

Den separata React/Vite-appen använder en Kotlin-ägd serversession enligt
ADR-018. Gamla Next-appen och dess Auth/MCP-flöden är separata. Det här ändrar
inte skydd eller publicering av hela sajten: statiska sidor är publika och
backend har uttryckliga regler för varje API-route.

## API och browser

| Route | Åtkomst och funktion |
| --- | --- |
| `GET /actuator/health` | Publik, inga detaljer; inkluderar Auth-nycklar och sessionslagringens schema |
| `POST /api/auth/login` | Publik med CSRF-skydd; email/password till Auth från Kotlin |
| `POST /api/auth/passkey/options` | Publik med CSRF-skydd; Auth-challenge binds till krypterad HttpOnly-cookie i högst fem minuter |
| `POST /api/auth/passkey/verify` | Publik med CSRF-skydd; kräver matchande challenge-cookie och giltig WebAuthn-assertion |
| `POST /api/auth/logout` | Publik med CSRF-skydd; idempotent även med utgången cookie |
| `GET /api/auth/session` | Kräver session; returnerar endast verifierat användar-ID och email |
| Verksamhets-API och övriga routes | Kräver autentisering och respektive verksamhetsbehörighet |

Cookieautentiserade skrivningar och alla Auth-POST kräver den konfigurerade
Origin exakt samt `X-Forena-Request: 1`. Ingen tillåtande CORS införs. Browsern
skickar automatiskt Origin; JavaScript behöver aldrig läsa sessionscookien.
Verksamhetsanrop skickar även `X-Forena-Account` med UI:ts aktuella konto-ID.
Backend jämför det med serversessionens konto; fel konto eller saknat värde vid
cookieautentiserad verksamhetsskrivning nekas. Headern ger inga rättigheter.
Bearer-anrop behåller tidigare stateless-kontrakt och kontroller; att kombinera
Bearer och sessionscookie nekas för skyddade API-anrop.

Login/passkey sätter `__Host-forena-session`: 256 slumpbitar, HttpOnly, Secure,
SameSite=Lax, Path=/, utan Domain eller beständig cookie-expiry. Servern styr
giltigheten även om browsern återställer sina sessionscookies. Auth- och privata
svar har `Cache-Control: no-store`. Tokens finns aldrig i frontendens svar,
state, localStorage, sessionStorage, IndexedDB eller JavaScript-läsbara cookies.
Gamla pilotnyckeln och dess hjälpfält rensas vid start; användaren loggar in igen.

Login och logout uppdaterar React utan dokumentbyte. Passkey gör options →
`navigator.credentials.get()` → verify via samma origin. Supabase verifierar
signatur, challenge, RP-ID, origin och användarstatus. Kotlin binder challenge-ID
till browserns krypterade cookie och dess expiry; Auth ansvarar för engångsanvändning.
Webbläsaren får aldrig leverantörens sessionssvar. Kontobyten signaleras mellan
flikar utan användardata; sessionen kontrolleras även när fliken får fokus.

## Serversession och livscykel

`forena.browser_session` är privat infrastruktur, inte affärshistorik. Tabellen
har SHA-256-hash av sessions-ID, konto-ID, leverantörens sessions-ID, krypterat
tokenpar och tidsgränser. Tokens krypteras med AES-256-GCM, ny 96-bitars nonce
och sessionshash som authenticated additional data. Krypteringsnyckeln finns
enbart i runtime-hemlighetshanteringen, separat från databasen. Klientroller
saknar grants. Runtime får endast DML i tabellen, inte schemaägar-/Auth-adminrätt.

Standard är åtta timmars maximal livstid och 30 minuters inaktivitet. Godkända
sessionsuppslag flyttar inaktivitetstid framåt inom maximaltiden. Vid högst 60
sekunder kvar på access-token förnyas den på servern. `SELECT ... FOR UPDATE`
inom en JDBC-transaktion serialiserar uppslag/förnyelse över alla instanser.
Förnyad JWT måste fortfarande ha samma konto och leverantörssession. Omstarter
behåller sessioner när databas, nyckel och konfiguration är desamma.

Ogiltig refresh och utgångna tidsgränser tar bort raden och ger 401. Tillfälliga
Auth-/JWKS-fel ger 503 och bevarar sessionen; ingen retry eller browser-fallback.
Lokal konto-/sessionsspärr och aktuell Auth-session kontrolleras som tidigare,
också vid verksamhetsskrivning efter radlås. Inga behörigheter kommer från
`user_metadata`. Utloggning tar bort raden innan Auth anropas med `scope=local`
och rensar cookien. Om Auth är nere avslutas appsessionen ändå; ingen garanti
ges då om omedelbar återkallning av en redan utfärdad leverantörs-JWT.

Expired-rader städas varje minut när applikationen kör och vid ny inloggning.
Vid skalning till noll körs ingen städning förrän nästa instans startar, men
utgångna sessioner accepteras aldrig. Kontoradering kaskadraderar dess
appsessioner. Ingen atomär transaktion finns med extern Auth: processkrasch
efter provider-refresh men före databascommit kan kräva ny inloggning efter
leverantörens refresh-reuse-fönster. In-flight-kommandon har samma gräns vid
revokering efter sista kontrollen som ADR-016 beskriver.

## Konfiguration och releaseordning

1. Applicera Liquibase till och med `api-006-browser-session` med separat
   ägarkonto. Runtime får inga migreringscredentials. Den additiva tabellen
   ändrar inte affärstabellerna; befintliga Bearer-klienter fungerar fortsatt.
2. Skapa en base64-kodad nyckel från 32 kryptografiskt slumpade byte i godkänd
   hemlighetshantering. Sätt `FORENA_WEB_SESSION_KEY` endast för backendens runtime.
   Alla instanser behöver samma nyckel. Ingen automatisk nyckelgenerering vid
   start används. Nyckeln får aldrig hamna i byggargument, publika filer eller loggar.
3. Sätt `FORENA_WEB_SESSION_ENABLED=true` och `FORENA_WEB_ORIGIN` till exakt
   sajt-origin utan avslutande slash. Produktion kräver HTTPS och Secure-cookie.
   Valfria `FORENA_WEB_SESSION_MAX_SECONDS`/`FORENA_WEB_SESSION_IDLE_SECONDS`
   styr tidsgränser (högst ett dygn). Behåll API:ts separata Auth-issuer/JWKS/key.
4. För passkey måste målprojektets experimentella passkey-stöd vara aktiverat
   och ha rätt RP-ID och tillåtna origins. Befintliga registrerade passkeys
   måste tillhöra detta RP-ID. Registrering/hantering av passkeys ingår inte.
   Se [Supabases aktuella passkey-kontrakt](https://supabase.com/docs/guides/auth/passkeys).
5. Publicera frontend och backend tillsammans. Releaseförberedelsen validerar
   runtime-nyckeln utan att exportera den; runtime-descriptorn aktiverar sessioner
   med kanonisk Kotlin-site-origin. Health måste verifiera migration 006 före
   promotion. Verifiera sedan faktisk login/cookie/API/logout på sajtens origin.

Lokalt kan `FORENA_WEB_SESSION_SECURE=false` användas endast med loopback-origin,
till exempel `http://localhost:3000`. Då heter cookien `forena-local-session`.
Använd localhost för WebAuthn; ett IP-literal är inget giltigt WebAuthn RP-ID.
Migration-only och äldre Bearer-tester behöver inte aktivera webbsessioner.

Nyckelbyte gör gamla krypterade sessioner ogiltiga; planera det som utloggning
av samtliga webbsessioner och rensa gamla sessionsrader i samma driftoperation.
Nyckeln måste också skyddas vid backup. Återgång görs genom föregående gemensamma
frontend/backend-release; databasen behöver inte återställas. En äldre frontend
kan återinföra browserlagrade tokens och ska därför inte användas obemärkt som
säkerhetsmässigt likvärdig återgång.

## Verifiering

- `backend/mvnw -f backend/api/pom.xml verify`: verklig lokal PostgreSQL,
  migreringsuppgraderingar, kryptering, cookieflaggor, CSRF, kontospärr,
  refresh/konkurrens, expiry, logout och provider-challenge-kontrakt.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` och
  `npm run frontend:build`: frontend och gemensamma komponenter.
- `node scripts/migration/browser-frontend-mock.mjs` mot lokal Vite-preview:
  kontrollerade Auth/API-svar och riktig browser-WebAuthn med virtuell credential,
  login utan omladdning, HttpOnly-cookie, lagringsrensning, UI, responsivitet och
  publikt komponentgalleri. Använd vid behov `FORENA_BROWSER_EXECUTABLE`.
- Med Vite-preview igång kan
  `FORENA_LOCAL_BROWSER_TEST=true backend/mvnw -f backend/api/pom.xml test`
  köra browser → riktig Kotlin → riktig PostgreSQL genom en lokal transportbrygga
  som bevarar HTTPS-origin och Secure-cookie. Auth-leverantören är kontrollerad
  i testfixturen; detta är inte ett Vercel- eller Supabase-driftprov.
- `python3 backend/api/scripts/browser-flow.py --browser-frontend`: opt-in mot
  isolerade Supabase-projektet, med separata testcredentials och verklig JDBC.
  Detta är separat från mockprovet. Passkey mot driftsatt Auth/RP-konfiguration
  och Vercels cookie-/proxybeteende måste verifieras i målmiljön; lokala prov
  bevisar inte dessa externa inställningar.
