# Ren målmiljö och Auth-livscykel

Status 2026-10-19: bootstrap verifierad i `forena-kotlin`; verkligt Auth-prov
**godkänt, 18 kontroller** på källcommit `a72d5de`. ES256-signatur mot riktiga
JWKS, inloggning, refresh, lokal/global logout, spärr/återöppning och soft delete
är verifierade. Även hela Kotlin-/databasprovet `TargetAuthIT` samt separat
paketerad Liquibase och återkörning är nu **godkända** i Vercel Sandbox,
på källcommit `8cdc088`. Detta fortsätter M02/M03, inte godkänd driftaktivering
eller hela M07.

## Godkänt målmiljöprov i Vercel Sandbox

Efter den blockerade preflighten nedan kördes hela provet 2026-10-19
kl. 13:13 svensk tid på `feat/target-api-verification`, från main `187bfd2`.
Källcommit `8cdc088` har samma API-/testkod som main. Inga kodändringar behövdes.
[TargetAuthIT-resultatet](evidence/target-auth-results.json) är separat från
Auth-only-resultatet. [Källhashar, migrationshistorik och efterkontroller](evidence/target-api-verification.json)
knyter körningen till samtliga API-källor, låst verktygskedja och JAR-hash.

- En tillfällig Vercel Sandbox i `fra1`, projekt `forena-kotlin`, användes
  utan publika portar eller beständig snapshot. Miljön är **stoppad** efter
  hämtad evidens; API:t driftsattes inte och Next.js kopplades inte om.
  Arbetsbranchen lades även till i båda befintliga `deploymentEnabled`-
  undantagen så kommande pushar inte startar vanliga Vercel-previewbyggen.
- De sex konfigurerade variablerna hade nu readiness `ready` och den ordinarie
  körmiljöns nätpolicy var `enforced`. Dess publika TCP-begränsning kvarstod;
  Sandboxens egen internetåtkomst löste transporten. Credentials överfördes
  krypterat till en tillfällig nyckel i Sandboxen, utan klartextvärden i loggar
  eller kommandoradsargument. Inga credentials sparades i evidensen.
- JAR byggdes med checksummeverifierad Oracle JDK `26.0.2.1+1-7` och Maven
  `3.9.11`. Supabases CA från `backend/certs/supabase-ca.crt` användes med
  `sslmode=verify-full`. Separat Java-handshake verifierade betrodd CA,
  hostname och TLS 1.3. Båda rollernas verkliga JDBC-inloggning fungerade.
- Paketerad `FORENA_MIGRATE=true java -jar backend/target/forena-api.jar`
  kördes som ägarrollen, utan HTTP-server och utan Auth-adminnyckel i
  releaseprocessen. Första körningen: **5 nya, 0 tidigare, totalt 5 steg**.
  Andra körningen: **0 nya, 5 tidigare, totalt 5 steg**. Hela historikposterna,
  inklusive checksummor och exekveringstider, var identiska efter återkörning.
- Hela `TargetAuthIT` kördes med kommandot längre ned: **1 test, 0 fel,
  0 överhoppade**. Riktig lösenordsinloggning, asymmetrisk signatur/JWKS,
  familjeavgränsning, accepterat svar och refresh fungerade. Annan familj fick
  404 vid läsning och 403 vid skrivning. Tidigare JWT gav 401 vid både läsning
  och skrivning efter lokal/global logout, spärr och soft delete. Annan session
  överlevde lokal logout; ny inloggning och återöppning fungerade.
- Nekade skrivningar lämnade historiken på exakt den enda godkända svarsposten.
  Testets `finally` städade fixturer och Auth-konton. JDBC och oberoende
  administrativ SQL bekräftade **noll syntetiska Auth-konton och noll rader i
  samtliga tio verksamhetstabeller** efteråt. Liquibase-historiken har fem steg.
  Roller är fortsatt LOGIN utan överprivilegier; runtime saknar ägarmedlemskap,
  schema-CREATE och läsrätt till `auth.users`/`auth.sessions`. Klientroller
  saknar schema-USAGE. Säkerhetsrådgivaren gav inga anmärkningar.

