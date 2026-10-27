# Närvaroregistrering

- Status: Redo
- Senast uppdaterad: 2026-10-27
- Berörda dokument: [Designregler](../design-spec.md),
  [arkitektur](../architecture.md), [säkerhetsarkitektur](../security-architecture.md),
  [funktionell likvärdighet](../migration/feature-parity.md)
- Implementation och verifiering: Implementerad i React/Kotlin. Se verifieringsmatrisen nedan.

## Problem och mål

Ta fram en featurespec för närvaroregistrering med befintlig funktionalitet
som underlag. Ledare ska kunna registrera vilka som faktiskt deltog i en
aktivitet. Leveransens exakta omfattning fastställs genom intervjun.

## Omfattning

### Ingår

Registrering, korrigering och ändringshistorik per aktivitet i React/Kotlin,
med befintlig Next-funktionalitet som grund och uttryckliga förbättringar
enligt kraven nedan. Närvarodata ska fortsatt kunna användas av kalenderns
beslutade närvaromarkeringar.

### Ingår inte

Statistik över flera aktiviteter, export och rapportering till externa
bidragssystem ingår inte. Självregistrering och skapande av helt nya personer
ingår inte i det beslutade ledarflödet.

## Användare, roller och flöden

1. Ledaren med `attendance.manage` för aktivitetens lag öppnar närvaro från
   aktivitetens start, läser personurvalet och eventuell befintlig rapport.
2. Ledaren söker, filtrerar och markerar närvarande personer, med möjlighet
   att använda snabbval och lägga till befintliga medlemmar enligt K-007.
3. Ledaren sparar hela rapporten. Vid 0 närvarande krävs extra bekräftelse.
4. Rapporten kan återöppnas och korrigeras utan fast tidsgräns. Historiken
   visar vem som sparat, när och vilka personers närvaro som ändrats.
5. Konflikter och sparfel stoppar överskrivning och behåller egna val.
   Inställda aktiviteter kan endast visa befintlig rapport i läsläge.

## Befintligt underlag

Läst i källkod och dokumentation 2026-10-26, inte verifierat genom körning:

- Next har `AttendanceModal`, nåbar från aktivitetsdialogen för användare med
  `attendance.manage` för aktivitetens lag. Rapportering erbjuds från starttid;
  efter sluttid heter åtgärden ”Justera närvaro”. Inställda aktiviteter saknar
  närvaroåtgärd i aktivitetsdialogen.
- Personen markeras med kryssruta. Det finns sökning, filtren Alla/Närvarande/
  Ej närvarande, snabbval för roller och lagundergrupper samt knappen
  ”Lägg till alla anmälda”. Kallelsesvar visas separat på personraderna.
- Sammanfattningen visar närvarande, ej närvarande och ledare på plats.
  Ett befintligt rapporttillfälle visas med information om att det kan justeras.
- Sökning och filtrering ändrar endast synliga rader. Sparandet skickar hela
  närvarourvalet, även personer dolda av sökning/filter.
- Listan byggs i nuvarande API av lagmedlemskap för deltagare/ledare utan
  slutdatum samt aktivitetens inbjudna personer. Kallelsens aktivitetsroll
  används före medlemsrollen. Det är inte ett fullständigt datumgiltigt urval.
- API:t kräver inloggning och `attendance.manage`. Sparande före starttid nekas.
  Personer utanför tillåtet urval nekas. En tom lista kan sparas som rapport.
- Sparandet ersätter hela närvarourvalet och uppdaterar rapportör/tidpunkt.
  Rapport och närvaroposter skrivs i flera separata operationer; atomaritet
  och skydd mot samtidiga ändringar behöver utredas inför implementation.
- UI:t döljer rapportering för inställda aktiviteter, men granskat API
  kontrollerar inte inställningsstatus. Detta är en skillnad mellan UI och
  serverkontroll, inte ett föreslaget produktbeteende.
