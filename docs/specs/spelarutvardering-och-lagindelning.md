# Spelarutvärdering och lagindelning

- Status: Redo
- Senast uppdaterad: 2026-11-03
- Berörda dokument: [Discipliner](discipliner.md), [Fotboll](fotboll.md),
  [Aktiviteter](hantera-aktiviteter.md), [Lagmedlemmar](hantera-trupp.md),
  [Roadmap](../roadmap.md), [Arkitektur](../architecture.md),
  [Säkerhetsarkitektur](../security-architecture.md)
- Implementation och verifiering: Implementerad lokalt i React/Kotlin 2026-11-03.
  Se kravspårning och verifieringsomfattning nedan. Specen är fortsatt Redo.

## Problem och mål

Laget ska kunna bedöma spelare utifrån egna mätpunkter på skalan 0–10 och
använda medelvärden per mätpunktstyp för att få förslag på lagindelning till
träningar utifrån svaren på kallelserna. Ledarna ska kunna välja mellan
jämnstarka lag och grupper efter förmåga. Syftet med förmågegruppering är
bland annat att spelare med lägre förmåga ska få fler möjligheter att röra
bollen när de tränar tillsammans. Betygen ska hjälpa ledarna att skapa bra
träningar. Funktionen ska vara återanvändbar mellan discipliner.

## Omfattning

### Ingår

- Lagets egna mätpunkter, exempelvis ambition, spelteknik, spelförståelse
  och styrka. Exemplen är inte beslutade standardfält.
- Spelarvärden som heltal på skalan 0–10; beräknade värden kan ha decimaler.
- Två mätpunktstyper med separat medelvärde: förmåga och utvecklingsindikator.
- Förslag till träningsindelning med kallelsesvaren som urvalsunderlag.
- Rapportvy över dagens fördelning utan krav på aktivitet, med valbart
  gruppantal för hela lagets aktuella spelartrupp.
- Val mellan jämnstarka lag och grupper efter förmåga.
- Återanvändbar funktion för andra discipliner.
- Mätpunkter som kan anges som utvecklingsindikatorer, separata från
  förmågevärdet och med ledarbeslut om eventuell uppflyttning.
- En återanvändbar capability med pluggbar aktivitetsvy och lagrapport,
  tillgängliga endast när funktionen är aktiverad för laget och användaren
  har rätt behörighet.

### Ingår inte

- Specintervjun beställde ingen implementation. Implementation beställdes
  separat 2026-11-03 och omfattar kraven i denna spec.
- Individuella vikter och fria formler i första versionen.
- Sparade gruppindelningar, godkännandeflöden och indelningshistorik.
- Manuella gruppflyttar i förslagsvyn; ledaren beslutar faktisk indelning på plats.
- Betygshistorik och utvecklingsdiagram; endast aktuella spelarvärden behövs.

## Undersökt nuläge

- Roadmapens avsnitt om spelarutveckling beskriver historiska bedömningar,
  separat synlighet och förslag på spelarkombinationer. Det är underlag;
  historik, radardiagram och pluginform är inte automatiskt krav här.
- Fotbollsspecens K-018 skjuter upp spelarbedömningar från den tidigare
  eftermatchutökningen. Denna spec gäller en separat framtida feature.
- Discipliner har gemensamma utökningskontrakt. Befintliga fotbollsfält i
  `src/disciplines/football/definition.ts` omfattar bland annat positioner
  och tröjnummer, men ingen bedömningsmodell eller lagindelningsformel.
- Kallelsesvar och faktisk närvaro är separata begrepp. Ett förslag inför
  träning innebär inte registrering av faktisk närvaro.

## Användare, roller och flöden

Övergripande målflöde från beställningen: definiera lagets mätpunkter,
registrera spelarvärden, ange mätpunktstyp och visa indelningsförslag
inför en träning utifrån kallelsesvaren. Ledarna är uttrycklig målgrupp och
ska kunna välja indelningssätt. Alla med lag-admin-behörighet för laget får
justera mätpunkter och hur de används. Ledare eller lagadmin får läsa och
ändra betyg och se gruppförslag. Varje spelare har gemensamma betyg inom
laget, inte separata betyg per bedömare. En separat rapportvy
ska visa dagens fördelning utan koppling till aktivitet. Träningsindelningen
visas för ledaren på plats så att grupperna kan ropas upp, utan att indelningen
sparas. Endast aktuella betyg lagras; någon betygshistorik behövs inte.

## Krav

- K-001: Varje lag ska kunna definiera sina egna mätpunkter för spelarutvärdering.
- K-002: En spelares värde för en mätpunkt ska anges inom skalan 0–10.
  Registrerade betyg ska vara heltal; beräknat förmågevärde kan ha decimaler.
  Saknade värden följer K-013.
- K-003: Alla med lag-admin-behörighet för laget ska kunna ange hur
  mätvärden används samt ändra lagets mätpunkter. Varje mätpunkt ska ha
  exakt en av typerna förmåga och utvecklingsindikator. Inom respektive typ
  väger alla mätpunkter lika. Förmågevärdet är summan av förmågebetygen
  delat med antalet förmågemätpunkter; utvecklingsvärdet beräknas på
  motsvarande sätt från indikatorbetygen. Individuella vikter och fria
  formler ingår inte i första versionen. Saknade underlag följer K-013.
- K-004: Systemet ska kunna föreslå lagindelning till en träning utifrån
  spelarvärden, beräknat förmågevärde och träningens kallelsesvar.
  Förvalet ska vara spelare som svarat ja. Ledaren ska kunna lägga till
  och ta bort spelare för indelningen utan att ändra kallelsesvar eller
  registrerad närvaro.
- K-005: Vid indelning ska ledaren kunna välja mellan jämnstarka lag och
  grupper efter förmåga. Nivåindelning för att hjälpa spelarna är huvudsyftet.
  Vid valet jämnstarka lag ska grupperna ha så lika genomsnittligt
  förmågevärde som möjligt och högst en spelares skillnad i storlek.
  Positioner och särskilda spelarkombinationer ingår inte i automatiken
  i första versionen.
- K-006: Funktionen ska vara återanvändbar mellan discipliner och inte kräva
  fotbollsspecifika mätpunkter eller regler för att kunna användas.