En extra HTTP-kontroll av Data API gav **503/PGRST002**, schema-cachefel.
Det är ett separat, ofullständigt exponeringsprov; det räknas inte som
bekräftad PGRST106-avvisning. Data API-konfigurationen ändrades inte och SQL
bekräftar fortsatt nekade klientgrants. Bootstrap kördes inte igen och gamla
Förena-projektet ändrades inte.

Browser-PKCE, passkeys, magic-link/mejlleverans, OAuth/MCP, full signalworker
och driftsatt Vercel-runtime är fortsatt **ej verifierade**. Målmiljöprovet
bevisar API-/databasflödet i denna körning, inte dessa återstående grindar.

## Historisk API-preflight efter mergad PR #113

På `feat/target-api-verification`, från `main` på `187bfd2`, kontrollerades
miljön 2026-10-19 kl. 12:54 svensk tid. Imagen innehöll först en äldre
`work`-checkout; rätt källrevision hämtades före bygget.
[Preflight-evidens](evidence/target-api-preflight.json) skiljer observerad
konfiguration från verifierad databasautentisering och genomfört målmiljöprov.

- Alla sex `FORENA_TEST_*`-variabler för Auth/JDBC/roller är satta i processen.
  Miljötjänstens readiness för variabler och nätpolicy är dock fortfarande
  `unknown`; satta variabler bevisar inte giltiga lösenord.
- JDBC-värdet har avsedd poolerhost, port 5432 och databas `postgres`, utan
  credentials i URL:en, men saknar `sslmode`. Lägg till `sslmode=verify-full`
  och verifierad `sslrootcert` för körningen; sänk aldrig TLS-kontrollen.
  Rollnamnen matchar de avsedda namnen med projektsuffix.
- SQL bekräftar LOGIN på båda rollerna. Ägarrollen hade oväntat `BYPASSRLS`
  och `CREATEDB`; dessa återkallades med
  `ALTER ROLE forena_api_owner NOBYPASSRLS NOCREATEDB`. Efterkontrollen
  bekräftar att båda rollerna saknar superuser/BYPASSRLS/CREATEDB/CREATEROLE,
  runtime saknar ägarmedlemskap och klientroller saknar schemaåtkomst.
  Inga nya roller skapades och bootstrap kördes inte igen.
- Schemaägaren är `forena_api_owner`. Schemat har fortsatt noll tabeller;
  noll syntetiska `forena-auth-*`-konton finns kvar. Denna preflight skapade
  inga Auth-konton eller verksamhetsfixturer.
- Paketerad JAR byggdes med Oracle JDK `26.0.2.1+1-7` från det låsta,
  checksummeverifierade installationsscriptet och Maven `3.9.11`.
  Testkällor kompilerades; tester var **överhoppade** med `-DskipTests package`.
  Explicit Maven-proxy användes i en lokal `settings.xml`; miljöns CA lades
  i en lokal JDK-truststore. TLS-verifiering behölls. Filerna ligger under
  `work/target-api-verification/` och är inte versionshanterade.

Blockeraren är transporten: `/etc/codex/network-policy.json` har tomma
`tcp_network_access.domains` och `ip_ranges`, samt `vpn_configured: false`.
Anslutning till angiven TCP-proxy `proxy:8088` gav `connection refused`.
HTTP-tillåtelse för poolerhosten ger inte PostgreSQL-åtkomst. Den lästa
runtime-anvisningen beskriver TCP CONNECT endast för privata adresser via VPN;
en domängrant ensam löser därför inte den publika Supabase-poolerns åtkomst.
En körmiljö med stödd publik PostgreSQL-åtkomst, eller en godkänd privat
anslutningsväg till samma databas, krävs innan fortsättning.

Vid denna preflight var JDBC-lösenord, databasens CA/hostname-handshake,
separat paketerad Liquibase, oförändrad femstegshistorik vid återkörning och hela
`TargetAuthIT` **ej verifierade/ej körda**. Då fanns inget godkänt `target-auth-results.json`.
Auth-only-resultatet nedan kvarstår separat. Ingen Next.js-omkoppling,
Data API-exponering eller molndeploy gjordes. Äldre miljöobservationer nedan
beskriver läget före denna preflight.

