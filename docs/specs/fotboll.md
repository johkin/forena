# Fotboll – migrering, spelaregenskaper och matchuppföljning

- Status: Redo
- Senast uppdaterad: 2026-10-27
- Berörda dokument: [Generell disciplinspec](discipliner.md),
  [Discipliner](../disciplines.md), [Närvarospec](narvaroregistrering.md),
  [Arkitektur](../architecture.md)
- Implementation och verifiering: Ej påbörjad. Ingen kod har implementerats
  eller funktionstestats inom specarbetet.

## Problem och mål

Bevara Next-appens fotbollsfunktionalitet vid migrering till React/Kotlin och
därefter tillföra intern matchuppföljning av faktisk lagkapten och Gröna kortet,
med historik och rapport. Definiera konkreta spelaregenskaper och deras åtkomst.

Gemensam utökningsmekanik ägs av [discipliner.md](discipliner.md). Krav-ID:n och
acceptans-ID:n från den ursprungliga intervjun är bevarade och delade mellan
filerna. Referenser till K-020 och liknande kan därför avse den generella specen.

## Omfattning

### Ingår

- Befintligt kodägt fotbollspaket med spelformer 3v3–11v11, positioner,
  matchförval, medlemskapsfält, matchfält och deltagarfält.
- Migrering med bevarat beteende enligt den generella specens migreringsbas.
- Faktisk lagkapten skild från planerad.
- Valbar Gröna kortet-capability med eftermatchuppföljning och rapport.
- Intern spelarhistorik och kodägda läsregler för spelaregenskaper.

### Ingår inte

- Resultat, matchanteckningar och spelarbedömningar i första utökningen.
- Automatisk härledning av faktisk kapten från planering eller ja-svar.
- Automatisk historisk massinhämtning.
- Implementation beställs separat; denna intervju beställer inte kod.

## Användare, roller och flöden

1. Aktivitetens sluttid nås. Tillämpliga aktiva capabilities och disciplinen
   bidrar med informationsbehov till en gemensam förfrågan för aktiviteten.
2. Alla lagets behöriga ledare kan hitta uppföljningen på lagöversikten.
   Första notifiering använder befintlig privat kanalpolicy.
3. Ledaren öppnar aktivitetens samlade formulär. Saknas sparad närvaro
   registreras den först i samma flöde.
4. Ledaren registrerar faktisk kapten och, när Gröna kortet är aktiverat,
   mottagare eller uttryckligt inget kort utdelat. Urvalet är faktiskt
   deltagande spelare för egna laget, inklusive inlånade.
5. Delar kan sparas. Förfrågan ligger kvar tills alla efterfrågade uppgifter
   är besvarade eller ett capabilitybidrag avslutats genom avstängning.
6. Sparade utfall visas i intern historik och rapport. Alla lagets ledare
   kan rätta dem utan tidsgräns. Vid berörd närvarorättning kan utfallet
   rättas direkt i samma flöde.

Alla lagets ledare får läsa, registrera och rätta matchuppföljning.
Lagadmin får aktivera Gröna kortet. Målsmans-/spelaråtkomst ger inte tillgång
till intern eftermatchuppföljning eller rapporter.
Tröjnummer och position får visas för hela laget och dess målsmän enligt
kodägda fältregler. Matchuppföljning och dess rapporter förblir interna för ledare.

## Krav

- K-007: Fotbollens utökning ska stödja uppföljning efter match, med uppgift
  om vem som fick gröna kortet och vem som var lagkapten. Gröna kortet gäller
  endast egna lagets spelare, normalt en mottagare men flera ska tillåtas i
  undantagsfall. Faktisk lagkapten ska registreras separat från planerad
  lagkapten, med högst en faktisk lagkapten per match. Uppföljningen får
  sparas ofullständig enligt K-016; spelarurvalet följer K-009.
