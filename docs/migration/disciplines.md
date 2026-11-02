# Disciplinpaket i React/Kotlin

Implementation 2026-11-02 av [discipliner](../specs/discipliner.md) och
[fotboll](../specs/fotboll.md). Varje disciplin och återanvändbar capability
ligger i sitt eget Kotlinpaket inom samma Mavenprojekt och backendtjänst.

## Paket och utökningskontrakt

- `extensionapi`: `DisciplinePackage`, `DisciplineCatalog`,
  `DisciplineActivityLifecycle`, `DisciplineCapability`, `ActivityCapability`,
  `InformationContributor`, `InformationCapability`, `AttendanceOutcomeGuard`,
  `DisciplineBackgroundWork` och `ExtensionNotifier`.
- `disciplines.common`: allmän verksamhet utan fotbollsfält.
- `disciplines.football`: fotbollens fält, matchtillämplighet, validering,
  faktisk lagkapten och komposition av capabilities.
- `capabilities.targetteamsize`: önskad trupp, rena utvärderingsregler,
  kontrolltider, signaler och notifieringsförslag.
- `capabilities.greencard`: egen definition, närvarovalidering och färdigvillkor.
- `extensions`: register, katalog, versionsrefererade värden, gemensam
  informationsinhämtning, historik, rapport, signaler och beständigt bakgrundsarbete.
- `activities`: behörigt faktagränssnitt, tidsförval, deltagarkapacitet och närvaro.
- `notifications`: beständig leveranskö med privat Telegram och push.

Aktivitetskärnan importerar inga konkreta discipliner eller capabilities.
Utökningslagret läser kärnans fakta genom publika tjänster, utan åtkomst till
andra modulers interna repositories. `ArchitectureTest` verifierar dessa
gränser, Moduliths cykelregler och repositorykonventioner.

För ett nytt disciplinpaket:

1. Implementera `DisciplinePackage` i `disciplines/<nyckel>/` med stabil
   nyckel/version, fält, kodägda läs-/skrivregler och matchande aktivitetstyper.
2. Registrera komponenten med Spring och installera katalogposten med en
   Liquibase-migration, inklusive kategori och `code_owned=true`.
3. Komponera återanvändbara capabilities genom deras interfaces. Kärnan och
   den gemensamma runtime-koden behöver inga nya sportvillkor.
4. Behåll gamla implementationer som `selectable=false` när deras version
   fortfarande refereras av sparade värden eller informationsbidrag.
   Ändrad betydelse kräver explicit migration; okända versioner har ingen reserv.
5. Använd gemensamma produktionskomponenter för deklarativa fält och
   uppföljning. Eventuella nya specialeditorer och kodägda timingprofiler ska
   registreras i frontend och visas på `/components`.

Dynamisk tredjepartskod, egna processer och separata Mavenartefakter ingår inte.

## Katalog, arv och matchförval

Systemadministratören hanterar katalogdiscipliner och kategorier. Installerade
paket är skrivskyddade; databasen skyddar använda discipliner och kategorier
mot borttagning. Sektionens disciplin ärvs av samtliga lag och kan inte ändras
när befintligt disciplinlås gäller. En katalogdisciplin utan installerat paket
får gemensamma aktivitetsfunktioner och inga fotbollsregler som reserv.

`ActivityDefaultsService` tillämpar behörighet, revisioner och audit på
sektions-/lagförval. Sparsamma JSON-värden bevarar fältvis arv från disciplin
till sektion och lag. Tidsregler, valbara tidslistor, capabilityaktivering och
kontrolltider ärvs var för sig. `null` ärver, `false` stänger av notifiering och
`[]` ger inga notifieringskontroller. Truppkontrollens grundläge är av,
kontrolltiderna 72 och 24 förflutna timmar före start. Högst fem olika heltal
mellan 1 och 720 timmar tillåts.

Vid skapande sparas matchens egna planeringsvärden och aktiverade
notifieringsregler i samma transaktion. En framtida aktivitet som uttryckligen
byter från exempelvis träning till match initialiseras första gången den blir
tillämplig. Livscykelanropet innehåller både tidigare och ny aktivitetstyp.
Vid senare typbyten bevaras matchens sparade värden, revisioner, regler och
beständiga notifieringskontroller; ändrade lagförval ersätter dem inte. Senare ändrade förval skriver inte om
befintliga matcher. Flyttade matcher använder sina sparade kontrolltider.
Importerade, inställda och avslutade aktiviteter har skrivskyddad planering.