- K-007: Spelarutvärderingen ska vara ett stöd för ledarna att skapa bra
  träningar. I första versionen får lagets ledare eller lagadmin läsa betygen.
  Spelar- och vårdnadshavarroller ska inte i sig ge läsåtkomst.
  Detta preciserar den tidigare allmänna kommentaren om att betyg inte
  behöver vara hemliga. Lagadmin behöver inte dessutom ha en separat ledarroll.
- K-008: Varje spelare ska ha ett gemensamt betyg per mätpunkt inom laget,
  inte separata betyg per ledare att väga ihop. Endast aktuella värden
  behövs; tidigare betyg ska inte sparas som betygshistorik i denna feature.
- K-009: Antalet grupper ska kunna konfigureras. Två grupper samt tre eller
  fler ska stödjas, så att indelningen kan anpassas till lagets storlek.
  Lagadmin sätter ett förval för laget och ledaren ska kunna ändra antalet
  för varje träning. Giltighetsgränser följer K-022.
- K-010: Lagadmin ska kunna ange att en mätpunkt används som
  utvecklingsindikator. Rollen får inte vara hårdkodad till namnet ambition.
  Förmågevärdet styr grundindelningen, medan utvecklingsindikatorn markerar
  möjliga kandidater att prova nästa högre förmågegrupp. Ledaren beslutar
  om eventuell flytt; indikatorn får inte automatiskt flytta spelaren.
  Lagadmin anger en gemensam tröskel för utvecklingsvärdet, exempelvis minst
  7 av 10. Spelare vars medelvärde av indikatorbetygen når tröskeln och som
  inte redan är i högsta förmågegruppen ska markeras som möjliga att prova
  i nästa grupp. Detta ersätter tidigare separata indikatortrösklar.
  7 är ett exempel, inte en hårdkodad ambitionsgräns.
- K-011: Det automatiska indelningsförslaget ska ha ungefär lika stora
  grupper, med högst en spelares skillnad. Vid förmågeindelning ska
  deltagarna sorteras efter förmågevärde och delas i sammanhängande grupper,
  utan fasta poänggränser. För 20 spelare och tre grupper blir storlekarna
  7, 7 och 6. Lika förmågevärden och ej bedömda spelare behandlas i
  K-022/K-023. Faktiska avsteg beslutas på plats.
- K-012: En rapportvy ska visa dagens fördelning utan att en aktivitet
  finns eller måste skapas. Ledaren ska kunna välja antal grupper i
  rapporten. Detta är inte det tidigare föreslagna fristående arbetsflödet
  där ledaren väljer dagens deltagare manuellt. Rapporten omfattar hela
  lagets aktuella spelartrupp, fördelad efter dagens betyg och valt antal
  förmågegrupper, oberoende av kallelser. Övrigt rapportinnehåll följer K-024.
- K-013: Saknade betyg ska visas som ”saknar bedömning” och aldrig
  automatiskt räknas som 0. Spelare som saknar förmågebetyg ska visas
  separat för ledarens beslut på plats eller kunna bedömas direkt.
  Ett partiellt underlag får inte tyst beräknas som om det vore fullständigt.
  Om indikatorer eller något indikatorbetyg saknas ska inget fullständigt
  utvecklingsvärde och ingen kandidatmarkering visas. Förmågeindelning
  ska ändå kunna göras om förmågeunderlaget är komplett.
- K-014: Alla lagets ledare eller lagadmin ska kunna registrera och ändra
  spelarens gemensamma betyg i laget och läsa gruppförslag. Lag-admin-
  behörighet ska inte krävas för en ledare. Endast lagadmin får ändra
  mätpunkter och regler.
- K-015: Träningsindelningen ska visas som ett praktiskt underlag för
  ledaren på plats att ropa upp grupperna. Indelningen behöver inte sparas
  och ska inte få beständig lagring eller ett godkännandeflöde i första
  versionen. Indelningen är en läsvy med ett förslag, inte en editor för
  manuella gruppflyttar. Ledaren på plats beslutar den faktiska indelningen.
  Detta preciserar tidigare svar om manuell placering till placering på
  plats utanför förslagsvyn. Uppdateringsbeteendet följer K-020.
- K-016: Lagadmin ska kunna ändra mätpunktens namn och typ. Nya mätpunkter
  börjar utan betyg. Borttagning ska kräva bekräftelse eftersom tillhörande
  betyg försvinner. Beräkningarna ska därefter använda den aktuella
  uppsättningen mätpunkter. Typbyte ändrar hur befintliga värden används.
- K-017: Spelarutvärdering och gruppförslag ska tillhandahållas av en
  återanvändbar capability. Capabilityns aktivitetsbidrag och lagrapport
  får endast vara tillgängliga när funktionen är aktiverad för laget.
  Aktiveringsläge och användarens rättigheter ska verifieras på servern;
  enbart dold frontendnavigation räcker inte. Vid avstängning får
  capabilityns data tas bort. Detta tillåter inte att lagets personer,
  medlemskap, aktiviteter, kallelser, närvaro eller andra capabilities
  raderas. Exakt raderingsbeteende följer K-021.
- K-018: Frontendens aktivitetsvy ska ha en gemensam utökningspunkt för
  registrerade disciplin-/capabilitybidrag. Capabilityn bidrar med
  gruppförslagsvyn genom denna punkt, inte genom capabilityspecifika
  villkor eller komponentimporter i aktivitetskärnan. Samma princip ska
  användas för lagrapportens bidrag. Frontendens gemensamma komponenter
  registreras i applikationens kompositionslager. Bidragets UI får inte
  kräva fotboll. Bidragen ska använda serverbeskrivna generella läsvyer
  enligt kontraktsprinciperna nedan.
- K-019: Backend ska beskriva capabilityns läsvyer med ett versionerat,
  typat kontrakt för gemensamma vytyper: lista, grupperad lista, tabell
  och informationsmeddelande. Frontend väljer renderare efter vytyp och
  ska inte behöva capabilityspecifik kod för dessa vyer. Gruppförslag,
  tabellinnehåll och kandidatmarkeringar beräknas på servern. Typade filter
  kan ange gruppantal och indelningssätt och begära ny beräkning genom
  en definierad läsoperation. Backend skickar inte körbar UI-kod.
