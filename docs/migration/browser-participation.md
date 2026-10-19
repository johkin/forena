# Första browserflödet genom Next och Kotlin

Avgränsat M07-steg efter PR #114, från main `548d627`. Sidan
`/migration/participation` återanvänder lösenordsinloggning, `AppShell`,
kontomeny, footer och `ActivityInvitationResponse`. En syntetisk målsman ser
två barns kallelser från det nya privata `forena`-schemat. Det är ingen
omkoppling av ordinarie översikt och ingen API-deploy.

## Serverstyrd adapter

De befintliga rutterna behåller URL, metod och payload:

- `GET /api/activities/{activityId}/my-invitations`
- `PUT /api/invitations/{invitationId}/respond`

`FORENA_PARTICIPATION_BACKEND` är serverkonfiguration. Utelämnat värde eller
`legacy` behåller befintligt beteende. `kotlin` väljer den nya adaptern;
andra explicita värden nekar med 503 och faller inte tillbaka. Klientens
query, cookies eller headers kan inte välja backend eller upstream-URL.
Denna leverans låser Kotlin-läget till testprojektets Auth-URL
`https://ckzrtxqjskosqzoitymc.supabase.co`.

`FORENA_KOTLIN_API_URL` är en origin utan sökväg, credentials, query eller
fragment: HTTPS, eller HTTP på loopback för avskilda testprocesser.
`SITE_URL` anger browserns kanoniska origin och används för Origin-kontroll
vid skrivning, även när Next konstruerar en annan intern request-URL.
`FORENA_KOTLIN_TEST_ACTIVITY_ID` kommer från testseeden och öppnar testsidan.
Sidan ger 404 när läget är avstängt eller dess API-/ID-konfiguration är ogiltig.

Adaptern skapar Supabase-klienten per request, verifierar aktuell användare
med `getUser()` och hämtar sedan samma användares bearer-token från SSR-
sessionen. Kotlin verifierar signatur/claims, aktuell Auth-session och
familjeåtkomst igen. Browserns eventuella Authorization-header används inte.
Varken cookies, adminnycklar eller databascredentials vidarebefordras.

Kotlin-kontraktets genererade TypeScript-typer används. Runtime-validering
skyddar mot felaktiga 200-svar. Kommentar utelämnad/null/string bevaras genom
adaptern; Kotlin äger normalisering, svarstid, revision, historik och
signalversion. Okända bodyfält och ogiltiga typer nekas.
Alla adaptersvar har `Cache-Control: no-store`. Kända 400/401/403/404/409/503
behålls med generiska feltexter. Timeout, redirect, nätfel, okänt felsvar eller
felaktigt kontrakt ger 503. Anropet görs en gång med tio sekunders deadline;
ingen retry eller legacy-fallback sker. En timeout bevisar inte att en redan
påbörjad skrivning saknar effekt; API:ts befintliga idempotensregler gäller.

Lösenordsinloggning i Kotlin-läge anropar inte gamla databasens
`claim_person_account`. Testsidan använder den centrala kontomenyns
`session`-variant utan profil-/admin-/notisanrop till gamla databasen.
Varianten finns med samma komponent på `/components`.

## Återkörbart browserprov och seed

Förutsättningar: målprojektets fem Liquibase-steg är redan installerade,
de sex `FORENA_TEST_*`-värdena finns i testmiljön och låst Oracle JDK
`26.0.2.1+1-7` används. Behåll miljöns proxy och CA-konfiguration där sådan
krävs. Kör i en miljö med faktisk TCP-åtkomst till poolern, exempelvis en
tillfällig Vercel Sandbox som i verifieringen.

```sh
npm ci
npx playwright install --with-deps chromium
FORENA_TEST_TARGET_REF=ckzrtxqjskosqzoitymc python3 backend/api/scripts/browser-flow.py
```

`browser-flow.py` bygger API-JAR med låst Maven Wrapper och Next-appen,
skapar fixturer, startar API på `127.0.0.1:8080` och Next på
`127.0.0.1:3000`, kör Chromium-provet och städar i `finally`.
`--skip-build` får bara användas med artefakter från exakt samma kod och
publika target-konfiguration. API-processen får enbart runtime-credential;
Next får inga DB-/Auth-admincredentials. Ägare och Auth-admin används av
testprocessens seed/snapshot/städning. Chromium-processen får inte testets
privilegierade `FORENA_*`-miljövariabler. Inga portar behöver exponeras publikt.

[Seeden](../../backend/api/scripts/browser-seed.py) använder Python stdlib och
[JDBC-fixturen](../../backend/api/scripts/BrowserSeed.java), inte Data API.
Den kontrollerar projektref, pooler, begränsad ägaridentitet, `verify-full`,
betrodd Supabase-CA och femstegshistorik innan Auth-konton skapas.
Den skapar bara nya slumpade ID:n: två Auth-konton under `example.invalid`,
en förening, ett lag, två aktiviteter, två barn i första familjen och ett barn
i andra familjen, med separata kallelser. Inga mejl eller import av gamla data.

Privat recovery-state i `backend/api/target/browser-seed.json` har filmode
0600 och innehåller den syntetiska inloggningens lösenord. Publicera aldrig
state, serverloggar, Playwright-traces eller cookie-filer. Testet skriver
inga traces eller sparad browser-storage. State uppdateras efter varje skapat
Auth-konto; städning använder enbart denna körnings exakta ID:n och verifierar
hard delete med efterföljande 404. Lösenordet tas bort ur state efter städning.

Vid avbruten process:

```sh
FORENA_TEST_TARGET_REF=ckzrtxqjskosqzoitymc python3 backend/api/scripts/browser-seed.py cleanup
```

`create`, `snapshot` och `cleanup` kan även köras separat för en medvetet
avgränsad manuell testkörning. `--state` måste ligga under ignorerad `work/`
eller `backend/api/target/`. Återanvänd inte ett oavslutat state för en ny seed.
Bootstrap, nya roller och generella DELETE-operationer ingår aldrig.

## Verifiering och återstående gränser

Browserprovet omfattar riktig lösenordsinloggning och SSR-cookies, de två
barnens läsning, ja/nej, kommentarändring, återställning och omläsning.
SQL-snapshots kontrollerar revision/historik, oförändrad svarstid och
signalversion vid kommentarändring, samt idempotent identisk upprepning.
Annan familj får 404 vid läsning och 403 vid skrivning utan databasändring.
Gamla cookies efter riktig lokal logout ger 401 för både läsning och skrivning.
Provet stänger därefter API-processen och verifierar 503 utan legacy-fallback
eller databasändring. Mobilbredder 320/390/768 och desktop 1440 kontrolleras
för horisontell overflow; meny/Escape och komponentsidans variant provas.

Endast efter godkänt prov och bekräftad städning skrivs
`backend/api/target/browser-flow/results.json`. Den versionshanterade evidensen
och aktuell CI redovisas i [status](status.md).

Vanliga översiktens aktivitets-/ID-läsning från nya databasen, full
signalberäkning/worker, browser-PKCE, passkeys, mejlleverans, OAuth/MCP och
driftsatt runtime ingår inte. En beständig signalversion är verifierad,
inte levererad notifiering. Hela M07 och driftaktivering är därför inte
accepterade. Återgång till `legacy` är en separat serverkonfiguration för ett
annat dataset, aldrig en automatisk skrivfallback eller kopiering av data.
