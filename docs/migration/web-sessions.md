# Webbsessioner i Kotlin (#135)

Den separata React/Vite-appen använder Spring Session JDBC i Kotlin enligt
ADR-018. Gamla Next-appen och dess Auth/MCP-flöden är separata. Det här ändrar
inte skydd eller publicering av hela sajten: statiska sidor är publika och
backend har uttryckliga regler för varje API-route.

## API och browser

| Route | Åtkomst och funktion |
| --- | --- |
| `GET /actuator/health` | Publik, inga detaljer; inkluderar Auth-nycklar och sessionslagringens schema |
| `POST /api/auth/login` | Publik med CSRF-skydd; email/password till Auth från Kotlin |
| `POST /api/auth/passkey/options` | Publik med CSRF-skydd; Auth-challenge lagras i serversessionen i högst fem minuter |
| `POST /api/auth/passkey/verify` | Publik med CSRF-skydd; kräver matchande challenge i serversessionen och giltig WebAuthn-assertion |
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

Login/passkey sätter `__Host-forena-session`: Spring Sessions slumpmässiga ID
skyddat med AES-GCM, HttpOnly, Secure,
SameSite=Lax, Path=/, utan Domain eller beständig cookie-expiry. Servern styr
giltigheten även om browsern återställer sina sessionscookies. Auth- och privata
svar har `Cache-Control: no-store`. Tokens finns aldrig i frontendens svar,
state, localStorage, sessionStorage, IndexedDB eller JavaScript-läsbara cookies.
Gamla pilotnyckeln och dess hjälpfält rensas vid start; användaren loggar in igen.

Login och logout uppdaterar React utan dokumentbyte. Passkey gör options →
`navigator.credentials.get()` → verify via samma origin. Supabase verifierar
signatur, challenge, RP-ID, origin och användarstatus. Kotlin binder challenge-ID
till serversessionen och dess expiry; Auth ansvarar för engångsanvändning.
Webbläsaren får aldrig leverantörens sessionssvar. Kontobyten signaleras mellan
flikar utan användardata; sessionen kontrolleras även när fliken får fokus.

## Serversession och livscykel

Spring Session JDBC 4.1 äger servletsessionen, persistens, sessions-ID,
HttpOnly-cookiens livscykel, inaktivitet och städning. Standardtabellerna
`forena.spring_session` och `forena.spring_session_attributes` skapas av
Liquibase, aldrig automatiskt av runtime. Säkerhetskontexten sparas inte i sessionen:
Spring Security fortsätter verifiera JWT för varje skyddat anrop.

Spring Sessions UUID lagras i den privata sessionstabellen. En liten
`CookieSerializer`-adapter skyddar ID:t med befintlig AES-256-GCM-kryptering
innan Spring skriver det i cookien. Ett läst databas-ID kan därför inte direkt
användas som browsercredential. Spring hanterar fortsatt cookieflaggor och
utgång. Leverantörens tokenpar och verifierade sessionsmetadata lagras som ett
AES-GCM-krypterat strängattribut med sessions-ID som authenticated additional
data. Nyckeln finns enbart i runtime-hemlighetshanteringen. Bara strängattribut
serialiseras som UTF-8; ingen Java-objektdeserialisering används.
Klientroller saknar grants och runtime får endast DML, inte schemaägarrätt.

Standard är åtta timmars maximal livstid och 30 minuters inaktivitet. Spring Session
sköter inaktivitetstid och `BrowserSessionService` kontrollerar den absoluta
maximitiden mot sessionens skapandetid vid varje autentiserat cookieanrop. Vid högst 60
sekunder kvar på access-token förnyas den på servern. `SELECT ... FOR UPDATE`
på Spring Sessions rad inom en JDBC-transaktion serialiserar tokenförnyelse
över alla instanser. Providerattributet läses om efter låset och uppdateras
genom repositoryt i samma transaktion. Servletens äldre kopia får bara spara
åtkomsttid; `SaveMode.ON_SET_ATTRIBUTE` förhindrar återställning av gamla tokens.
Förnyad JWT måste fortfarande ha samma konto och leverantörssession. Omstarter
behåller sessioner när databas, nyckel och konfiguration är desamma.