- K-020: Nivåindelning ska vara förvalt indelningssätt. Gruppförslaget
  ska beräknas när fliken öppnas och när dess inställningar eller
  deltagarurval ändras. Andra ledares betygsändringar och ändrade
  kallelsesvar ska inte automatiskt flytta grupper i en öppen uppropsvy.
  Ledaren väljer Uppdatera för att läsa aktuellt underlag och räkna om.
  Varje beräkning ska följa aktuell aktivering och behörighet på servern.
- K-021: Funktionen ska vara av från början och aktiverbar av lagadmin
  enligt disciplinens capabilitykontrakt. Avstängning ska tydligt ange att
  lagets mätpunkter, capabilityinställningar och spelarvärden raderas och
  kräva bekräftelse. Radering och avstängning ska ske konsekvent: vid fel
  får inget halvklart tillstånd lämnas. Återaktivering börjar utan tidigare
  mätpunkter/betyg. Andra lag och andra verksamhetsdata påverkas inte.
- K-022: Minst en förmågemätpunkt och komplett förmågeunderlag krävs för
  automatisk placering. Övriga spelare visas separat med saknad bedömning.
  Storleksregeln gäller de automatiskt placerade. Gruppantal måste vara
  heltal mellan två och antalet bedömbara spelare; vid för få bedömbara
  spelare visas vägledning, inga tomma grupper. Lagadmin anger förvalt
  gruppantal och utvecklingströskel i inställningarna. Tröskeln ska ligga
  mellan 0 och 10 och jämföras mot orundat medelvärde.
- K-023: Lika förmågevärden får delas mellan intilliggande nivågrupper
  för att behålla storleksregeln. Samma underlag och val ska ge samma
  förslag. Indikatorer får inte bli en dold sorteringsregel. Exakt algoritm
  för balansering är ett implementationsval inom beslutade mål;
  matematisk garanti om globalt bästa lösning krävs inte.
- K-024: Aktivitetsbidraget ska heta Gruppförslag och visa grupper med
  namn, antal spelare och genomsnittlig förmåga. Lagrapporten ska även
  visa aktuella mätvärden och båda medelvärdena med begriplig förklaring.
  Markering för nästa nivå visas i nivåläge och rapport, inte i jämnstarka
  grupper där nästa nivå saknas. Saknat indikatorunderlag visas som saknat.
- K-025: Inlånade ja-anmälda spelare ska ingå i träningens urval. Saknas
  bedömning i aktuellt lag visas saknad bedömning; andra lags betyg hämtas
  inte automatiskt. Bedömning är alltid knuten till aktuellt lag. Utan rätt
  till personurvalet får ett manuellt tillägg inte göras.
- K-026: En annan ledares ändring får inte tyst skrivas över. Konflikt
  ska bevara det egna utkastet och erbjuda att läsa aktuellt värde.
  Borttagna eller omtypade mätpunkter och avstängd capability kontrolleras
  på nytt vid sparande/beräkning. Ett redan mottaget förslag är ett temporärt
  underlag; nästa anrop får inte lämna ut data när capabilityn är avstängd.

### Beslutad målbild för serverbeskrivna läsvyer

Användaren har bekräftat capabilityaktivering, pluggbarhet och deklarativa
serverbeskrivna läsvyer. Detta är beslutad målarkitektur, inte befintlig
implementation. Exakta API-namn och kodplaceringar är implementationsförslag.

- Gemensamma kontrakt anger schemaversion, stabilt bidrags-ID, capabilitynyckel,
  placering (exempelvis aktivitetsflik eller lagrapport), rubrik, ordning och
  en typad vybeskrivning med data. Förmåge-/indikatordata ägs av capabilityn.
- Backendens `extensions`-runtime samlar registrerade bidrag genom små
  kontrakt i `extensionapi`. Servern returnerar endast bidrag som är
  aktiva, tillämpliga för aktiviteten/laget och behöriga för användaren.
  Den generella aktivitetsvyn behöver inte känna konkreta capabilities.
- Backendcapabilityn lämnar en
  deklarativ vybeskrivning, exempelvis `grouped-list` eller `table`.
  Frontendens gemensamma värd väljer renderare efter vytyp, inte efter
  capabilitynyckel. En ny capability som använder befintliga vytyper kräver
  ingen ny capabilityspecifik frontendkod. Servern levererar data och
  metadata, inte React, HTML eller körbar UI-kod.
- Första byggstenarna är lista, grupperad lista, tabell och
  informationsmeddelande. Tabellkontraktet beskriver stabila rad-/kolumn-ID:n,
  kolumnrubriker och typade cellvärden; grupperad lista beskriver grupper,
  rubriker, personer/rader och markeringar. Layout, tillgänglighet och
  mobilanpassning ägs av frontendens produktionskomponenter.
- Gruppförslag kan uttryckas som en grupperad lista med spelarnamn och
  kandidatmarkeringar. Rapport över betyg kan uttryckas som en tabell med
  mätpunkter och beräknade medelvärden. Backend utför beräkningar och
  lägger med kandidatmarkeringar; frontend härleder inga domänregler ur
  capabilityns ID, mätpunktsnamn eller tabellkolumner.
- Gemensamma typade filter kan beskriva gruppantal och indelningssätt.
  Ändrade val skickas genom en definierad läsoperation till backend för ny
  beräkning. Att en vy har filter innebär inte skrivåtkomst eller stöd för
  manuella flyttar. Transport och bindning till dataresurs är kontraktsägda,
  inte godtycklig kod eller fria uttryck i vybeskrivningen.
- Schemaversion, vytyper och värden valideras. Okänd typ eller inkompatibel
  version hanteras med ett avgränsat tillstånd för bidraget utan att
  grundvyn kraschar. Servern filtrerar data efter aktuell behörighet innan
  de skickas, oberoende av vad klienten visar.
- Capabilityspecifika React-renderare väljs bort för dessa läsvyer.
  Eventuella framtida behov av helt nya interaktioner prövas separat;
  gruppförslag kräver ingen capabilityspecifik specialrenderare.