## Historiskt Auth-only-prov från PR #113

På branch `feat/target-auth-lifecycle` kördes Auth-provet 2026-10-19
12:06 svensk tid. Den tidigare adminnyckelblockeringen är löst i körmiljön;
adminanropen fungerade utan att credentialvärden loggades.
[Resultat och slutkontroll](evidence/target-auth-provider-results.json)
är knutna till källcommit och scriptets SHA-256.
Det [tidigare blockerade försöket](evidence/target-auth-attempt.json) behålls
som historiskt underlag.

- Signatur/issuer/audience/claims och lösenordsinloggning/refresh godkändes.
- Lokal logout nekade både ursprunglig och uppdaterad JWT via `/user`
  med 403 `session_not_found`; refresh nekades med 400. Annan session fungerade.
- Global logout nekade båda sessionernas JWT och refresh. Ny inloggning fungerade.
- Spärr gav 403 `user_banned` och nekad refresh; efter återöppning fungerade ny inloggning.
- Soft delete nekade JWT med 403 `session_not_found` och refresh med 400.
  Avslutande hard delete följd av 404 bekräftade städning. Inga mejl skickades.

Oberoende SQL-läsning efter Auth-only-provet bekräftade noll syntetiska Auth-provkonton och
noll tabeller i `forena`. Båda rollerna var då NOLOGIN utan
superuser/BYPASSRLS/CREATEDB/CREATEROLE. Runtime saknar ägarmedlemskap och
klientroller saknar schemaåtkomst. Bootstrap har inte körts igen.
JDBC-URL och båda rollernas credentials saknades; exekverarens nätpolicy hade inga
TCP-grants. Fullt `TargetAuthIT` krävde då credential-/nätkonfiguration
och separat Liquibase-release; detta är nu utfört i Sandbox enligt ovan.
Auth-only-provet bevisar `/user`-beteendet vid denna
körning, inte Kotlin-API:ts familjeavgränsning eller nekade databasändringar.

Det separata [Auth-provet utan databas](../../backend/scripts/target-auth-probe.py)
kördes med Python 3; det kan upprepas med Python 3 och `cryptography` tillgängligt:

```sh
FORENA_TEST_TARGET_REF=ckzrtxqjskosqzoitymc python3 backend/scripts/target-auth-probe.py
```

Det använder bara testprojektets Auth-API och nya syntetiska konton utan utskick.
Det verifierar JWT-signaturen mot riktiga JWKS samt issuer/audience/claims,
refresh, tidigare JWT och refresh efter lokal/global logout, annan kvarvarande
session, ny inloggning, spärr/återöppning och soft delete. En hard delete och
efterföljande 404 bekräftar städning. Publishable key i adminvariabeln nekas
före nätanrop; okända opaka nätsecret-placeholders lämnas åt miljöns proxy.
API-nycklar skickas i `apikey`, bearer-header används endast för användar-JWT.
Redirect följs inte och TLS-verifiering behålls.

Resultatet skrivs till `backend/target/target-auth-provider-results.json`
först efter avslutade prov och bekräftad städning. Filen har scope
`auth-provider-only`; den kan aldrig ersätta resultatet från `TargetAuthIT`.
Utebliven fil eller `passed: false` är inte ett godkänt prov. Inte heller
ett godkänt Auth-prov bevisar familjeåtkomst eller nekade databasändringar.

## Avsedd miljö och ursprungligen utförd bootstrap

- Projekt: `forena-kotlin`, `ckzrtxqjskosqzoitymc`, eu-central-1.
- Privat nytt schema `forena`, ägare `forena_api_owner`.
- Vid bootstrap var ägare och `forena_api_runtime` separata **NOLOGIN**-roller,
  utan superuser, BYPASSRLS, CREATEDB eller CREATEROLE, utan satta lösenord.
  Aktuell LOGIN-status beskrivs i API-preflight ovan.
- Runtime är inte medlem i ägarrollen. `anon`, `authenticated` och `service_role`
  saknar schemaåtkomst. Supabases säkerhetsrådgivare gav inga anmärkningar.
