# Discipliner – gemensam modell och utökningsarkitektur

- Status: Redo
- Senast uppdaterad: 2026-10-27
- Berörda dokument: [Fotbollsspec](fotboll.md), [Discipliner](../disciplines.md),
  [Arkitektur](../architecture.md), [Migreringsbeslut](../migration/decisions.md),
  [Funktionsparitet](../migration/feature-parity.md)
- Implementation och verifiering: Ej påbörjad. Kod och dokumentation är lästa;
  apparna har inte funktionstestats inom specarbetet.

## Problem och mål

Migrera Next-appens disciplinfunktionalitet med bevarat beteende och därefter
utöka systemet. Denna spec äger gemensamma krav på egenskaper, capabilities,
fältåtkomst, informationsinhämtning och utökningsarkitektur. Fotbollens konkreta
fält, eftermatchflöde, Gröna kortet och rapporter ägs av [fotbollsspecen](fotboll.md).

Krav-ID:n K-001–K-030 och acceptans-ID:n AK-001–AK-033 behålls från den
ursprungliga gemensamma intervjun och är fördelade mellan filerna. En hänvisning
kan därför avse den andra specen. Nya ID:n fortsätter i samma gemensamma serie.
Intervjusvaren från de första tolv omgångarna är bevarade i fotbollsspecens
besluts- och ändringshistorik.

## Omfattning

### Ingår

- Befintlig disciplinkatalog, tilldelning, förval, egenskaper och capability-
  beteenden som migreringsbas.
- Gemensamt utökningskontrakt och informationsinhämtning per aktivitet.
- Kodägd synlighet per fält samt kodägda grundval och justerbarhet.
- Underlag för återanvändning mellan discipliner och bekräftad teknisk målbild.
- Maxantal deltagare exklusive ledare, som ett valfritt aktivitetsfält med
  anmälningsspärr och visning av fyllnadsgrad.

### Ingår inte

- Implementation i denna intervju.
- Dynamisk tredjepartskod, generell schemaeditor eller generell rapportbyggare.
- Kompletta nya innebandy-/körpaket utifrån obekräftade jämförelseexempel.
- Fotbollens detaljkrav som dubblerad källa; se fotbollsspecen.
- Reservkö och automatisk härledning av maxantal från spelvariant eller arv.

## Undersökt nuläge

Next-appen är kanonisk förlaga enligt repots arbetsinstruktioner. Följande är
befintligt stöd, inte nya beslut i intervjun:

- Disciplinen väljs på sektionen och ärvs av dess lag. Byte är låst när
  sektionen har lag eller sparat underlag.
- Systemadministrationen hanterar katalog och kategorier. Kategorier grupperar
  discipliner men styr inte beteende, aktivitetstyper eller behörigheter.
- Endast fotboll är registrerat som kodägt paket i `src/disciplines/registry.ts`.
  Katalogposter utan paket är inte fullständiga disciplinimplementationer.
- Fotboll har spelformer 3v3–11v11, positioner och schemastrukturer för sektion,
  lag, lagmedlemskap, aktivitet och aktivitetsdeltagande. Sektion har inga
  extrafält i nuvarande fotbollspaket.
- Lagets matchförval omfattar spelform, önskad matchtrupp, målvakter och
  perioder/tid. Medlemskap har tröjnummer och positioner. Matcher har även
  hemma/borta/neutral och lagkapten; deltagare har matchnummer och position.
- Förval ärvs fältvis disciplin → sektion → lag. Matchförval och aktiverade
  capabilityregler kopieras vid skapande; senare förvalsändringar skriver
  inte om befintliga matcher.
- `targetTeamSize` är en återanvändbar capability med validering, kontroller,
  signaler och notifieringsförslag. Aktivering är uttrycklig; liknande namn
  eller samma aktivitetskategori aktiverar inte funktionen automatiskt.
- Värden och paket är versionsrefererade. Servern validerar objektkopplingar,
  behörighet och samtidiga ändringar med revision. Okända paket får ingen
  fotbollsimplementation som reserv.
- Generella vyer använder paket-/UI-register. Livscykelhändelser behandlas
  med begränsade operationer, beständiga jobb och deduplicering.
- Dynamisk installation av tredjepartskod, generell schemaeditor och
  paketuppgraderingsflöden är inte befintliga levererade funktioner.
- Fullständiga disciplinpaket och signaler återstår enligt migreringens
  paritetslista. Befintligt Next-stöd ska inte beskrivas som redan flyttat
  till React/Kotlin.

Källor: `src/disciplines/football/definition.ts`,
`src/lib/disciplines/types.ts`, `src/lib/disciplines/common-activities.ts`,
`src/components/discipline-fields.tsx`, `src/disciplines/football/fields.tsx`,
`src/components/club-structure-administration.tsx`,
`src/app/system/disciplines/page.tsx` samt domän- och migreringsdokumenten ovan.

### Relaterade GitHub-issues