- K-008: Läsåtkomst ska kunna skilja mellan fält som målsmän får se och
  fält som är interna för ledare. Gröna kortets mottagare och faktisk
  lagkapten ska endast vara tillgängliga för ledare; målsmän och spelare får
  inte åtkomst till dessa uppgifter genom sina målsmans-/spelarroller.
  Målsmän ska kunna se spelaregenskaper som tröjnummer och position enligt
  respektive fälts kodägda åtkomstregel (K-020). Tröjnumrets åtkomst följer
  K-032 och positionens K-039. Övriga fält ska följa sina uttryckliga
  kodägda åtkomstregler.
  Ledaråtkomsten följer K-014.
- K-009: Mottagare av gröna kortet och faktisk lagkapten ska väljas bland
  spelare som faktiskt deltog i matchen för egna laget. Inlånade spelare som
  representerade laget ingår. Kallelsens ja-svar är inte bevis på deltagande.
- K-010: Gröna kortets uppföljning ska skilja mellan ännu inte registrerat,
  uttryckligen inget kort utdelat och registrerade mottagare.
- K-011: Ledare ska ha en historiköversikt per spelare som visar när och hur
  många gånger spelaren varit faktisk lagkapten respektive fått gröna kortet.
  Historiken ska följa samma interna läsåtkomst som matchuppgifterna.
  Förvalet är aktuellt lag och aktuell säsong. Ledaren ska kunna välja äldre
  säsonger och datumintervall inom sin behöriga historik. Sammanställning
  mellan olika lag ingår inte genom detta beslut.
- K-012: Faktisk närvaro ska vara sparad innan eftermatchuppföljning kan
  registreras. Närvaro och disciplinutfall är separata uppgifter.
- K-013: Behöriga ledare ska kunna rätta eftermatchuppföljningen utan fast
  tidsgräns. Ändringshistorik ska visa vem som ändrade vad och när. Samtidiga
  ändringar får inte tyst skriva över varandra.
- K-014: Alla ledare för matchens lag ska få läsa, registrera och rätta
  eftermatchuppföljningen samt läsa dess spelarhistorik. Åtkomsten ska
  verifieras på servern och ska inte kräva att ledaren deltog i matchen.
  Teknisk mappning av lagets ledaråtkomst till behörigheter ska följa den
  befintliga åtkomstmodellen; andra roller får ingen ny åtkomst genom detta krav.
- K-015: När en närvarorättning berör en registrerad kortmottagare eller
  faktisk lagkapten ska ledaren kunna rätta matchuppföljningen direkt i
  samband med närvarorättningen. Lösningen ska erbjuda omedelbar rättning
  i flödet, snarare än kräva att ledaren återkommer till ett separat ärende.
  Ingen automatisk ersättare eller tyst radering av utfallet är beslutad.
- K-016: Matchuppföljningen ska kunna sparas ofullständig, exempelvis med
  gröna kortet registrerat men faktisk lagkapten ännu okänd. Saknade uppgifter
  ska markeras tydligt. Planerad kapten får inte automatiskt bli faktisk,
  och ett tomt kortval får inte automatiskt betyda inget kort utdelat.
- K-017: Eftermatchuppföljningen ska fungera även för importerade spelade
  matcher. Detta öppnar inte deras skrivskyddade planeringsfält för redigering.
- K-018: Första eftermatchutökningen avgränsas till faktisk lagkapten,
  gröna kortet och tillhörande historik/rapport. Resultat, matchanteckningar
  och spelarbedömningar skjuts upp.
- K-021: Gröna kortet ska vara en capability som kan väljas per lag och
  omfattar eftermatchregistrering samt rapport över registrerade utfall.
  Disciplinen ska ange capabilityns grundläge och om lagadministratören
  får ändra aktiveringen. Gröna kortet ska vara av från början och valbart
  per lag av lagadministratören. Detta ändrar inte kodägd fältsynlighet.