- Schemat var tomt vid bootstrap. Det är nu Liquibase-migrerat enligt ovan;
  inga syntetiska verksamhetsrader eller Auth-provkonton finns kvar.
  Teknikprovets scheman finns kvar separat. Gamla Förena-projektet ändras inte.

[Bootstrap](../../backend/scripts/bootstrap.sql) kördes genom Supabases
administrativa bootstrap-migration `forena_api_bootstrap`. Den äger bara
roller/schema, inga verksamhetstabeller. Liquibase äger verksamhetsobjekt och
sin egen historik. Begränsad CREATEROLE kräver tillfällig SET-rätt för
schemaägartilldelningen; scriptet stänger därefter av SET/INHERIT igen.
Runtime får aldrig sådant medlemskap. Verifierad observation och källhashar
finns i [readiness-underlaget](evidence/target-auth-readiness.json).

## Aktuell sessionskontroll

API:t verifierar JWT lokalt med oförändrade krav på signatur, issuer, audience,
kanal och claims. Lokal konto-/sessionsspärr kontrolleras som tidigare.
`SupabaseSessionService` anropar därefter samma issuers `GET /user` med aktuell
verifierad bearer-token och projektets **publishable key**. Leverantörssvaret
måste avse samma konto och en icke-anonym användare. Metadata ger inga rättigheter.

Varje verksamhetsläsning kontrollerar aktuell Auth-status. Skrivningar gör det
före verksamhetsåtkomst och efter aktivitetens/kallelsens radlås. Ett avslut som
blivit synligt under låsväntan kan därmed stoppa den väntande skrivningen.
Det finns ingen gemensam transaktion med Auth: revokering efter sista kontrollen
kan inte återkalla ett redan pågående eller committat kommando.

Kända 401/403-koder för ogiltig token, saknad session/användare, spärr och utgången
session ger lokal 401. Tekniska fel, felaktig konfiguration, 429, 5xx, redirect,
felaktig JSON och timeout ger generiskt 503 med `Cache-Control: no-store`.
Ingen retry, positiv sessionscache eller fallback används. Anslutnings- och
lästimeout är två sekunder vardera, ingen totaldeadline. Redirect följs inte.

Bearer-tokenen finns bara i anropets aktör, utan genererad `toString`, och sparas
inte i historik. Runtime behöver varken Auth-adminnyckel, service-role,
Auth-tabellgrants, databasfunktioner eller ändrad Auth-RLS. Leverantörens
timebox/inaktivitets-/single-session-inställningar antas inte verkställas
proaktivt av `/user`; de behöver verifieras separat tillsammans med refresh.

Nuvarande offentliga Auth-källa laddar konto och `session_id` för `/user` och
nekar saknade sessioner/spärrade konton. **Det bevisar inte vilken revision det
driftade projektet kör.** Auth-provet ovan verifierar nu detta beteende i målprojektet.
`TargetAuthIT` är nu godkänt; övriga pilotgrindar ovan återstår:

- [Auth-kontroll](https://github.com/supabase/auth/blob/master/internal/api/auth.go)
- [UserGet](https://github.com/supabase/auth/blob/master/internal/api/user.go)
- [Felkontrakt](https://github.com/supabase/auth/blob/master/internal/api/apierrors/apierrors.go)
- [Supabases sessionsdokumentation](https://supabase.com/docs/guides/auth/sessions)

Vid fortsättningen gav Markdown-indexet HTTP 403 från körmiljön; aktuell
sessionsdokumentation lästes genom Supabases dokumentationsverktyg. Tidigare:
changelog-indexet kunde inte läsas som Markdown av webbverktyget;
[HTML-indexet](https://supabase.com/changelog) kontrollerades i stället. Dess
aviserade HTTP/TLS-ändring kräver moderna TLS-klienter; TLS-verifiering behålls.

## Färdigställ credentials och migrering

Publika issuer/JWKS/key-värden finns i
[exempelkonfigurationen](../../backend/.env.target.example).
Det nya obligatoriska runtime-värdet är `FORENA_AUTH_PUBLISHABLE_KEY`.

1. Sätt separata starka rollösenord genom administrativ credentialhantering.
   En administrativ `psql`-session kan använda `\password forena_api_owner`
   respektive `\password forena_api_runtime` utan klartextlösenord i shellargument.
   Aktivera därefter LOGIN för respektive roll. Ägarkontot används endast för
   release/migrering och testfixturering.
2. Hämta den faktiska JDBC-kompatibla session-pooler-adressen från projektets
   Connect-panel. Verifiera `sslmode=verify-full`, betrodd CA och poolerns
   rollnamn med projektsuffix. Hostnamn/credentials gissas inte från regionen.
   Körmiljön behöver godkänd TCP-åtkomst till adressen; Auth-HTTPS ger inte JDBC-åtkomst.
3. Kör paketerad migrering enligt [API-README](../../backend/README.md).
   Kör igen och kontrollera att fem Liquibase-steg är oförändrade. Ingen
   Supabase-migration ska skapa/modifiera verksamhetstabellerna.
4. Kör Auth-/API-provet nedan. Ingen import av gamla testdata behövs. Provet
   städar sina fixturer; det lämnar inte en permanent demo-inloggning.
   Beständiga frontend-testdata behöver en dokumenterad seed när ID-läsningen kopplas in.

## Verkligt Auth-/API-prov

`TargetAuthIT` är opt-in och körs inte av ordinarie Maven `verify` eller CI med
admincredentials. Det kompileras med vanliga testkällor. Provet låser projektref
och ägar-/runtimerollnamn, kräver TLS-hostname-verifiering och skapar nya slumpade
syntetiska UUID:n/adresser under `example.invalid`. Auth-admin create/ban/delete
används bara av provprocessen. Inga mejl skickas.

Konfigurera följande i testkörmiljön; lägg inte credentials i chatten, Git eller
kommandoradsargument:

| Namn | Värde/ändamål |
| --- | --- |
| `FORENA_TEST_TARGET_REF` | `ckzrtxqjskosqzoitymc` |
| `FORENA_TEST_AUTH_SECRET_KEY` | Testprojektets `sb_secret_…`, network secret för `ckzrtxqjskosqzoitymc.supabase.co` |
| `FORENA_TEST_PUBLISHABLE_KEY` | Publishable key från exempelkonfigurationen |
| `FORENA_TEST_JDBC_URL` | Verifierad JDBC-URL med TLS/CA, utan lösenord |
| `FORENA_TEST_OWNER_USERNAME` | `forena_api_owner.<projektref>` för session-pooler |
| `FORENA_TEST_OWNER_PASSWORD` | Ägarrollens lösenord som skyddad direkt variabel |
| `FORENA_TEST_RUNTIME_USERNAME` | `forena_api_runtime.<projektref>` för session-pooler |
| `FORENA_TEST_RUNTIME_PASSWORD` | Runtimerollens lösenord som skyddad direkt variabel |

Med låst JDK och Maven Wrapper:

```sh
backend/mvnw -f backend/pom.xml --batch-mode --no-transfer-progress -Dtest=TargetAuthIT test
```

En miljö med HTTP-proxy behöver normal Java-proxy-/CA-konfiguration också för
Spring/Nimbus. Behåll miljöns proxy och certifikatverifiering. Network secrets
är placeholders som proxyn byter mot credential för rätt HTTPS-destination;
databaslösenord behöver däremot vara direkt läsbara av JDBC.

Provet omfattar riktig lösenordsinloggning/signatur, familjeavgränsning, refresh,
lokal utloggning (annan session kvar), global utloggning, ny inloggning, spärr och
soft delete. Tidigare JWT provas mot läsning och skrivning. Nekade kommandon får
inte skapa historik. Fixturer och Auth-konton städas i `finally`; endast efter
godkänd kontroll **och** städning skrivs
`backend/target/target-auth-results.json`, utan tokens/lösenord.
Vid avbruten process kan fixturer kräva avgränsad städning, aldrig generell DELETE.

Mejlleverans/magic-link, browser-PKCE, passkeys, OAuth/MCP, full signalworker och
Vercel-runtime är separata, ej verifierade grindar. Avsaknad av resultatfil eller
enbart gröna lokala tester räknas inte som godkänt målmiljöprov.