- Det räcker inte med det befintliga `InformationContributor`-kontraktet:
  det gäller eftermatchinhämtning med lagrade svar. Gruppförslag är ett
  läsbidrag inför/på träning och behöver en egen lämplig utökningspunkt.
- Första capabilityn bidrar med aktivitetsfliken Gruppförslag samt lagets
  rapport över aktuell trupp. Hur mätpunktskonfiguration och betygsregistrering
  uttrycks är separat från de föreslagna läsvykontrakten; en generell
  formulärmotor ingår inte automatiskt genom detta förslag.
- Föreslagen kodplacering är `features/extensions` för kontrakt/värd,
  `capabilities/<key>` för eventuell nödvändig capabilityspecifik frontend
  och `disciplines/<key>` för disciplinspecifika delar. Serverbeskrivna
  standardvyer kräver inte sådana frontendmoduler. Detta utvecklar målbilden i disciplinspecen;
  React har inte Springs modulgränser automatiskt. Imports och
  arkitekturkontroller behöver upprätthålla beroenderiktningen.

Undersökt nuläge: `src/disciplines/ui-registry.tsx` registrerar Next-appens
disciplinfälteditorer. React/Kotlin använder bland annat de delade
`src/components/extension-fields.tsx` och `activity-follow-up.tsx` direkt
från `frontend/src/activity-details.tsx`. Fält och uppföljningsbidrag är
datadrivna, men ett gemensamt register för capabilityägda aktivitetsflikar
är inte implementerat i de granskade vyerna. Se också avsnittet Frontend
och kanaler i [disciplinspecen](discipliner.md).

## Data, integrationer och kvalitetskrav

Mätpunkter med typ, aktuella spelarvärden, utvecklingströskel, förvalt
gruppantal och aktivitetens kallelsesvar är identifierade informationsbehov.
Betygshistorik och beständig lagring av indelningar ingår inte.
Aktivering och åtkomst kontrolleras på servern för varje läsning och ändring;
lagets ID eller en synlig flik ger ingen behörighet i sig. Framtida
implementation ska följa projektets befintliga konflikthantering och
revisionskontroller, utan att införa betygshistorik genom detta krav.
Gränsfall och samtidiga ändringar regleras i K-021–K-026.
Serverbeskrivna läsvyer är implementerade genom `extensionapi.ReadViewContributor`,
`extensions.ReadViewController` och den delade `ExtensionReadViews`-värden.
Capabilityn ligger i `capabilities.playerevaluation`. Endast aktuell
konfiguration och aktuella betyg lagras i tre privata tabeller i `forena`.

De gemensamma produktionskomponenterna, sidskalet och designreglerna ska
återanvändas. Nya vytyper och tillstånd ska representeras på `/components`.
Vid implementation ska de fullständiga flödena för aktivering, konfiguration,
betygsregistrering, träningsförslag och lagrapport verifieras på mobil och
desktop, tillsammans med negativa åtkomstfall och avstängning. Saknat,
tomt, laddande eller felaktigt underlag får inte presenteras som ett giltigt
tomt förslag. Exakta prestandagränser fastställs vid implementation utifrån
representativa truppstorlekar; inget numeriskt svarstidskrav är beslutat.

## Acceptanskriterier

- AK-001 (K-001): Två lag kan definiera olika uppsättningar mätpunkter utan
  att behöva använda samma uppsättning.
- AK-002 (K-002): Värdena 0 och 10 tillåts; värden under 0 eller över 10
  samt decimalbetyg som 7,5 nekas även vid direkt serveranrop. Ett beräknat
  förmågevärde får däremot ha decimaler.
- AK-003 (K-003): Förmågebetygen 6, 7 och 8 ger förmågevärdet 7.
  Indikatorbetygen 6 och 8 ger utvecklingsvärdet 7 och ändrar inte
  förmågevärdet. Samma beräkning används för rapport och träningsindelning.
- AK-004 (K-005): Ledaren kan välja båda indelningssätten för en träning.
  Vid jämnstarka lag används gruppens genomsnittliga förmågevärde som
  balansmått. Med förmågevärdena 9, 7, 5 och 3 och två grupper kan
  förslaget vara 9+3 respektive 7+5, med medelvärdet 6 i båda grupperna.
  Vid nivåindelning blir motsvarande grupper 9+7 och 5+3.
- AK-005 (K-001, K-006): Ett lag i en annan disciplin kan använda egna
  mätpunkter för bedömning och indelningsförslag utan krav på fotbollsfält.
- AK-006 (K-003): En användare med lag-admin-behörighet för laget kan ändra
  mätpunkter, deras typ och gemensam utvecklingströskel. En ledare utan
  lag-admin-behörighet nekas motsvarande ändring även vid direkt API-anrop.
- AK-007 (K-007): Lagets ledare kan läsa betygen. En användare med enbart
  spelar- eller vårdnadshavaråtkomst får inte betygen via vare sig UI eller API.
- AK-008 (K-008): När en spelares betyg för en mätpunkt ändras läser
  behöriga ledare samma aktuella värde för spelaren i laget.
- AK-009 (K-009): För ett tillräckligt stort deltagarurval kan förslag skapas
  med två, tre respektive fyra grupper; antalet är inte låst till två.
- AK-010 (K-009): Givet ett lagförval på tre grupper kan ledaren välja två
  grupper för en viss träning utan att ändra lagets förval.
- AK-011 (K-010): Lagadmin kan ange en egen mätpunkt som utvecklingsindikator.
  När beslutade markeringsvillkor uppfylls visas en kandidatmarkering för
  ledaren utan att spelaren automatiskt flyttas till en annan förmågegrupp.
  Indikatorn ska inte räknas in i förmågevärdet genom denna roll.
- AK-012 (K-010): Med en utvecklingströskel på 7 markeras en spelare med
  utvecklingsmedelvärde 7 som kandidat för nästa grupp, medan 6 inte ger markering.
  En spelare som redan är i högsta förmågegruppen får ingen sådan markering.
- AK-013 (K-011): Med 20 deltagare och tre grupper fördelas alla deltagare
  en gång till grupper med storlekarna 7, 7 och 6. I förmågeläget överlappar
  gruppernas förmågeintervall inte, bortsett från lika förmågevärden.