- [#105 – Låt disciplinen styra aktivitetstyper och benämningar](https://github.com/johkin/forena/issues/105).
  Direkt relevant. Öppet vid kontroll 2026-10-27, utan kommentarer. Efterfrågar
  gemensamma och disciplinspecifika aktivitetstyper med samma definitioner i UI
  och assistent. Benämningar ska hållas isär från beteenden och historik bevaras.
- [#66 – Utrustning och bokning](https://github.com/johkin/forena/issues/66).
  Närliggande exempel på en gemensam capability (`equipmentTracking`) för
  klubb, sektion och lag. Ingår inte automatiskt i denna spec.
- [#67 – Seriespel och senaste mötet med motståndaren](https://github.com/johkin/forena/issues/67).
  Närliggande behov som kan pröva återanvändning mellan matchdiscipliner.
- [#169 – Grupper och möten på klubb- och sektionsnivå](https://github.com/johkin/forena/issues/169).
  Närliggande krav på gemensamma möten, neutrala organisationsbegrepp och att
  hålla organisatorisk tillhörighet, mottagarurval och behörighet åtskilda.

Issueinnehåll är underlag för intervjun, inte automatiskt bekräftad omfattning.

## Användare, roller och flöden

Systemadministration hanterar katalog och kodägda paket. Disciplinen tilldelas
sektionen och lag ärver den. Lagadmin får ändra den capabilityaktivering som
disciplinen gjort justerbar. Fältens läsregler är kodägda och ändras genom PR.

En capability kan bidra med fält, synkrona regler, informationsbehov, signaler
och rapport. Gemensamt UI samlar tillämpliga informationsbehov per aktivitet.
Denna spec beskriver mekanismerna; [fotbollsspecen](fotboll.md) beskriver det
konkreta användarflödet.

## Krav

- K-001: Specarbetet ska utgå från Next-appens befintliga funktionalitet och
  tydligt skilja denna från föreslagna utökningar och återstående migrering.
- K-002: Specarbetet ska behandla hur discipliner kan följa gemensamma mönster
  och vilka ansvar som hör till kärna, återanvändbara funktioner och disciplin.
- K-003: Första leveransens mål ska vara migrering av Next-appens befintliga
  disciplinfunktionalitet till React/Kotlin. Föreslagna utökningar ska hållas
  tydligt åtskilda från migreringskraven.
- K-004: Fotboll ska användas som huvudsakligt konkret kravunderlag.
  Innebandy och kör ska användas som jämförelsefall; gissningar om deras
  verksamhetsregler får inte presenteras som bekräftade krav eller automatiskt
  innebära att kompletta nya disciplinpaket ingår i migreringen.
- K-005: Arkitekturmönster och eventuell uppdelning i delspecar ska motiveras
  av konkreta disciplinbehov. En gemensam kontraktsspec är inte en redan
  beslutad utgångspunkt.
- K-006: Migreringen ska bevara Next-appens befintliga beteende. Uppföljning
  efter match och utökad läsåtkomst ska specificeras som separata utökningar.
- K-019: Kravmodellen ska behandla tröjnummer, position och liknande som
  egenskaper på spelaren i relevant sammanhang. Gemensamt stöd ska beskrivas
  genom egenskapernas objektkoppling, typ, validering och åtkomst; ett visst
  fotbollsfälts namn ska inte vara arkitekturens centrala abstraktion.
- K-020: Synlighet ska definieras per fält i den capability eller disciplin
  som äger fältet. Reglerna är kodägda; ändrad synlighet kräver uppdatering
  genom PR. Klubb-/lagadministration ska inte kunna överstyra synligheten
  genom inställningar. Reglerna ska tillämpas vid dataåtkomst, inte bara i UI.
- K-022: Vid händelsen match-avslutad ska Gröna kortet-capabilityn kunna
  bidra med en request-for-info. Ledaren ska få ett samlat UI för matchens
  efterfrågade uppgifter från relevanta capabilities och disciplinen.
  Fält från flera bidrag ska kunna visas tillsammans, med sin respektive
  validering och behörighet. Utlösning följer K-023, färdigvillkor K-025,
  avstängning K-027 och notifiering K-026/K-028.
- K-024: Informationsförfrågan och dess svar ska tillhöra en enskild aktivitet,
  inte laget, helgen eller en matchgrupp som helhet. Alla behöriga ledare
  arbetar med samma sparade svar för den aktiviteten. Två matchgrupper inom
  laget kan spela olika matchaktiviteter samma helg och registrera egna
  kortmottagare och faktisk lagkapten för respektive aktivitet. Ett lags
  registrering för en match får inte fylla i eller avsluta en annan matchs
  förfrågan. Ingen laggemensam kvot per helg ska införas.
- K-025: Aktivitetens informationsförfrågan ska ligga kvar som ofullständig
  tills alla efterfrågade uppgifter är besvarade. Delvis sparande är tillåtet
  enligt K-016. Ett uttryckligt inget-kort-svar räknas som ett besvarat fält;
  ett ännu okänt utfall gör det inte. En enskild ledares öppning eller svar
  får inte i sig avsluta förfrågan om övriga uppgifter saknas.
- K-026: Lagöversikten ska visa en gemensam uppföljningspunkt med länk till
  den aktuella aktivitetens samlade formulär. För olika matchaktiviteter
  ska uppföljningspunkter och länkar hållas åtskilda. Extern notifiering
  följer K-028.
- K-028: När en uppföljningsförfrågan skapas ska ett första utskick till
  behöriga ledares privata kanaler göras enligt befintlig leveranspolicy
  för Telegram/push, med länk till aktivitetens gemensamma webbformulär.
  Återkommande påminnelser ingår inte i första versionen. Kanalval ger ingen
  ytterligare åtkomst och registrerad leverans betyder inte besvarad förfrågan.

- K-031: Det ska gå att ange ett maxantal deltagare exklusive ledare.
  Maxantalet ska vara ett hårt tak för ja-anmälda deltagare. När gränsen
  nåtts ska knappen för ett nytt ja-svar vara inaktiverad. Spärren ska även
  kontrolleras på servern, inklusive vid samtidiga svar och andra kanaler.
  Detta är en utökning och ska inte blandas ihop med befintligt önskat
  antal spelare (`targetTeamSize`).
  Maxantalet är en grundegenskap på aktiviteten med regler ägda av
  aktivitetskärnan, och anges manuellt enligt K-036.
- K-033: En capability ska vara en återanvändbar komponent som kan användas
  av flera discipliner. Den kan bidra med egenskaper, regler, UI, händelse-
  hantering, informationsinhämtning eller rapporter efter behov; den behöver
  inte implementera alla dessa delar. Disciplintillämplighet ska vara
  uttrycklig och återanvändning får inte bygga på kopiering av implementationen.
- K-034: En aktivitet med deltagargräns ska visa fyllnadsgrad med en
  progressbar baserad på antalet ja-anmälda deltagare, exklusive ledare,
  och aktivitetens maxantal. Numerisk text, exempelvis ”8 av 10 platser”,
  ska göra fyllnadsgraden begriplig även utan färg eller visuell avläsning.
  Vid full aktivitet ska detta framgå tillsammans med den inaktiverade
  ja-knappen. Placeringen följer K-038.
- K-035: Om maxantalet sänks under antalet redan ja-anmälda deltagare ska
  befintliga ja-svar bevaras. Överbeläggningen ska visas och nya ja-svar
  stoppas. Ingen deltagare ska avbokas automatiskt på grund av sänkningen.
- K-036: Maxantal deltagare ska anges genom ett enda valfritt fält när en
  aktivitet skapas eller redigeras. Angivet värde ska vara ett positivt
  heltal. Tomt fält betyder obegränsat antal. Ingen extra aktivering,
  inställningspanel, automatisk härledning eller ärvt maxantal ingår.
- K-037: När ett ja-svar återtas ska platsen omedelbart frigöras för nya
  ja-svar, förutsatt att antalet kvarvarande ja-anmälda är under maxantalet.
  Ingen reservkö eller automatisk tilldelning av den lediga platsen ingår.
  Ett redan sparat ja-svar ska kunna behållas eller återtas även när det
  är fullt; en idempotent omsparning är inte en ny anmälan.
- K-038: Progressbar och numerisk platsangivelse ska visas för begränsade
  aktiviteter i aktivitetskort och aktivitetsdetaljer. Obegränsade aktiviteter
  ska inte visa progressbar. Överbeläggning visas med faktiskt antal och
  tydlig text; grafisk fyllnad stannar vid full bar. Presentera inte ledarnas
  ja-svar som upptagna deltagarplatser.

### Migreringsbas att verifiera före utökning

Tabellen preciserar K-001, K-003 och K-006. Befintliga tekniska lösningar
som RPC/triggers behöver inte kopieras till Kotlin, men deras observerbara
beteende, transaktionsskydd och åtkomst ska bevaras.

| Område | Beteende som ska bevaras |
| --- | --- |
| Katalog och tilldelning | Kategorier, katalogadministration, kodägda paket skrivskyddade, sektionstilldelning och disciplinlås |
| Förval | Fältvist disciplin → sektion → lag, tydlig källa, separat ärvning av valbara tider och notifieringsinställningar |
| Egenskaper | Befintliga fotbollsfält för lag, medlemskap, aktivitet och deltagande i motsvarande produktionsvyer |
| Validering och revision | Objekt-/klubbkopplingar, tillåtet spelarurval, samtidighetskonflikt med bevarat utkast och uttrycklig omladdning |
| Skapande och historik | Matchvärden och regler kopieras vid skapande; ändrade förval skriver inte om äldre matcher; paketversioner bevaras |
| Bakgrundsbeteende | Capabilitykontroller, signaler, notifieringsförslag, deduplicering, återförsök och avgränsat arbete med bibehållna åtkomstregler |
| Okänd disciplin och skrivskydd | Ingen fotbollsreserv för okända paket; befintliga importerade/inställda/avslutade planeringsfält behåller sina skrivregler |

Nya eftermatchutfall och utökad fältläsning införs separat och ändrar inte
betydelsen av kravet på bevarat migreringsbeteende.

## Arkitekturmönster härlett ur kraven

Gröna kortet ska vara en valbar capability med både uppföljning och rapport.
Synlighet definieras per fält i kod. Capabilities ska kunna bidra till ett
samlat informationsinhämtningsflöde. Följande konkretiserar kraven;
modulgränser och runtime-kontrakt preciseras i den tekniska målbilden nedan:

| Del | Ansvar | Konkret exempel |
| --- | --- | --- |
| Egenskap | Typat värde med objektkoppling, validering och åtkomst | Tröjnummer/position på lagmedlemskap; matchposition på aktivitetsdeltagande |
| Capability | Återanvändbar komponent som flera discipliner kan komponera; bidrar med de egenskaper, regler och flöden den behöver | Gröna kortet med uppföljning och rapport; återanvändbar truppstorlekskontroll |
| Disciplinpaket | Definierar egenskaper och relevanta capabilities samt deras terminologi och tillämplighet | Fotboll använder matchutfall; kör får inte automatiskt fotbollens funktioner |
| Gemensam kärna | Tillhandahåller organisation, personidentitet, aktivitet, faktisk närvaro, åtkomst och transaktioner | Capabilityn använder verifierade deltagare och aktuellt lag |
| Gemensam informationsinhämtning | Samlar informationsförfrågningar för en aktivitet och visar ett formulär med behöriga fält | Gröna kortet och faktisk kapten efter samma match |

Föreslaget flöde: match-avslutad → aktiva capabilities bedömer behov →
strukturerade request-for-info-bidrag → gemensam matchuppföljning →
validerade utfall → uppdaterad historik/rapport.

Skilj händelsen att matchen avslutats från den beständiga förfrågan om
information och från en eventuell notis om förfrågan. Notisleverans är inte
bevis på att uppföljningen är gjord. Samlingsvyn äger presentation och
samordning; respektive capability äger informationsbehov och domänvalidering.
En åtkomstregel kan exempelvis ange ledare, egen spelare/målsman eller
behöriga lagmedlemmar, men inga sådana ytterligare målgrupper är beslutade
för ett visst fält enbart genom dessa exempel.

Aktivitetens identitet är ankare för informationsförfrågan, svaren och de
registrerade utfallen. Lag och matchgrupper ger organisatorisk kontext;
de ersätter inte aktivitetsankaret. Rapporter summerar behöriga aktiviteters
utfall per spelare och period utan att slå ihop olika matchers svar.

En spelaregenskap behöver rätt objektankare. Tröjnummer i ett lag hör normalt
till lagmedlemskapet, inte till personens globala profil. En uppgift från en
enskild match hör till matchen/deltagandet. Gröna kortets mottagande är ett
historiskt matchutfall kopplat till en person och ska inte reduceras till en
föränderlig flagga på spelarprofilen.

Capabilityns rapport ska härledas ur samma registrerade utfall som används
i matchuppföljningen. Rättningar ska därför slå igenom i rapporten. Gemensamt
rapportstöd kan hantera periodurval, läsåtkomst och presentation; capabilityn
äger vilka uppgifter som räknas och deras betydelse. Extern export eller en
generell rapportbyggare är inte beställd genom önskemålet att ta fram rapport.

Begreppet capability omfattar här mer än den befintliga notifieringsinriktade
`targetTeamSize`-implementationen. De nuvarande kontrakten behöver granskas
mot eftermatchregistrering och rapportering före val av målgränssnitt.
Capability innebär inte i sig dynamisk plugininstallation.

### Prövning mot tre verksamheter

Fotbollskolumnen bygger på kod och intervjusvar. Innebandy och kör är
arkitekturexempel som behöver domänverifieras före implementation, inte
beslut om kompletta nya paket eller faktiska verksamhetsregler.

| Fråga | Fotboll | Innebandy – hypotes | Kör – hypotes |
| --- | --- | --- | --- |
| Medlemsegenskaper | Tröjnummer och ordinarie position på lagmedlemskap | Egna positionsval på medlemskap | Stämma på gruppmedlemskap |
| Aktivitetsuppgifter | Planerad kapten och matchuppgifter | Relevanta matchuppgifter med eget schema | Egna konsert-/repetitionsuppgifter |
| Återanvändning | Gemensam närvaro, förval, revisionsskydd och request-for-info | Samma stöd med disciplinens urval och tillämplighet | Samma stöd utan krav på match-, kapten- eller spelarbristlogik |
| Capabilities | Gröna kortet och befintlig truppstorlekskontroll | Endast uttryckligen valda och tillämpliga capabilities | Endast uttryckligen valda och tillämpliga capabilities |

Det gemensamma mönstret är objektanknutna egenskaper och komponerade
funktioner. Delad kategori som Idrott innebär inte delat beteende. Ett
framtida paket ska kunna tillföra egna regler utan nya sportvillkor i
aktivitetskärnan. Verksamhetsspecifika regler får ligga i egna capability-
implementationer; någon godtycklig regelmotor är inte beställd.

### Föreslagen ansvarsfördelning i målappen

- Aktivitetsmodulen äger aktivitet och faktisk närvaro samt publicerar
  verifierade fakta och livscykelhändelser genom små publika kontrakt.
- Disciplinområdet äger paketregistrering, egenskaper och capability-
  implementationer, kodägda fältregler, konfiguration och utfall.
- Gemensam informationsinhämtning samordnar bidrag per aktivitet, status
  och formulär. Den anropar ägande disciplins/capabilitys validering.
- Befintlig notifieringsinfrastruktur levererar färdiga notifieringar.
  Rapportläsning använder samma åtkomstregler och registrerade utfall.

Konkret paketindelning och kontraktsplacering ska hålla befintlig modulär
monolit utan cykler eller åtkomst till andra modulers interna repositories.
Samordnade närvaro-/utfallskommandon behöver en tydlig transaktionsägare.
Det kräver inte en separat driftsatt tjänst för varje del.

### Teknisk målbild

Den befintliga backendkoden använder ett Maven-projekt med verksamhetsmoduler
under `backend/src/main/kotlin/se/forena/api`. `activities`, `identity`,
`administration` och `notifications` är exempel på faktisk befintlig kod.
Modulgränser verifieras redan med Spring Modulith i `ArchitectureTest`.
Disciplinernas fulla utökningslager nedan är målbilden för kommande
implementation och är bekräftad i den slutliga specgranskningen.

Med core avses systemets basfunktioner med små publika kontrakt. Behåll
deras sammanhållna verksamhetsmoduler; samla inte alla interna repositories
och domänmodeller i en gemensam jättemodul. Ett separat litet kontraktspaket
kan däremot vara gemensamt för kärna och tillägg.

Föreslagen placering inom samma backendtjänst:

```text
se.forena.api/
  activities/                 befintlig aktivitet, kallelser, närvaro
  identity/                   befintlig identitet och personåtkomst
  administration/             befintlig struktur och administrativa roller
  notifications/              befintlig leveransinfrastruktur
  extensionapi/               små typade kontrakt, ingen disciplinimplementation
  extensions/                 register, egenskaper, RFI-samordning, runtime
  capabilities/
    greencard/                Gröna kortet-regler och rapport
  disciplines/
    football/                 paket, egenskaper och capabilitykomposition
```

Detta är logisk kodstruktur inom samma Maven-projekt och backendtjänst.
Separata processer eller Maven-artifakter ingår inte. Modulith ska verifiera
gränserna; ett undermappnamn behöver inte bli en egen applikationsmodul.

- `extensionapi` innehåller stabila objektankare, verifierad kontext och små
  kontrakt för relevanta utökningspunkter. Ingen fotbollskod.
- `activities` kan använda kontraktet för att kontrollera ett kommando men
  importerar inte `football` eller `greencard`.
- `extensions` registrerar och anropar implementationer genom kontrakten.
  Publika fakta från activities får hämtas genom dess API, aldrig genom
  dess interna repositories.
- Capabilityimplementationer får behörigt inlästa fakta och sina egna
  inställningar. Disciplinpaketen komponerar de capabilities de stödjer.
- Spring registrerar implementationerna. Förslaget kräver inte en egen
  dynamisk pluginladdare.
- Paketversioner och beständiga referenser behöver kunna läsas efter nya
  leveranser; kodändring får inte tyst ändra betydelsen av äldre utfall.
- Modulers `internal/Entities.kt` och `internal/Repositories.kt` följer repots
  konvention. Delat schema innebär inte delad rätt att läsa andras tabeller.

Det minsta kontraktet skiljer på deklarativa definitioner och körbar logik:

- En fältdefinition anger stabil nyckel, objektankare, schema, UI-metadata
  och kodägd läs-/skrivregel. Objektankare omfattar sektion, lag, medlemskap,
  aktivitet och deltagande, med serverhärledd klubbtillhörighet.
- En capabilitydefinition anger stabil nyckel/version, tillämplighet,
  grundläge, justerbarhet och de fält/kontrakt den bidrar med.
- En synkron kommandokontroll får verifierad aktör, aktivitet, föreslagen
  ändring och nödvändiga serverhämtade fakta och returnerar ett tillåtet
  beslut eller strukturerat valideringsfel. Generell deltagarkapacitet
  kontrolleras av activities själv.
- En händelsehanterare får beständigt händelse-ID, aktivitets-ID och
  generation. Den kan lämna strukturerade informationsbehov eller signaler
  genom avgränsade kontrakt; den får inte godtycklig databasåtkomst.
- Ett request-for-info-bidrag anger stabil ägare/ändamål, fält och
  färdigvillkor. Svar knyts till aktivitet, bidrag, definitionens version
  och revision. Notifieringsleverans har separat status.
- Ett rapportkontrakt läser behöriga registrerade utfall med periodfilter
  och uppgift om rapporttäckning; det får inte kringgå fältens läsregler.

`activities` äger transaktionen för deltagarsvar och kapacitetskontroll med
serialisering per aktivitet. Samordnad närvaro-/utfallsrättning ägs av en
applikationstjänst i `extensions`: den öppnar en Spring-transaktion och
anropar activities publika närvarokommando och utfallsdelens publika kommando
i samma databastransaktion. Båda gör sina behörighets- och revisionskontroller.
Lås tas i samma ordning, aktivitet före uppföljning. Fel återställer hela
kommandot. Activities importerar inte den orkestrerande tjänsten eller dess
disciplinimplementationer, vilket undviker ett modulberoende tillbaka.

Skrivningar och beständiga händelser publiceras transaktionellt genom
projektets befintliga Spring/Modulith-mönster. Informationsbehov dedupliceras
per aktivitet + stabil bidragsägare + ändamål. Paketversion lagras som
datareferens och används inte ensam för att skapa nya dubbletter.
Aktivitetsgeneration kontrolleras före behandling av sena händelser.

### Utökningspunkter för flera delar av systemet

En capability ska kunna bidra där dess funktion behöver påverka systemet.
Gör kontrakten små och separata så att en capability bara implementerar de
delar den använder.

| Utökningspunkt | Användning |
| --- | --- |
| Egenskaper och presentation | Fält, objektankare, etiketter, validering och kodägda läsregler |
| Kommandokontroll före skrivning | Kompletterande disciplinspecifika begränsningar; generella aktivitetsregler ägs av kärnan |
| Beständiga livscykelhändelser | Aktivitet ändrad/avslutad, närvaro rättad; återförsök utan dubbla utfall |
| Informationsinhämtning | Begär eftermatchfält och bidra till aktivitetens gemensamma formulär |
| Signaler och notifieringsförslag | Uppmärksamma ett tillstånd genom befintlig infrastruktur |
| Rapporter | Läs behöriga registrerade utfall och sammanställ enligt capabilityns betydelse |

En hård maxgräns kan inte säkras enbart av en händelse efter att svaret sparats.
Kontroll och skrivning måste ske under samma transaktion med skydd mot samtidiga
svar, och kontrollen gäller alla skrivvägar (webb, Telegram, assistent och import
i den mån de kan ändra den räknade statusen). Däremot lämpar sig händelser för
uppföljningsförfrågningar, rapportuppdateringar och notifiering efteråt.
Nya ja-svar som skulle överskrida maxantalet ska blockeras enligt K-031.

### Grundegenskap eller capability?

Maxantal deltagare är en grundegenskap
på aktiviteten, tillgänglig oberoende av disciplin och utan att en särskild
capability behöver aktiveras. Aktivitetskärnan äger värdet, dess validering
och den generella spärren. I första versionen anger ledaren maxantalet i ett
valfritt fält. Automatisk härledning, exempelvis utifrån spelvariant, och
generellt sektions-/lagarv ingår inte och är fortsatt parkerade.

Capabilities kan tillföra funktioner utöver den generella gränsen, exempelvis
kvoter per roll eller en specifik truppkontroll. Sådana exempel är inte nya
leveranskrav och får inte kringgå kärnans grundregler. Gröna kortet är en
capability med registrering, informationsinhämtning och rapport. Definitionen
är dock återanvändbar komponent, inte krav på ett visst antal funktioner.
En komponent kan vara liten och huvudsakligen bidra med egenskaper eller regler.

Maxantalet är ett hårt tak för ja-anmälda deltagare. Sänkt gräns bevarar
befintliga ja-svar enligt K-035. Återtaget ja-svar frigör plats enligt K-037.
Reservkö och automatisk härledning ingår inte i första versionen.

### Frontend och kanaler

Gemensamma produktionskomponenter visar fält och samlar informationsbehov;
disciplin-/capabilitykod bidrar med definitioner och nödvändiga specialeditorer
genom ett register. Kodägda synlighetsregler kontrolleras på servern. Ingen
komponent får hämta interna fält för att sedan bara dölja dem visuellt.

Föreslagen senare placering är `features/extensions`, `capabilities/<key>` och
`disciplines/<key>` i frontend. Flytta inte Next-komponenter som en del av denna
specändring; bevara befintlig återanvändning och CSS vid migrering.
Webb, Telegram, AI och MCP anropar samma behörighetskontrollerade kommandon.

## Data, integrationer och kvalitetskrav

Versionerade definitioner, objektanknutna värden, fältvis arv och aktivitetens
sparade ögonblicksbilder ska bevaras från migreringsbasen. Beständiga jobb,
idempotens och revisionskontroll krävs där befintliga flöden förlitar sig på dem.
Nya kommandokontroller behöver en tydlig transaktionsägare och samtidighetsskydd.
Ingen korsvis repositoryåtkomst eller cykel mellan activities och disciplines.

Maxantalet anges manuellt i aktivitetsfältet. Spärren gäller nya ja-anmälningar.
Befintliga ja-svar bevaras även vid sänkt gräns och överbeläggning visas.
Svar räknas per deltagande person i aktiviteten, inte per inloggat konto,
så att ett målsmanskonto med flera barn inte blir en enda deltagarplats.
Ledarroll på aktiviteten förbrukar ingen deltagarplats. Ingen reservkö ingår.
Gemensamma UI-element ska visas med produktionskomponenter på `/components`
enligt designreglerna vid implementation. Ingen UI-kod ändras i denna spec.

## Acceptanskriterier

- AK-001 (K-001): När specarna granskas framgår vad som finns i Next, vad som
  återstår i React/Kotlin och vilka beteenden som är föreslagna utökningar.
- AK-002 (K-002): Innan specen markeras Redo beskriver den beslutade
  ansvarsfördelningen och visar med konkreta discipliner vilka delar som
  återanvänds och vilka som varierar.
- AK-003 (K-003): Migreringskrav och nya funktioner kan granskas var för sig;
  #105 och nya disciplinpaket redovisas inte som befintligt Next-stöd.
- AK-004 (K-004): Varje jämförelse med innebandy eller kör skiljer bekräftat
  behov från hypotes som behöver verifieras före implementation.
- AK-005 (K-005): Varje föreslagen gemensam abstraktion kan kopplas till
  konkreta krav, och osäkra generaliseringar markeras som förslag.
- AK-006 (K-006): Befintliga disciplinflöden fungerar med samma regler och
  åtkomst i React/Kotlin som i Next; nya eftermatchflöden och läsrättigheter
  räknas inte som krav på oförändrad migrering.
- AK-021 (K-019): Kravmodellen visar hur egenskaper knyts till lagmedlemskap
  respektive enskilt aktivitetsdeltagande, och hur deras läsåtkomst kan skilja
  sig från åtkomsten till interna matchutfall.
- AK-022 (K-020): Olika fält i samma disciplin/capability kan ha olika
  kodägda läsregler. API och samlingsvy lämnar endast ut fält som aktören får
  läsa. En klubb-/laginställning kan inte ge åtkomst till ett internt fält.
- AK-026 (K-014, K-024): När en ledare sparar ett svar för en aktivitet
  ser en annan behörig ledare samma svar när uppföljningen läses igen.
  Varje ledare behöver inte lämna ett eget separat svar.
- AK-028 (K-024, K-026): Två matcher i samma lag med ofullständig uppföljning
  ger två urskiljbara uppföljningspunkter. Varje länk öppnar rätt aktivitet,
  och besvarande av den ena tar inte bort den andras uppföljningspunkt.
- AK-031 (K-024, K-028): Första notifieringen länkar till rätt aktivitets
  webbformulär och går via befintlig leveranspolicy till behöriga ledare.
  Delvis sparande eller fortsatt ofullständighet skapar inte återkommande
  påminnelser. Transportåterförsök får inte skapa nya informationsförfrågningar.

- AK-035 (K-031): En aktivitet med maxantal 10 och 10 ja-anmälda deltagare
  har inaktiverad knapp för nya ja-svar. Ja-anmälda ledare räknas inte mot
  de 10 platserna. Ett direkt serveranrop som skulle ta en elfte plats nekas.
- AK-036 (K-031): När två deltagare samtidigt försöker ta den sista platsen
  kan högst en ny ja-anmälan sparas. Den andra får besked om att det är fullt
  utan att ett ja-svar registreras.
- AK-037 (K-034): En begränsad aktivitet med 8 ja-anmälda deltagare och
  maxantal 10 visar fyllnadsgrad 80 procent och text med 8 av 10 platser.
  Vid 10 av 10 visas full aktivitet och inaktiverad ja-knapp. Ledares ja-svar
  ändrar varken antalet fyllda platser eller progressbarens värde.
- AK-038 (K-033): Två registrerade disciplinpaket kan komponera samma
  capabilityimplementation med egna tillämpliga inställningar utan att
  implementationen kopieras eller kärnan får nya sportvillkor.
- AK-039 (K-031, K-034, K-035): Om en aktivitet har 12 ja-anmälda deltagare
  och gränsen sänks till 10 finns samtliga 12 ja-svar kvar. Vyn visar 12 av
  10 och överbeläggning; ja-knappen för nya anmälningar är inaktiverad.
  Servern nekar nya ja-svar. Ingen befintlig deltagare avbokas automatiskt.
- AK-040 (K-031, K-036): Aktivitetens skapa-/redigeraformulär har ett valfritt
  maxantalsfält. Ett positivt heltal kan sparas; noll, negativa tal och
  decimaltal nekas. Tomt fält sparar obegränsad aktivitet utan anmälningsspärr.
- AK-041 (K-031, K-037): Med 10 av 10 platser upptagna kan en anmäld deltagare
  återta sitt ja. Därefter kan en ny deltagare ta den frigjorda platsen.
  Ingen reservplacering eller automatisk anmälan görs. Vid 12 av 10 måste
  antalet först sjunka under 10 innan ett nytt ja kan sparas.
- AK-042 (K-034, K-038): Begränsade aktivitetskort och aktivitetsdetaljer
  visar progressbar och korrekt platsangivelse. Obegränsade aktiviteter
  saknar progressbar. Vid överbeläggning visar texten faktiskt antal medan
  den visuella baren är full, utan att antyda att antal deltagare har minskats.
- AK-047 (K-002, K-033): Modulverifiering avvisar cykler och beroenden till
  andra modulers interna repositories. Aktivitetskärnan importerar inga
  konkreta fotbolls-/Gröna kortet-implementationer. Samma kommandokontroller
  gäller oavsett kanal.

Befintliga jämförelsekrav för migrering gäller fortsatt.

## Bekräftade beslut och motiv

- Migrera Next-beteendet först och härled mönster ur konkreta disciplinbehov.
- Fältdefinitioner kan ägas av disciplin eller capability; synlighet anges
  per fält i kod och ändras genom PR.
- Disciplinen anger capabilityns grundläge och om lagadmin får ändra aktivering.
- Capabilities kan bidra till ett gemensamt request-for-info per aktivitet.
  Händelse, förfrågan, svar och leverans av notifiering är skilda begrepp.
- 2026-10-27, omgång 13: Användaren vill kunna ange maxantal deltagare
  exklusive ledare. Capability är föreslagen placering, inte ett redan
  beslutat generellt kontrakt.
- Ursprungliga intervjusvar finns bevarade i [fotbollsspecen](fotboll.md).
- 2026-10-27, omgång 15: Capability betyder en återanvändbar komponent som
  kan användas av flera discipliner.
- 2026-10-27, omgång 15: Maxantalet är ett hårt tak för ja-anmälda deltagare,
  exklusive ledare. Ja-knappen ska vara inaktiverad vid full aktivitet.
  En progressbar ska visa fyllnadsgraden för begränsade aktiviteter.
- 2026-10-27, omgång 16: Maxantalets förval/härledning lämnas uttryckligen
  öppna. Generellt sektions-/lagarv är inte accepterat. I fotboll beror ett
  lämpligt maxantal på spelvariant; 7v7 med max 10 är ett exempel, ingen
  fastställd regel eller förbundsregel.
- 2026-10-27, omgång 16: Sänkt maxantal bevarar befintliga ja-svar, visar
  överbeläggning och stoppar nya ja-svar. Ingen automatisk avbokning.
- 2026-10-27, omgång 17: Ett enda extra valfritt aktivitetsfält räcker för
  att ange maxantalet manuellt. Automatisk härledning från spelvariant/arv
  ingår inte i första versionen. Återtaget ja frigör plats direkt, reservkö
  ingår inte och progressbar visas i kort och detaljer för begränsade aktiviteter.
- 2026-10-27, omgång 17: Återaktivering ska inte skapa dubbletter/historiska
  notifieringar. Rapporten visar täckning och saknade uppgifter. Närvaro
  och berörda matchutfall rättas atomärt enligt fotbollsspecen.

## Implementationsdetaljer inom den bekräftade målbilden

Kodstruktur och kontrakt ingår i den bekräftade tekniska målbilden.
Detaljer som klassnamn får anpassas vid implementation
inom ansvarsfördelningen, de publika kontrakten och Modulith-verifierade
beroendegränser. Maxantalets kärnansvar, manuella fält, beteende och UI samt
atomära närvaro-/utfallskommandon är specificerade ovan.

## Parkerat och avgränsat till senare

- Automatisk härledning av maxantal, inklusive koppling till fotbollens
  spelvariant, och eventuellt arv. Manuellt valfritt fält är tillräckligt
  för första versionen; parkeringen blockerar därför inte den leveransen.
- Reservkö, automatisk uppflyttning och återkommande eftermatchpåminnelser.
- Kompletta nya innebandy-/körpaket. Jämförelserna är hypotetiska och ger
  inga nya verksamhetsregler utan fortsatt domänunderlag.
- Dynamisk tredjepartskod, generell schemaeditor och generell rapportbyggare.

Efter omgång 17 återstår inga kända blockerande produktfrågor inom denna
avgränsning. Användaren har bekräftat den slutliga sammanfattningen.

## Bekräftelse

2026-10-27: Användaren bekräftade båda specarnas slutliga sammanfattning:
”Ja, specarna ser bra ut”. Bekräftelsen omfattar teknisk målbild och
avgränsningen att automatisk härledning av maxantal inte ingår i första
versionen. Status är Redo.
Ingen implementation är beställd genom intervjun.

## Ändringshistorik

- 2026-10-27, slutlig bekräftelse: Användaren godkände båda specarna.
  Markerat Redo; implementation och verifiering är fortsatt ej påbörjade.
- 2026-10-27: Inledande intervju sparad i denna fil; ursprunglig historik
  bevarad i [fotbollsspecen](fotboll.md).
- 2026-10-27, omgång 13: Delat ut generell spec och fotbollsspec med bevarade
  krav-/acceptans-ID:n. Tillagt deltagargräns och konkret kodstrukturförslag.
- 2026-10-27, omgång 14: Användaren föreslår maxantal som grundegenskap.
  Rekommendationen har ändrats till aktivitetsägt värde och generell regel,
  med kompletterande capabilities endast där särskilt beteende behövs.
- 2026-10-27, omgång 15: Preciserat capability som återanvändbar komponent.
  Bekräftat hårt ja-tak, inaktiverad ja-knapp vid full aktivitet och progressbar.
  Tillagt kriterier för deltagarräkning, samtidighet och fyllnadsgrad.
- 2026-10-27, omgång 16: Parkerat maxantalets förval/härledning och sparat
  spelvariant som relevant underlag. Bekräftat beteende vid sänkt gräns
  och tillagt acceptansfall för överbeläggning utan automatisk avbokning.
- 2026-10-27, omgång 17: Bekräftat manuellt valfritt maxantalsfält,
  frigjord plats efter återtaget ja, ingen reservkö och progressbar i kort
  och detaljer men inte vid obegränsad aktivitet. Konkretiserat teknisk
  målbild, kontrakt, transaktionsägare och acceptanskriterier. Inväntar
  slutlig sammanfattningsbekräftelse.