## Fält och läsåtkomst

`GET/PUT /api/discipline-fields` använder serverhärledd klubb, lag, person och
aktivitet. Kodägda fältregler filtrerar både definitioner och värden före svar.
Tröjnummer och positioner är läsbara för lagets aktuella spelare/målsmän genom
lagets spelaruppgifter; rosterbehöriga kan redigera dem. Kaptensplanering och
matchdeltagandets fält har separat kallelsebehörighet.

Eftermatchutfall och spelarhistorik kräver aktuellt ledarmedlemskap i matchens
lag. Enbart klubbadministration eller spelar-/målsmansåtkomst räcker inte.
Lagadmin kan ändra capabilityaktivering utan att därmed få tillgång till
interna utfall. Alla läsningar och kommandon verifierar åtkomst på servern.

## Matchuppföljning

`CaptainInformation` och `GreenCardCapability` bidrar med separata delar till
ett gemensamt formulär per aktivitet. Faktisk lagkapten är högst en och skiljs
från planerad kapten. Gröna kortet skiljer okänt, uttryckligen inget kort och
ett eller flera olika mottagar-ID:n. Båda bidragen använder endast faktiskt
närvarande deltagare för laget, inklusive inlånade spelare. Ja-svar räcker inte.

Sparad närvaro krävs. Delvisa svar bevaras och håller uppföljningen öppen.
Revisionskontroll skyddar mot samtidiga ändringar. Ändringshistoriken sparar
aktör, tid, föregående och nya värden samt verifierade spelarnamn.
`InformationCorrectionService` äger en transaktion för närvaro och berörda
utfall, med aktivitetslåset först. Stale revision eller valideringsfel återställer
båda delarna. En fristående närvarorättning får inte lämna utfall med ogiltiga
spelarreferenser. Importerade spelade matcher kan följas upp och rättas.

Beständiga jobb utlöses vid sluttiden och omplaneras vid ändringar. Förfrågningar
är unika per aktivitet och bidragsägare. Första privata notifieringen länkar till
rätt aktivitet och följer befintlig aktiverings-/mottagarpolicy, Telegram först,
push därefter. Köerna behandlas under `POST /internal/notifications/run`, inom
samma tidsbudget och en gemensam gräns på 50 leveransförsök för mejl och
tilläggsnotifieringar. Körningen växlar mellan köerna och redovisar
`processedExtensions` separat; leveransen kräver ingen bakgrundstimer efter
HTTP-svaret. Delvis besvarad uppföljning ger inga återkommande påminnelser.
Osäker Telegram-leverans återförsöks via nästa kanal utan att skicka om Telegram.

Gröna kortet är av som förval och justerbart för lagadmin. Avstängning stänger
endast öppna Gröna kortet-bidrag med orsak, även vid samtidig bakgrundskörning.
Kapten, sparade utfall och historik bevaras. Återaktivering gäller kommande
matcher och skapar inga historiska massutskick eller dubbletter. Manuell
historisk komplettering är möjlig. Inställning av matchen avslutar öppna bidrag.
Läsningen av en inställd match visar endast redan sparade bidrag och skapar
inga virtuella öppna förfrågningar.

Lagöversikten visar ofullständiga matcher som separata länkar. Rapporten visar
registrerade utfall per spelare, matcher/datum och täckning: besvarat, saknat
respektive avslutat. Registrerade delutfall räknas även när andra bidrag saknas.
Förvalet följer aktuellt lag och lagets årssäsong; om årssäsong saknas används
aktuellt kalenderår i klubbens tidszon. Äldre årssäsonger och egna lokala
datumintervall kan väljas. Ingen sammanställning mellan lag ingår.

## Truppsignaler och beständigt arbete

Kärnans dataadapter räknar kallade, ja och obesvarade spelare utifrån explicit
aktivitetsroll eller medlemskap på matchens lokala datum. Ledare undantas.
Capabilityn utvärderar verifierade fakta utan databasåtkomst.