- Migreringsmatrisen anger att närvaro återstår i React/Kotlin. Ingen
  motsvarande närvaroimplementation hittades i de granskade backend-/frontendfilerna.

Källor: `src/components/attendance-modal.tsx`, dess tester,
`src/components/person-selection-list.tsx`,
`src/components/activity-detail-modal.tsx`,
`src/app/api/activities/[activityId]/attendance/route.ts` och dokumenten ovan.

## Krav

- K-001: Faktisk närvaro ska registreras av ledare, enligt användarens
  tidigare bekräftade beslut. Behörighet styrs av K-012.
- K-002: Saknad närvaroregistrering ska betyda okänd närvaro och får inte
  tolkas som bekräftad frånvaro. Anmälan och faktisk närvaro är skilda uppgifter,
  enligt tidigare bekräftade beslut i kalenderdialogen.
- K-003: React/Kotlin-versionen ska motsvara Next-flödets befintliga
  närvarofunktionalitet, med uttryckliga ändringar fastställda genom intervjun.
  Återanvänd befintliga produktionskomponenter och arbetsflöden enligt AGENTS.md.
  Detta omfattar sökning, Alla/Närvarande/Ej närvarande, roll- och
  undergruppssnabbval, ”Lägg till alla anmälda”, separata kallelsesvar och
  summering av närvarande, ej närvarande och ledare på plats. Filtrering får
  inte rensa dolda val; hela rapportens urval ska sparas. Före första sparande
  är omarkerade personer fortfarande okända enligt K-002 och K-004.
- K-004: ”Spara närvaro” ska bekräfta att hela rapportens personurval är
  genomgånget. Markerade personer blir registrerat närvarande; övriga personer
  i rapportens urval blir registrerat frånvarande. Före en sparad rapport är
  närvaron okänd. Delvis bedömd närvaro efter sparande ingår inte i detta flöde.
- K-005: En sparad närvarorapport ska kunna återöppnas och korrigeras av
  behörig ledare utan fast tidsgräns efter aktiviteten. Ändringshistorik
  ska finnas enligt K-011.

- K-006: Närvarons personurval ska utgå från deltagare och ledare vars
  lagmedlemskap gäller på aktivitetens datum, kompletterat med aktivitetens
  kallade personer, inklusive gäster, oavsett kallelsesvar. En person som
  senare slutat ska finnas kvar vid efterregistrering. En person som började
  efter aktiviteten ska inte automatiskt ingå i dess historiska personurval.
  Samma person ska förekomma en gång även om flera urvalsvägar gäller.

- K-007: Ledaren ska i närvaroflödet kunna välja och lägga till en befintlig
  person utanför lag-/kallelseurvalet, under förutsättning att personen är
  medlem i både samma klubb och samma sektion som aktivitetens lag.
  Detta registrerar deltagande på just aktiviteten utan att skapa
  lagmedlemskap eller ändra kallelsesvar. Denna funktion ska inte skapa en
  helt ny person eller tillåta tillägg från annan klubb eller sektion.

- K-008: Närvaro ska kunna registreras tidigast vid aktivitetens starttid,
  även innan aktiviteten avslutats. Före start ska sparande nekas även vid
  direkt serveranrop. Rapportering och korrigering ska sakna fast tidsgräns
  efter aktiviteten. Vid varje sparande ska användarens aktuella
  närvarobehörighet för aktivitetens faktiska lag kontrolleras på servern.

- K-009: Om rapporten har ändrats sedan ledaren läste in den ska sparandet
  stoppas med en tydlig konfliktvarning. Ingen annan ledares ändringar får
  skrivas över. Den egna redigeringen ska behållas för avstämning; ledaren
  ska kunna läsa in senaste rapporten och stämma av före ett nytt sparande.
  Regeln gäller även om två ledare försöker skapa den första rapporten samtidigt.