Ogiltig refresh och utgångna tidsgränser tar bort raden och ger 401. Tillfälliga
Auth-/JWKS-fel ger 503 och bevarar sessionen; ingen retry eller browser-fallback.
Lokal konto-/sessionsspärr och aktuell Auth-session kontrolleras som tidigare,
också vid verksamhetsskrivning efter radlås. Inga behörigheter kommer från
`user_metadata`. Utloggning tar bort raden innan Auth anropas med `scope=local`
och rensar cookien. Om Auth är nere avslutas appsessionen ändå; ingen garanti
ges då om omedelbar återkallning av en redan utfärdad leverantörs-JWT.

Spring Session städar inaktiva rader varje minut när applikationen kör.
Vid skalning till noll körs ingen städning förrän nästa instans startar, men
utgångna sessioner accepteras aldrig. Efter kontoradering nekas fortsatt åtkomst av kontokontrollen även om en
Spring Session-rad finns kvar tills den går ut och städas. Ingen atomär
transaktion finns med extern Auth: processkrasch
efter provider-refresh men före databascommit kan kräva ny inloggning efter
leverantörens refresh-reuse-fönster. In-flight-kommandon har samma gräns vid
revokering efter sista kontrollen som ADR-016 beskriver.

## Begränsning av publika Auth-anrop

Lösenordsinloggning och båda passkey-POST-rutterna har delade, kontinuerligt
påfyllda buckets i `forena.auth_rate_limit`. Kortlivade databastransaktioner
låser en gemensam rad över instanser, kontrollerar alla gränser och committar
ett tillstånd innan något Auth-anrop görs. Även misslyckade providerförsök
förbrukar tillstånd. Nekade försök returnerar 429 med `Retry-After` och
`no-store`; inga credentials skickas vidare. Logout och sessionens refresh
använder inte inloggningsbudgeten. Vid databasfel nekas nya försök med 503.

| Bucket | Kontinuerlig påfyllning | Tillåten omedelbar burst |
| --- | --- | --- |
| Klient-IP, gemensam för lösenord/passkey | 10 anrop / 5 minuter | 5 |
| Normaliserad e-postadress, endast lösenord | 5 anrop / 5 minuter | 3 |
| Gemensam publik Auth-budget | 20 anrop / 5 minuter | 10 |

Passkey är discoverable och har ingen e-postadress före verifieringen; dess
options/verify delar därför klient- och globalgränserna. IP/e-post lagras endast
som HMAC-SHA-256 med sessionsnyckeln och en separat kontext. Nya bucket-rader
skapas bara för godkända anrop, så nekad trafik med nya identifierare växer inte
tabellen. Helt återfyllda och inaktiva rader städas efter ytterligare tio minuter.