Runtime låser aktiviteten, läser aktuella fakta och sparar resultat/checkpoint
samt notifieringsförslag atomärt. Endast närmast förfallna kontroll väljs;
beständiga checkpoints överlever rensning av leveranskön. Inga regler skapas
retroaktivt för befintliga matcher. Full trupp, saknat målantal, inga
spelarkallelser eller importerad/inställd/passerad aktivitet ger ingen notis.
Mottagare har både aktuell laganknytning och `invitation.manage`.

Signaler fungerar även utan notifieringsaktivering och har tillstånden aktiv,
avfärdad och löst. Återkomst ger ny episod och bevarad åtgärdshistorik.
Påminnelse granskas och kör befintligt behörighetskontrollerat kommando;
en ny föreslås tidigast efter en timme och före svarstid. Fler spelare öppnar
matchens befintliga kallelsehantering; faktiskt skapade kallelser auditeras.
Assistenten får samma behöriga strukturerade signaler, med uttrycklig markering
om läsningen är otillgänglig, och inget nytt skrivverktyg.

Indataändringar publiceras med Spring-händelsen `DisciplineInputsChanged`,
som synkront invaliderar aktivitetens enda beständiga revisionsplats i samma
transaktion. Även medlemskaps-/rollintegrationer använder denna publika händelse. Arbetaren behandlar högst 500 kontexter, i sidor om högst 100,
sparar nästa relevanta tid och fortsätter efter matcher utan notifieringsförslag.
Fel återförsöks med väntetid och markeras som misslyckade efter fem försök.
Leveransköer rensas i begränsade batcher efter sju dagar; checkpoints och
utfallshistorik bevaras. Schemats rättigheter följer Kotlinappens privata datalager.

## Deltagargräns

`maxParticipants` är ett valfritt positivt JSON-heltal på aktivitet/serie.
Tomt/null är obegränsat. `InvitationService` kontrollerar nya ja-svar under
samma aktivitetslås i alla kanaler. Platser räknas per deltagande person,
exklusive ledare. Sänkt gräns bevarar ja-svar och visar överbeläggning;
återtaget ja frigör plats. Ingen reservkö eller automatisk härledning ingår.
Gemensamma kort och detaljer visar platsantal, progressbar och spärrad ja-knapp.

## Kravspårning

| Krav och kriterier | Implementation och verifiering |
| --- | --- |
| K-001–K-006 / AK-001–AK-006 | Katalog, sektion/lagsarv, egenskaper, förval och runtime enligt migreringsbasen. `ApiTest`, pakettester och gemensamma produktionskomponenter. Jämförelser med innebandy/kör ger inga nya domänregler. |
| K-019–K-020 / AK-021–AK-022 | Versionerade objektankare, fältvis kodägd åtkomst och allmän spelarvy. API-prov för ägarskap, medlemsläsning, nekad skrivning och interna fält. |
| K-022, K-024–K-026, K-028 / AK-026, AK-028, AK-031 | Gemensamma versions-/revisionsbundna informationsbidrag, aktivitetslänkar, första privata utskick och deduplicering. Informations-API- och notifieringstester. |
| K-031, K-034–K-038 / AK-035–AK-037, AK-039–AK-042 | Kärnans kapacitetskontroll, samtidighet, idempotens, frigjord plats, sänkt/tömd gräns och strikt heltal. `ApiTest`, `activity-capacity.test.tsx` och svarskomponenternas tester. |
| K-033 / AK-038 | Två paket kan dela capabilityimplementation genom interface. `FootballDisciplineTest`, `CapabilityTest` och runtime-API-prov. |
| AK-047 | `ArchitectureTest`: Modulith och ArchUnit, inga sportimporter i kärna/runtime eller cykler/interna repositoryberoenden. |
| Fotboll K-007–K-010 / AK-007–AK-012 | Separat faktisk kapten och Gröna kortet med närvarovalidering, flera distinkta mottagare och okänt/inget/utdelat. Paket-/capability- och informationsprov. |
| K-011, K-041 / AK-013, AK-018, AK-045 | Intern spelarhistorik, aktuell årssäsong, äldre perioder, lokala datum, registrerade delutfall och täckning. Rapport-API och komponentprov. |
| K-012–K-017, K-042 / AK-014–AK-017, AK-019–AK-020, AK-046 | Sparad närvaro, gemensamma ledarsvar, revisionshistorik, importerade matcher och atomär närvaro-/utfallsrättning. `ApiTest` provar partiell inmatning, flera ledare, nekad åtkomst, stale revision och rollback. |
| K-018 | Inga spelarutvärderingar, resultat eller fria eftermatchanteckningar införs. |
| K-021, K-023, K-027, K-029–K-030, K-040 / AK-023–AK-025, AK-027, AK-029–AK-030, AK-032–AK-033, AK-044 | Kodägd justerbarhet, avstängt grundläge, livscykeljobb, avstängning med orsak, återaktivering och historikbevarande. Informations- och notifieringsprov. |
| K-008, K-032, K-039 / AK-008, AK-034, AK-043 | Lagets spelare/målsmän läser tröjnummer/position; aktuella ledare läser interna utfall. Administrativ aktivering medför inte intern läsåtkomst. API och gemensamma spelar-/uppföljningskomponenter. |