- K-010: Inställda aktiviteter ska vara spärrade för både ny
  närvaroregistrering och korrigering, även vid direkt serveranrop. Om en
  rapport redan finns när aktiviteten ställs in ska rapporten behållas som
  historik och visas tydligt tillsammans med aktivitetens status ”Inställd”.

- K-011: Behöriga ledare ska kunna se närvarorapportens ändringshistorik:
  vem som sparade, när det skedde och vilka personers närvaro som ändrades.
  Tidigare ändringar ska bevaras vid korrigering. Att skriva en motivering
  ska inte vara obligatoriskt.

- K-012: `attendance.manage` för aktivitetens faktiska lag ska krävas för
  att läsa närvarolistan, registrera, korrigera och se ändringshistoriken.
  Kontrollen ska ske på servern för läsning och skrivning. En kallelse med
  ledarroll på aktiviteten ska inte i sig ge närvarobehörighet.

- K-013: Närvarorapport, personurval, närvaroposter och ändringshistorik ska
  sparas tillsammans som en atomär ändring. Vid misslyckande ska tidigare
  rapport och historik förbli helt oförändrade; en första rapport får inte
  lämnas delvis skapad. Dialogen ska visa fel och behålla ledarens val för
  återförsök, med fortsatt behörighets- och konfliktkontroll enligt K-008–K-009.

- K-014: Ledaren ska kunna spara en rapport med 0 närvarande, efter extra
  bekräftelse med texten ”Du rapporterar 0 närvarande. Alla i listan
  registreras som frånvarande.” Efter bekräftat och lyckat sparande är
  rapporten registrerad och alla personer i rapportens urval frånvarande;
  detta får inte förväxlas med en aktivitet utan närvarorapport.

- K-015: Leveransen ska omfatta registrering, korrigering och historik per
  aktivitet. Statistik över flera aktiviteter, export och externa bidragssystem
  ingår inte. Närvarodata ska fortsatt kunna användas av kalenderns beslutade
  markeringar för närvarande, frånvarande och okänd närvaro.

## Data, integrationer och kvalitetskrav

Befintligt stöd använder aktivitet, lag, person, medlemskap, kallelse,
närvarorapport med rapportör/tidpunkt och poster för närvarande personer.
Datumgiltighet, läs-/skrivbehörighet, atomärt sparande och samtidiga ändringar
ska följa K-006–K-013. Tekniska kontrakt inventeras vid implementation.
Implementation beställd 2026-10-27. Ingen ny extern integration ingår.

## Acceptanskriterier

- AK-001 (K-001): Givet en behörig ledare, när faktisk närvaro registreras
  för en aktivitet, ska rapporten kunna läsas tillbaka som faktisk närvaro.
- AK-002 (K-002): Givet en aktivitet utan närvaroregistrering, när dess
  närvarostatus visas, ska status vara okänd; ett ja-svar på en kallelse får
  inte i sig innebära registrerad närvaro.

- AK-003 (K-003): I React/Kotlin ska ledaren kunna öppna närvaroflödet från
  aktiviteten, söka/filtrera personer, använda befintliga snabbval, markera
  närvarande, spara och återöppna för korrigering. Avvikelser från Next ska
  motsvara uttryckliga beslut i denna spec.

- AK-004 (K-002, K-004): Givet ett personurval med A och B och ingen sparad
  rapport ska bådas närvaro vara okänd. När ledaren markerar A och sparar ska
  A vara registrerat närvarande och B registrerat frånvarande. Kallelsesvaren
  ska förbli oförändrade.
- AK-005 (K-005): Givet en sparad rapport, när en behörig ledare öppnar den,
  ändrar närvarourvalet och sparar, ska de korrigerade uppgifterna kunna läsas
  tillbaka även långt efter aktiviteten. Ändringen ska ingå i historiken enligt K-011.