- K-023: Aktivitetens sluttid ska automatiskt utlösa eftermatchinhämtningen
  för tillämpliga matchaktiviteter. Om sparad närvaro saknas ska det samlade
  flödet först erbjuda närvaroregistrering och därefter matchuppföljning.
  Registrering av matchutfall kräver fortsatt sparad närvaro enligt K-012.
- K-027: Avstängning av Gröna kortet ska stoppa nya förfrågningar från
  capabilityn och avsluta dess ännu obesvarade bidrag utan att registrera
  dem som besvarade eller inget kort utdelat. Registrerade utfall, historik
  och rapporter ska bevaras. Övriga capabilities och bidrag för aktiviteten
  ska inte påverkas av avstängningen.
- K-029: Flyttad sluttid ska omplanera utlösningen med registrerade svar
  bevarade. Inställd match ska inte skapa nya eftermatchförfrågningar och
  ska avsluta eventuella befintliga förfrågningar utan att radera sparade utfall.
- K-030: Aktivering ska ge automatiska förfrågningar för kommande matcher.
  Tidigare spelade matcher ska inte automatiskt massgenerera förfrågningar,
  men behöriga ledare ska kunna öppna dem och följa upp manuellt.

- K-032: Tröjnummer i fotbollsdisciplinen ska vara synligt för hela laget
  och lagets målsmän, enligt befintligt behörigt lag-/målsmansmedlemskap.
  Det innebär inte offentlig åtkomst. Regeln är kodägd enligt K-020 i den
  generella specen; positionens motsvarande beslut anges i K-039.
- K-039: Position i fotbollsdisciplinen ska vara synlig för hela laget och
  dess målsmän med samma åtkomstområde som tröjnummer. Läsregeln är kodägd
  per fält; den öppnar inte interna eftermatchutfall eller deras rapporter.
- K-040: Återaktivering av Gröna kortet ska gälla kommande matcher, bevara
  registrerade svar och återanvända beständiga referenser utan dubbletter.
  Den får inte skapa nya historiska förfrågningar eller en ny historisk
  notifieringsserie. Äldre spelade matcher kan fortsatt följas upp manuellt.
- K-041: Spelarhistorik och rapport ska visa antal registrerade utfall och
  tydligt ange hur många relevanta matcher i perioden som saknar respektive
  efterfrågad uppföljningsuppgift. Ofullständig rapportering får inte tolkas
  som säkert noll kaptensuppdrag eller kort. Redan registrerade delutfall
  får räknas även om en annan uppgift från samma match fortfarande saknas.
- K-042: En rättning som omfattar både närvaro och berörda matchutfall ska
  sparas atomärt. Båda delarnas aktuella behörigheter och revisioner ska
  kontrolleras. Om någon del misslyckas sparas ingen del av rättningen.
  Tidigare sparade data och historik ska då vara intakta, och användaren
  ska få besked om felet med möjlighet att behålla sitt utkast och läsa om.
  Ingen automatisk ersättare för en borttagen kapten/kortmottagare ska väljas.

## Data, integrationer och kvalitetskrav

Fotbollsfälten behåller sina befintliga objektankare, paketversioner och
sparade matchögonblicksbilder vid migrering. Eftermatchutfall knyts till en
aktivitet och faktiskt deltagande personer. Matchuppgifter och per-spelar-
rapporter använder samma sparade utfall så att rättningar slår igenom.

Gröna kortet är av från början, valbart av lagadmin och internt för ledare.
Aktivering, request-for-info, gemensamt UI och notifiering använder kontrakten
i den generella specen. Truppstorlekskontrollen `targetTeamSize` migreras med
befintligt beteende och är inte samma sak som föreslaget maxantal deltagare.

## Acceptanskriterier

- AK-007 (K-007): En behörig ledare kan i en spelad matchs uppföljning
  registrera och läsa vem som fick gröna kortet och vem som var lagkapten.
  Urval, rättningar och saknade uppgifter följer kriterierna nedan.