- AK-014 (K-004): Ja-anmälda spelare ingår som förval, nej-anmälda och
  obesvarade gör det inte. Manuell ändring av indelningens deltagarurval
  ändrar inga kallelsesvar eller närvaroposter.
- AK-015 (K-012): En ledare kan öppna en rapport över dagens fördelning
  och välja gruppantal utan att skapa eller välja en aktivitet. Exakt
  samma aktuella spelartrupp ingår oavsett vilka kallelsesvar som finns.
  Rapportens gruppindelning bygger på dagens betyg och valt gruppantal.
- AK-016 (K-013): En spelare utan ett nödvändigt förmågebetyg visas med
  ”saknar bedömning”, inte värde 0. Ledaren kan registrera det saknade
  betyget direkt eller själv bestämma spelarens grupp på plats. Komplett
  förmågeunderlag och saknat indikatorbetyg hindrar inte förmågeindelning,
  men ger ingen kandidatmarkering.
- AK-017 (K-014): En ledare utan lag-admin-behörighet kan registrera och
  ändra lagets gemensamma spelarvärden. Spelar-/vårdnadshavaråtkomst ensam
  ger varken läs- eller skrivrätt till betygen.
- AK-018 (K-008, K-015): Ledaren kan läsa aktuella betyg och visa grupper
  för upprop utan att spara indelningen. Ingen gruppindelning eller tidigare
  betygsversion skapas i featurens beständiga lagring.
- AK-019 (K-015): Uppropsvyn visar föreslagna grupper utan reglage för att
  flytta spelare mellan grupper. Ledarens faktiska indelning registreras inte.
- AK-020 (K-016): Namnbyte bevarar spelarvärden. Typbyte använder befintliga
  värden i den nya typen. En ny mätpunkt saknar initialt betyg för samtliga
  spelare. Avbruten borttagning bevarar mätpunkt och betyg; bekräftad
  borttagning tar bort båda och utesluter mätpunkten ur nya beräkningar.
- AK-021 (K-007, K-014): En lagadmin utan separat ledarroll får läsa och
  ändra betyg samt läsa gruppförslag. En ledare utan lag-admin-behörighet
  får inte ändra mätpunkter eller regler genom direkt API-anrop.
- AK-022 (K-017): För ett lag med avstängd capability visas inget
  gruppförslagsbidrag eller rapportbidrag, och direkta anrop lämnar inte ut
  capabilityns betyg eller förslag. Ett annat lags aktivering ger ingen åtkomst.
- AK-023 (K-018): Samma registrerade capabilityvy kan bidra i en tränings
  aktivitetsvy för lag i olika discipliner utan capabilityspecifika
  villkor/importer i aktivitetskärnan. Avsaknad av bidrag ändrar inte grundvyn.
- AK-024 (K-019): Två olika capabilities kan leverera varsin grupperad
  lista eller tabell genom samma kontrakt och frontendrenderare utan
  nya capabilityspecifika React-komponenter. Ändrat gruppantal skickas
  till backend och det nya serverberäknade förslaget visas. Okänd vytyp
  eller schemaversion påverkar bara bidraget, inte aktivitetens grundvy.
- AK-025 (K-020): Fliken öppnas med nivåindelning och aktuellt underlag.
  Byte av gruppantal, indelningssätt eller lokalt deltagarurval ger en ny
  beräkning. Om ett kallelsesvar eller betyg ändras i en annan vy ligger
  den öppna uppropsindelningen still tills ledaren väljer Uppdatera.
  Därefter används senaste underlaget med aktuell serverbehörighet.
- AK-026 (K-021): Funktionen är av för ett nytt lag. Lagadmin kan aktivera
  den. Avbruten avstängningsbekräftelse bevarar aktivering och data;
  bekräftad avstängning tar bort lagets mätpunkter, inställningar och betyg.
  Andra lag, personer, medlemskap, aktiviteter, svar och närvaro bevaras.
  Återaktivering återställer inte raderade värden. Ett misslyckat
  avstängnings-/raderingsförsök lämnar inget delvis raderat tillstånd.
- AK-027 (K-022): Med sex spelare med kompletta förmågebetyg och två med
  saknade betyg fördelas sex spelare i tre grupper om två; övriga två visas
  separat. Gruppantal 1, 7 eller 2,5 nekas för dessa sex bedömbara spelare.
  Utan förmågemätpunkter eller med färre än två bedömbara spelare visas
  vägledning i stället för en indelning med tomma grupper.
- AK-028 (K-022): Utvecklingströsklarna 0 och 10 tillåts; -1 och 11 nekas.
  Vid tröskel 7 ger ett indikatorvärde på 20/3 ingen markering även om
  visningen avrundas till 7. Ett värde på exakt 7 når tröskeln.
- AK-029 (K-023): Upprepade beräkningar med samma underlag och val ger
  samma grupper. Lika förmågevärden vid en gruppgräns får delas utan att
  storleksregeln bryts. Ändrade indikatorbetyg ändrar inte själva indelningen.
- AK-030 (K-024): Gruppförslag visar spelarnamn, gruppstorlek och
  genomsnittlig förmåga. Rapporten visar också mätvärden och båda
  medelvärdena. En kandidatmarkering som visas i nivåläge visas inte i
  jämnstarkt läge. Ofullständigt indikatorunderlag anges som saknat.
- AK-031 (K-025): En inlånad ja-anmäld spelare utan betyg i aktuellt lag
  visas med saknad bedömning även om betyg finns i ett annat lag. Behörighet
  i aktuellt lag ger inte åtkomst till det andra lagets betyg. Ett obehörigt
  försök att lägga till en person i urvalet nekas på servern.
- AK-032 (K-026): När två ledare ändrar samma aktuella betyg upptäcks en
  konflikt för det inaktuella utkastet; sparat värde skrivs inte tyst över
  och det egna utkastet kan behållas. Föråldrade anrop efter typbyte,
  borttagning eller avstängning valideras mot aktuellt tillstånd och får
  inte återskapa raderade värden eller lämna ut avstängd capabilitydata.

## Implementation och verifiering