- AK-006 (K-006): Givet att A tillhörde laget på aktivitetsdatumet men
  senare slutat, B började efter aktiviteten och C är kallad gäst, när
  närvarolistan öppnas i efterhand ska A och C ingå men inte B enbart på
  grund av sitt nya medlemskap. Ett nej-svar får inte ta bort C ur listan.
- AK-007 (K-006): Givet en person som både tillhör laget på aktivitetsdatumet
  och är kallad, när listan öppnas, ska personen visas en gång.

- AK-008 (K-007): Givet en befintlig medlem i samma klubb och sektion som
  aktivitetens lag, men utan lagmedlemskap på aktivitetsdatumet eller kallelse,
  ska behörig ledare kunna lägga till personen och registrera dennes närvaro.
  Inget lagmedlemskap ska skapas och inga kallelsesvar ska ändras.
- AK-009 (K-007): En person i en annan klubb eller i en annan sektion inom
  samma klubb ska inte kunna läggas till via tilläggsfunktionen, även vid
  direkt serveranrop. Regeln ändrar inte urvalet av redan kallade gäster i K-006.

- AK-010 (K-008): Före aktivitetens starttid ska sparande nekas även vid
  direkt serveranrop. Vid starttiden och efteråt ska en behörig ledare kunna
  spara rapporten, även om aktiviteten ännu inte avslutats.
- AK-011 (K-005, K-008): Givet en gammal aktivitet och aktuell
  närvarobehörighet för dess lag ska ledaren kunna registrera eller korrigera
  närvaro utan åldersbaserad tidsgräns. Om behörigheten återkallats efter
  öppning av dialogen ska sparandet nekas utan ändring av rapporten.

- AK-012 (K-009): Givet att två ledare öppnat samma rapport och A sparat
  ändringar, när B försöker spara sin äldre version ska sparandet stoppas med
  konfliktvarning. A:s uppgifter ska bestå och B:s redigering behållas för
  avstämning mot senaste rapporten före ett nytt sparande.
- AK-013 (K-009): Givet att två ledare öppnat en aktivitet utan rapport,
  när den ena skapar rapporten ska den andras sparande från samma ursprungsläge
  upptäcka konflikten och inte skriva över den nya rapporten.

- AK-014 (K-010): Givet en inställd aktivitet ska både skapande och
  korrigering av närvarorapport nekas på servern utan ändring av närvarodata,
  även om dialogen öppnades innan aktiviteten ställdes in.
- AK-015 (K-010): Givet en rapporterad aktivitet, när aktiviteten ställs
  in, ska befintlig rapport finnas kvar som historik och visas tillsammans
  med statusen ”Inställd”, utan möjlighet att redigera rapporten.

- AK-016 (K-011): Givet en sparad rapport, när en behörig ledare ändrar
  A:s närvaro och sparar utan motivering, ska sparandet lyckas och historiken
  visa ledaren, tidpunkten och att A:s närvaro ändrades. Tidigare historik
  ska finnas kvar och vara tillgänglig för behöriga ledare.

- AK-017 (K-012): Givet `attendance.manage` för lag A men inte lag B ska
  användaren kunna läsa och hantera närvaro samt läsa historik för A:s
  aktiviteter, men nekas motsvarande åtkomst till B:s aktiviteter även via
  direkt serveranrop. Personurval och historik för B får inte lämnas ut.
- AK-018 (K-012): Givet en användare kallad som ledare men utan
  `attendance.manage` för aktivitetens lag ska närvarolista, skrivning och
  ändringshistorik nekas även om aktivitetens övriga uppgifter kan läsas.

- AK-019 (K-013): Givet en sparad rapport, när ett fel inträffar under
  sparandet, ska hela den tidigare rapporten och historiken bestå. Ledarens
  osparade val ska finnas kvar i dialogen tillsammans med felmeddelande och
  möjlighet till återförsök; ingen del av ändringen får ha sparats separat.