- AK-008 (K-008): En målsman får läsa tillåtna fält inom sin beslutade
  åtkomst, medan interna ledarfält inte lämnas ut till målsmannen.
  Gröna kortets mottagare och faktisk lagkapten lämnas inte ut till användare
  med enbart målsmans-/spelaråtkomst, oavsett om uppgiften gäller det egna
  barnet eller en annan spelare. Tröjnummer och position följer AK-034 och
  AK-043. Samma kodägda läsregler gäller vid UI- och API-åtkomst.
- AK-009 (K-007): En ledare kan registrera en eller flera olika mottagare av
  gröna kortet i egna laget. Motståndarlagets spelare kan inte registreras
  som mottagare. Ett tekniskt maxantal för flera mottagare är inte beslutat.
- AK-010 (K-007): Om faktisk lagkapten skiljer sig från planerad kan ledaren
  registrera utfallet utan att ändra den sparade planeringen. Uppföljningen
  tillåter inte flera faktiska lagkaptener för samma match.
- AK-011 (K-009): En faktiskt deltagande spelare från egna laget, inklusive
  en inlånad spelare, kan väljas. En spelare som endast tackat ja men inte
  deltagit kan inte väljas. Saknad och rättad närvaro följer AK-014/AK-017.
- AK-012 (K-010): Ej registrerat, inget kort utdelat och registrerade
  mottagare visas som skilda tillstånd. Ej registrerat får inte presenteras
  som att inget kort delades ut.
- AK-013 (K-008, K-011): En behörig ledare kan per spelare se datum/matcher
  och antal registrerade kaptensuppdrag respektive gröna kortet-tilldelningar
  inom översiktens period. Målsmans-/spelaråtkomst ensam ger inte tillgång
  till översikten. Rättningar ska återspeglas utan dubbelräkning.
- AK-014 (K-012): Om närvarorapport saknas kan matchuppföljningen inte
  registreras. Ett ja-svar på en kallelse ersätter inte sparad närvaro.
- AK-015 (K-013): En ledare kan rätta tidigare registrerade utfall utan
  tidsgräns. Historiken visar aktör, tidpunkt och ändringar. Om två ledare
  sparar utifrån samma revision avvisas den inaktuella skrivningen utan att
  skriva över den första ledarens ändring.
- AK-016 (K-008, K-014): Två olika ledare för matchens lag får båda läsa,
  registrera och rätta uppföljningen. En användare med enbart ledaråtkomst
  till ett annat lag får inte åtkomst genom detta krav.
- AK-017 (K-009, K-015): När en ledare tar bort en registrerad kortmottagare
  eller faktisk lagkapten från närvaron kan motsvarande matchutfall rättas
  direkt i samma flöde, med ändringshistorik enligt K-013.
- AK-018 (K-011): Spelarhistoriken öppnas för aktuellt lag och aktuell
  säsong. Byte till äldre säsong eller datumintervall uppdaterar historiken
  och antalen utan att utöka användarens läsåtkomst.
- AK-019 (K-010, K-016): En uppföljning med registrerat grönt kort och
  okänd faktisk lagkapten kan sparas. Den saknade kaptensuppgiften visas
  uttryckligen; planerad lagkapten räknas inte som ett faktiskt kaptensuppdrag.
- AK-020 (K-012, K-017): En importerad spelad match med sparad närvaro
  kan få eftermatchutfall registrerade och rättade av lagets ledare utan
  att de importerade planeringsuppgifterna ändras.
- AK-023 (K-021, K-022): För ett lag som använder Gröna kortet kan en
  avslutad match ge en informationsförfrågan vars fält visas tillsammans
  med andra tillämpliga eftermatchfält i ett gemensamt UI. Ett lag utan
  capabilityn får ingen ny Gröna kortet-förfrågan från händelsen.