Ingången är lagmenyns **Spelarutvärdering**, `/teams/{teamId}/evaluation`,
i React/Kotlin. Gruppförslag bidras generellt till träningsdetaljerna.
Next och Vite visar samma produktionskomponenter på `/components`; den äldre
Next-backenden får ingen parallell implementation eller ny datamodell.

| Krav / acceptanskriterier | Implementation och evidens |
| --- | --- |
| K-001–K-003, K-006, K-008; AK-001–AK-003, AK-005, AK-008 | Lagägda mätpunkter och aktuella heltalsbetyg med separata kompletta medelvärden. `EvaluationService`, `Grouping` och migration `player-evaluation.sql`. `GroupingTest` verifierar medelvärden och saknat underlag; API-proven använder allmän verksamhet utan fotbollsfält. |
| K-004–K-005, K-009, K-011, K-022–K-023; AK-004, AK-009–AK-010, AK-013–AK-014, AK-027, AK-029 | Serverberäknad deterministisk nivåindelning och balansering av genomsnitt med högst en spelares storleksskillnad. Balanseringen förbättrar en deterministisk grundindelning med parbyten; globalt optimum garanteras inte. `GroupingTest` och `ApiTest` täcker 9/7/5/3, 20 spelare, flera gruppantal, likheter, saknat underlag och ogiltiga val. Läsvyn ändrar aldrig svar eller närvaro. |
| K-007, K-014, K-017, K-025; AK-006–AK-007, AK-017, AK-021–AK-022, AK-031 | `EvaluationAccess` kontrollerar aktuell ledar-/adminåtkomst, trupp och inbjudna spelare. `ApiTest` verifierar admin utan ledarroll, ledare utan adminrätt, nekad spelar-/vårdnadshavaråtkomst, inlånad ja-anmäld utan betyg och nekat främmande personurval. |
| K-010, K-013, K-024; AK-011–AK-012, AK-016, AK-028, AK-030 | Kandidatmarkering kommer från orundat komplett indikatormedelvärde, endast i nivåläge och under högsta gruppen. Saknat betyder aldrig noll. `GroupingTest` och API-proven verifierar partiellt underlag, giltig nolla, exakt 7 samt 20/3 under tröskel 7 och avsaknad av markering i jämnstarkt läge. |
| K-012, K-015, K-020; AK-015, AK-018–AK-019, AK-025 | Rapporten använder aktuell spelartrupp utan aktivitet; träningen har ja-svar som förval och lokalt justerbart urval. `ExtensionReadViews` gör nya läsningar vid öppning/filterval och Uppdatera, utan pollning eller gruppflyttar. Ingen betygshistorik eller indelningstabell finns. |
| K-016, K-026; AK-020, AK-032 | Laglås, förnyad behörighet och nya revisionsreferenser vid varje ändring. Namn-/typbyte bevarar aktuella värden. Borttagning kräver bekräftelse. `ApiTest` verifierar inaktuella skrivningar och mätpunktsändringar; browserproven verifierar bevarat utkast vid 409 och uttrycklig omläsning. |
| K-018–K-019; AK-023–AK-024 | Spring-registrerade bidrag genom `extensionapi`, generisk aktivitetsvärd och renderare för lista/grupperad lista/tabell/information. `ArchitectureTest`, `extension-read-views.test.tsx`, `evaluation-api.test.ts` och komponentsidans oberoende exempelcapabilities täcker kontrakt, tillåtna läsoperationer och isolering av okänd typ/version. |
| K-021; AK-026 | Av från början. Bekräftad avstängning kaskadraderar bara capabilityns tre tabeller i en transaktion. Återaktivering får en ny revisionsreferens utan gamla betyg. API- och browserproven täcker avbruten/bekräftad avstängning, bevarade medlemskap/kallelser och nekat gammalt sparande efter återaktivering. |

Verifieringskommandon och browseromfattning redovisas i
[implementationsunderlaget](../migration/player-evaluation.md).

## Bekräftade beslut och motiv

Intervjulogg i tidsordning. Tidiga öppna frågor och preliminära förslag
har i flera fall ersatts av senare svar. Avsnittet Krav beskriver aktuellt
bekräftat beteende. Samtliga kompletteringar godkändes i slutbekräftelsen.

- 2026-11-03: Användaren efterfrågar egna mätpunkter per lag, spelarvärden
  0–10, en angiven viktning/formel och indelningsförslag till träningar
  baserat på kallelsesvar.
- 2026-11-03: Användaren beställer en grill-me-session och en sparad spec.
- 2026-11-03, svar 1: Både jämnstarka lag och indelning efter förmåga ska
  kunna väljas. Förmågegruppering ska ge spelare med lägre förmåga fler
  möjligheter att röra bollen vid träning tillsammans.
- 2026-11-03, svar 2: Betygen behöver inte vara hemliga; de ska hjälpa
  ledarna att göra bra träningar. Exakt läs- och skrivåtkomst är inte avgjord.
- 2026-11-03, svar 3: Funktionen ska vara återanvändbar i andra discipliner.
- 2026-11-03, svar 4: Alla med lag-admin-behörighet ska kunna ändra vilka
  mätpunkter som används och hur de används. Antalet grupper ska vara valbart;
  mindre lag kan behöva två grupper och större tre eller fler.
- 2026-11-03, svar 5: Bara ledare ska kunna se betygen till att börja med.
- 2026-11-03, svar 6: Ett gemensamt betyg per spelare. I kombination med
  grundkravet på flera mätpunkter avser detta gemensamma värden per mätpunkt,
  inte separata bedömningar per ledare. Historik har inte uttryckligen bekräftats.
- 2026-11-03, svar 7: Användaren har testat förmågevärdet
  `(spelteknik + spelförståelse + styrka) / 3`. Ambition betyder villighet
  att lyssna och försöka och används separat som pekare för spelare som
  kanske kan ta ett kliv upp till nästa nivå. Hur detta ska uttryckas som
  regelverk återstår att besluta; inga ambitionströsklar eller automatiska
  uppflyttningar är bekräftade.
- 2026-11-03, svar 8: Förvalt gruppantal per lag med möjlighet för ledaren
  att ändra antalet för varje träning godkändes.