- AK-020 (K-013, K-002): Givet en aktivitet utan rapport, när det första
  sparandet misslyckas, ska ingen delvis skapad rapport eller historik finnas.
  Närvaron ska fortsatt vara okänd och de osparade valen behållas för återförsök.

- AK-021 (K-014, K-004): Givet ett personurval och inga markerade personer,
  när ledaren väljer ”Spara närvaro” ska bekräftelsen för 0 närvarande visas.
  Om ledaren bekräftar och sparandet lyckas ska en registrerad rapport med
  0 närvarande finnas och alla i urvalet vara registrerat frånvarande.
- AK-022 (K-014): Om ledaren avbryter bekräftelsen för 0 närvarande ska
  varken rapporten eller ändringshistoriken ändras. Dialogens val ska behållas.

- AK-023 (K-015, K-002, K-004): En aktivitet utan rapport ska kunna
  särskiljas från en rapport med registrerad närvaro/frånvaro i kalenderns
  närvarounderlag. Kallelsesvar får inte ersätta faktisk närvaro.

## Implementation och verifiering

Integrerad med kalendervyn på aktuell `main` inför PR 2026-10-27. Migration 019
utökar befintliga `attendance_report`/`attendance_record` utan att ändra
kalenderns migration 018. Befintlig närvaro, rapportör och rapporttid bevaras;
en importerad baslinjehistorik visar de uppgifter som faktiskt är kända.
Kalenderns statusord bevaras. Närvarospecens fullständiga ledarurval ersätter
kalenderadapterns tidigare begränsning till endast lagmedlemmar utan
`invitation.manage`; ingen rätt att ändra kallelsesvar införs.

Implementation beställd 2026-10-27. Produktkravens status är fortsatt `Redo`.

- [AttendanceService](../../backend/src/main/kotlin/se/forena/api/activities/AttendanceService.kt)
  äger behörighet, aktivitetslås, versionskontroll och hela transaktionen.
- [Migration 019](../../backend/src/main/resources/db/attendance.sql) lagrar
  rapport, bedömt personurval, närvaro och ändringshistorik. Inga nya triggers,
  databasfunktioner eller klientgrants införs. Befintliga installationer
  uppgraderas med Liquibase; ingen återställning av extern databas behövs.
- [AttendanceModal](../../src/components/attendance-modal.tsx) delas mellan
  apparna. React använder kontobunden transport och versionshanterat API.
  Next behåller sitt äldre serverkontrakt. De beslutade serverreglerna införs
  i Kotlin; detta ändrar inte Next-serverns äldre databasflöde.
- Historiskt grundurval använder medlemskapets start-/slutdatum, även när
  medlemskapet senare har inaktiverats. En sparad rapports bedömda personurval
  bevaras vid korrigering. Explicita tillägg verifieras på nytt vid sparande.
  Sektionsmedlemskap härleds från ett aktuellt lagmedlemskap i samma sektion;
  klubbgränsen följer personens och lagets organisation.
- Den personliga översiktens `attendance` följer kalenderns befintliga kontrakt:
  `unknown` för okänd närvaro, `present` för närvaro och `absent` för frånvaro. Uppgiften lämnas
  bara för personer användaren redan får företräda; den lämnar inte ut
  ledarens närvarolista eller historik.

