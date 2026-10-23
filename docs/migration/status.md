# Migreringsstatus

## Spring-autentisering som enda lösning, 2026-10-23

Den nya React/Kotlin-appen använder enbart Spring-autentisering. Se
[auth-arkitektur och körguide](authentication.md). Ingen driftaktivering,
kontomigrering eller ändring av Liquibase-historiken ingår.
Tidigare prov nedan gäller sina angivna commits och verifierar inte den nya koden.
Lokalt verifierat inför denna PR:

- JVM/Java 25: Maven verify samt sista testkörningen, 72 tester godkända,
  inga fel eller överhoppade tester. Riktig browser/WebAuthn/OAuth ingår.
- AOT: genererad Spring-graf på JVM passerar paketerat startprov och samma
  riktiga browserflöde. Det är separat från native-kompilering.
- GraalVM 25.0.4: faktisk native-binär byggd och körd mot tillfällig PostgreSQL.
  Full registrering/verifiering/lösenord, virtuell WebAuthn-registrering och
  inloggning, magic link/reset, OAuth/PKCE/consent, refresh-rotation, MCP och
  revokering passerar. Även migration före HTTP, owner/runtime, grants,
  skyddad cookie, browserbindning, kontospärr, 429 och logout passerar.
- Local-profil: automatisk PostgreSQL-start från tom testvolym, Liquibase och
  loggsändare utan .env eller externa nycklar. Verklig localhost:3000 → Vite →
  Spring registrering, loggad verifieringslänk och lösenordslogin passerar;
  fel Origin avvisas.
- Npm: 1 143 tester, typecheck, lint, Next-bygge och Vite-bygge godkända.
  Kontrollerat browserprov för navigation/kontoisolering passerar också.
- Ett genererat OpenAPI/TS-kontrakt och deployverktygens 25 gränstester passerar.

Den första native-körningen hittade saknad reflektionsmetadata för WebAuthn
(inklusive millisekundformatet för timeout) och senare JDBC-grantens samlingstyp.
Det är korrigerat med avgränsad, reproducerbar metadata; inga verifierings- eller
Jackson-typgränser har stängts av. Det fullständiga native-browserprovet passerar
med korrigeringen.

CI ska dessutom bygga och prova den faktiska buildpack-/OCI-imagen för PR:ns
aktuella commit; aktuell körstatus och commit redovisas i PR:n. Lokal binär är
inte samma artefakt som CI-containern. Riktiga mejlutskick, fysisk passkey-hårdvara,
produktionsflöden och kontomigrering ingår inte. Historisk SQL/migrationskatalog
bevaras; aktiv kanaltransport och appinställningar för den pensionerade kanalen
är borttagna.


## Spring Securitys färdiga autentiseringsflöden, 2026-10-23

På `feature/native-auth` enligt ADR-025: Spring-komponenter och standardflöden
ska användas i första hand. Spring-flödets egna login-, logout-, magic-link- och
WebAuthn-ceremonier i controllers är ersatta med Springs filter och providers.
`PasskeyService` är borttagen. Spring sköter även credential-ägarkontroll
vid borttagning, sessionsbyte och webbens säkerhetsheaders.

React/Vite-klienten följer nu Springs formulär-/WebAuthn-format; ingen extra
JSON-översättare eller `challenge_id` används i Spring-flödet. MVC-controllers
behålls för kontolivscykel och läsning. Smala Spring repository-/tokenservice-
adaptrar behåller säker stränglagring, tokenversioner och webbläsarbindning.
Next-appen och äldre Supabase-flöden är inte ändrade. Backend och den nya
frontenden måste uppdateras tillsammans när auth-kontraktet ändras.

Godkänt: full Maven `verify`, 96 tester, noll fel och ett överhoppat äldre
browser-opt-in-prov; native-browserprovet kördes. Verklig Chromium → Spring →
PostgreSQL täcker lösenord, passkey-registrering/inloggning, magic link, reset,
OAuth/PKCE/consent, refresh-rotation, MCP och revokering. Ett separat API-prov
verifierar att Spring nekar borttagning av annans passkey och tillåter den egna.
Båda OpenAPI-exporterna är genererade från servern. 1 159 frontendtester,
typkontroll, lint samt Next- och native-Vite-bygge är godkända. Inga riktiga mejl,
kontoflyttar eller driftpubliceringar ingår.

[Granskning, genomförda byten och kvarvarande adaptrar](spring-security.md).

## Resend REST i Kotlin, 2026-10-23

Auth-mejl i `feature/native-auth` använder nu Resends REST-API i stället för SMTP.
All leverantörskod är samlad i `email.internal`, bakom `EmailSender` och typade
leveransresultat. Auth äger mallar och krypterad outbox. Samma idempotensnyckel
återanvänds vid återförsök; tillfälliga fel och numeriskt Retry-After hanteras i
kön, medan permanenta fel stoppar utskicket och raderar engångslänken.
`RESEND_API_KEY` och `RESEND_FROM_EMAIL` ersätter tidigare SMTP-/avsändarvariabler.
Next-appen och äldre Edge Functions är inte ändrade.

Godkänt: full Maven `verify`, 95 tester, noll fel och två överhoppade valbara
browserprov. Sex adapterprov täcker HTTP-kontrakt och felhantering; auth-proven
verifierar även beständiga återförsök och permanenta fel mot lokal PostgreSQL.
Modulith verifierar mejlmodulens gräns. Båda genererade API-kontrakten är
oförändrade och kontraktskontrollen är godkänd. Inga riktiga mejl eller någon
publicering ingår. Tidigare browserbevis nedan har inte körts om för detta
backendbyte; verklig leverans från verifierad avsändardomän återstår före drift.
Se [konfiguration och driftgränser](authentication.md).

## Egen kontohantering och Authorization Server i Spring, 2026-10-22

Lokalt JVM-försök enligt användarens instruktion och ADR-024, bakom
Spring-autentisering. Supabase-läget är kvar utan automatisk fallback.

- Lokala konton med BCrypt, browserbunden e-postverifiering och magic link,
  versionerade engångslänkar och lösenordsåterställning. Tidigare webb- och
  OAuth-åtkomst upphör vid lösenordsåterställning eller kontospärr.
- Passkeys registreras och verifieras med Spring Security/WebAuthn4J. Egna
  passkeys kan listas och tas bort. Webbens enda session är Spring Session JDBC;
  ingen Supabase-token eller tokenförnyelse finns i Spring-flödet.
- Spring Authorization Server i samma backend, beständig klient-/grant-/consent-
  lagring, PKCE, CSRF-skyddat samtycke, opaka resursbundna token, roterande refresh
  och revokering. MCP-piloten har `list_my_activities` med befintlig personåtkomst.
- Migration 012 inför privata auth-/frameworktabeller och krypterad mejl-outbox.
  Samma owner-/runtime-gräns gäller. Nya UUID:n ger inga verksamhetsrättigheter.
- Godkänt: `npm test` (1 158 tester), typkontroll, lint, Next- och native-konfigurerat
  Vite-bygge; full Maven `verify` på aktuell `main` (87 tester, noll fel, ett överhoppat äldre
  browser-opt-in-prov) med aktivt native-browserprov. Verklig Chromium → Spring →
  PostgreSQL verifierar signup, e-postverifiering, lösenord, WebAuthn-registrering
  och inloggning, magic link, reset, OAuth/PKCE/samtycke, refresh-rotation,
  MCP och revokering. Slutlig
  paketering och native OpenAPI-export är godkända. SMTP använder testtransport.
- Separata reproducerbara OpenAPI-/TypeScript-kontrakt finns för båda körlägena.
  Vite och Vercel-routingen känner igen OAuth-/metadata-endpoints.
- Ingen kontoflytt, driftaktivering eller produktionsmejl. Extern SMTP,
  worker vid skalning till noll, kontomigrering, bredare användaradministration
  och GraalVM/AOT behöver separata driftprov. Publiceringsverktyget blockerar
  Spring-flödet tills native-image-pipelinen är verifierad.

[Körguide, omfattning och återstående gränser](authentication.md).

## Passkey-registrering och magic link i React/Kotlin, 2026-10-22

Implementerat på `feature/native-auth`, inte driftsatt:

- Befintlig passkey-inloggning kompletteras med registrering på
  `/account/security`, via den gemensamma kontomenyn. Auth verifierar
  attestation; separat challenge binds till verifierat konto och Spring-session.
- Magic link begärs för befintliga konton med generiskt svar och delad
  inloggningsbudget. PKCE-verifieraren lagras krypterad på servern i tio minuter.
  `/auth/callback` rensar URL:en och kräver bekräftelse före POST-kodutbyte.
  Samma browserprofil krävs. Leverantörstokens lämnar aldrig servern.
- Anonyma sessionskontroller bevarar pågående PKCE-/WebAuthn-ceremonier.
  Komponentgalleriet visar formulär, callback, registrering, fel och lyckade resultat.
- Lokalt godkänt: `npm test` (1 157 tester), typkontroll, lint, Next-/Vite-byggen,
  browserprovet med virtuell WebAuthn-registrering och magic link-callback samt
  Maven `verify` (79 tester, noll fel, ett överhoppat opt-in-browserprov).
  Backendproven använder lokal PostgreSQL och kontrollerad Auth-provider.
  OpenAPI och TypeScript genereras från den riktiga springdoc-exporten.