- AK-024 (K-012, K-023): När en tillämplig match når sin sluttid kan dess
  eftermatchförfrågan skapas utan att en ledare manuellt avslutar matchen.
  Saknas närvarorapport erbjuds närvaro först i samma flöde, och matchutfall
  kan inte sparas förrän närvaron är registrerad.
- AK-025 (K-007, K-011, K-024): Givet två matchaktiviteter för samma lags
  olika matchgrupper samma helg kan ledarna registrera en kortmottagare och
  en faktisk kapten för vardera matchen. Matchernas svar påverkar inte varandra.
  Spelarhistoriken visar respektive tilldelning med rätt match och datum;
  flera kortmottagare i samma match tillåts fortsatt enligt K-007.
- AK-027 (K-010, K-016, K-025): Delvis sparade svar bevaras medan aktivitetens
  förfrågan fortfarande visas som ofullständig. När faktisk kapten är angiven
  och gröna kortet har mottagare eller uttryckligt inget-kort-svar kan denna
  första versions informationsbehov markeras som besvarat.
- AK-029 (K-020, K-021): Gröna kortet är initialt av för laget och kan
  aktiveras av lagadministratören. För en capability som disciplinen markerat
  som ej justerbar kan lagadmin inte överstyra aktiveringen. Inget av dessa
  val ändrar fältens kodägda synlighetsregler.
- AK-030 (K-025, K-027): Vid avstängning avslutas obesvarade Gröna kortet-
  bidrag med särskild avslutsorsak, utan att räknas som besvarade eller
  inget kort utdelat. Sparade korttilldelningar finns kvar i historik/rapport.
  En obesvarad kaptensfråga för samma aktivitet ligger fortfarande kvar.
- AK-032 (K-029): Om en match flyttas före sluttid ändras tidpunkten för
  dess eftermatchinhämtning. Befintliga svar bevaras. Inställning avslutar
  förfrågan utan att markera den som besvarad eller radera utfallen.
- AK-033 (K-030): När capabilityn aktiveras skapas inte automatiskt en kö
  av äldre spelade matchers förfrågningar. En behörig ledare kan ändå öppna
  en äldre spelad match och registrera uppföljning efter sparad närvaro.

- AK-034 (K-020, K-032): En spelare eller målsman med behörig åtkomst till
  laget kan läsa lagets spelares tröjnummer. Samma åtkomst ger inte tillgång
  till gröna kortets mottagare eller faktisk lagkapten. En användare utan
  behörig lag-/målsmansåtkomst får inte tröjnummer genom detta krav.
- AK-043 (K-020, K-032, K-039): En behörig spelare eller målsman kan läsa
  lagets spelares tröjnummer och position. Samma användare får inte läsa
  faktisk kapten, gröna kortet eller den interna rapporten via UI eller API.
- AK-044 (K-024, K-030, K-040): Avstängning följd av återaktivering behåller
  tidigare utfall. Upprepade eller sena händelser skapar inte dubbla bidrag
  för samma aktivitet och ändamål, och historiska matcher massnotifieras inte.
- AK-045 (K-010, K-011, K-041): Om perioden innehåller en registrerad
  korttilldelning, ett uttryckligt inget-kort-svar och en match utan
  kortuppföljning visar rapporten en registrerad tilldelning samt en saknad
  uppföljning. Den obesvarade matchen räknas inte som inget utdelat kort.
  En registrerad faktisk kapten visas även om kortuppföljningen är ofullständig.
- AK-046 (K-013, K-015, K-042): Om en närvaro-/utfallsrättning möter en
  inaktuell revision eller ett valideringsfel lämnas båda delarna oförändrade.
  En lyckad rättning sparar båda delarna med ändringshistorik; ett återförsök
  skapar inte dubbla utfall. Ledaren kan rätta matchutfallet i samma flöde.

## Bekräftade beslut och motiv

De första tolv omgångarna omfattade både generell mekanik och fotboll.
De bevaras här som intervjuhistorik; den generella specen äger generella krav.