| Acceptanskriterier (krav) | Implementation och verifiering |
| --- | --- |
| AK-001 (K-001) | Implementerat. HTTP-prov sparar och läser faktisk närvaro. |
| AK-002 (K-002) | Implementerat. Orapporterat personurval och personlig närvarostatus är okända, oberoende av kallelsesvar. |
| AK-003 (K-003) | Implementerat. Gemensam dialog med sökning, filter, roll-/undergruppssnabbval, anmälda och summering; browserprov i båda apparna. |
| AK-004 (K-002, K-004) | Implementerat. Hela urvalet bedöms; HTTP-prov verifierar närvarande/frånvarande och oförändrade kallelsesvar. |
| AK-005 (K-005) | Implementerat. HTTP-prov korrigerar tio år gammal aktivitet och läser historiken. |
| AK-006 (K-006) | Implementerat. HTTP-prov täcker avslutat/inaktiverat medlemskap, senare start och nekande gäst. |
| AK-007 (K-006) | Implementerat. Samma person i medlemskap och kallelse dedupliceras i HTTP-provet. |
| AK-008 (K-007) | Implementerat. HTTP-prov lägger till medlem från annat lag i samma sektion utan nytt medlemskap eller kallelsesvar. |
| AK-009 (K-007) | Implementerat. HTTP-prov nekar främmande klubb och person utanför sektionen. |
| AK-010 (K-008) | Implementerat. HTTP-prov nekar före start och tillåter vid/passerad start under pågående aktivitet. |
| AK-011 (K-005, K-008) | Implementerat. HTTP-prov täcker gammal aktivitet samt återkallad rättighet, även efter väntan på aktivitetslås. |
| AK-012 (K-009) | Implementerat. Konkurrerande korrigeringar ger en lyckad skrivning och en 409; dialogen behåller utkast för avstämning. |
| AK-013 (K-009) | Implementerat. Samma konkurrensprov omfattar två första rapporter med revision 0. |
| AK-014 (K-010) | Implementerat. HTTP-prov nekar inställd aktivitet, även när inställningen sker under väntan på lås. |
| AK-015 (K-010) | Implementerat. Rapport/historik bevaras och inställd aktivitet visas i låst dialog. |
| AK-016 (K-011) | Implementerat. HTTP-prov kontrollerar rapportör, ändrade personer och bevarade historikposter utan motivering. |
| AK-017 (K-012) | Implementerat. HTTP-prov verifierar lagavgränsad läs-/skrivrätt och nekad åtkomst utan rättighet. |
| AK-018 (K-012) | Implementerat. Kallad ledare utan separat rättighet nekas lista/historik och sparande. |
| AK-019 (K-013) | Implementerat. Injicerat databasfel vid historikskrivning återställer befintlig rapport, personposter och historik. UI-prov bevarar utkast vid sparfel. |
| AK-020 (K-013, K-002) | Implementerat. Samma felprov lämnar första rapport och historik helt oskapade. |
| AK-021 (K-014, K-004) | Implementerat. Nollbekräftelsen och registrerad rapport med samtliga frånvarande kontrolleras i UI-/HTTP-prov. |
| AK-022 (K-014) | Implementerat. UI-prov avbryter nollbekräftelsen utan skrivning och med oförändrade val. |
| AK-023 (K-015, K-002, K-004) | Implementerat. Personligt HTTP-underlag och frontendadapter skiljer `unknown`, `present` och `absent` utan att ändra kallelsesvar. |

Verifieringskällor:
[API-integration](../../backend/src/test/kotlin/se/forena/api/ApiTest.kt),
[migrationsprov](../../backend/src/test/kotlin/se/forena/api/MigrationTest.kt),
[dialogprov](../../src/components/attendance-modal.test.tsx),
[transportprov](../../frontend/src/api.test.ts),
[kalenderunderlag](../../frontend/src/personal-overview.test.ts) och
[browserprov](../../scripts/migration/attendance-browser.mjs).
Browserprovet jämför riktiga produktionskomponenter i 320, 375, 390, 768 och
1280 px och provar React-ingången med uttryckligen mockade HTTP-svar.
API-proven använder verklig Spring-server och lokal PostgreSQL-testcontainer.
Verifierat 2026-10-27:

- `npm test`: 1 195 godkända tester i 140 testfiler efter integration med
  kalendervyn på aktuell `main`.
- `npm run typecheck`, `npm run lint` och `npm run frontend:build`: godkända.
- `npm run build`: godkänt Next-produktionsbygge även efter den sista
  kompatibilitetsrättningen.
