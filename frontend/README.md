# Separat browser-frontend

React/TypeScript och Vite, parallellt med den befintliga Next-appen. Första
flödet är lösenordsinloggning samt att läsa, svara, ändra kommentar och återställa
familjens kallelser. Backend äger fortfarande alla behörigheter och skrivningar.

```text
Browser ── HTTPS ── Vercel ── /api/* ── Kotlin
                         └─ övrigt ── statiska frontendfiler
Kotlin  ── HTTPS ── Supabase Auth
```

Det finns ingen Node-/Next-process mellan browsern och Kotlin. Sidskal,
header, meny, sidfot, design-token och kallelsesvar återanvänds från `src/`.
`/components` visar samma produktionskomponenter med lokala exempeldata.

## Lokalt

Kör `npm ci` från reporoten. Ange `NEXT_PUBLIC_SUPABASE_URL` och
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` för det nya isolerade projektet; bara
publishable key får användas. Startsidan visar Mina aktiviteter från Kotlin-API:t utan förvalt ID.
`FORENA_KOTLIN_TEST_ACTIVITY_ID` gäller endast den avskilda provsidan
`/migration/participation`. Djuplänkar använder `/activities/<uuid>`.

```sh
npm run frontend:build
npm run frontend:dev
```

Vite kör på `127.0.0.1:3000` och routar `/api/*` till Kotlin på
`127.0.0.1:8080`. Servera `frontend/dist` statiskt i produktion. Den publika
`config.json` genereras separat med en uttrycklig tillåtelselista och har
`no-store`; nycklar för admin, databas eller migreringar får aldrig finnas där.

## Intern navigering

React Router håller URL och aktuell vy synkroniserade utan att ladda om hela
HTML-dokumentet. Aktivitetslänkar, tillbaka-länkar, meny och logotyp använder
samma routeradapter; header, meny och sidfot behålls mellan privata vyer.
Bakåt/framåt och direkta djuplänkar stöds. Externa länkar och öppning i ny flik
behåller webbläsarens vanliga beteende. Vid vybyte flyttas fokus till innehållet
och sidan rullas till toppen.

Delade komponenter tar en valfri `linkComponent` och använder vanliga ankare
som standard, så samma komponenter fungerar i Next-appen. Vite använder
`AppLink`, även i galleriet. Sessionen hämtas vid start/fokus/kontoändring,
inte vid varje aktivitetshopp. `/components` är fortsatt publik och hämtar
sessionen först när man navigerar vidare till en privat vy.

Startsidan är **Min översikt** med Behöver svar, Agenda/Kalender, Kommande
aktiviteter samt Mina lag och föreningar. Den använder `GET /api/me/overview`
och delar `PersonalHome`, `PersonalOverview` och `TeamCalendar` med Next.
Personrader finns även utan kallelse. Bekräftade direktsvar synkroniseras mellan
sektionerna; skrivlås gäller samma kallelse i båda vyerna och snabbsvar bevarar
kommentar. Räknare och kalender använder hela snapshoten, även fler än 50
aktiviteter och starter mer än 90 dagar framåt. Ett överstort underlag ger ett
uttryckligt fel i stället för ofullständig översikt.

`/activities/:id` hämtar behöriga detaljer även utan kallelse. Förenings- och
laggenvägar öppnar `/organizations/:id` och `/teams/:id`, med personligt filtrerat
innehåll och verkliga roller. Det är läsvyer, inte migrerad administration.
`/notifications` visar aktuella kallelser som behöver svar. Extern pushleverans,
arbetspass och AI/MCP-anslutning är fortfarande separata migreringsområden;
AI-länken är fortsatt dold i Vite. Se [funktionsmatrisen](../docs/migration/feature-parity.md).

Översikten förnyas vid fokus, synlighet, relevant service-worker-signal och var
60:e sekund i synlig flik. En äldre läsning får inte skriva över ett senare
bekräftat svar. Ingen privat snapshot sparas i localStorage eller beständig cache.

Auth använder Kotlin-ägda serversessioner enligt
[ADR-018 och driftsinstruktionen](../docs/migration/web-sessions.md). Frontenden
har ingen Supabase Auth-klient och skickar inga Bearer-token. Bara ett
ogenomskinligt sessions-ID finns i en HttpOnly-cookie. `GET /api/auth/session`
ger verifierad användarinfo. Login, passkey och logout uppdaterar gränssnittet
utan full sidomladdning. Supabase måste ha passkey aktiverat med rätt RP-ID/origin;
registrering av nya passkeys ingår inte här.

Alla API-anrop använder `credentials: same-origin`, `no-store` och nekade
redirects. Skrivningar skickar `X-Forena-Request: 1`; browsern sätter Origin.
Verksamhetsanrop skickar också det aktuella konto-ID:t i `X-Forena-Account`, så
att en gammal flik inte råkar skriva under ett konto som loggats in i en annan
flik. Kotlin verifierar identitet och behörighet oberoende av dessa klientvärden.
`BroadcastChannel` signalerar kontoändringar utan privata payloads; vid fokus
hämtas aktuell session. Ett uttryckligt app-401 avmonterar privata data.
Plattformens 401 och tillfälliga verifieringsfel upphäver inte serversessionen.

Den gamla nyckeln `forena-kotlin-browser-auth` och dess hjälpfält rensas vid
start. Befintliga användare behöver logga in igen. Äldre service workers och
cachar från Next-piloten avregistreras på samma origin. `/components` är publik
och kräver inget sessionsanrop.

För lokal backend behövs migrering till och med 009 (aktivitetsöversikt; 008 införde Spring Session JDBC) samt `FORENA_WEB_SESSION_ENABLED=true`,
`FORENA_WEB_ORIGIN=http://localhost:3000`, `FORENA_WEB_SESSION_SECURE=false` och
en separat base64-kodad 32-bytesnyckel i `FORENA_WEB_SESSION_KEY`. Öppna då
`http://localhost:3000`; använd samma exakta origin i backend. Produktion kräver
HTTPS och Secure-cookie. Publika Auth-värden i config finns kvar för
byggkontraktet men används inte till Auth-anrop i browsern.

## Verifiering

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build` och
`npm run frontend:build` körs från reporoten. Releasegrindarna finns under
`scripts/deploy`. Ett opt-in verkligt browser → Kotlin → Supabase-prov finns:

```sh
FORENA_TEST_TARGET_REF=ckzrtxqjskosqzoitymc \
  python3 backend/scripts/browser-flow.py --browser-frontend
```

Det kräver de sex isolerade testcredentials som den befintliga körningen
beskriver, Java 25, Chromium och nätåtkomst till den isolerade poolern. Vid annan
Maven-cache kan `FORENA_TEST_JDBC_JAR` välja den installerade JDBC-JAR:en;
`FORENA_BROWSER_EXECUTABLE` kan välja en installerad Chromium. Privata konton,
lösenord, tokens, traces och storage-state-filer får inte publiceras.

CI:s application-jobb kör browserprovet efter Vite-bygget med Playwrights Chromium.
Lokalt körs samma browserprov med kontrollerade Auth/API-svar mot den statiska previewn
med `node scripts/migration/browser-frontend-mock.mjs` mot `http://localhost:3000`.
Det kör också WebAuthn med en virtuell discoverable credential utan omladdning.
Det verifierar frontendbeteende och tokenhantering, inte Kotlin/Supabase. Bilder skrivs bara lokalt
till ignorerade `frontend/.evidence/`.

Fullt Supabase-browserprov är ännu inte verifierat för denna app: miljöns
TCP-policy stoppade den läsande anslutningskontrollen innan några konton eller
verksamhetsrader skapades. Separata browserprov med kontrollerade Auth/API-svar
och backendens lokala PostgreSQL-tester redovisas i migreringsstatus.

Mina aktiviteter listar nu kallelsekopplade aktiviteter via personåtkomst,
50 per sida, inom 90 dagar. Lagmedlemskap utan kallelse, arbetspass och
föreningstidszon är ännu inte flyttade.

Ännu inte flyttat: signup, återställning av
lösenord, passkey-registrering/hantering, PWA/offline, administration, kanaler
och assistent. Dessa funktioner ligger kvar i den gamla appen och är inte dolda databasgenvägar i den
nya. Det här är en avgränsad pilot, inte full M18B-funktionsparitet.