- 2026-11-03, svar 9: Användaren förtydligar att hjälpen med gruppindelning
  ska finnas till varje träning baserat på deltagare och deras betyg.
  Frågan om vem som får registrera betyg besvarades inte. Uttrycket
  ”skapa förslag” avsåg att ta fram gruppindelningen för träningen, inte
  ett separat arbetsflöde för förslagshantering. Automatisk generering,
  omräkning och eventuell knapp för att ta fram indelningen är ännu öppna.
- 2026-11-03, svar 10: Uppdelningen mellan förmågevärde och separat
  utvecklingsindikator, med ledarbeslut om flytt, godkändes. Användaren
  tillägger att en mätpunkt måste kunna anges som utvecklingsindikator.
- 2026-11-03, svar 11: Användaren föredrar preliminärt lika stora grupper
  (”troligen”). Exakt storleksregel och om fasta nivågränser ska väljas bort
  är ännu inte bekräftade.
- 2026-11-03, svar 12: Något färdigt system för betyg eller ambition finns
  inte. 7 av 10 anges som en möjlig rimlig ambitionsgräns (”kanske”);
  det är ett förslag och ingen fastställd eller hårdkodad gräns.
- 2026-11-03, svar 13: Konfigurerbar indikatorgräns, markering vid minst
  gränsvärdet utom i högsta förmågegruppen och ingen automatisk flytt godkändes.
- 2026-11-03, svar 14: Ungefär lika stora grupper, högst en spelares
  skillnad, sortering efter förmåga och inga fasta poänggränser godkändes.
  Användaren tillägger att en dagsaktuell indelning ska kunna göras utan
  aktivitet (formulerat ”skapa en dags-aktuella bilder”). Tolkningen och
  urvalsflödet följs upp i nästa frågeomgång.
- 2026-11-03, svar 15: Ja-svar som förvalt urval samt manuell tilläggning
  och borttagning utan ändring av kallelsesvar eller närvaro godkändes.
- 2026-11-03, svar 16: Användaren avvisar tolkningen av ett fristående
  manuellt deltagarurval. Behovet är att kunna titta på dagens fördelning
  i en rapportvy och där kunna välja hur många grupper som visas.
  Vilka spelare ”dagens fördelning” avser är ännu inte uttryckligen bestämt.
- 2026-11-03, svar 17: Saknade betyg markeras som saknad bedömning,
  aldrig som 0. Manuell placering eller bedömning direkt godkändes.
- 2026-11-03, svar 18: Alla ledare får registrera och ändra gemensamma betyg.
- 2026-11-03, svar 19: Rapporten ska omfatta hela lagets aktuella
  spelartrupp och visa fördelning efter dagens betyg och valt antal
  förmågegrupper, oberoende av kallelser.
- 2026-11-03, svar 20: Användaren föreslår att varje mätpunkt anges som
  förmåga eller utvecklingsindikator, och att ett separat medelvärde beräknas
  av alla mätpunkter i respektive kategori. Detta utvecklar den tidigare
  indikatorrollen till två aggregat. Slutlig bekräftelse av lika vikter,
  gemensam indikatortröskel och bortval av fria formler återstår.
- 2026-11-03, svar 21: Heltalsbetyg 0–10 och möjlighet till decimaler i
  det beräknade förmågevärdet godkändes.
- 2026-11-03, svar 22: Två mätpunktstyper, lika vikter inom varje typ,
  separata medelvärden och en gemensam utvecklingströskel godkändes. Inga
  separata vikter eller fria formler behövs i första versionen.
- 2026-11-03, svar 23: En indelning behöver inte sparas; den ska visas
  för ledaren på plats som kan ropa upp vilka som ska träna i varje grupp.
- 2026-11-03, svar 24: Endast aktuella siffror per spelare behövs, ingen historik.
- 2026-11-03, svar 25: Indelningen är endast en läsvy och ett förslag;
  ledaren på plats bestämmer faktisk indelning. Det föreslagna stödet för
  tillfälliga manuella gruppflyttar i vyn avvisades.
- 2026-11-03, svar 26: Saknade indikatorbetyg ska inte hindra gruppering
  efter förmåga, men då visas ingen markering för möjlig uppflyttning.
- 2026-11-03, svar 27: Namn och typ får ändras, nya mätpunkter saknar
  initialt betyg och borttagning kräver bekräftelse eftersom betyg försvinner.
  Beräkningarna använder därefter aktuell uppsättning. Förslaget godkändes.
- 2026-11-03, svar 28: Balans efter genomsnittlig förmåga, ungefär lika
  gruppstorlekar och inga positions-/kombinationsregler i första versionen
  godkändes för jämnstarka grupper. Användaren betonar att nivåindelning
  för att hjälpa spelarna är det primära målet.
- 2026-11-03, svar 29: Användaren föreslår att gruppförslag ligger under
  en egen flik. Placering och uppdateringsbeteende är ännu inte bekräftade;
  svaret ska inte tolkas som godkännande av automatisk eller manuell uppdatering.
- 2026-11-03, svar 30: Användaren bedömer att den som har lag-admin-
  behörighet troligtvis är ledare. Ett uttryckligt beslut om åtkomst för
  lagadmin utan ledarroll återstår, utan krav på en särskild extra rollkontroll.
- 2026-11-03, svar 31: Funktionen styrs av capabilityns aktivering för laget.
  Vyn är ett pluggbart tillägg till aktivitetsgrunden. Användaren efterfrågar
  hur frontendmoduler och capabilityägda informationsbidrag ska fungera i
  motsvarighet till Kotlin-backendens disciplin-/capabilitymoduler.
  Det tidigare förslaget om när fliken beräknar/uppdaterar är ännu obesvarat.
- 2026-11-03, svar 32: Ledare eller lagadmin får läsa/ändra betyg och läsa
  gruppförslag; lagadmin får dessutom ändra mätpunkter och regler. Godkänt.
- 2026-11-03, fortsatt arkitekturdiskussion: Användaren frågar om servern
  kan beskriva vytypen, exempelvis lista eller tabell, så att frontend blir
  agnostisk till vilken capability som bidrar. Dokumenterat en deklarativ
  modell med gemensamma renderare som alternativ till capabilityspecifika
  React-renderare. Slutligt arkitekturval är ännu inte bekräftat.