- 2026-10-27: Användaren vill grilla fram specar för discipliner, utgå från
  Next-appen och därefter utöka. Arkitektur och gemensamma mönster ska utredas.
- 2026-10-27, omgång 1: Prioriteten är att migrera Next-appens funktionalitet.
- 2026-10-27, omgång 1: Fotboll, innebandy och kör är lämpliga fall att pröva.
  Användaren har detaljerad insyn endast i fotboll; övriga fall kräver tydlig
  hantering av antaganden.
- 2026-10-27, omgång 1: Ta fram disciplinernas krav och låt dem visa
  arkitekturmönstret. Uppdelningen i kontrakts- och delspecar är inte bekräftad.
- 2026-10-27, omgång 2: Bevara Next-beteendet vid migrering.
- 2026-10-27, omgång 2: Prioriterad utökning är uppföljning efter match,
  exempelvis gröna kortets mottagare och vem som var lagkapten.
- 2026-10-27, omgång 2: Vissa fält ska kunna vara synliga för målsmän;
  andra är interna för ledare. Ingen specifik fältklassning är ännu beslutad.
- 2026-10-27, omgång 3: Gröna kortets mottagare hör endast till egna laget.
  Vanligen är mottagaren en, men undantagsvis kan flera få kortet.
- 2026-10-27, omgång 3: Faktisk lagkapten hålls separat från planerad.
  Endast en faktisk lagkapten per match ska kunna registreras.
- 2026-10-27, komplettering till omgång 3: Gröna kortets mottagare och
  faktisk lagkapten ska båda vara interna, endast för ledare. Detta innebär
  ingen ändring av den planerade lagkaptenens befintliga migreringsbeteende.
- 2026-10-27, omgång 4: Urvalet ska bygga på faktiskt deltagande för egna
  laget, inklusive inlånade spelare som representerade laget.
- 2026-10-27, omgång 4: Ett uttryckligt besked att inget grönt kort delades
  ut ska skiljas från att uppföljning ännu inte har registrerats.
- 2026-10-27, omgång 4: Ledarna behöver en historiköversikt per spelare med
  när och hur många gånger spelaren varit kapten eller fått gröna kortet.
- 2026-10-27, omgång 5: Närvaron ska vara sparad före matchuppföljningen.
- 2026-10-27, omgång 5: Uppföljningen ska kunna rättas utan tidsgräns,
  med ändringshistorik och skydd mot samtidiga överskrivningar.
- 2026-10-27, omgång 5: Alla lagets ledare får läsa, registrera och rätta.
- 2026-10-27, omgång 6: Uppföljningen ska kunna rättas på en gång vid
  närvarorättning. Den tidigare föreslagna hanteringen som ett kvarstående
  rättningsärende är inte vald som huvudflöde.
- 2026-10-27, omgång 6: Historiken avgränsas som förval till aktuellt lag
  och aktuell säsong, med möjlighet att välja äldre säsonger och datumintervall.
- 2026-10-27, omgång 6: Ofullständig uppföljning får sparas med tydligt
  markerade saknade uppgifter.
- 2026-10-27, omgång 7: Målsmän ska kunna se tröjnummer, position och
  liknande spelaregenskaper. Det principiella behovet är egenskaper på
  spelaren, inte särskild generell logik för just tröjnummer.
- 2026-10-27, omgång 7: Eftermatchuppföljning ska även gälla importerade matcher.
- 2026-10-27, omgång 7: Första utökningen avgränsas till faktisk kapten,
  gröna kortet och historik. Resultat, anteckningar och bedömningar kommer senare.
- 2026-10-27, omgång 8: Gröna kortet är valbart per lag.
- 2026-10-27, omgång 8: Synlighet ska kunna anges per fält i respektive
  capability eller disciplin. Ändringar kräver PR; administrativt
  konfigurerbar överstyrning av synlighet valdes inte.