- `cd backend && ./mvnw verify`: 143 godkända tester, 3 befintliga browserprov
  överhoppade eftersom deras uttryckliga browserinställning inte aktiverats.
  Samtliga 19 migrationsbaslinjer är godkända. Alla närvarons API-prov kördes.
- `cd backend/contract && npm run generate`: OpenAPI exporterat från den verkliga
  Spring-servern och TypeScript genererat från exporten.
- `node scripts/migration/attendance-browser.mjs` (med lokala browser-/appadresser):
  godkänt i samtliga fem bredder, med strikt bildjämförelse, tangentbord,
  rullbredd, konflikter, historik och fel. Separat browserprov av Reacts
  aktivitetsingång/HTTP-transport med mockade svar är godkänt. Även befintliga
  navigations-/sessionsprov och `ui-parity-browser.mjs` är godkända. Närvaroprovet
  körs nu i CI och dess skärmbilder sparas som artefakt.
- `python3 -m unittest discover -s scripts/deploy -p 'test_*.py'`: 39 godkända tester.
- Databasverifieringen använder lokala PostgreSQL-testcontainrar och Liquibase.
  Next/Supabase-schemat ändras inte och ingen extern databas återställs.

## Bekräftade beslut och motiv

- 2026-10-27: Användaren beställde implementation av den sparade närvarospecen.

- 2026-10-26, svar 13: Användaren bekräftade slutlig sammanfattning och
  avgränsningar med ”ja”. Specen är Redo; implementation har inte beställts.
- 2026-10-26, svar 12: Avgränsning till registrering, korrigering och
  historik per aktivitet accepterades. Statistik, export och externa
  bidragssystem lämnas till separata funktioner; kalenderns närvarounderlag
  ska fortsatt kunna använda uppgifterna.
- 2026-10-26, svar 11: Rapport med 0 närvarande accepterades med extra
  bekräftelse. Lyckat sparande betyder rapporterad närvaro med alla i
  personurvalet frånvarande, inte okänd eller saknad rapport.
- 2026-10-26, svar 10: Misslyckat sparande ska lämna tidigare rapport
  oförändrad och behålla ledarens val för återförsök. Närvaro och historik
  ska sparas tillsammans så att en halv rapport inte kan uppstå.
- 2026-10-26, svar 9: `attendance.manage` för aktivitetens lag ska krävas
  för läsning, registrering, korrigering och historik. Att vara kallad med
  ledarroll ger inte i sig denna behörighet.
- 2026-10-26, svar 8: Ändringshistorik för behöriga ledare accepterades,
  med vem som sparade, när och vilka personers närvaro som ändrats.
  Motivering ska inte vara obligatorisk.
- 2026-10-26, svar 7: Inställda aktiviteter spärras för ny rapport och
  korrigering även på servern. Befintlig rapport behålls som historik och
  visas tydligt tillsammans med statusen ”Inställd”.
- 2026-10-26, svar 6: Användaren accepterade konfliktvarning och stoppat
  sparande om en annan ledare hunnit ändra rapporten. Egen redigering behålls
  för avstämning mot senaste rapporten innan nytt sparande.
- 2026-10-26, svar 5: Registrering från aktivitetens start och korrigering
  utan fast tidsgräns accepterades. Aktuell närvarobehörighet för aktivitetens
  lag krävs vid varje sparande.
- 2026-10-26, svar 4: Tillägg av en befintlig person direkt i närvaroflödet
  accepterades, med begränsningen att personen är medlem i samma klubb och
  sektion. Tillägget ska avse just aktiviteten, utan nytt lagmedlemskap eller
  ändrat kallelsesvar.
- 2026-10-26, svar 3: Användaren accepterade datumgiltigt lagurval plus
  kallade personer inklusive gäster, oavsett svar. Historiska medlemmar
  behålls och senare tillkomna medlemmar läggs inte automatiskt till bakåt.