- 2026-11-03, arkitekturbekräftelse: Användaren svarar ”låter bra” på
  förslaget om deklarativa serverbeskrivna läsvyer med gemensamma renderare
  och typade filter. Arkitekturvalet är godkänt. Betygsredigering och
  konfiguration hålls separata; en generell formulärmotor är inte beställd.
- 2026-11-03, svar 33: Vid avstängning kan capabilityns data tas bort.
  Förslaget att bevara alla betyg vid avstängning ersätts därmed av
  tillåten radering. Aktiveringsförval och exakt raderingsomfattning
  sammanfattas som förslag inför slutbekräftelse.
- 2026-11-03, svar 34: Nivåindelning som förval, beräkning vid öppning
  och ändrade inställningar samt manuell Uppdatera för aktuella
  kallelsesvar och betyg godkändes.

- 2026-11-03, slutbekräftelse: Användaren svarade ”ja” på sammanställningen
  och kompletteringarna P-001–P-006. De är införda som K-021–K-026 med
  acceptanskriterier AK-026–AK-032. Specen är godkänd och markerad Redo.

## Obekräftade antaganden och förslag

Inga kvarvarande produktförslag inväntar beslut. Exakta API-namn,
kodplaceringar och balanseringsalgoritm är implementationsval inom de
godkända kontrakten och kraven. En generell serverbeskriven formulärmotor
ingår inte i det godkända läsvykontraktet.

## Öppna frågor

Inga blockerande produktfrågor återstår från intervjun.

## Bekräftelse

Grundbeskrivningen, svar 1–34, arkitekturvalet och slutbekräftelsen är
sparade. Användaren bekräftade sammanställningen inklusive samtliga
kompletteringar med ”ja” 2026-11-03. Status är Redo. Det innebär godkänd
spec. Implementation beställdes separat och genomfördes lokalt 2026-11-03;
verifieringens omfattning redovisas ovan. Ingen driftsättning ingår.

## Ändringshistorik

- 2026-11-03: Separat beställd implementation genomförd i React/Kotlin:
  aktuell bedömning, konfiguration, serverbeskrivna gruppförslag och rapport.
  Kravspårning och verifieringsomfattning tillagda. Ingen driftsättning.

- 2026-11-03: Användaren godkände slutlig sammanställning inklusive
  kompletteringarna. Infört K-021–K-026 och AK-026–AK-032, markerat specen
  Redo och uppdaterat specindex. Ingen kodimplementation utförd.
- 2026-11-03: Sparat svar 33–34: data får raderas vid avstängning och
  uppdateringsbeteendet är godkänt. Lagt till K-020/AK-025 och sammanställt
  återstående gränsfall som uttryckliga förslag för slutbekräftelse.
- 2026-11-03: Användaren godkände serverbeskrivna läsvyer och gemensamma
  frontendrenderare. Lagt till K-019/AK-024 och samordnat målbilden med
  arkitektur- och disciplindokumentationen. Specen kvarstår som Utkast.
- 2026-11-03: Utvecklat tekniskt förslag med serverbeskrivna listor,
  grupperade listor och tabeller som gör frontend oberoende av capabilityn.
  Skilt generiska läsvyer och filter från eventuell framtida formulärmotor.
- 2026-11-03: Sparat svar 31–32: capabilityaktivering och pluggbar vy är
  krav; lagadminåtkomst bekräftad. Granskat frontendens befintliga fält- och
  uppföljningsstöd och beskrivit föreslaget register för aktivitets-/rapportbidrag
  som ännu inte implementerad målbild.
- 2026-11-03: Sparat svar 28–30: fastställt mål för jämnstarka grupper
  med nivåindelning som huvudsyfte. Dokumenterat egen flik och föreslagen
  förenklad åtkomst för ledare eller lagadmin som kvarvarande förslag.
- 2026-11-03: Sparat svar 25–27: läsförslag utan gruppeditor, förmågeindelning
  även vid saknade indikatorbetyg och regler för ändring/borttagning av
  mätpunkter. Tidigare manuell placering preciserad till beslut på plats.
- 2026-11-03: Sparat svar 22–24: fastställt medelvärde per typ och gemensam
  utvecklingströskel. Avgränsat bort betygshistorik och sparade indelningar;
  träningsindelningen används som visat uppropsunderlag på plats.
- 2026-11-03: Sparat svar 19–21: rapport över aktuell trupp och heltalsbetyg
  bekräftade. Dokumenterat förslag om två mätpunktstyper och medelvärde per typ;
  gemensam indikatortröskel och lika vikter inväntar bekräftelse.
- 2026-11-03: Sparat svar 16–18: ersatt tolkningen av fristående manuellt
  urval med rapportvy över dagens fördelning. Bekräftat hantering av saknade
  betyg och rätt för alla ledare att ändra gemensamma betyg.
- 2026-11-03: Sparat svar 13–15: indikatorvillkor, gruppstorlekar och
  förmågeindelning samt ja-anmälda som förval med manuell urvalsjustering.
  Tillagt krav på dagsaktuell indelning utan aktivitet; urvalsflödet är öppet.
- 2026-11-03: Sparat svar 10–12: konfigurerbar utvecklingsindikator och
  ledarbeslut om flytt bekräftade. Lika stora grupper och gränsen 7 av 10
  är dokumenterade som preliminära förslag, inte färdiga krav.
- 2026-11-03: Sparat svar 7–9: befintligt försök med förmågemedelvärde och
  separat ambition, godkänt gruppantal per lag/träning och förtydligat hjälpen
  till varje träning. Regler för utvecklingsindikator och betygsregistrering är öppna.
- 2026-11-03: Sparat svar 4–6: lagadmin styr mätpunkter och användning,
  valbart antal grupper, initial läsåtkomst enbart för ledare och gemensamma
  spelarvärden. Historik och rätt att registrera betyg kvarstår som öppna frågor.
- 2026-11-03: Sparat svar 1–3: valbara indelningssätt, ledarstöd utan krav
  på hemliga betyg och återanvändning mellan discipliner. Preciserat öppna åtkomstfrågor.
- 2026-11-03: Skapat utkast från användarens grundbeskrivning och granskat
  befintliga specar, roadmap och disciplinfält. Dokumenterat öppna beslutsområden.