- 2026-10-27, omgång 8: Gröna kortet ska kunna bidra med request-for-info
  vid match-avslutad, så att ledaren får ett samlat UI med eftermatchfält.
  Benämningen Gröna-kortet-disciplin tolkas i sammanhanget som capabilityn
  inom fotbollsdisciplinen, inte en separat sektionstilldelad disciplin.
- 2026-10-27, omgång 9: Aktivitetens sluttid utlöser flödet automatiskt.
- 2026-10-27, omgång 9: Saknad närvaro registreras först i samma flöde.
- 2026-10-27, omgång 9: Svaren gäller en aktivitet. Laget har två
  matchgrupper och kan få två gröna kort samma helg, genom olika matcher.
  Uppföljningen får därför inte avgränsas eller dedupliceras per lag/helg.
- 2026-10-27, omgång 10: Förfrågan ligger kvar tills alla efterfrågade
  uppgifter för aktiviteten är besvarade; delvis sparande är fortsatt tillåtet.
- 2026-10-27, omgång 10: Gemensam uppföljningspunkt på lagöversikten är
  accepterad. Användaren föreslår också push eller aktuell chattkanal/Telegram;
  exakt leveranspolicy är inte beslutad.
- 2026-10-27, omgång 10: Lagadministratören styr aktivering. Användaren
  föreslår att disciplinen även kan ange om en capability är justerbar.
- 2026-10-27, omgång 11: Disciplinen ska ange grundläge och justerbarhet.
  Gröna kortet är av från början och valbart per lag av lagadmin.
- 2026-10-27, omgång 11: Avstängning stoppar nya förfrågningar och avslutar
  obesvarade Gröna kortet-bidrag; historik/rapporter och andra bidrag bevaras.
- 2026-10-27, omgång 11: Första notifiering enligt befintlig Telegram/push-
  policy i privata ledarkanaler, med länk till webbformuläret. Återkommande
  påminnelser ingår inte i första versionen.
- 2026-10-27, omgång 12: Flyttad sluttid omplanerar inhämtningen med svar
  bevarade. Inställd match avslutar förfrågan utan att radera sparade utfall.
- 2026-10-27, omgång 12: Automatiska förfrågningar gäller kommande matcher
  efter aktivering. Äldre spelade matcher kan följas upp manuellt.

- 2026-10-27, omgång 13: Fotbollsdisciplinens tröjnummer får vara synligt
  för hela laget och målsmän. Ingen motsvarande ny regel är bekräftad för position.
- 2026-10-27, omgång 17: Även position ska kunna läsas av hela laget och
  målsmän. Gröna kortet, faktisk kapten och interna rapporter förblir ledaruppgifter.
- 2026-10-27, omgång 17: Återaktivering är framåtriktad utan dubbletter
  eller historisk notifieringsserie. Rapporter visar registrerade utfall
  och saknad uppföljning. Närvaro och berörda utfall rättas atomärt.

## Tekniska rekommendationer och avgränsningar

Generella kontrakt, capabilitystruktur, transaktionsägare och kodstruktur
beskrivs i den generella specens bekräftade tekniska målbild.
De är inte redan implementerade. Inga kända produktfrågor blockerar den
avgränsade första versionen efter omgång 17.

## Parkerat till senare

Automatisk härledning av maxantal utifrån spelvariant ingår inte i första
versionen. Ledaren anger i stället maxantalet manuellt i ett valfritt
aktivitetsfält enligt K-036 i den generella specen. För 7v7 kan exempelvis
10 anges, men det är ingen fast standard eller förbundsregel. Generellt
sektions-/lagarv är inte valt. Parkeringen blockerar inte denna leverans.

## Bekräftelse

2026-10-27: Användaren bekräftade båda specarnas slutliga sammanfattning:
”Ja, specarna ser bra ut”. Status är Redo. Automatisk härledning av maxantal
är avgränsad till senare enligt den generella specen. Implementation är
fortsatt ej påbörjad och beställs separat.

