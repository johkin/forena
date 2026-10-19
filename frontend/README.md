# Separat browser-frontend

React/TypeScript och Vite, parallellt med den befintliga Next-appen. Första
flödet är lösenordsinloggning samt att läsa, svara, ändra kommentar och återställa
familjens kallelser. Backend äger fortfarande alla behörigheter och skrivningar.

```text
Browser ── HTTPS ── Vercel ── /api/* ── Kotlin
                         └─ övrigt ── statiska frontendfiler
Browser ── HTTPS ── Supabase Auth
```

Det finns ingen Node-/Next-process mellan browsern och Kotlin. Sidskal,
header, meny, sidfot, design-token och kallelsesvar återanvänds från `src/`.
`/components` visar samma produktionskomponenter med lokala exempeldata.

## Lokalt

Kör `npm ci` från reporoten. Ange `NEXT_PUBLIC_SUPABASE_URL` och
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` för det nya isolerade projektet; bara
publishable key får användas. Valfritt `FORENA_KOTLIN_TEST_ACTIVITY_ID` ger en
startaktivitet. Utan den öppnas aktiviteter genom `/activities/<uuid>`.

```sh
npm run frontend:build
npm run frontend:dev
```

Vite kör på `127.0.0.1:3000` och routar `/api/*` till Kotlin på
`127.0.0.1:8080`. Servera `frontend/dist` statiskt i produktion. Den publika
`config.json` genereras separat med en uttrycklig tillåtelselista och har
`no-store`; nycklar för admin, databas eller migreringar får aldrig finnas där.

Auth använder en separat localStorage-nyckel och inga gamla Next-cookies.
JWT skickas i Authorization-headern endast till de två stödda API-rutterna på
samma origin. Cookies, externa URL:er och redirects tillåts inte i API-klienten.
Utloggning och nekad session avmonterar familjens privata data. Äldre service
workers/cachar från Next-piloten avregistreras på den nya sajtens origin.

## Verifiering

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build` och
`npm run frontend:build` körs från reporoten. Releasegrindarna finns under
`scripts/deploy`. Ett opt-in verkligt browser → Kotlin → Supabase-prov finns:

```sh
FORENA_TEST_TARGET_REF=ckzrtxqjskosqzoitymc \
  python3 backend/api/scripts/browser-flow.py --browser-frontend
```

Det kräver de sex isolerade testcredentials som den befintliga körningen
beskriver, Java 25, Chromium och nätåtkomst till den isolerade poolern. Vid annan
Maven-cache kan `FORENA_TEST_JDBC_JAR` välja den installerade JDBC-JAR:en;
`FORENA_BROWSER_EXECUTABLE` kan välja en installerad Chromium. Privata konton,
lösenord, tokens, traces och storage-state-filer får inte publiceras.

Ett browserprov med kontrollerade Auth/API-svar körs mot den statiska previewn
med `node scripts/migration/browser-frontend-mock.mjs`. Det verifierar frontend-
beteende och tokenhantering, inte Kotlin/Supabase. Bilder skrivs bara lokalt
till ignorerade `frontend/.evidence/`.

Fullt Supabase-browserprov är ännu inte verifierat för denna app: miljöns
TCP-policy stoppade den läsande anslutningskontrollen innan några konton eller
verksamhetsrader skapades. Separata browserprov med kontrollerade Auth/API-svar
och backendens lokala PostgreSQL-tester redovisas i migreringsstatus.

Ännu inte flyttat: ordinarie översikt/aktivitetslista, signup, återställning av
lösenord, passkeys, PWA/offline, administration, kanaler och assistent. Dessa
funktioner ligger kvar i den gamla appen och är inte dolda databasgenvägar i den
nya. Det här är en avgränsad pilot, inte full M18B-funktionsparitet.