- Återstår före drift: målprojektets passkey/RP-ID/origins, SMTP/mejlmall,
  exakt callback-allowlist och verkliga passkey-/mejlleveransprov. Inga
  projektinställningar, produktionskonton eller publicerade versioner ändrades.
  Se [flöden och konfiguration](web-sessions.md#magic-link-och-registrering-av-passkey).

## Min översikt med medlemskap, kalender och roller, 2026-10-22

Implementerat på `feat/personal-dashboard` från main `3e5ae96`:

- Migration 011 inför datumgiltigt lagmedlemskap, egen lagåtkomst och
  föreningsroller samt plats, beskrivning, samling, svarstid och föreningstidszon.
  Nya tabeller använder owner-rollens gemensamma runtime-default grants.
- `GET /api/me/overview` ger hela det behöriga pågående/kommande underlaget i en
  read-only repeatable-read-snapshot. Personrader finns även utan kallelse.
  Endast skickade kallelser lämnas ut. Lagläsning ger inte svarsrätt för andra;
  delegation ärver inte personens fristående lagåtkomst. Lokalt datum styr
  medlemskapets giltighet. Fler än 20 000 aktiviteter ger 503, inte delräknare.
- `GET /api/activities/{id}` ger behöriga detaljer även utan kallelse; okänd/
  främmande aktivitet ger 404. Det äldre list-API:t finns kvar för kompatibilitet.
- Next och Vite delar `PersonalHome`, `PersonalOverview`, `TeamCalendar` och
  svarskomponent/styling. Min översikt har Behöver svar, Agenda/Kalender,
  Kommande aktiviteter och rollgenvägar. Svar och räknare uppdateras i båda
  sektionerna från samma bekräftade tillstånd. En kallelse har gemensamt
  skrivlås även när den visas två gånger. Kommentar bevaras vid snabbsvar.
- Förenings-/laglänkar öppnar personligt filtrerade läsvyer, inte full migrerad
  administration. Klockan öppnar aktuella kallelser. Extern pushleverans,
  arbetspass och AI/MCP återstår; AI-länken är fortsatt dold i Vite.

Lokalt godkänt: 1 151 frontendtester, typkontroll, lint och Next-/Vite-byggen.
Maven verify med opt-in-browserprov körde 75 tester utan fel eller överhoppning,
inklusive tom installation och uppgradering från baslinjer 1–10, default grants,
nekad DDL/klientåtkomst, datum/tidszon, roller utan lagrelation, eget/delegerat
urval och främmande aktivitet. 25 Python-releasekontroller passerar. Kontraktet
är genererat från Spring och exporterat till TypeScript.

Riktig lokal GraalVM 25.0.4 `native:compile` passerar. Den nya native-binären
klarar både start/migrering av ett tomt PostgreSQL-schema och samma riktiga
browser → native Kotlin → PostgreSQL → browser-kedja. Det senare körde alla
50 ApiTest-fall utan fel/överhoppning, med provider-mock men verklig databas,
sessionscookie, läsning, skrivning, omläsning, CSRF-avvisning och logout.
Chromium-regressionen med kontrollerad Auth/API passerar samtidiga svarsvyer,
sista svaret, kommentarer, kalender, arbetsytor, kontobyte och mobil/desktop
på fem bredder utan horisontell scroll. Bilderna är granskade mot målbilden.

Next-bygget kräver fungerande underprocesser utanför sandboxen här. Inget lokalt
buildpack-/OCI-bygge kördes; CI behåller sitt obligatoriska native-image- och
startprov. Gamla Supabase-schemats reset/pgTAP är inte omkörda; det privata
Liquibase-schemat har verifierats med riktig lokal PostgreSQL. Ingen moln-
migration, dataimport eller deployment har körts. CI och målmiljöacceptans för
den publicerade ändringen redovisas separat.

## Fastställd målbild för startsidan, 2026-10-22

Användarens mobilbilder preciserar [Min översikt](personal-homepage-target.md):
Behöver svar med aktivitetsräknare, Agenda/Kalender, Kommande aktiviteter och
Mina lag och föreningar, med verkliga roller, notiser och gemensam sidfot.
Varje berörd person har en rad även utan kallelse. Samma aktivitet kan ligga i
båda aktivitetssektionerna; antal gäller aktiviteter och sparade svar ska
återspeglas i båda. M07B kräver därför deltagar-/personinformation även när
kallelsen saknas. Fullständigt urval och räknare över fler än 50 poster återstår.

PR #155 är mergad. Omkörningen av CI `39737680460` för `a590395` är grön,
inklusive native-image och startprovet. Den första körningen föll när Maven
Central inte kunde lämna ut `native-maven-plugin:1.1.1`; versionen kunde sedan
hämtas och en omkörning utan kodändring passerade. Detta CI-resultat verifierar
PR-koden, inte ett inloggat driftprov av hela startsidemålet.

Denna uppföljning ändrar enbart krav och dokumentation. Berörda länkar och diff
kontrolleras; apptester/byggen körs inte om för denna dokumentationsändring.

## Direkta kallelsesvar och full funktionsparitet, 2026-10-22

Leverans på `feat/activity-overview-invitations`, från main `06215d1`.
`GET /api/me/activities` innehåller nu skickade kallelser för behöriga personer
på varje aktivitetsrad. En extra, sidavgränsad repository-fråga hämtar dem i
batch; inga per-aktivitet-anrop och inga framtida kallelser lämnas ut. Samma
`OverviewInvitationResponse` som Next använder visar namn, svar och direkta
Kommer/Kan ej-knappar i listan. Vite använder sin konto-/CSRF-kontrollerade
request-adapter. Kommentar utelämnas vid snabbsvar och bevaras av svarstjänsten.
Fel/väntande gäller personens rad; aktivitetsrubriken öppnar kommentarvyn utan
full omladdning. Komponenter och styling delas med `/components` och Next.

Användarens slutmål är samma funktionalitet som Next-appen. Den nya
[funktionsmatrisen](feature-parity.md) skiljer befintliga delar från återstående
flöden. Nästa startsidesteg är [M07B](tasks/m07b-personal-activity-scope.md):
aktiviteter via datumgiltigt lagmedlemskap/egen lagåtkomst utan kallelse, med
separat svarsrätt och läsbara detaljer. Full Behöver svar, kalender, arbetspass,
lag/föreningar och övriga funktioner förblir öppna i matrisen.

Lokalt godkänt: 1 147 Vitest-tester, båda apparnas typkontroll, lint, Next- och
Vite-produktionsbyggen samt 25 Python-releasekontroller. Maven verify körde
70 tester: 69 godkända, ett separat opt-in-browserprov överhoppat. De nya
PostgreSQL/HTTP-fallen täcker behöriga personer, återkallning, dolda framtida
kallelser, svar efter omläsning och bevarad kommentar. Spring-genererad OpenAPI
är exporterad till TypeScript. Paketerat JVM-startprov mot tom lokal PostgreSQL
passerar, inklusive startmigrering och owner/runtime-separation.
Chromium med syntetisk Auth/API passerar direktsvar utan navigering, sparfel,
bevarad kommentar efter omladdning, befintliga sessions-/navigeringsprov samt
320/375/390/768/1440 px utan horisontell scroll. Mobil/desktop är bildgranskade.

Next-bygget kördes utanför sandboxen för fungerande TypeScript-underprocess.
Inget nytt native-bygge eller verkligt driftprov kördes lokalt; obligatoriska
CI-grindar behålls. Gamla Supabase-schemats reset/pgTAP är inte omkörda, eftersom
schema/migrationer är oförändrade. Ingen molndeploy eller dataskrivning ingår.
PR och aktuell CI-status redovisas i leveransrapporten.

## Klientnavigering i browser-frontenden, 2026-10-22

Aktivitetslänkar var vanliga ankare och laddade om dokument/config/session samt
hela sidskalet. Vite-appen använder nu React Router 7.18.4 för intern navigering.
Delade komponenter får en valfri routeradapter, med ankare som standard för
Next-appen. Aktivitetslista, meny, logotyp, tillbaka-länkar och login/logout
använder samma navigering. Headern och dokumentet bevaras mellan privata vyer;
bakåt/framåt och inloggningens returadress följer URL:en. Fokus och scroll återgår
till sidans innehåll. `/components` är publik utan sessionsanrop; kontobyten i
andra flikar fortsätter att upphäva klientens session även där.

Lokalt godkänt: 1 146 Vitest-tester, båda apparnas typkontroll, lint samt Next-
och Vite-produktionsbyggen. Chromium-provet verifierar oförändrat dokument och
samma header, inga extra sessionsanrop vid aktivitetshopp, historik, tangentbord,
meny och övergång från publikt galleri till privat vy. Dessutom passerar tidigare
Auth-/sessions-/svarsprov, login-returadress samt mobil/desktop och fem bredder.
Browserprovet läggs även till CI:s application-jobb och använder syntetiska
Auth/API-svar, utan databas eller verklig Auth. Backend/native-bygge och gamla
Supabase-schemats reset/pgTAP är inte omkörda lokalt för denna frontendändring.
Ingen deployment eller databasändring ingår.

## Native-reflection för Liquibase, 2026-10-21

CI #658 för `ba06301` klarade application/database/backend och själva native-
bygget, men native-startprovet stoppades av `MissingReflectionRegistrationError`
för `AbstractSQLChange.setSplitStatements(Boolean)`. JVM och JVM med AOT-graf
har inte GraalVM:s reflection-begränsningar och fångade därför inte detta.

Metadata kompletteras för deklarerade metoder i `AbstractSQLChange` och
`SQLFileChange` samt SQL-filklassens konstruktor. Det täcker SQL-filernas attribut
och checksummeåtkomst, inte bara den första saknade metoden. Testverktyget kan
nu köra en lokalt byggd native-binär genom `--runtime-executable`; samma
migrations-/Auth-/sessionsprov används fortfarande för CI:s buildpack-image.
Migrations-SQL, DB-roller och målmiljö är oförändrade.

Lokalt godkänt med Oracle GraalVM 25.0.4: riktigt `native:compile` utan
DB-anslutning/credentials och startprov av den resulterande native-binären mot
tomt PostgreSQL-schema. Samtliga tio steg körs före HTTP-start; DB/Auth-health,
sessionslagring, rate limit, Bearer-avvisning och avstängning passerar.
Testverktygets JAR-steg verifierar även idempotent migration, runtime-kontroll
utan owner och fel utan HTTP vid nekade grants/saknad owner-credential.
CI:s bygg- och startprov av buildpack-imagen behålls som obligatoriskt krav.
De tidigare 69 JVM-testernas resultat hör till `ba06301`; de är inte omkörda
för denna metadata-/testverktygsrättning. Inga Kotlin- eller SQL-filer ändras.

## Startmigrering, 2026-10-21

ADR-023 ersätter den tidigare separata startordningen: korta Liquibase-steg
körs vid backendstart med en separat owner-anslutning, följt av runtime-kontroll
före HTTP. Health gör fortsatt bara anslutningskontroll. Tunga dataflyttar ska
köras separat i återupptagbara batcher. Samma native-image ska stödja start med
eller utan migrering; CI:s paketerade startprov verifierar ett tomt schema.

Vercels descriptor aktiverar migrering. Backendprojektet behöver separata
owner-credentials i runtime-miljön. Ingen målmiljö eller hemlighet ändras av
kodändringen.

Lokalt godkänt: **69 backendtester, 0 fel, 1 valfritt browserprov överhoppat**,
15 releasekontroller och oförändrat OpenAPI/TypeScript-kontrakt. Paketerad JAR
klarar migration två gånger, separat runtime-verifiering utan owner, nekade
grants och saknade owner-credentials utan HTTP-start. Både vanlig JVM och JVM
med native-byggets genererade AOT-graf migrerar ett tomt schema före HTTP och
klarar DB/Auth/session-startprovet. Native AOT/paketering sker utan DB-anslutning.
Fullständigt native-image-bygge/startprov återstår i CI; ingen molnmigration,
release eller ändring av runtime-hemligheter har gjorts. Frontendens tester och
byggen samt gamla Supabase-schemats reset/pgTAP är inte omkörda för denna
backendändring. Historiska verifieringsresultat och tidigare beslut följer nedan.

## Engångsverifiering i stället för rättighetsfrågor i health, 2026-10-21

Uppföljning i PR #151 efter användarens granskning. `DatabaseAccessHealthIndicator`
och `BrowserSessionHealthIndicator` är borttagna. Spring Boots inbyggda
`DataSourceHealthIndicator` sköter löpande databas-health; befintlig Auth/JWKS-health
behålls. Health kör inga egna roll- eller sessionsschemafrågor.

`DatabaseAccessVerifier` körs en gång efter Liquibase i den separata JVM-
migreringsprocessen, med runtime-datasource. Det går också att köra verifiering
utan migrering med `FORENA_VERIFY_DATABASE_ACCESS=true FORENA_MIGRATE=false` och
runtime-credentials. Processen öppnar ingen HTTP-server, tvingar Liquibase avstängt
och avslutas med fel om datagrants, rollisolering eller sessionsschema är fel.
Vanlig webbruntime anropar inte verifieraren, varken vid start eller health.

Det befintliga Vercel-deployjobbet saknar DB-credentials och kör fortsatt HTTP-
health/version/login. Engångskontrollen tillhör det separata migrerings-/releasejobbet,
som ska avbrytas före aktivering vid verifieringsfel. Ingen ny kontroll-endpoint
eller credential införs. Native-CLI för verifieringsläget är inte verifierat;
använd den paketerade JVM-JAR:en. Kubernetes-liveness ska inte bero på DB;
readiness kan uttryckligen inkludera anslutningskontrollen `db`.

Lokalt godkänt: Maven `clean verify` på Java 25 med **69 tester, 0 fel och
1 valfritt browserprov överhoppat**. Regressionen tar bort INSERT-rättighet,
visar att engångskontrollen nekar den och att tre health-anrop ändå är UP utan
verifieraranrop; återställda grants godkänns. Paketerat JAR-prov verifierar
migrering två gånger, separat kontroll utan owner, nekade rättigheter med
icke-noll exitkod, ingen HTTP och oförändrad migrationshistorik i verifieringsläge.
Runtime utan owner, Auth, sessionsanrop och avstängning är fortsatt godkända.
**15 releasegrindtester** och oförändrat/reproducerbart OpenAPI/TS är godkända.
Frontendkoden är oförändrad; dess tidigare appkontroller har inte körts om här.

Tidigare CI för `744b2f0`, körning `39606731885`, är färdig och grön inklusive
native-image. Det resultatet verifierar den tidigare versionen, inte denna
uppföljning. Ny native-image och verkligt målmiljöprov återstår för nya koden.
Målmiljön har inte ändrats, i enlighet med användarens val av enbart kod/PR.
Äldre status nedan om rättighetskontroll i health ersätts av denna uppföljning.

## Gemensam dataroll och Kotlin-konventioner, 2026-10-21

Branch `fix/activity-overview-migration`, från main `262169e`.
Användarens driftlogg visade `permission denied for table team` i Mina aktiviteter.
Läsande katalogkontroll i `forena-kotlin` bekräftade exakt åtta Liquibase-steg,
olåst historik och saknad runtime-läsning av teamets ID, organisation och namn.
Alltså saknades migration 009 i målmiljön trots att nya API-koden kördes.

Användaren valde därefter gemensamma datagrants och enbart kod/PR.
**Målmiljön är oförändrad.** Förberedd SQL har endast körts i en tillfällig lokal
PostgreSQL; inga steg 009–010, rolländringar eller verksamhetsskrivningar har
körts i målprojektet. Översiktsfelet kvarstår där tills owner kör migreringarna.

[ADR-021](decisions.md#adr-021-gemensam-dataroll-separat-migrationsägare):
nytt, additivt steg 010 ger runtime SELECT/INSERT/UPDATE/DELETE på datatabeller
och sekvensåtkomst i privata `forena`. Owner-specifika default privileges gäller
även framtida tabeller. Runtime saknar DDL, TRUNCATE, ägarrätt och Liquibase-
metadata; klientroller får inga nya grants. Runtime är en betrodd backendroll
som kan skriva även konto-/personåtkomst-/historikdata; användarregler finns i
Kotlin. Tidigare snäva kolumngrants är historiska och ersätts av denna modell.

Owner kör fortsatt Liquibase separat före runtime-start. Detta inför inte
migration vid varje webbinstansstart eller owner-credentials i runtime.
Ny databas-health kontrollerar rollmodellen via katalogerna utan verksamhetsdata;
saknade DML-grants, ägarrätt eller migrationsrättigheter ger DOWN och stoppar
promotion. Den nya koden ska därför inte främjas före separat migration 010.

[ADR-022](decisions.md#adr-022-kotlin-standardundantag-och-entity-namn) och
AGENTS.md inför generella Kotlin-regler: standardundantag vid argument-,
tillstånds- och uppslagsfel, samt ramverkets egna typer för Auth/transport.
Egna problem-/RuntimeException-klasser är borttagna. HTTP översätts i advice/
filter med fasta feltexter; 401/403/404/409/429/503 och Retry-After behålls.
Alla tabellmappningar heter `*Entity`; den fristående läsprojektionen heter
`ActivityOverviewRow`. SQL-tabeller, kolumner och OpenAPI/TS är oförändrade.

Lokalt godkänt: Java 25 Maven verify med **68 tester, 0 fel, 1 valfritt
browserprov överhoppat**. Det omfattar tio migrationsbaslinjer, framtida
owner-skapad tabell/identitetssekvens med automatisk DML, nekad DDL/metadata,
health-fel/återhämtning samt fulla Auth-/verksamhetsregressioner. Därefter kördes
**4 tester, 0 fel/överhoppade** med opt-in-browser och utökad arkitekturkontroll:
Entity-suffix, inga egna RuntimeException-typer och riktig lokal browser →
Kotlin → PostgreSQL → svar/omladdning/logout med kontrollerad Auth-leverantör.
Paketerad JAR klarade bootstrap, migrering två gånger och runtime/health utan
ägarkonto. **1 146 Vitest-tester**, båda apparnas typkontroll, lint, Next- och
Vite-produktionsbygge samt reproducerbart OpenAPI/TS-kontrakt är godkända.

Nytt native-bygge och verkligt driftsatt browserprov är inte körda lokalt.
Gamla appens Supabase reset/pgTAP är inte körda för detta separata Liquibase-
schema. Nästa driftmoment är ett separat godkänt owner-migreringssteg genom
010, därefter native-release och inloggat prov. Ingen molnmigration ingår i PR:n.

## Mina aktiviteter och personåtkomst, 2026-10-21

Branch `feat/my-activities`, från main `62247c7` (PR #148).
[ADR-020](decisions.md#adr-020-personåtkomst-och-mina-aktiviteter) och
[M07A](tasks/m07a-activity-overview.md) beskriver aktuell modell och avgränsning.

Startsidan i Vite visar nu **Mina aktiviteter** utan förvalt aktivitets-ID.
`GET /api/me/activities` listar kontots kallelsekopplade aktiviteter genom egen
eller delegerad personåtkomst, över föreningsgränser och utan dubbletter.
Pågående/kommande ej inställda aktiviteter med start inom 90 dagar ingår,
inklusive nej-svar och ännu inte utskickade kallelser. 50 aktiviteter/sida,
starttid/UUID-sortering och `next_offset`; samtidiga ändringar kan flytta sidor.
Klubb, lag och uttryckligen svensk tid visas; länken öppnar befintligt svarflöde.
Laddning, tomt, fel/återförsök och samma produktionskomponent finns på `/components`.

Kotlin använder `PersonAccessService`, `AccessiblePerson`, `MyInvitations` och
`AccessibleInvitation`, utan familj som kodbegrepp. Tilldelningarna `self` och
`guardian` ger oförändrad personåtkomst; andra relationstyper införs inte nu.
Befintliga kallelserutters URL:er och JSON-fält är oförändrade; genererade
scheman har nya namn. En parameteriserad, begränsad läsprojektion i Spring Data
JDBC undviker att ladda hela kallelsemängden. Migration 009 ger endast runtime
kolumnläsning av lag-ID, organisation och namn. Tidigare migrationer är orörda.

Verifierat lokalt på denna branch:

- Java 25 Maven `verify`: 66 tester, 0 fel, 1 valfritt browserprov överhoppat.
  Nytt urval, egen/delegerad åtkomst, andra konton/föreningar, återkallad
  åtkomst, inaktiv session, sidindelning och nio migrationsbaslinjer ingår.
- Det valfria browserprovet kördes därefter med
  `FORENA_LOCAL_BROWSER_TEST=true FORENA_BROWSER_EXECUTABLE=/usr/bin/chromium`
  och Maven `'-Dtest=ApiTest#real*' test`: 2 tester, 0 fel/överhoppade.
  Browser → riktig Kotlin → lokal PostgreSQL → svar/omladdning/logout är grönt;
  endast Auth-leverantören är kontrollerad. En lokal transportbrygga bevarar
  HTTPS-origin och Secure-cookie; detta är inget driftsatt Vercel-/Supabase-prov.
- Paketerad JAR via `backend/scripts/local-smoke.py`: bootstrap, migrering två
  gånger, runtime utan ägarkonto, health, Auth-budget och avstängning godkända.
- 1 146 Vitest-tester, båda apparnas typkontroll, lint, Next-produktionsbygge
  och Vite-produktionsbygge godkända. OpenAPI/TS genererade från riktig Spring
  HTTP-export; upprepad generation ger bytevis identiskt kontrakt.
- `scripts/migration/browser-frontend-mock.mjs`: startsida/lista/detalj/svar,
  sidindelning, 503/återförsök, kontobyte, logout, tangentbordsmeny och galleri
  godkända. Ingen horisontell overflow vid 320/375/390/768/1440 px. Mobil och
  desktop visuellt granskade med syntetiska data.

Initiala verifieringshinder är rättade: Maven behövde miljöns proxy och CA,
frontendens förinstallerade beroenden saknade Vite-pluginen och Next-byggets
underprocess behövde normal exekveringsåtkomst. Befintliga kontrakts-/granttester
uppdaterades för den nya rutten och lagets kolumnläsning; ovan avser godkända
omkörningar. Inga kontroller eller skydd har stängts av.

Ej körda: nytt native-bygge och verkligt driftsatt Auth/browserprov. Ingen
molnmigration, deployment eller ändring av projektinställningar har gjorts.
Migration 009 och ombyggd native-image krävs före aktivering. Nya Liquibase-
schemat är verifierat mot lokal PostgreSQL; gamla appens Supabase-reset/pgTAP
har inte körts för detta separata schema.

Nästa grind är aktuell gemensam native-release och inloggat prov i målmiljön.
Lagmedlemskap utan kallelse, arbetspass och föreningstidszon saknas ännu i Kotlin.
M06:s fulla signalworker, M22G:s driftgrindar och återstående M03-metoder
(passkey gav senast `passkey_disabled`) återstår. M07 och full M18B är inte
accepterade enbart genom denna avgränsade översikt. Äldre rapporter nedan är
historiska; deras ”nästa steg” ersätter inte denna uppföljning.

**2026-10-21:** Kotlin-koden är samlad direkt i `backend/` enligt
[ADR-019](decisions.md#adr-019-en-kotlin-kodbas-direkt-i-backend).
M21/M22-probets kod, skript och deployfiler är borttagna. Dokumenterade
provresultat och evidens bevaras; äldre provkommandon/källsökvägar gäller
historiska revisioner och beskriver inte körbar kod i dagens repo.

Lokal verifiering av katalogstädningen 2026-10-21: Java 25 Maven `verify`
är godkänd (61 tester, varav ett valfritt browserprov överhoppat). Paketerad
JAR har klarat `backend/scripts/local-smoke.py`: färsk bootstrap, migrering
två gånger, runtime utan ägarcredential, DB/Auth-/sessionshealth och avstängning.
Vitest: 1 145 tester godkända. Typkontroll, lint, Next-produktionsbygge,
Vite-frontendbygge, kontraktsgeneration/-kontroll och 15 releasegrindtester
är godkända. OpenAPI, genererade typer, produktionskod och verksamhetens
migrationsfiler är oförändrade efter flytten. Två tester har justerade relativa
filsökvägar. Native-image och driftat browser-/Auth-prov har inte körts för
katalogstädningen; ingen deployment eller ändring i målmiljön har gjorts.

Uppdaterad 2026-10-19. Inventeringsbas: `c379a96719490bc4edbfcb0a4ee7a1947684ddce`.
Planens uppgifter finns i [uppgiftsindex](tasks/README.md).

## Bekräftat TLS-fel vid Auth-nyckelhämtning

Efter PR #124, main `312cb51`, svarar aktivitetens API 503 utan att logga ut.
Vercel-loggarna för `dpl_AEEyQRwtotNvNfEx8jXd4dousebK` visar den
2026-10-19 21:38 UTC `api_auth_failed stage=jwt reason=jwks_tls`.
Det bekräftar TLS-fel på Kotlin → Supabase JWKS, före familjeåtkomst.

Branch `fix/auth-platform-ca` använder samma Auth-HTTP-klient för JWKS och
`/user`. Truststore förenar Java-, system- och uttryckliga plattforms-CA-rötter;
entrypointen bevarar CA-sökvägen före miljörensning. Klienten behåller normal
kedje-/värdnamnsverifiering, nekar redirects och stoppar felaktig CA-konfiguration.
Release-health hämtar nu också Auths publika nycklar med samma klient, så ett
kvarstående TLS-fel stoppar promotion i stället för att passera enbart JDBC-health.

Lokala TLS-prov verifierar extra CA, nekad okänd CA och fel värdnamn samt
saknad/felaktig CA-konfiguration. Molnverifiering och inloggat aktivitetsflöde
återstår efter merge; exakt certifikatkedja i Vercel har inte kunnat inspekteras.
Ett verkligt HTTPS-prov mot målprojektets JWKS återskapar `jwks_tls` med
enbart den paketerade JDK:ns rötter och lyckas med den nya klientens systemrötter
genom arbetsmiljöns proxy. Inga Auth-konton, sessionsdata eller verksamhetsdata
behövs för det provet. Det verifierar CA-mekanismen lokalt, inte Vercels kedja.
Slutkontroller godkända: Java 25 Maven verify med 41 tester, 1 142 Vitest-tester,
båda apparnas typkontroll, lint, Next-produktionsbygge, nio releasegrindtester
och Actionlint. Health-regressionen stoppar vid nekad nyckelhämtning och
återhämtar sig utan att exponera komponenter, URL:er eller exceptiontext.
Även paketerad JAR är verifierad med två migreringsstarter, runtime utan
ägarkonto, lokal JWKS-server, nekad/återställd Auth-health och Bearer-krav.
Det äldre startprovet använde en adress utan nyckelserver och uppdaterades
när CI korrekt nekade den nya health-kontrollen. OpenAPI-/typkontraktet passerar.

## Fortsatt utloggning: verifieringsfel och säker auth-diagnostik

Branch `fix/jwt-verification-diagnostics` från main `5cc4759`.
PR #123 är driftsatt som `dpl_EUYYWmGiPs1Ny4anhd7XQJj4gh5z`, men användaren
rapporterar fortsatt utloggning vid aktivitetshämtning. Cookie-rättningen var
inte tillräcklig; molnfelets exakta orsak är fortfarande inte fastställd.
Browserns Response är `{"error":"Inloggning krävs."}`, vilket identifierar
Kotlin-säkerhetsfiltrets 401 före aktivitetshanteraren, inte Vercels HTML-skydd.

JWT-decodern gjorde tidigare alla verifieringsfel till 401, inklusive ett
otillgängligt JWKS-endpoint. Nu ger TLS-, timeout-, HTTP- och anslutningsfel
503/no-store utan att återkalla browserns appsession. Ogiltiga tokens/claims
ger fortsatt 401 och inga operationer tillåts utan verifierad signatur.
Loggar skiljer fasta felkategorier och saknad Bearer utan känslig feltext.
API-regressionen provar ett verkligt HTTP-503 från nyckelservern, oförändrad
databas, fortsatt cached-key-verifiering och rotation. Separata tester täcker
TLS/timeout och frånvaro av token/exceptiontext i loggarna.
Efter merge behövs ett nytt molnanrop för att läsa exakt felkategori; detta
är inte ett påstående att den faktiska anslutningsorsaken är åtgärdad.
Lokalt godkänt: Maven verify med 38 tester på Java 25, 1 142 Vitest-tester,
båda apparnas typkontroll, lint och befintliga Next-appens produktionsbygge.

## Browserpilot: rättning för Vercel Deployment Protection

Branch `fix/protected-browser-api`, från main `596f8b0` (PR #122 mergad).
Användaren kan logga in men loggas ut när aktivitetens API hämtas. Databasen
bekräftar aktivt konto, familjeåtkomst och två kallelser. En färsk riktig
Supabase-token passerar Java 25-backendens JWT-decoder lokalt. Vercel-projektet
har SSO-skydd `all_except_custom_domains`; klientens `credentials: omit`
utelämnade skyddscookien och behandlade alla 401 som ogiltig appsession.

API och publik config använder nu `same-origin`. Kotlin autentiserar fortsatt
med Bearer. Bara API:ts uttryckliga 401/JSON loggar ut ur Supabase; plattformens
nekade åtkomst bevarar appsessionen. Browserregressionen kräver en syntetisk
Vercel-cookie och provar separat plattforms-401 och Kotlin-401.
Riktig inloggad Vercel-verifiering återstår efter merge: den autentiserade
fetch-anslutningen nekades av Vercels skydd även med dess skapade delningslänk.
Lokalt är 1 142 Vitest-tester, båda apparnas typkontroll, lint och
produktionsbyggen godkända. Browserregressionen med kontrollerade svar passerar
cookiekontrollen för API/config, båda 401-fallen samt tidigare pilotflöden.

## Separat browser-frontend: första pilotflödet på branch

Branch `feat/browser-frontend`, bas main `b6ae962`. På användarens instruktion
byggs en separat React/Vite-app parallellt med Next. Inloggning med lösenord
och familjens kallelsesvar går via browser → Vercel → Kotlin. Gemensamma UI-
komponenter, design och `/components` återanvänds. Backend/JWT/session/åtkomst
är oförändrade; inga tabeller, migrationer eller verksamhetsgenvägar införs.
[Omfattning, körning och återstående funktioner](../../frontend/README.md).

Lokal verifiering: frontendens kontrollerade browserprov passerar loginfel,
inloggning, Bearer-anrop utan cookies, sparande/omladdning, nekad session,
kontobyte, utloggning, komponentreferens och tangentbordsmeny. Ingen horisontell
scroll vid 320/375/390/768/1440 px; mobil/desktop visuellt granskade.
1 138 Vitest-tester, båda apparnas typkontroll, lint och produktionsbyggen samt
åtta releasegrindtester är godkända. Actionlint och Vercel CLI 60.1.3:s
konfigurationsvalidering är godkända.
Kotlin: Maven verify med 35 tester på Java 25 är godkänt. Fullt
browser → Kotlin → Supabase-prov stoppades av TCP-policyn vid den läsande
pooler-kontrollen, före Auth-/verksamhetsseed; återställning av det privata
provets status är verifierad utan kvarvarande skapade konton eller data.
Ny Vercel-deployment, riktiga Supabase-browserflödet och full M18B-paritet är
ännu inte verifierade. Tidigare deployförsök med privat binding nedan avser
Next-piloten, inte bevis för den nya statiska frontendens drift.

## Actions-deploy för parallell Kotlin-sajt: implementation på branch

Första riktiga Kotlin-deployen, `39263714818` på `b3ff6ef`, byggde och laddade
upp båda containerbilderna och skapade `dpl_9u3qpQh6Cipge9yF2KVFVa3f5cVU`.
Hälsokontrollen gav därefter generiskt 503 och ingen explicit promotion kördes.
Runtime-loggarna gav inget felsteg, så exakt 503-orsak är ännu inte fastställd.
Den kanoniska adressen `forena-kotlin.vercel.app` pekar fortfarande på tidigare
deployment; Vercels genererade team-alias pekar redan på stagingdeploymenten.

Uppföljningen skiljer intern `FORENA_KOTLIN_SERVICE_URL` från direkt test-origin.
Intern HTTP och eventuella routingprefix/sökparametrar bevaras enligt bindingens
bas-URL, utan origin-/legacy-fallback. Hälsokontrollen loggar fasta felsteg och
HTTP-status utan URL, tokens, exceptiontext eller felkropp. Startskriptets två
konfigurationsgrindar får också säkra felmeddelanden. Lokalt: 1 112 Vitest-tester,
typecheck, lint, standalone-bygge och sex releasegrindtester godkända. Paketerad
frontend/startskript har verifierats mot en riktig intern HTTP-stub med prefix
och sökparameter: login/health 200, exakt byggversion och inga DB-/adminvariabler
i webbprocessen. Ny molnverifiering kräver nästa granskade main-release.
Full lokal Supabase-reset/pgTAP kunde inte köras: standardregistret blockeras
av nätpolicyn och spegelbildens uppackning gav `no space left on device` i
Docker-miljön. Lokalt PostgreSQL-tidsprov är godkänt; inga molndatabaser ändrades.

Branch `ci/kotlin-vercel-deploy`, från main `e0953a3` efter PR #116.
Användaren har kopplat bort Vercels Git-integration för den nya sajten och
beställt deploy av frontend/backend genom GitHub Actions.
[Körinstruktion, engångskonfiguration och gränser](actions-deployment.md).

Ny workflow väntar på grön CI för exakt aktuell main-SHA, även vid manuell
körning. Next standalone och verksamhets-API paketeras som separata containrar
och publiceras atomärt genom Vercel Services (beta), med privat API-binding.
Staging sker med `--skip-domain`; Next → API → JDBC-health och frontendens
versions-ID måste godkännas före promotion. Gamla deployworkflowen är separat.
Startskripten begränsar applikationsprocessernas miljö; inga migreringar,
bootstrap, seed, utskick eller full signalworker införs.

Lokal verifiering: 1 102 Vitest-tester, typecheck, lint och standalone-
produktionsbygge godkända. Sex exekverade releasegrindtester och Actionlint
godkända; Vercel CLI 60.1.3 accepterar Services-konfigurationen. API Maven
verify: 35 tester, 0 fel/överhoppade; paketerat bootstrap-/migrerings-/runtimeprov
godkänt. Båda containerbilderna byggda lokalt; frontendens login/health,
versionsmatchning och avsaknad av privilegierade variabler i Node-processen
verifierade mot en kontrollerad health-stub. API-bildens låsta JVM startar.
Det lokala stubprovet är inget nytt moln-/databas-/browserprov.

Vercel-projektets Root Directory har satts till reporoten och Production-
konfiguration för SITE_URL, runtime-användarnamn och JDBC/TLS lagts in utan
deployment. Runtime-lösenord och GitHub-miljöns secret/skydd behöver konfigureras
direkt i respektive tjänst; de har inte lästs eller överförts av denna leverans.
PR/CI redovisas i leveransrapporten. Molndeploy och
promotion är inte verifierade i denna implementation; GitHub-miljöns Vercel-token,
Vercels runtimekonfiguration och mergad workflow på main krävs före första release.
Avsaknad av syntetiskt aktivitets-ID gör fortfarande testsidan 404 och är inte
ett fel i deployen. Övriga M07-/Auth-/pilotgrindar kvarstår.

## M07: avskilt browserflöde genom Next och Kotlin godkänt

Branch `feat/kotlin-browser-flow`, från main `548d627` efter mergad PR #114.
[Körinstruktion och gränser](browser-participation.md),
[källbunden browser-/databasevidens](evidence/browser-participation-results.json).

De två befintliga Next-rutterna för familjekallelser/svar har nu en serverstyrd
Kotlin-adapter som är avstängd som standard. Den avskilda sidan
`/migration/participation` använder nya seedens ID och återanvänder inloggning,
sidskal, kontomeny, footer och svarskomponent. Kontraktstyperna importeras från
den genererade Kotlin-specen. Fel/timeout/redirect ger ingen retry eller
legacy-fallback. Origin-skyddet använder kanonisk `SITE_URL` och verifieras även
när Next har en intern request-URL bakom en proxy.

Verifierat 2026-10-19 kl. 13:48 svensk tid i tillfällig Vercel Sandbox i
Frankfurt: **14 godkända browserkontroller** med riktig lösenordsinloggning,
SSR-cookies, Next → Kotlin → privat JDBC-databas. Två barn läses; svar,
kommentar, nej, återställning och omläsning fungerar. Kommentarändring bevarar
svarstid och signalversion, identisk upprepning skapar inget nytt. Annan familj
nekas med 404/403 och gamla cookies efter logout med 401 utan ändrad historik.
Ett verkligt avbrott av API-processen ger 503 utan fallback eller databasändring.
Mobilbredder 320/390/768 och desktop 1440 har ingen horisontell overflow;
meny/Escape och komponentsidans kontomenyvariant är verifierade. Mobil- och
desktopbilder granskade.

Seeden och ettkommando-körningen är versionshanterade. Både full körning med
byggen och slutlig återkörning med samma artefakter är godkända. Privilegierade
credentials används endast i testprocessen; Next och Chromium får inga sådana,
och API:t får bara runtime-credential. Testet städar i `finally`. Slutlig
oberoende SQL bekräftar **noll syntetiska browserkonton och noll rader i alla
tio verksamhetstabeller**, fem oförändrade Liquibase-steg och nekade klientgrants.
Sandboxen är stoppad utan beständig snapshot eller publika portar.

Lokala kontroller: **1 096 Vitest-tester i 133 filer**, typkontroll, lint och
produktionsbygge godkända. API-JAR byggd med låst verktygskedja; paketstegets
tester överhoppades, verklig browserkörning utfördes separat. Alla registrerade
källhashar matchar ändringen. Fel projektref nekas före nätanrop och tar bort
äldre resultatfil. Arbetsbranchen har automatiska Vercel-deployer avstängda i
båda konfigurationerna. Ingen API-deploy, bootstrap eller vanlig routingaktivering.

Återstår före hela M07: ordinarie översiktens aktivitets-/ID-läsning från nya
databasen, full signalworker och aktivering/återgång i driftsatt runtime.
Browser-PKCE och övriga Auth-metoder är separata grindar. Data API-cachefelet
från PR #114 ändrades inte; det nya browserflödet behöver inte Data API.

## Målmiljö och Auth-livscykel: Auth-/API-/databasprov godkända

Arbetsbranch `feat/target-api-verification`, bas main `187bfd2` (PR #113 mergad),
[PR #114](https://github.com/johkin/forena/pull/114).
Målmiljökörning på källcommit `8cdc088`, oförändrad API-/testkod från main.
[Körning och begränsningar](target-auth-lifecycle.md),
[målmiljöevidens](evidence/target-api-verification.json) och
[TargetAuthIT-resultat](evidence/target-auth-results.json).

`forena-kotlin` har nu ett Liquibase-migrerat privat `forena`-schema, separata LOGIN-
roller utan superuser/BYPASSRLS/DDL-grants till runtime. Klientroller saknar
schemaåtkomst och runtime är inte medlem i ägarrollen. Bootstrap använder
tillfällig SET-rätt för administrativ schemaägartilldelning, därefter avstängd.
Kontrollerat genom oberoende SQL-läsning; säkerhetsrådgivaren gav inga anmärkningar.
Inga syntetiska Auth-provkonton eller verksamhetsrader har lämnats efter provet.
Liquibase äger verksamhetstabellerna och sin femstegshistorik. Ägarrollens
oväntade BYPASSRLS/CREATEDB återkallades under preflight före migreringen.
Bootstrap har inte körts igen.

ADR-016 inför `ProviderSessionVerifier` och onlinekontroll av samma JWT via
Supabase `/user`, ovanpå lokal signatur- och konto-/sessionskontroll. Skrivningar
kontrolleras även efter radlås. Kända inaktiva sessioner ger 401; tekniska fel
ger generiskt 503/no-store utan retry/cache/fallback. Ingen Auth-adminnyckel,
Auth-tabellåtkomst eller ändring av Auth-RLS i runtime. OpenAPI/TS beskriver 503.

Lokalt godkänt: Maven clean verify **35 tester, 0 fel/överhoppade**; riktiga
HTTP-/JWT-/PostgreSQL-prov och kontrollerad Auth-server täcker logout, spärr,
saknad/felkontrollerad session, timeout, felstatus, redirect utan credential-
vidarebefordran och logout under radlåsväntan utan skrivning. Tom installation,
fyra uppgraderingsbaslinjer och Modulith-struktur behålls. Paketerad JAR/bootstrap,
migrering två gånger och runtime utan ägarcredential godkända. Befintlig app:
1 065 tester, typecheck, lint och produktionsbygge godkända. Kontraktet genererat
från riktig Spring HTTP och reproducerat bytevis. Exakta källhashar finns i evidensen.

**Verkligt Auth-prov från PR #113, godkänt:** på källcommit `a72d5de` kördes
Auth-only-scriptet med fungerande admincredential: **18 godkända kontroller**.
Riktig ES256/JWKS-signatur, claims, lösenordsinloggning, refresh, lokal/global
logout, annan kvarvarande session, ny inloggning, spärr/återöppning och soft delete.
Tidigare JWT nekades med 403 `session_not_found` eller `user_banned`;
refresh efter avslut nekades med 400. Hard delete och efterföljande 404 bekräftade
städning. Inga mejl skickades. Oberoende SQL bekräftade noll syntetiska provkonton,
noll verksamhetstabeller, fortsatt NOLOGIN och oförändrade rollgränser.
Bootstrap har inte körts igen. [Aktuell evidens](evidence/target-auth-provider-results.json).
[Historiskt blockerat försök](evidence/target-auth-attempt.json) behålls.

**Verkligt Auth-/API-/databasprov godkänt:** hela `TargetAuthIT` kördes
2026-10-19 kl. 13:13 svensk tid i en tillfällig Vercel Sandbox i Frankfurt:
**1 test, 0 fel, 0 överhoppade**. Verklig JDBC-inloggning för båda begränsade
rollerna och TLS 1.3 med betrodd Supabase-CA/hostname är verifierade. Paketerad
Liquibase kördes separat som ägarrollen: första gången 5 nya steg; andra gången
0 nya och alla fem fullständiga historikposter exakt oförändrade.

Riktig lösenordsinloggning/signatur/JWKS, accepterat svar, refresh,
familjeavgränsning, lokal/global logout, kvarvarande annan session,
ny inloggning, spärr/återöppning och soft delete fungerade. Tidigare JWT gav
401 på både API-läsning och skrivning efter avslut/spärr; annan familj fick
404/403. Nekade skrivningar skapade ingen extra historik. Efter testets
städning bekräftade JDBC och oberoende SQL noll syntetiska Auth-konton och
noll rader i samtliga tio verksamhetstabeller. Säkerhetsrådgivaren gav inga
anmärkningar. Sandboxen är stoppad utan beständig snapshot eller publika portar.

En extra Data API-kontroll gav 503/PGRST002 (schema-cachefel), inte en verifierad
PGRST106-avvisning; detta är redovisat separat i evidensen. Klientroller saknar
fortsatt schemaåtkomst och ingen Data API-konfiguration ändrades.
**Ej körda:** browser-PKCE, passkeys, magic-link/mejlleverans, OAuth/MCP, full
signalworker och driftsatt molnruntime. Lokala resultat tidigare i avsnittet
är tidigare verifiering; denna fortsättning ändrar dokumentation/evidens och
lägger arbetsbranchen i befintliga Vercel-undantag för automatiska deployer.

Vercel-byggen är avstängda för arbetsbranchen i båda befintliga konfigurationerna.
Ingen API-deploy eller omkoppling av Next.js ingår. Nästa beroende arbete är
de återstående browser-/Auth-/runtimegrindarna; hela M03/M07 är inte accepterade.

## Första verksamhets-API:t: för granskning, ren start

Leverans på `feat/participation-api`, från main `1b60bb8b5978041f469f024f100432c72dbd44d4`.
[ADR-010](decisions.md) fastställer användarens beslut att inte importera gamla
projektets testdata. Nytt privat `forena`-schema och egna Liquibase-migrationer;
`backend` är en separat app från M21/M22-provet.

Ändrat beteende: API för familjens kallelser och för att svara, ändra eller
återställa svaret. Explicit familje-/organisationskontroll i Kotlin utan RLS enligt ADR-012,
JWT-verifiering, konto-/sessionsspärr, livscykellås och atomär
svarshistorik/signalversion. OpenAPI och reproducerbart genererade TS-typer.
CRUD i verksamhets-API:t är nu genererad med Spring Data JDBC 4.1.0 och smala
Repository-interface enligt ADR-011. Modulen heter `activities` och äger aktivitet/
kallelse enligt ADR-015; den beror på `identity` för konto/session och familj.
Tjänster har suffixet `Service`, databasmodeller ligger i `Entities.kt` och
repository-interface i `Repositories.kt` inom varje modul. DTO:er är separata.
All svarslogik ligger i `InvitationService`, en
`@Service` med `@Transactional` enligt ADR-013; läsning är read-only. Ingen manuell
transaktionshantering eller databaskontext behövs. Steg 004 tar bort båda triggers
med funktioner; inga egna databasfunktioner/procedurer finns kvar. Pessimistiska
lås tas aktivitet → kallelse; historik och signalversion skrivs via repositories.
Runtime får smala skrivgrants för dessa fält/tabeller; identitet och historikens
oföränderlighet skyddas fortsatt. En native @Query återstår för databasens klocka.
Steg 005 tar bort `session_id` från affärshistoriken enligt ADR-014; konto-ID
bevaras. Verifierad tokens sessions-ID används fortsatt i autentiseringens
spärrkontroll och kan hämtas för framtida separat teknisk audit-loggning.
Ingen audit-logg införs nu. Teknikprovets registry-SQL är separat och inte omskriven.
CI får ett separat obligatoriskt API-jobb; befintliga kontroller behålls.
Se [första flödet](first-flow.md) och [körinstruktionerna](../../backend/README.md).

Lokal verifiering för leveransen:

- API Maven `verify`: 30 tester, inga fel eller överhoppade. Riktiga ES256/RS256-
  signaturer och lokal JWKS-server, HTTP, PostgreSQL 17.6/Testcontainers med
  begränsad runtime och schemaägare, familje-/klubbgränser utan RLS, rollback,
  samtidiga skrivare/inställning, historik och Modulith-struktur. Nya prov täcker
  två målsmän för samma person med sammansatt ID samt att repository-save inte
  kan skriva kallelsens oföränderliga identitet. Svarstid och revision ägs nu
  av Kotlin-tjänsten och verifieras genom HTTP.
- Tom Liquibase-installation och uppgradering från alla fyra tidigare baslinjer,
  validate/återkörning, borttagna policyer/RLS/funktioner/verksamhetstriggers,
  återkallade klientgrants, bevarade syntetiska svar/historik/signalversioner och
  negativa constraints ingår. HTTP-prov täcker återkallad familjeläsning,
  nekad skrivning före främmande radlås och inga historikskrivningar vid läsning/
  nekade svar/identiska upprepningar. Nya prov täcker samtidiga olika svar,
  olika kallelsers gemensamma signalrad, sluttid efter låsväntan och rollback
  av svar/historik/revision om signalens skrivning misslyckas.
- Paketerad JAR: verklig bootstrap, migreringsläge två gånger utan HTTP,
  runtime utan ägarcredential, health, bearerkrav och SIGTERM verifierade lokalt.
- Befintliga Vitest: 131 filer, 1 065 tester godkända. Typkontroll, lint och
  produktionsbygge godkända lokalt. Bygget krävde egna lokala dependencies och
  subprocessrättigheter; tidigare miljöfel är lösta, inga kontroller avstängda.
- Springdoc 3.1.1 genererar OpenAPI via riktig bearer-skyddad HTTP från
  REST-controllers och typade DTO:er; required/nullable, enumvärden och typade
  felkontrakt verifieras. Export och TS-generation jämförs med Git i CI.
- Teknikprovets controllers har också data classes för status och fel med
  bevarade JSON-fält. Maven `verify`: 45 tester, inklusive HTTP-kontraktsprov.
- OpenAPI-generation utan diff och CI-jobbens beroenden verifierade.

PR-förberedelse: API-konfigurationen har bytts från `application.properties`
till `application.yaml` med samtliga 24 värden bevarade. Ren Maven-verifiering
och prov av den paketerade appen körs även med YAML. Automatiska Vercel-byggen
är avstängda för just `feat/participation-api` i webb- och provkonfigurationen
på grund av lagringsvarningen; GitHub CI behåller samtliga obligatoriska jobb.
[PR #112](https://github.com/johkin/forena/pull/112) innehåller också springdoc-
integrationen och typade svar för alla egna REST-controllers. Okända bodyfält,
fel kommentartyper och numeriska enumvärden nekas; utelämnad kommentar och null
behåller olika betydelser. CI-status för den publicerade committen redovisas i PR:n.

Inte aktiverade: Vercel-deploy, verklig Supabase-inloggning,
passkey/OAuth/MCP, browser → Next-adapter eller full signalworker. Gamla
Supabase-migrationer är oförändrade; inget reset/pgTAP körs mot gamla projektet.
Det nya schemat verifieras med Liquibase/Testcontainers, inga molndatabaser har
ändrats. Ingen dataöverföring, gammal projektradering eller nya Vercel-byggen.

M02/M03/M05/M07 är delvis levererade; helheten får inte markeras färdig.
Nästa steg är nya syntetiska verksamhetsdata, verifierad Auth-livscykel,
full signalreaktion och därefter Next-adapter/browserprov i den rena miljön.
Extern Auth-utloggning/radering kan inte lovas slå igenom omedelbart med endast
lokal JWT-verifiering: koppla lokal spärr eller besluta tokenlivslängd före pilot.
Vercel-lagringsvarningen behöver hanteras före driftaktivering.

## M00: Nuläge, beslut och migreringsplan

Status: dokumentationsleverans färdig för granskning på
`docs/spring-migration-plan`, skapad från uppdaterad `origin/main`.
Ingen backendimplementation, produktionsändring eller dataflytt ingår.
PR-/CI-status redovisas i leveransrapporten; denna text påstår inte att CI gått.

Ändrat beteende: inget runtimebeteende. Repot får gemensamt migrationsunderlag,
självständiga uppgifter, beslut, första flödets acceptans och en kostnadsmodell.
Verifierat nuläge hålls isär från målarkitektur och obesvarade driftfrågor.

Genomförd verifiering:

- Repots enda hittade `AGENTS.md` och relevanta arkitektur-/säkerhets-/driftdokument
  lästa; aktuell main-SHA kontrollerad före branchskapande.
- Källkodsinventering: 98 SQL-migrationsfiler, 43 SQL-testfiler och 131 TS/TSX-
  testfiler. Statisk SQL-referenslista beskriver historiken, inte effektiv katalog.
- Isolerat verktygskedjeprov på JDK 26.0.2.1: Boot 4.1.0, Kotlin 2.4.20,
  Modulith 2.1.0; nio tester godkända, inga fel eller överhoppade. Se
  [exakt provomfattning](versions.md) och [reproduktion](toolchain-probe.md).
- Supabase Terraform-provider granskad i offentlig källa vid låst commit;
  passkey- och MCP OAuth-konfiguration är ännu inte verifierat providerstöd.

Dokumentkontroll godkänd: 34 Markdown-filer, 237 lokala länkar, 231 grupper
med SQL-radreferenser, 22 uppgiftsbeskrivningar inklusive beroendegraf samt
refererade befintliga filer. Kostnadssummor och whitespace kontrollerade.
Appens test/typecheck/lint/build och databasreset körs inte enbart för textändringen,
i enlighet med AGENTS.md. Dessa kontroller är **inte körda lokalt för M00**.
Det isolerade JVM-provet ersätter inte deras resultat.

Begränsningar: ingen läsning av driftkonton/produktionsdata, inga externa
JWT/passkey/OAuth-/kanalflöden eller Docker-/databasprov. Inga verifierade
aktuella Google-priser eller regionlistor på grund av nätpolicyn.
Kostnadsbilden är en antagandebaserad budget, inte en offert.

Tre separata agentuppdrag genomfördes: källkodsinventering (read-only), isolerat
verktygskedjeprov (endast temporär katalog) och kostnads-/regionunderlag (egen
fil). De var underuppdrag till denna leverans, inte egna GitHub Issues eller
långlivade migreringsbrancher. Övriga uppgifter är dokumenterade, inte delegerade.

## Reviderad databasriktning

Planerings-PR: [#97](https://github.com/johkin/forena/pull/97), mergad som `ce0d23a`.
Supabase PostgreSQL behålls enligt ADR-008. Cloud SQL är ett senare alternativ,
inte ett beroende för backend eller frontend. Befintlig säkerhet behålls tills
motsvarande backendregler är testade. M20 ger separat verifiering av portabilitet.
Inga databaser har ändrats eller provisionerats; inga nya prisuppgifter verifierats.
Tidigare budget och M00:s kontrollantal avser första planversionen.
Den reviderade planens 209 lokala länkar, 23 uppgiftsbeskrivningar och
beroendegraf har kontrollerats; Cloud SQL-uppgiften blockerar inte backendpiloten.
Inga apptester kördes lokalt för denna rena textändring.

M21:s teknikprov startades på `spike/vercel-kotlin` från `ce0d23a` på main.
Det testar delar av M01/M02/M06; inga beroende PR:er staplas på planeringsbranchen.
Maven Wrapper, låst container, 9 backendtester och CI-jobb finns nu i M21:s
separata ändring. Lokal Maven-verifiering och appens tester/typecheck/lint/build
är godkända. Publicerad Vercel-preview och Supabase-JDBC-prov är körda, se
[provrapporten](vercel-probe-results.md) med källmanifest och exakta resultat.
10 s efter HTTP-svar lyckades; 60 s blev inte klart inom 90 s. Verklig JVM-krasch
återtogs av ny instans, med en effekt efter upprepat återtag. Hostingbeslutet är
fortfarande öppet. M22 beskriver nästa leveransprov, inte en startad session.

## Nästa ordning

1. M01: grundprojekt med låsta versioner, Maven Wrapper, container och CI samt
   struktur-/modultester. M21 inför ett isolerat bygge; verksamhetsgrundprojektet återstår.
2. M04 och M17 kan inventeras oberoende. M02 och M03 följer M01.
3. M05/M06 förbereder första svarflödet. M07 flyttar hela flödet genom ny backend.
4. M22G verifierar Vercel/Supabase före pilot. M13 är backendpilot på samma
   databas. M08, M12 och M18C är vilande tills ett konkret hinder dokumenterats.

Övriga verksamhetsuppgifter i indexet är planerade. M21 är ett genomfört teknikprov,
inte implementering av verksamhetsbackend. M22 följer innan hostingvalet fastställs.
M15A/M15B separerar kanalerna och M18A/M18B/M18C separerar katalogflytt, Vite och hosting. Fler självständiga
uppgifter krävs för kvarvarande verksamhetsflöden innan pilotens cutover-grind.

## Frågor som behöver beslut före respektive aktivering

| Fråga | När krävs svaret? | Nuvarande hantering |
| --- | --- | --- |
| Region och same-origin-stöd | M22G före pilot | Vercel fra1 och Supabase eu-central-1; routing verifieras i vald lösning |
| SLO, RPO, RTO och backup/PITR | Före produktionsbudget/aktivering | Verifiera stöd och pris i vald Supabaseplan; Cloud SQL HA är endast jämförelse |
| Faktisk signeringsnyckel, audience/scopes, kontorevokering | M03 före auth-aktivering | Enbart teststub verifierad hittills |
| Befintlig domän/RP-ID och preview-origins | Före domän-/hostingbyte | Behåll befintlig identitetsleverantör och ändra inte RP-ID utan plan |
| Auth passkeys/OAuth Terraform-stöd | Före automatisering av dessa fält | Låst providerkälla granskad; faktisk publicerad release/API-roundtrip återstår |
| SSR/förgenerering och publik datafärskhet | M17 före Vite | Next.js kvar tills beslut och prov |
| Tillåten livslängd för äldre frontend/API | Före brytande API-ändring | Additiva kontrakt och kompatibilitetsadapter under övergången |
| Pilotklubb och routingfönster | M13 efter testrepetition | Ingen produktionspilot vald eller bokad |

## Mall vid nästa avslut

```text
Uppgift / PR / commit:
Ändrat beteende och berörda filer:
Verifiering (godkänt / fel / överhoppat / ej kört, exakt revision/miljö):
Begränsningar och aktiveringsstatus:
Nya beslut och följduppgifter:
Nästa beroende uppgift:
```

## M22: genomförd första del

PR #98 är mergad som `2e0af8f`. Fortsättningen på `test/vercel-durable-delivery`
utgår från denna main. [Delrapporten](m22-results.md) registrerar verifierad
fra1-runtime i Git-previewn och ett reproducerbart lokalt konkurrensprov med
två separata JVM:er. Tre omgångar gav en effekt och noll oavslutade publiceringar.
Krasch-/omstartsprovet passerade också. CI aktiverar samma två-JVM-prov.

Även verkligt långt återtag är nu godkänt: den ursprungliga PROCESSING-posten
och en ny 60-sekundershändelse efter 90 s utan apptrafik återtogs i ny JVM,
med cirka 76 s aktiva HTTP-anrop. Upprepat återtag gav en effekt och noll
oavslutade poster i båda fallen. Resultat och exakta deployment-/klienthashar
finns i delrapporten. Observationskontot har endast läsrättigheter; LOGIN är
avstängt och den tillfälliga testklienten är stoppad. Användaren har godkänt
credentialöverföring för detta och kommande isolerade test.

Vercel Cron kräver production-deployment och Hobby stödjer endast dagliga jobb.
Ingen planuppgradering eller cronaktivering har gjorts. Nästa avgränsade del
är ett workeranrop med tidsbudget och faktisk schemalagd väckning, exempelvis
med Supabase Cron. Molnkonkurrens, felpunkt efter effekt och full kostnadsbild
återstår också; M22 är inte avslutad och hostingbeslutet är öppet.

## M22A: schemalagd worker

Bas `2c3e3a6` (PR #99 mergad), branch `test/supabase-cron-worker`.
[Rapport och överlämning](m22-scheduler-results.md) samt
[uppgift](tasks/m22a-scheduled-worker.md) beskriver denna separata leverans.
Worker med egen token återtar högst två valbara publiceringar under mjuk budget
och skyddar färska försök. Lokal verifiering: 25 JUnit-tester, verklig JVM-krasch/
omstart, två-JVM-konkurrens samt 1 065 frontendtester/typecheck/lint/build.

Verklig Supabase Cron väckte fra1-previewn efter minst 150 s utan användartrafik.
1/60 s-händelser fick en effekt och registerkvittens var. Första HTTP-sändaren
fick avsiktlig timeout; JVM:en fortsatte och slutförde arbetet. Senare Cron-
anrop skapade inga dubbletter. Detta är inte ett nytt JVM-dödsprov.

Städning verifierad: inga provjobb, Vault-poster, köade requests, HTTP-responser
eller inställningar; observationskontot NOLOGIN, testklienten stoppad och
previewlänken återkallad. Kvar finns tomma privata hjälptabeller/funktion och
installerade pg_cron/pg_net, samt preview och syntetiska effekter.

Hosting är fortsatt öppet: pg_net:s HTTP-credentials är synliga för direkta
SQL-loginroller; Data API-kontrollen gav 503/PGRST002; predicate-API:t läser hela
registret före filter. Dessa gränser, faktisk schemalagd JVM-krasch, effekt/kvittens-
felpunkt, last/anslutningar och kostnader måste hanteras före verksamhetspilot.
Ordinarie Förena berörs inte.

## M22B: Data API och scheduleråtkomst

Bas `e43d752` (PR #100 mergad), branch `test/scheduler-isolation`.
[Rapport](m22-isolation-results.md), [uppgift](tasks/m22b-scheduler-isolation.md)
och [bevis](evidence/m22-isolation.json) skiljer API-exponering från SQL-grants.
Användaren bekräftade att Data API avsiktligt stängts av för JDBC. Detta
förklarar loggarnas pg_pgrst_no_exposed_schemas och 503/PGRST002; inställningen
är återställd och ska behållas. Ingen ändring av ordinarie Förena.

13 HTTP-fall verifierade med en tillfälligt exponerad syntetisk RLS-fixtur:
positiv läskontroll, nekad skrivning och 406/PGRST106 för privata GET-/POST-
scheman och scheduler-RPC. SQL-markören kunde läsas som anon/authenticated;
runtime/observer verifierades med effektiva katalogprivilegier, utan att ändra
deras SET FALSE eller NOLOGIN. Inget autentiserat användar-JWT-prov kördes.
Sex lokala Pythonregressionstester och offlinebeviskontroll godkända; CI kör
dessa också. App-/Kotlin-/Liquibasekällor är oförändrade i denna del.
Även befintliga 1 065 frontendtester/typecheck/lint/build godkända lokalt.
Ingen lokal Maven-körning eller databasreset för oförändrat applikationsschema;
CI:s befintliga DB-/Kotlin-kontroller behålls.

Städning verifierad 2026-10-18 17:08:35 UTC: fixtur borttagen, API-override
borta, 0 jobb/köposter/responser, observer NOLOGIN. Två providerbootstrap-poster
för tillfällig fixtur och borttagning finns i testets migrationshistorik.
Supabases säkerhetsrådgivare gav inga lints; pg_net:s PUBLIC-grants kvarstår.

Slutsats: JDBC och avstängt Data API räcker för nästa isolerade backendprov.
pg_net innebär fortfarande gemensam HTTP-credentialtillit för SQL-inloggningar.
Produktionsaktivering kräver ett separat val av tillitsgräns eller extern
schedulercredential; ingen ny leverantör eller plan väljs i denna uppgift.
Nästa avgränsade uppgift är [M22C](tasks/m22c-scheduled-crash.md), inte ännu körd
eller delegerad. Registry-/lastprov och kostnads-/hostingbeslut återstår i M22.

## M22C: faktisk schemalagd JVM-krasch

Bas `175fc5e` (PR #101 mergad), branch `test/scheduled-jvm-crash`.
[Rapport](m22-crash-results.md), [uppgift](tasks/m22c-scheduled-crash.md),
[molnbevis](evidence/m22c-scheduled-crash.json) och
[lokalt bevis](evidence/m22c-local-crash.json) beskriver körningarna.

Verifierat lokalt: 29 JUnit-/PostgreSQL-tester, struktur/modultest, riktiga
JVM-exit 137 före effekt och efter commit men före leveranskvittens, tre
två-JVM-workeromgångar samt 1 065 frontendtester/typecheck/lint/build.
Samma låsta verktygskedja används; Liquibase probe-002-faults inför SQL-styrda
förbrukningsmarkörer. Workertokenen får ingen ny endpoint eller ID-styrd krasch.
Runtime kan förbruka/ändra konsumtionsmarkörer via SQL men kan inte skapa en
felpunkt eller ändra dess ID/fas; detta skyddar inte mot komprometterad JDBC.

Moln: Supabase Cron väckte fra1-previewn utan användartrafik efter minst 150 s
och båda avsiktliga JVM-avsluten bekräftades av Vercel. SQL verifierade 0
respektive 1 effekter efter krasch och senare en slutlig effekt och kvittens
för båda. Två överlappande HTTP-workers valde samma publicering; en ny
lyssnarstart observerades i den rundan, inte två bevisat olika moln-JVM:er.
Senare anrop ändrade inte effekter/försök. Cron stängde av sig vid tio anrop.

Städning **delvis klar**: 0 jobb, 0 köposter, 0 oavslutade publiceringar,
preview-share återkallad, klienter stoppade, migrationskonto NOLOGIN utan
medlemskap och utgånget lösenord. Tabellägare är forena_probe_migrator.
Data API är fortsatt avstängt och kommande previewförval har crash=false.
Alla tre Vault-värden är neutraliserade och verifierade som ofarliga markörer.

Radrensning blockerad: tre städanrop returnerade Invalid or expired
requestState, inget uttryckligt säkerhetsavslag. Kvar finns 3 neutraliserade
Vault-poster, 2 förbrukade fault-rader, 10 HTTP-responser/transportkorrelationer
och 1 utgången inställning. [Exakt städ-SQL](../../scripts/probe/m22c-cleanup.sql)
är redo och ska verifieras innan dessa provnamn återanvänds. M22C:s tester är
godkända, men uppgiftens städning är inte avslutad.

Nästa självständiga uppgift är [M22D](tasks/m22d-bounded-registry.md), planerad
och inte delegerad/startad. Den kan börja lokalt när kodbasen mergats; nästa
molnprov måste först passera städgrinden. Last/anslutningar/kostnader och
produktionsmodell för scheduleråtkomst återstår i M22. Ordinarie Förena är
oförändrat och hostingvalet fortfarande öppet.


## M22D: begränsad worker-materialisering

Bas `ad9ac0b` (PR #102 mergad), branch `test/bounded-registry`.
[Rapport](m22-registry-results.md), [evidens](evidence/m22d-bounded-registry.json)
och [uppgift](tasks/m22d-bounded-registry.md).

Workern använder nu ett exakt-ID-read-scope via Moduliths publika repository-
SPI; Modulith äger fortfarande alla claims/statusskrivningar. Låsta versioner
behålls. Per batch om två: en kandidatläsning/två resultatrader och två exakta
publiceringsläsningar/två resultatrader, två deserialiseringar både med 100 och
10 000 extra registry-poster. Lokala tider 228/277 ms är observationer, inte SLA.
SQL-scan/sort är fortfarande köberoende; manuellt provåtertag och bibliotekets
shutdown-diagnostik är obegränsade. Egen read-timeout två sekunder är verifierad
mot låst tabell och återanvändning av poolen, inte en hård totaldeadline.

Verifierat: 36 JUnit-/PostgreSQL-tester, struktur/modultest, två riktiga worker-
krascher före effekt/efter commit samt tre två-JVM-workeromgångar med 10 000
färska registerposter kvar. Alla slutade med en effekt/kvittens och backloggen
orörd. Även äldre lifecyclebaslinje, 1 065 frontendtester/typecheck/lint/build,
sex Pythonregressioner och offlinebeviskontroll godkända. CI kör samma utökade
processprov. Inget nytt molnprov eller ändrat applikationsschema i denna uppgift.

M22C:s dokumenterade rensningshinder kvarstår utan ny molnverifiering; lokal
DB-container är raderad. Nästa självständiga uppgift är
[M22E](tasks/m22e-load-cost.md): last/anslutningar och kostnadsbild före hosting-
och schedulerbeslut. Hostingvalet är fortsatt öppet; ordinarie Förena oförändrat.


## M22E: last, anslutningar och kostnad för en förening

Bas `a9ca451` (PR #103 mergad), branch `test/load-cost`.
[Rapport](m22-load-cost-results.md), [kalkyl](m22-costs.md),
[lokala mätningar](evidence/m22e-local-capacity.json),
[reproducerbar budget](evidence/m22e-costs.json) och [städbevis](evidence/m22e-cleanup.json).
Användaren valde enstaka förening först; Supabase Cron är huvudspåret och
kräver inte Vercel Pro. Inga betalplaner eller produktionsresurser ändrade.

Reproducerbart prov med två riktiga JVM:er: 1 000/10 000/100 000 registry-poster,
EXPLAIN/BUFFERS, 40 korta leveranser med en/två workers, 1,5 s-lyssnare, tvåsekunders
read-timeout, fyra anslutningar fyllda av åtta konkurrerande skrivningar samt
överbudgeterad lyssnare. En slutlig databaseffekt/kvittens per genomförd körning;
extra försök med två workers är observerade. P95 och RSS är lokala små stickprov,
inte molngarantier. Ingen app-/schemaversion ändrad, ingen ny molnlast.

Mätt dränering vid täta anrop är inte cronkapacitet: batch två/minut behöver
minst 50 minuter för 100 poster efter stale-väntan. Det föreslagna pilotmålet
är fem minuter efter stale-gränsen. SQL-scan/sort, pool-/instansbudget och
fördröjda/felande poster behöver fortsatt arbete i [M22F](tasks/m22f-recovery-capacity.md).
Vercel-beta/planvillkor, två samtidiga moln-JVM:er, pg_net-tillit och driftgrindar
ligger i [M22G](tasks/m22g-vercel-pilot-gates.md). Ingen av dem är startad/delegerad.

Kostnadsinriktning: prod cirka 25–30 USD/månad med Supabase Pro/Micro och
Vercel Hobby om villkor/kvoter passar; 45–50 med ett Pro-team. Ständigt aktiv
betald test-Micro tillför cirka 9,6 USD på orgnivå; lokal dev är grundmodellen.
Avgifter/krediter delas per org/team, inte per miljö. Reserv är egen budget,
mejl/AI/domän/add-ons tillkommer. Hobby har liten CPU-marginal i lastantagandet;
kalla teststarter kan överskrida kvoten. Inget nytt abonnemang valt.

M22C:s tidigare rensningshinder är **avslutat**: exakt städ-SQL lyckades;
oberoende kontroll 2026-10-18 21:09:10 UTC visar noll provjobb, kö-/Vault-/fault-/
calls-/settings-/responseposter och oavslutade publiceringar. Historiska M22C-
rapporter/bevis har kvar sina dåvarande observationer med tydlig senare uppföljning.

Lokalt 36 JUnit-/PostgreSQL-tester inklusive struktur/modultest, full kapacitets-
matris, 1 065 frontendtester/typecheck/lint/build, sex Pythonregressioner och
offlinebeviskontroll godkända. CI kör även --quick-kapacitetsvariant och verifierar
kostnadsreproduktionen samt behåller tidigare krasch-/DB-/frontendkontroller.
Ordinarie Förena fortsätter; produktionshosting/pilot är inte aktiverade.

## M22F: begränsad dränering och beständig turordning

Bas `a3ff203` (PR #104 mergad), branch `test/recovery-capacity`.
[Rapport och överlämning](m22-recovery-results.md),
[uppgift](tasks/m22f-recovery-capacity.md),
[krasch-/konkurrensbevis](evidence/m22f-lifecycle.json) och
[timeout-/pool-/SQL-regressioner](evidence/m22f-regressions.json).

Workern läser nu flera små sidor per request, högst 64 starter/256 kandidater
inom mjuk budget. En privat, beständig CAS-markör låter senare kandidater
passera långa ködelar av uppskjutna/felande poster. Modulith äger fortfarande
claims och leveransstatus; ingen parallell outbox eller egen statusskrivning.
Liquibase probe-003-worker-cursor körs separat före ny runtime. Testerna täcker
tom databas, föregående schema med data, förnyad migrering och begränsade grants.

44 JUnit-/PostgreSQL-tester inklusive struktur/modultest godkända, liksom
båda riktiga worker-krascherna och tre två-JVM-omgångar med 10 000 färska
poster kvar. Även timeout, fyra mättade poolanslutningar/åtta skrivningar,
för lång/felande/stillastående lyssnare, 1 065 frontendtester/typecheck/lint/build,
sex Pythonregressioner, offlinebevis och oförändrad kostnadsreproduktion godkända.
Minutprovet klarade 100 korta leveranser på 186,03 s från start, cirka
187,62 s efter stale-gränsen, trots missad tick och 300 blockerande poster.
[Sanerat minutbevis](evidence/m22f-cadence.json) och rapport anger mätgränser.
Supabase CLI saknas lokalt; dess reset/test db är inte körda lokalt.

Aktuellt användarbeslut: Vercel + Supabase är arbetsinriktningen. Google Cloud-
kopplingar utvärderas först vid dokumenterat konkret hinder i denna lösning.
M08/M12/M18C är vilande, inte pilotberoenden. Tidigare statusavsnitts öppna
hostingval och GCP-ordning beskriver historiska skeden och ersätts av ADR-009.
Inga molnjobb, betalplaner, produktionsdata eller befintlig frontend ändrade.
Nästa beroende uppgift är M22G:s isolerade Vercel/Supabase-prov och driftgrindar
på mergad M22F-kod; ingen separat session eller GitHub Issue har startats.
