# Förena

Förena är en öppen, AI-native plattform för föreningslivet. Målet är att samla
föreningens administration, kommunikation och vardagsarbete utan att ersätta
människorna som fattar besluten.

Projektet är i en tidig utvecklingsfas. Den första vertikala delen demonstrerar
flödet förening → lag → aktivitet → kallelse → svar.

## Kom igång

Förutsättningar:

- Node.js 22 eller senare
- Docker Desktop, Rancher Desktop, Podman eller annan Docker-kompatibel runtime

```bash
npm install
npm run db:start
cp .env.example .env.local
npm run dev
```

Öppna <http://localhost:3000>.

`npm run db:start` skriver ut URL och lokala API-nycklar. Kopiera den lokala
`Publishable key` (eller `anon key` i äldre CLI-utskrifter) till
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` i `.env.local`. Supabase Studio finns
normalt på <http://localhost:54323> och den lokala mejltestservern på
<http://localhost:54324>.

### Pushnotiser

Skapa ett VAPID-nyckelpar, till exempel med `npx web-push generate-vapid-keys`.
Lägg den publika nyckeln i `NEXT_PUBLIC_VAPID_PUBLIC_KEY` i webbappen. Workern
behöver samma nyckel som `VAPID_PUBLIC_KEY`, den privata nyckeln som
`VAPID_PRIVATE_KEY` och en kontaktadress som `VAPID_SUBJECT`. Lokalt kan
worker-värdena läggas i `supabase/functions/.env`; i produktion sätts de som
Supabase Edge Function-secrets. Den privata nyckeln får aldrig ha prefixet
`NEXT_PUBLIC_`.

Efter inloggning finns **Notiser → Aktivera pushnotiser** i sidhuvudet. Web Push
kräver HTTPS, men webbläsare tillåter även `localhost` för lokal utveckling.

Återskapa databasen och läs in `supabase/seed.sql` igen med:

```bash
npm run db:reset
```

Den lokala Supabase-stacken körs i containrar men hanteras av Supabase CLI;
projektet behöver därför ingen egen `docker-compose.yml`.

### Lokala testkonton

Efter `npm run db:reset` kan den seedade Ursvik-föreningen öppnas med:

- Lagledare: `ledare@forena.test` / `Forena-test-2026!`
- Målsman för Elsa: `malsman@forena.test` / `Forena-test-2026!`

Kontona är endast avsedda för lokal utveckling och får inte skapas i produktion.

## Kommandon

```bash
npm run dev       # lokal utvecklingsserver
npm run build     # produktionsbygge
npm run lint      # statisk kodkontroll
npm test          # domäntester
npm run typecheck # TypeScript utan emit
npm run db:start  # starta lokal Postgres, Auth, Storage och Studio
npm run db:stop   # stoppa den lokala Supabase-stacken
npm run db:status # visa lokala URL:er och nycklar
npm run db:reset  # kör om migrationer och seeddata
npm run db:types  # generera TypeScript-typer från lokalt schema
```

## Databas

Databasschemat versionshanteras i `supabase/migrations`. Den första migrationen
skapar föreningar, lag, personer, vårdnadshavare, medlemskap, aktiviteter,
kallelser, push-prenumerationer, notifieringsutkö och revisionslogg.

Row Level Security är aktiverat för samtliga tabeller. Läsning och skrivning
avgränsas till användarens föreningar och roll. Seedfilen innehåller en fristående
demoförening och används tills registreringsflödet kopplas till gränssnittet.

## Driftsättning

Pull requests verifieras av GitHub Actions genom att databasen byggs från
migrationerna, databastyper kan genereras och appens tester, typkontroll, lint
och produktionsbygge körs.

När en ändring landar på `main` bygger GitHub först ett produktionsartefakt. Om
bygget och kontrollerna lyckas körs nya migrationer mot Supabase och därefter
publiceras samma artefakt till Vercel. Vercels automatiska Git-deploy är avstängd
i `vercel.json` för att databasmigreringen alltid ska ske före publiceringen.

Lägg följande secrets i GitHub-miljön `production`:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Vercel-projektet ska dessutom ha `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` och `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
konfigurerade för Production. `RESEND_FROM_EMAIL` ska vara en avsändare på en
domän som verifierats i Resend. Applikationen använder requestens origin för
länkar i e-post och använder Vercels
`VERCEL_PROJECT_PRODUCTION_URL` som reserv. Sätt `SITE_URL` till den canonical
produktionsadressen om projektet har flera domäner eller Vercel-alias; denna
override används då för samtliga användarlänkar. Endast publika nycklar får
exponeras i webbläsaren; lägg aldrig in en secret-, service-role- eller privat
VAPID-nyckel som `NEXT_PUBLIC_*`.

### AI Gateway

Lagöversiktens första AI-funktion använder Vercel AI Gateway via Vercels OIDC,
så någon providerspecifik API-nyckel ska inte läggas i applikationen. Aktivera
AI Gateway för Vercel-projektet. I produktion sköter Vercel OIDC-token
automatiskt. För lokal utveckling hämtas en kortlivad token med:

```bash
vercel link
vercel env pull .env.local
```

Kör kommandot igen när den lokala token har gått ut. `AI_FEED_MODEL` kan användas
för att byta Gateway-modell och `AI_ENABLED=false` stänger av modellanropen utan
att ta bort den deterministiska reservprioriteringen. Tokenmängd och svarstid
sparas i `ai_generation_runs`; promptar lagras inte. Ett validerat och
personuppgiftsminimerat resultat mellanlagras i fem minuter per lag när de
underliggande signalerna är oförändrade.

## Principer

- Föreningens data är strukturerad; AI producerar validerade kommandon.
- Behörighet kontrolleras i applikationslagret, aldrig enbart i gränssnittet.
- Känsliga eller breda åtgärder kräver förhandsgranskning och godkännande.
- Viktiga förändringar ska kunna revisionsloggas.
- Plattformen byggs multi-tenant från början.

Se [docs/architecture.md](docs/architecture.md) för den första arkitekturen och
[docs/roadmap.md](docs/roadmap.md) för föreslagen ordning framåt.


## Licens

GNU Affero General Public License v3.0. Se [LICENSE](LICENSE).