- 2026-10-26, svar 2: Användaren accepterade fullständig rapport vid
  ”Spara närvaro”: markerade närvarande, övriga inom rapportens personurval
  frånvarande, okänd närvaro före sparad rapport och möjlighet att rätta senare.
- 2026-10-26, svar 1: Användaren bekräftade motsvarande Next-funktionalitet
  i React/Kotlin som grund, med eventuella förbättringar beslutade i intervjun.
- 2026-10-26: Användaren beställde grill-me och en sparad spec med befintlig
  funktionalitet som utgångspunkt. Implementation har inte beställts.
- Tidigare kalenderdialog: ledare registrerar närvaro; saknad registrering
  är okänd och kallelsesvar ska hållas isär från faktisk närvaro.

## Obekräftade antaganden och förslag

Inga obekräftade produktförslag återstår. Tekniska lösningar väljs vid
implementation inom de beslutade kraven.

## Öppna frågor

Inga blockerande produktfrågor återstår från intervjun.

## Bekräftelse

Svar 1–13 är sparade. Användaren bekräftade slutlig sammanfattning och
avgränsningar 2026-10-26 med ”ja” i svar 13. Status är Redo.
Implementation beställd och genomförd 2026-10-27; se verifieringsmatrisen ovan.

## Ändringshistorik

- 2026-10-27: Integrerat med kalenderns migration 018 och bevarat befintliga
  rapporter via migration 019; verifierat uppgradering och aktiverat närvarons
  browserprov i CI inför PR mot aktuell `main`.

- 2026-10-27: Implementerat React/Kotlin-flödet, migration 019, gemensam dialog,
  personligt kalenderunderlag och verifieringsmatris.

- 2026-10-26: Slutlig sammanfattning och avgränsningar bekräftade i svar 13.
  Markerat specen Redo. Implementation är fortsatt ej påbörjad.
- 2026-10-26: Sparat svar 12 om avgränsning per aktivitet och fortsatt
  kalenderunderlag, med K-015 och AK-023. Sammanställt flöden inför bekräftelse.
- 2026-10-26: Sparat svar 11 om bekräftad rapport med 0 närvarande,
  med K-014 och AK-021–AK-022.
- 2026-10-26: Sparat svar 10 om atomärt sparande och bevarade val vid fel,
  med K-013 och AK-019–AK-020.
- 2026-10-26: Sparat svar 9 om lagavgränsad `attendance.manage` för
  läsning, skrivning och historik, med K-012 och AK-017–AK-018.
- 2026-10-26: Sparat svar 8 om synlig ändringshistorik utan obligatorisk
  motivering, med K-011 och AK-016.
- 2026-10-26: Sparat svar 7 om spärr för inställda aktiviteter och
  bevarande av befintlig rapport, med K-010 och AK-014–AK-015.
- 2026-10-26: Sparat svar 6 om skydd mot samtidiga överskrivningar,
  med K-009 och AK-012–AK-013.
- 2026-10-26: Sparat svar 5 om starttid, obegränsad korrigeringsperiod och
  aktuell serverkontrollerad behörighet, med K-008 och AK-010–AK-011.
- 2026-10-26: Sparat svar 4 om tillägg av befintlig medlem i samma klubb
  och sektion, med K-007 och AK-008–AK-009.
- 2026-10-26: Sparat svar 3 om datumgiltigt personurval och kallade gäster,
  med K-006 och AK-006–AK-007.
- 2026-10-26: Sparat svar 2 om fullständig rapport och senare korrigering,
  med K-004–K-005 och AK-004–AK-005.
- 2026-10-26: Sparat svar 1 om Next-funktionalitet i React/Kotlin som grund
  och uttryckliga förbättringar genom intervjun, med K-003.
- 2026-10-26: Skapat utkast från repots specmall, inventerat Next-flödet
  och dokumenterat tidigare bekräftade närvaroprinciper samt första vägvalet.