## Verifiering

- `npm test`: 1 237 tester godkända i 143 testfiler.
- `npm run typecheck` och `npm run lint`: godkända.
- `npm run build` och `npm run frontend:build`: godkända.
- Samlad `backend/mvnw -f backend/pom.xml verify`: 233 tester, inga fel,
  ett miljöstyrt WebAuthn-browserprov överhoppat (`FORENA_AUTH_BROWSER_TEST`).
  Alla 25 migrationsbaslinjer godkända i isolerad PostgreSQL, inklusive
  upprepad migrering, bevarade data och databasrättigheter.
- Efter slutgranskning av aktuell ledaråtkomst och versionsbevarande:
  ytterligare `verify` med `ApiTest`, `ArchitectureTest`, `FootballDisciplineTest`
  och `CapabilityTest`: 153 tester godkända, inga överhoppade.
- OpenAPI hämtat från riktig Spring-start och TypeScriptkontrakt regenererat.
  Upprepad generering ger identiskt kontrakt.
- `discipline-fields-browser.mjs` och `information-components-browser.mjs`:
  båda apparna vid 320, 390, 768 och 1280 px. Sparande, flera mottagare,
  partiell/fullständig uppföljning, närvarokrav, läsläge, konfliktutkast,
  signalåtgärder, rapport och sidbredd godkända.
- `information-browser.mjs`: riktig inloggning, Spring och PostgreSQL;
  sparade matchutfall och återläsning godkända på mobil och desktop.
  Även befintliga browserprov för aktiviteter/serier och administrationskedjan
  genom separata konton är godkända.

PR-rättningarna verifierar även att scheduler-anropet både skapar och levererar
uppföljning utan timer, att mejl- och notifieringsköerna delar leveransbudgeten,
att typbyte till match initialiserar förval en gång och bevarar sparade värden,
samt att en inställd match inte får virtuella öppna informationskrav.
Navigationsproven är kompletterade med disciplinernas API-svar och godkända
vid 320, 375, 390, 768 och 1280 px. Lokal UI-paritet är godkänd; det separata
närvarobildprovet visar en liten skuggavvikelse i systemets Chromium och
kontrolleras även i CI:s Playwright-webbläsare. Pixelgränsvärdena är oförändrade.

Skärmbilder från komponentproven finns i `/tmp/forena-information-evidence`
och `/tmp/forena-discipline-evidence`; fullflödesprovens evidens sparas i
`frontend/.evidence`. Det aktuella ledarprovet omfattar även en ledare som
anslutit efter matchen och saknar kallelse, samt nekad intern läsåtkomst för
administratör utan ledarmedlemskap.

Webbläsarproven använder dels komponentsidans isolerade exempeltransport i
båda apparna, dels riktig Spring och en isolerad PostgreSQL-instans för
sparande/återläsning av matchutfall. Externa Telegram-/pushtransporter provas
med testdubblar och etablerad leveranspolicy; ingen produktionsleverans eller
driftsatt miljö verifieras här. Befintliga Next-data importeras inte automatiskt
till Kotlinappens separata databas genom denna funktion.