Som standard används anslutningens peer-IP. Godtyckliga `Forwarded`/
`X-Forwarded-For` från klienter är inte betrodda. Endast den Vercel-specifika
releasekonfigurationen sätter `FORENA_TRUST_VERCEL_PROXY=true`: där är
`X-Forwarded-For` en [header som Vercel skriver över](https://vercel.com/docs/headers/request-headers).
Den måste innehålla exakt ett IP-literal; listor, dubbletter och värdnamn ger
konservativ fallback till peer-IP. Flaggan får bara användas när all ingress
passerar Vercel, aldrig på en direkt exponerad server eller en annan proxy.

[Supabases Auth-dokumentation](https://supabase.com/docs/guides/auth/rate-limits)
bekräftar IP-baserade token buckets med burst 30 samt att `Sb-Forwarded-For`
kräver särskilt aktiverad forwarding och en secret API key. Runtime behåller
publishable key och inför inte denna privilegieutökning. Den dokumenterade
standardtakten för `/token` är 1 800 anrop/timme, alltså 150 per fem minuter.
Appens publika budget kan ta högst 10 av burstutrymmet och fylls på med 20 per
fem minuter. Det lämnar 20 burstplatser och 130 förnyelser per fem minuter vid
standardkvoten och utan annan trafik i samma leverantörsbucket.

Dimensioneringsantagandet för piloten är 100 aktiva sessioner. Målprojektets
access-tokenlivslängd uppmättes till 3 600 sekunder den 20 oktober 2026
([sanerat Auth-prov](evidence/web-auth-readiness.json)). Med förnyelse
60 sekunder före expiry blir medellasten
`100 × 300 / 3540 ≈ 8,5` refresh-anrop per fem minuter, under reservens 130.
Generellt är medellasten `N × 300 / (TTL − 60)`. Detta är ett konservativt
kapacitetsantagande, inte uppmätt produktionstrafik. Verifiera projektkvot,
samtidig trafik och att TTL fortfarande gäller före drift. Samtidiga förnyelser
som överskrider leverantörens återstående burst kan fortfarande ge 503; sessionen behålls.
En distribuerad attack kan fylla appens inloggningsbudget och fördröja nya
inloggningar, men når inte refresh-reserven genom dessa publika rutter.

## Konfiguration och releaseordning

1. Applicera Liquibase till och med `api-008-spring-session` med separat
   ägarkonto. Runtime får inga migreringscredentials. De nya privata sessionstabellerna
   ändrar inte affärstabellerna; befintliga Bearer-klienter fungerar fortsatt.
2. Skapa en base64-kodad nyckel från 32 kryptografiskt slumpade byte i godkänd
   hemlighetshantering. Sätt `FORENA_WEB_SESSION_KEY` endast för backendens runtime.
   Alla instanser behöver samma nyckel. Ingen automatisk nyckelgenerering vid
   start används. Nyckeln får aldrig hamna i byggargument, publika filer eller loggar.
   I Vercel ska den vara en Production Secret (tidigare Sensitive).
3. Sätt `FORENA_WEB_SESSION_ENABLED=true` och `FORENA_WEB_ORIGIN` till exakt
   sajt-origin utan avslutande slash. Produktion kräver HTTPS och Secure-cookie.
   Valfria `FORENA_WEB_SESSION_MAX_SECONDS`/`FORENA_WEB_SESSION_IDLE_SECONDS`
   styr tidsgränser (högst ett dygn). Behåll API:ts separata Auth-issuer/JWKS/key.
4. För passkey måste målprojektets experimentella passkey-stöd vara aktiverat
   och ha rätt RP-ID och tillåtna origins. Befintliga registrerade passkeys
   måste tillhöra detta RP-ID. Registrering/hantering av passkeys ingår inte.
   Se [Supabases aktuella passkey-kontrakt](https://supabase.com/docs/guides/auth/passkeys).
5. Publicera frontend och backend tillsammans. Releaseförberedelsen kräver att
   runtime-nyckeln finns, accepterar Vercels `[SENSITIVE]`-platshållare och
   kontrollerar formatet om värdet är läsbart. Nyckeln exporteras aldrig till
   bygget. Backend validerar den faktiska nyckeln vid runtime-start;
   runtime-descriptorn aktiverar sessioner
   med kanonisk Kotlin-site-origin. Health måste verifiera migration 008 och limiter-tabellen före
   promotion. Verifiera sedan faktisk login/cookie/API/logout på sajtens origin.
   Övergången kräver ny inloggning. Gamla `forena.browser_session` lämnas orörd
   för reversibel rollout och används inte av den nya koden; avveckling sker separat.

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

## Aktuellt målmiljöprov

Spring Session-migration 008 är applicerad i målprojektet. De nya tabellerna
ägs av migreringsrollen och runtime har DML; klientroller saknar åtkomst.
Gamla sessionstabellen är kvar och den befintliga publicerade versionens health
är UP. Detta är schemaverifiering inför kodpublicering, inte ett prov av den nya
appen i produktion. [Sanerat underlag](evidence/spring-session-schema.json).

Den 20 oktober 2026 skapades ett tillfälligt syntetiskt testkonto i det isolerade
målprojektet med uttryckligt godkännande. Lösenordsinloggning och tokenförnyelse
lyckades mot riktig Supabase Auth; refresh gav HTTP 200. Både JWT:s `exp − iat`
och Auth-svarets `expires_in` var 3 600 sekunder. Testkontot raderades efter
provet och Auth bekräftade raderingen. Inga lösenord, tokens eller kontouppgifter
sparades i underlaget. Detta verifierar leverantörens Auth-anrop och TTL;
det ersätter inte ett driftsatt browser–Kotlin–databas-prov.

Den 20 oktober 2026 anropades målprojektets riktiga
`POST /auth/v1/passkeys/authentication/options` med publishable key. Svaret var
HTTP 404 och `error_code=passkey_disabled`. [Sanerad observation](evidence/web-auth-readiness.json).
Inga projektinställningar ändrades. Ett fullständigt passkey-prov mot Auth/RP-ID
är därför fortfarande en öppen grind; ärende #135 ska inte stängas innan den
passerat. Virtuell WebAuthn med kontrollerad provider ersätter inte denna grind.