## Ändringshistorik

- 2026-10-27, slutlig bekräftelse: Användaren godkände båda specarna.
  Markerat Redo; implementation och verifiering är fortsatt ej påbörjade.
- 2026-10-27: Skapat utkast med Next-inventering, relaterade issues,
  preliminära arkitekturförslag och första intervjuomgångens öppna frågor.
- 2026-10-27, omgång 1: Sparat migreringsprioritet, jämförelsefallen och
  användarens inriktning att härleda arkitektur ur disciplinernas krav.
- 2026-10-27, omgång 2: Sparat oförändrat migreringsbeteende, behov av
  eftermatchuppföljning och uppdelad fältsynlighet för målsmän och ledare.
- 2026-10-27, omgång 3: Sparat mottagarregler för gröna kortet och separat
  faktisk lagkapten med högst en person per match. Synlighetsfrågan är obesvarad.
- 2026-10-27, komplettering till omgång 3: Sparat att gröna kortets
  mottagare och faktisk lagkapten är interna ledaruppgifter; synlighetsfrågan
  för dessa två fält är därmed besvarad.
- 2026-10-27, omgång 4: Sparat faktiskt deltagande inklusive inlånade,
  uttryckligt inget-kort-utfall och intern spelarhistorik. Kompletterat
  acceptanskriterier och möjliga arkitekturmönster härledda ur kraven.
- 2026-10-27, omgång 5: Sparat krav på föregående närvaroregistrering,
  rättningar utan tidsgräns med audit/konfliktskydd och åtkomst för alla
  lagets ledare. Nästa frågor gäller närvarorättningar, historik och luckor.
- 2026-10-27, omgång 6: Sparat omedelbar rättning vid närvaroändring,
  historikens förval/filter och möjlighet att spara ofullständig uppföljning.
- 2026-10-27, omgång 7: Sparat spelarens egenskaper som kravmönster,
  importerade matcher och avgränsad första utökning. Konkretiserat användarens
  förslag om Gröna kortet som capability med registrering och rapport.
- 2026-10-27, omgång 8: Sparat valbar capability, kodägd synlighet per fält
  och request-for-info till samlat eftermatch-UI. Ersatt öppna förslag om
  administrativ synlighetskonfiguration och separat Gröna kortet-formulär.
- 2026-10-27, omgång 9: Sparat automatisk utlösning vid sluttid, närvaro
  först och aktivitetsankrade gemensamma svar. Tillagt acceptansfall för
  två matchgrupper med separata matcher och korttilldelningar samma helg.
- 2026-10-27, omgång 10: Sparat förfrågans färdigvillkor, uppföljningspunkt
  per aktivitet och lagadminaktivering. Markerat disciplinstyrd justerbarhet
  och push/Telegram som förslag att precisera.
- 2026-10-27, omgång 11: Bekräftat disciplinägt grundläge/justerbarhet,
  avstängning med bevarad historik och första notifiering utan påminnelseserie.
- 2026-10-27, omgång 12: Sparat regler för flyttad/inställd match och
  historisk inhämtning. Sammanställt huvudflöde, migreringsbas och konkret
  arkitekturprövning med tydligt hypotetiska innebandy-/körexempel.
- 2026-10-27, omgång 13: Flyttat fotbollskraven till egen spec med bevarade
  ID:n och ursprunglig intervjuhistorik. Lagt till beslutad tröjnummersynlighet.
- 2026-10-27, omgång 16: Sparat spelvariant som underlag för maxantal,
  med 7v7/max 10 som exempel. Härledning och förval lämnas uttryckligen öppna.
- 2026-10-27, omgång 17: Bekräftat position för hela laget och målsmän,
  återaktivering utan dubbletter, rapporttäckning och atomära rättningar.
  Manuellt maxantalsfält räcker; automatisk härledning har avgränsats bort
  från första versionen. Inväntar slutlig sammanfattningsbekräftelse.
