# Lagmedlemmar – hantera trupp och medlemsansökningar

- Status: Redo
- Senast uppdaterad: 2026-10-26
- Berörda dokument: [Designregler: Truppen](../design-spec.md#truppen),
  [arkitektur](../architecture.md), [säkerhetsarkitektur](../security-architecture.md)
- Implementation och verifiering: Delvis implementerad; se kravredovisningen nedan.
  Produktkravens status är fortsatt Redo.

## Problem och mål

En lagansvarig ska enkelt kunna hålla truppen och dess personuppgifter aktuella.
Det långsiktiga målet omfattar att lägga till personer, hålla uppgifter och
målsmanskopplingar aktuella samt avsluta lagtillhörighet utan persondubbletter
eller förlorad historik. Leveransen omfattar befintlig funktionalitet från
Next-appen i React/Kotlin samt de nya administrations- och ansökningsflöden
som användaren inkluderat i svar 4.

Trupp avser lagets löpande spelare/deltagare och ledare. Målsmän kopplas till
barnen; uttagning till en viss match är ett separat begrepp.
Den användarvända benämningen ska vara ”Lagmedlemmar”. Dokumentets sökväg
behålls för kontinuitet.

## Befintligt underlag

Granskat i repot 2026-10-26; detta är nuläge, inte nya överenskomna krav:

- Next-appen har en truppvy med medlemslista, sökning, undergrupper och profiler.
- Designreglerna beskriver ledare, spelare och övriga roller samt kopplingar
  till målsmän och barn. Administration använder `roster.manage`.
- Befintliga actions hanterar bland annat spelarens namn och inloggningsadress,
  spelarens inbjudan, ledaruppgifter och undergrupper.
- Leveransen avser befintlig funktionalitet från Next-appen i React/Kotlin.
- I granskad truppvy finns ingen funktion för att lägga till en ny person,
  avsluta lagtillhörighet eller redigera målsmanskopplingar. Målsmän visas.
  Eventuellt stöd i andra flöden är inte fullständigt inventerat.
- Vanliga behöriga medlemmar och målsmän får en separat sökbar kontaktlista
  på samma route; truppadministrationen kräver `roster.manage`.
- Spelarprofilen visar även disciplinfält på lagmedlemskapet genom
  `DisciplineFields`. Dessa är ett befintligt beroende vid migreringen.
- Nuläget har lästs i dokumentation och källkod; flödena har inte provats i UI.

## Omfattning

### Ingår

Befintlig truppfunktionalitet från Next-appen, med motsvarande flöden i
React/Kotlin, inklusive medlemslista, sökning, gruppfilter, profiler,
namnredigering, spelarens inloggningsadress och inbjudan/inloggningslänk,
visning av målsmän och barn, befintliga disciplinfält, undergrupper och
kontaktlistan för vanliga medlemmar och målsmän.

Dessutom ingår att lägga till personer, avsluta lagtillhörighet, ändra
vårdnadshavarkopplingar och ansöka om att börja i ett valt lag. Ansökan granskas
innan den sökande läggs till i laget, enligt kraven nedan.

### Ingår inte

Uttagning till en enskild match är ett separat flöde.
Disciplinstyrda benämningar och andra relationstyper än vårdnadshavare ingår
inte i denna leverans. Relationsmodellen ska kunna anpassas för fler typer senare.
Permanent radering av personuppgifter, väntelista och automatisk
kapacitetskontroll ingår inte.
Insamling och visning av allergier eller andra hälsouppgifter ingår inte;
befintliga sådana fält från Next-formuläret ska inte kopieras till leveransen.
Fortsatt företrädaråtkomst efter 18-årsdagen ingår inte. Separat,
samtyckt läsåtkomst för föräldrar specificeras i [Mitt konto](mitt-konto.md#krav),
K-009–K-010; den förlänger inte vårdnadshavarens svarsrätt.

## Användare, roller och flöden

Primär målgrupp är lagansvariga. Följande flöden ska finnas:

1. Lagansvarig med `roster.manage` öppnar Lagmedlemmar, söker eller filtrerar,
   öppnar en profil och redigerar medlem eller vårdnadshavarkopplingar. Vanliga
   medlemmar och vårdnadshavare har den befintliga kontaktlistans läsåtkomst.
2. Behörig administratör lägger till en befintlig eller ny person, väljer roll
   och startdatum och hanterar eventuella dubblettvarningar.
3. Sökande väljer lag och skickar ansökan. Myndig sökande verifierar sin egen
   e-post; för minderårig verifierar den vårdnadshavare som skickar ansökan sin
   adress. Därefter blir ansökan tillgänglig för behörig granskare.
4. Granskaren kontrollerar personmatchning, plats och föreslagna relationer,
   och godkänner eller avslår med motivering. Godkännande skapar medlemskap
   direkt; kontoaktivering och övriga vårdnadshavares verifiering sker separat.
5. Administratören avslutar en lagtillhörighet, granskar följderna för framtida
   kallelser och bokningar och bekräftar. Historik behålls. Efter sista
   lagkopplingen kan personen arkiveras och senare återaktiveras.

Ansökningsbehörigheten är skild från `roster.manage`. Enbart kontaktlistans
läsåtkomst ger aldrig rätt att ändra personuppgifter eller relationer.

## Krav

- K-001: React/Kotlin-versionen ska motsvara Next-appens befintliga
  truppfunktionalitet, med uttryckliga ändringar och tillägg enligt denna spec.
- K-002: Truppbegreppet omfattar lagets löpande spelare/deltagare och ledare,
  med målsmän kopplade till barn. Matchuttagning behandlas separat.

- K-003: Behörig administratör ska kunna lägga till personer och avsluta deras
  lagtillhörighet utan att förlora historik, med datum enligt K-022.
- K-004: Behörig administratör ska kunna ändra kopplingar till målsman.
  Första leveransen stödjer vårdnadshavare. Relationen ska kunna anpassas för
  fler typer senare. Antal och godkännande regleras i K-009, K-014 och K-015.
- K-005: En ansökningsfunktion ska låta den sökande välja önskat lag och fylla
  i uppgifter enligt K-020.
- K-006: För minderårig ska minst en vårdnadshavare anges. Ett godkännande av
  ansökan räcker och ska skapa lagmedlemskapet direkt. Kontoaktivering sker
  separat och får inte vara ett villkor för att personen ska finnas i laglistan.
- K-007: Granskning/godkännande av medlemsansökningar ska ha en egen behörighet
  som kan tilldelas exempelvis en ledare i aktuellt lag. Att vara ledare ger
  inte i sig denna behörighet. Tilldelning och omfattning följer K-018.
- K-008: Den användarvända benämningen ska vara ”Lagmedlemmar”. Styrning av
  benämningen via disciplin skjuts upp.
- K-009: Ansökan ska stödja fler än två vårdnadshavarkopplingar via
  ”Lägg till vårdnadshavare”, utan en fast tvåpersonsgräns. Minst en krävs
  för minderårig. Eventuell teknisk skyddsgräns är inte beslutad.
- K-010: Den som är under 18 år ska ansöka med minst en vårdnadshavare.
  Från 18 år får personen ansöka själv utan vårdnadshavare och ska ange och
  verifiera sin egen e-postadress.
- K-011: Administratör med behörighet att hantera lagmedlemmar ska kunna
  lägga till en person direkt utan ansökan, genom att välja en befintlig person
  i föreningen eller registrera en ny. Systemet ska varna för möjliga dubbletter
  men aldrig slå ihop personer automatiskt.
- K-012: Avslut ska gälla lagtillhörigheten, med valt slutdatum och idag som
  förval. Historik och andra lagkopplingar ska behållas. Åtkomst som enbart
  bygger på lagtillhörigheten ska upphöra när slutdatumet passerat.
- K-013: När personen inte har några andra lagkopplingar ska personen kunna
  arkiveras och försvinna från aktiva register. Historiken ska behållas.
  Användarkontot och eventuella kopplingar som vårdnadshavare ska inte påverkas.
  Permanent radering av personuppgifter hanteras separat.
- K-014: Den som har behörighet att hantera lagmedlemmar får lägga till och
  ändra vårdnadshavarkopplingar. En vårdnadshavare får ange ytterligare
  vårdnadshavare i ansökan, men inte själv ge nya personer åtkomst efteråt.
  Förslag från vårdnadshavare om senare tillägg eller borttagning hanteras
  enligt [Mitt konto, K-016](mitt-konto.md#krav) och kräver klubbens godkännande
  innan åtkomsten ändras.
- K-015: Vårdnadshavarens åtkomst kräver både godkänd koppling och verifiering
  av personens egen e-postadress. Godkännande av ansökan godkänner dess angivna
  kopplingar; senare tillägg godkänns av administratören. Borttagning av kopplingen
  återkallar just den åtkomsten utan att påverka oberoende åtkomstgrunder.
- K-016: Granskaren ska kunna avslå med motivering som skickas till den sökande.
  Väntelista och automatisk kapacitetskontroll ingår inte; plats bedöms manuellt.
- K-017: Publik ansökan gäller spelare/deltagare. Ledare och övriga roller
  läggs till av behörig till lagmedlemmar. Medlemsroller ger inte automatiskt
  administrativa behörigheter.
- K-018: Ansökningsbehörigheten ska kunna tilldelas på klubb-, sektions- och
  lagnivå via befintlig rolladministration och begränsas till respektive områdes
  lag. Den omfattar att läsa ansökningar och godkänna/avslå, men ger inte i sig
  rätt att redigera befintliga lagmedlemmar.
- K-019: Vid möjlig dubblett ska granskaren kunna välja en befintlig person i
  föreningen så att en ny lagkoppling skapas utan ny personpost. Samma aktiva
  lagtillhörighet får aldrig skapas två gånger. En arkiverad person ska kunna
  återaktiveras med bevarad historik. Ingen automatisk personsammanslagning.
- K-020: Ansökan kräver namn, födelsedatum och önskat lag. Minderårig behöver
  minst en vårdnadshavares namn och e-post; myndig anger egen e-post. Telefon
  och adress är valfria. Tidigare förening, meddelande och fotomedgivande behålls
  som valfria uppgifter. Allergier och hälsouppgifter undantas tills läsåtkomst
  har beslutats i ett separat arbete.
- K-021: Vårdnadshavarrelationen är gemensam för personen inom föreningen.
  Den som är behörig att ändra relationen för spelaren ska kunna göra det även
  om spelaren finns i fler lag; ändringen slår igenom i dessa lag också.
  Det krävs inte en separat relationsändring eller ett godkännande per lag.
  Rätt att hantera lagmedlemmar enligt K-014 krävs. Enbart läsåtkomst till
  spelaren eller kontaktlistan ger inte rätt att ändra relationer.
- K-022: Framtida start- och slutdatum ska stödjas med idag som förval.
  Slutdatum är sista dagen som lagmedlem, enligt föreningens tidszon. Åtkomst
  som enbart beror på medlemskapet upphör efter den dagen. Retroaktiva datum
  ingår inte i leveransen. Godkänd ansökan ger omedelbar medlemsstart enligt K-006;
  val av framtida startdatum gäller manuell hantering.
- K-023: Innan ett avslut bekräftas ska berörda framtida kallelser och bokade
  uppgifter visas. Kallelser efter slutdatumet ska återkallas och bokningar av
  uppgifter efter slutdatumet tas bort som del av avslutet. Tidigare deltagande,
  svar och närvaro ska bevaras. Ändringen gäller bara det aktuella laget.
- K-024: En minderårigs ansökan ska kunna granskas efter att vårdnadshavaren
  som skickar den har verifierat sin egen e-post. Övriga vårdnadshavare måste
  verifiera sina egna adresser före åtkomst, men deras väntande verifiering
  får inte blockera godkännande eller lagmedlemskap.
- K-025: Vid ansökan för en befintlig person ska befintliga och föreslagna
  vårdnadshavarkopplingar visas för granskaren. Tillägg ska godkännas uttryckligen.
  Ansökan får aldrig automatiskt ersätta eller ta bort befintliga relationer.
- K-026: Åtkomst genom vårdnadshavarrelationen ska upphöra automatiskt på
  personens 18-årsdag. Relationen får därefter inte ge rätt att läsa personens
  uppgifter eller svara åt personen. Historik behålls. Oberoende behörigheter
  påverkas inte. Fortsatt företrädaråtkomst är en framtida feature.
  Separat följaråtkomst med den myndigas godkännande specificeras i
  [Mitt konto, K-009–K-010](mitt-konto.md#krav) och ger endast begränsad
  läsåtkomst, utan rätt att svara eller ändra åt personen. Detta är ett
  godkänt specbeslut, inte implementerad funktionalitet.

Vårdnadshavares självservice för barnets person- och kontaktuppgifter före
18-årsdagen specificeras i [Mitt konto, K-014–K-015](mitt-konto.md#krav).
Den ger inga nya rättigheter att ändra lag-/medlemsuppgifter eller närvaro.

## Data, integrationer och kvalitetskrav

Person, användarkonto, lagmedlemskap, vårdnadshavarrelation och ansökan ska
hållas som separata begrepp. Återanvänd befintliga personer och konton;
arkivering av en person får inte radera kontot eller historiken. Relationen
är gemensam mellan personens lag inom föreningen, med stöd för fler
relationstyper senare utan att de behöver införas nu.

Behörighet och giltighetsdatum ska kontrolleras på servern vid varje relevant
läsning och ändring. Gemensamma vårdnadshavarrelationer över lag innebär inte
generell rätt att läsa andra lags medlemsregister eller ansökningar.
Kontaktlistans befintliga begränsade läsåtkomst ska behållas. Dubblettuppslag
ska begränsas till uppgifter som behövs för personvalet och får inte öppna
andra lags privata medlemsuppgifter.

Befintliga säkerhetsprinciper för e-postverifiering och aktivering ska följas,
inklusive utgående länkars skydd, omskick och utskicksbegränsningar. Ett
mejlleveransfel ska visas som ett leveransfel och kunna återförsökas utan att
användaren måste skapa en ny ansökan eller ett nytt medlemskap. Ett redan
genomfört godkännande ska inte framställas som ogjort för att utskicket misslyckas.

Godkännande, medlemsstart och relationsbeslut ska sparas konsekvent.
Upprepade anrop och samtidiga godkännanden får inte ge dubbla medlemskap eller
förlorade relationer. Förhandsvisade avslut ska kontrolleras igen vid sparande
så att ändrade kallelser eller bokningar inte hanteras utifrån en gammal vy.
Ändringar ska följa projektets regler för revisionsloggning.

Befintliga produktionskomponenter, centralt sidskal och designregler gäller.
Nya och ändrade komponenter ska finnas på `/components`. Berörda flöden ska
verifieras på mobil och desktop. Före implementation ska relevanta gemensamma
design- och säkerhetsdokument stämmas av mot denna spec och uppdateras i samma
ändring; specen beskriver beslutat målbeteende, inte redan driftsatt beteende.

## Acceptanskriterier

- AK-001 (K-001): Givet inventerade befintliga truppflöden, när de utförs i
  React/Kotlin på mobil och desktop, ska funktionalitet, layout, navigation,
  texter och interaktioner motsvara Next-förlagan enligt AGENTS.md, med de
  uttryckliga ändringar som beslutas i denna spec, bland annat K-008.
- AK-002 (K-006): Givet en giltig ansökan och en behörig granskare, när ansökan
  godkänns, ska personen finnas i laglistan även om kontot inte aktiverats.
- AK-003 (K-007): Givet en ledare utan behörigheten för ansökningsbeslut, när
  ledaren försöker godkänna en ansökan, ska servern neka utan att skapa medlemskap.
- AK-004 (K-008): När medlemsvyn öppnas ska dess benämning vara ”Lagmedlemmar”
  utan att bero på disciplin.
- AK-005 (K-009): Givet en minderårigs ansökan med två vårdnadshavare, när en
  tredje läggs till, ska formuläret kunna registrera även den kopplingen.
- AK-006 (K-010): En myndig ska kunna ansöka utan vårdnadshavare. En minderårigs
  ansökan utan vårdnadshavare ska nekas även vid direkt anrop till servern.
- AK-007 (K-011): När en möjlig dubblett upptäcks vid manuell registrering ska
  administratören få en varning; ingen automatisk sammanslagning får ske.
- AK-008 (K-012): Givet en person i två lag, när lagtillhörigheten i ett lag
  avslutas och slutdatumet har passerat, ska det andra lagets koppling och
  oberoende åtkomst bestå, liksom historiken för det avslutade medlemskapet.
- AK-009 (K-013): När en person utan andra lagkopplingar arkiveras ska personen
  försvinna från aktiva register medan historik, användarkonto och eventuella
  vårdnadshavarkopplingar består.
- AK-010 (K-014, K-015): En godkänd vårdnadshavarkoppling utan verifierad egen
  e-post får inte ge åtkomst. Verifierad e-post utan godkänd koppling får inte
  heller ge åtkomst. När båda villkoren är uppfyllda ska avsedd åtkomst fungera.
- AK-011 (K-015): När en koppling tas bort ska åtkomst via just den kopplingen
  nekas vid nästa behörighetskontroll, även med en redan inloggad session.
- AK-012 (K-016): När granskaren avslår en ansökan med motivering ska ansökan
  markeras avslagen, den sökande meddelas och inget lagmedlemskap skapas.
- AK-013 (K-017): Publik ansökan får inte användas för att tilldela ledarroll
  eller administrativa rättigheter, även om klientens indata manipuleras.
- AK-014 (K-018): En granskare med enbart lagbehörighet ska inte kunna läsa
  eller fatta beslut om ett annat lags ansökningar via direkt serveranrop.
  Klubb-/sektionsbehörighet ska bara omfatta lag inom den tilldelade omfattningen.
- AK-015 (K-019): När en granskare väljer en befintlig person vid godkännande
  ska personens ID återanvändas. Upprepat godkännande får inte skapa ytterligare
  aktiva lagtillhörigheter eller persondubbletter.
- AK-016 (K-020): Ansökan ska kunna skickas utan telefon, adress, tidigare
  förening, meddelande och fotomedgivande. Saknade obligatoriska uppgifter ska
  nekas på servern. Hälsouppgifter ska inte efterfrågas eller visas i dessa flöden.
- AK-017 (K-021, K-015): Givet en spelare i två lag, när en behörig administratör
  ändrar spelarens vårdnadshavarrelation, ska samma relation och de åtkomstvillkor
  som följer av den gälla i båda lagen. En borttagen relation ska inte fortsätta
  ge åtkomst i det andra laget.
- AK-018 (K-022): Medlemskap med ett framtida startdatum ska inte i sig ge
  medlemsåtkomst före startdatumet. Medlemskapets slutdatum ska fortfarande
  räknas som en giltig medlemsdag; dagen efter ska medlemsåtkomsten upphöra.
  Gränserna beräknas i föreningens tidszon, även över sommar-/vintertidsbyte.
- AK-019 (K-023): När ett avslut bekräftas ska granskade kallelser och
  uppgiftsbokningar efter slutdatumet återkallas respektive tas bort. Motsvarande
  poster i andra lag och historiska svar/närvaroposter ska förbli oförändrade.
- AK-020 (K-021, K-014): En användare med enbart kontaktlistans läsåtkomst
  ska nekas försök att ändra vårdnadshavarrelationer via direkt serveranrop.
- AK-021 (K-024): När ansökande vårdnadshavare verifierat sin e-post ska
  ansökan kunna granskas och godkännas trots att en annan angiven vårdnadshavare
  ännu inte verifierat sig. Den senare får ingen åtkomst före egen verifiering.
- AK-022 (K-025): Vid personmatchning ska granskaren se befintliga och
  föreslagna kopplingar. En ny ansökan utan en befintlig vårdnadshavare får
  aldrig i sig ta bort den relationen.
- AK-023 (K-026): Vårdnadshavaråtkomst ska fungera enligt godkänd relation
  dagen före 18-årsdagen och nekas från 18-årsdagen, även med befintlig session.
  Historik och åtkomst från oberoende administrativa behörigheter ska bestå.
- AK-024 (K-001): Medlemslistan ska ha sökning och gruppfilter, ledare först,
  sedan spelare och övriga förekommande roller. Tomma rollavsnitt ska döljas.
  Profiler öppnas från medlemsraden och redigering öppnas uttryckligen.
- AK-025 (K-001): Profiler ska visa befintliga kontouppgifter, undergrupper,
  vårdnadshavare, barn i aktuellt lag och relevanta disciplinfält. Namnredigering
  får inte ändra roller eller ansvar. Inloggningsadress för redan aktiverat
  spelarkonto ska vara låst enligt förlagan; inbjudan/inloggningslänk ska fungera.
- AK-026 (K-001): Undergrupper ska kunna skapas, byta namn, få ändrat personval
  och raderas efter bekräftelse utan att lagmedlemskap tas bort. Sökning får inte
  rensa gjorda personval. På mobil ska val mellan ”Ej i gruppen” och ”I gruppen”
  fungera; på större skärm visas båda listorna enligt förlagan.
- AK-027 (K-001, K-014): Vanliga behöriga medlemmar och vårdnadshavare ska
  kunna söka i kontaktlistan och använda kontaktlänkar enligt förlagan, utan
  att få tillgång till administrationsåtgärder.
- AK-028 (K-006, K-019, K-024): Vid mejlleveransfel efter godkännande ska
  medlemskapet bestå och leveransen kunna återförsökas utan dubbletter.
  Samtidiga godkännanden får skapa högst ett aktivt medlemskap för samma roll.

Specen har verifierats som dokument. Produktbeteendena är endast delvis
implementerade och verifierade; se kravredovisningen nedan.

## Implementation och verifiering

Delimplementation 2026-10-26, beställd utifrån avsnittet
[Truppen i designreglerna](../design-spec.md#truppen). Denna ändring implementerar
inte hela den utökade featurespecen. Kraven och benämningsbeslutet ovan är
oförändrade; återstående funktioner ska inte betraktas som bortvalda.

| Krav / acceptanskriterium | Status och evidens |
| --- | --- |
| K-001, AK-024 | Medlemslista, sökning, gruppfilter, rollordning, profil och uttrycklig redigering implementerade och verifierade i båda apparna på mobil och desktop. `src/components/team-roster-workspace.tsx`, `scripts/migration/team-roster-browser.mjs`. Full funktionell likvärdighet enligt K-001/AK-001 återstår. |
| K-002 | Lagmedlemskap och undergrupper hanteras separat från enskilda aktiviteters urval. Implementerat; API- och browserprov verifierar att gruppborttagning bevarar lagmedlemskap. |
| K-001, AK-025 | Delvis implementerat och verifierat: kontokopplingsstatus, namnredigering utan roll-/ansvarsändring, undergrupper, registrerade målsmän och barn i aktuellt lag. Disciplinfält, inloggningsadress och inbjudan/inloggningslänk återstår i Kotlin; Next behåller befintliga flöden. |
| K-001, AK-026 | Undergrupper implementerade och verifierade: skapa, namn, personval, sökning som bevarar val, mobilväxling och bekräftad borttagning. Grupprevision, behörighet och atomära ändringar verifieras i `backend/src/test/kotlin/se/forena/api/ApiTest.kt`. |
| K-008, AK-004 | Återstår. Denna delimplementation behåller designförlagans benämning Truppen; målbenämningen i denna spec är fortsatt Lagmedlemmar. |
| K-001, AK-027 | Kontaktlistan för vanliga medlemmar/vårdnadshavare återstår i Kotlin. Next-appens kontaktlista finns kvar. |
| K-003–K-007, K-009–K-026; AK-002–AK-003, AK-005–AK-023, AK-028 | Återstår inom den utökade featuren: direktregistrering, start/avslut/arkivering, vårdnadshavaradministration, ansökan, granskning, e-postverifiering, dubbletthantering och automatisk åtkomstgräns vid 18 år. Befintlig datumgiltig läsning och administrativa behörighetskontroller innebär inte att dessa flöden är implementerade. |

Verifiering och begränsningar redovisas i
[migreringsstatus](../migration/status.md#truppen-medlemsprofiler-och-undergrupper-2026-10-26).
API-/PostgreSQL-tester och separata browserprov med mockad API-transport finns;
hela den utökade featurens acceptansflöden är inte genomförda.

## Befintligt ansökningsflöde som underlag

Läst i Next-källkod 2026-10-26, inte verifierat genom körning:

- Publik ansökan har val av sektion och lag, namn, födelsedatum, adressfält,
  tidigare förening, allergier/viktig information, meddelande och fotomedgivande.
- Formuläret kräver målsman 1 och tillåter målsman 2. Det skiljer inte i
  formuläret på myndiga och minderåriga och erbjuder inte fler kontaktpersoner.
- Ansökan verifieras via målsman 1:s e-post före granskning. Klubbens
  owner/admin kan granska på föreningens ansökningssida.
- Godkännande skickar aktiveringslänkar; det är ett separat steg från själva
  aktiveringen. Önskat nytt beteende måste uttryckligen fastställas.
- Källor: `src/components/membership-application-form.tsx`,
  `src/app/o/[organizationSlug]/join/actions.ts`,
  `src/app/o/[organizationSlug]/applications/page.tsx`,
  `src/app/api/membership-applications/[applicationId]/review/route.ts`.

## Bekräftade beslut och motiv

- 2026-10-26: Featuren heter ”Hantera trupp”. Användaren vill intervjua fram
  en spec; implementation har inte beställts.
- 2026-10-26, svar 1: Definitionen av trupp och gränsen mot matchuttagning godkänd.
- 2026-10-26, svar 2: Huvudmålet för lagansvarigas löpande administration godkänt.
- 2026-10-26, svar 3: ”Det räcker med nuvarande funktionalitet från Next-appen.”
  Ursprunglig avgränsning; utökad av användaren i svar 4 nedan.

- 2026-10-26, svar 4: Lägg till person, avsluta personens lagtillhörighet,
  ändra målsmanskoppling och medlemsansökan med lagval ingår. Minderårig
  behöver minst en målsman. Godkännande utifrån plats föregår lagtillhörighet.
- 2026-10-26, svar 5: Hela den uppräknade befintliga funktionaliteten ingår.
- 2026-10-26, svar 6: ”Lagmedlemmar” används nu; disciplinstyrning tas senare.
- 2026-10-26, svar 7: Börja med vårdnadshavare och gör relationen anpassningsbar.
- 2026-10-26, svar 8: Ett godkännande räcker. Egen behörighet ska kunna
  tilldelas exempelvis ledare i det aktuella laget.
- 2026-10-26, svar 9: Lagmedlemskap skapas direkt vid godkännande;
  kontoaktivering sker separat enligt rekommendationen.
- 2026-10-26, svar 10: Fler än två vårdnadshavarkopplingar ska stödjas.
- 2026-10-26, svar 11: Myndiga ansöker själva med egen verifierad e-post;
  under 18 år krävs vårdnadshavare.
- 2026-10-26, svar 12: Manuell registrering utan ansökan, återanvändning av
  befintlig person och dubblettvarning utan automatisk sammanslagning godkända.
- 2026-10-26, svar 13: Avslut med slutdatum enligt rekommendationen godkänt.
  Användaren tillägger: ”om det inte finns några andra kopplingar till andra
  lag kan personen tas bort”. Förtydligat som arkivering i svar 14.
- 2026-10-26, svar 14: Arkivering efter sista laget godkänd; historik,
  användarkonto och kopplingar som vårdnadshavare behålls. Permanent radering separat.
- 2026-10-26, svar 15: Behörig till lagmedlemmar hanterar vårdnadshavarkopplingar.
- 2026-10-26, svar 16: Rekommenderat godkännande- och verifieringsflöde för
  vårdnadshavare godkänt, inklusive återkallelse när kopplingen tas bort.
- 2026-10-26, svar 17: Avslag med skickad motivering godkänt; väntelista och
  automatisk kapacitetskontroll undantas.
- 2026-10-26, svar 18: Publik ansökan gäller spelare/deltagare; övriga roller
  registreras av behörig till lagmedlemmar och ger inga automatiska behörigheter.
- 2026-10-26, svar 19: Ansökningsbehörighetens omfattning och tilldelning på
  klubb-/sektions-/lagnivå enligt rekommendationen godkänd.
- 2026-10-26, svar 20: Återanvänd befintlig person efter granskarens val;
  förhindra dubbla aktiva lagtillhörigheter och tillåt återaktivering med historik.
- 2026-10-26, svar 21: Obligatoriska och valfria ansökningsfält enligt
  rekommendationen godkända; allergier/hälsouppgifter undantas från leveransen.
- 2026-10-26, svar 22: Ändringar av en spelares vårdnadshavarrelationer ska
  slå igenom även i andra lag där spelaren finns. Rekommendationen om lokal
  räckvidd per lag avvisades uttryckligen.
- 2026-10-26, svar 23: Framtida datum, idag som förval, sista medlemsdag enligt
  föreningens tidszon och avgränsning mot retroaktiva datum godkända.
- 2026-10-26, svar 24: Förhandsvisning och återkallelse/borttagning av framtida
  kallelser och uppgiftsbokningar efter slutdatum godkända; historik bevaras.
- 2026-10-26, svar 25: Rätt att ändra vårdnadshavarrelationer kräver behörighet
  att hantera lagmedlemmar, inte bara läsåtkomst till spelaren.
- 2026-10-26, svar 26: En verifierad ansökande vårdnadshavare räcker före
  granskning; övriga verifierar sig före åtkomst utan att blockera medlemskapet.
- 2026-10-26, svar 27: Nya relationer för en befintlig person granskas
  uttryckligen; ansökan får inte automatiskt ersätta eller ta bort befintliga.
- 2026-10-26, svar 28: Vårdnadshavaråtkomst upphör automatiskt på 18-årsdagen;
  historik behålls och eventuell fortsatt företrädaråtkomst hanteras senare.

## Obekräftade antaganden och förslag

Inga kvarvarande produktförslag väntar på beslut. Användaren har bekräftat
den sammanställda specen. Tekniska lösningar och eventuell
teknisk skyddsgräns för antalet relationer är implementationsval som inte får
återinföra en fast tvåpersonsgräns eller ändra beslutade produktkrav.

## Öppna frågor

Inga blockerande produktfrågor återstår från intervjun.

## Bekräftelse

Svaren 1–28 är sparade. Användaren bekräftade den slutliga sammanfattningen
2026-10-26 med ”Den ser bra ut!”. Status är Redo. Implementation har inte beställts.

## Ändringshistorik

- 2026-10-30: Samordnat med den godkända Mitt konto-specen: föräldrar
  får självservice för barnets person-/kontaktuppgifter före 18 år,
  relationsförslag kräver klubbgodkännande och följaråtkomst efter 18 år
  ger separat begränsad läsrätt. Ingen implementation ingår i specändringen.
- 2026-10-26: Skapat intervjuutkast med granskat nuläge och första öppna frågor.
- 2026-10-26: Sparat svar 1–3, avgränsat till befintlig Next-funktionalitet och
  noterat skillnaden mellan målbilden och den granskade truppvyn.
- 2026-10-26: Sparat svar 4–5 och namnförslaget; utökat leveransen med
  personadministration och ansökan samt dokumenterat befintligt ansökningsflöde.
- 2026-10-26: Sparat svar 6–9: neutral benämning, vårdnadshavare som första
  relationstyp, egen beslutsbehörighet och medlemskap direkt vid godkännande.
- 2026-10-26: Sparat svar 10–13 om flera vårdnadshavare, myndiga sökande,
  manuell registrering och avslut. Borttagning efter sista laget behöver preciseras.
- 2026-10-26: Sparat svar 14–17 om arkivering, behörig kopplingshantering,
  verifiering före åtkomst och avslag utan väntelista.
- 2026-10-26: Sparat svar 18–21 om roller, behörighetsomfattning, återanvändning
  av personer och ansökningsfält. Hälsouppgifter undantas uttryckligen.
- 2026-10-26: Sparat svar 22–24: gemensam vårdnadshavarrelation över lag,
  framtida datum och hantering av framtida kallelser/uppgifter vid avslut.
- 2026-10-26: Sparat svar 25–28 och sammanställt flöden, krav, avgränsningar
  och acceptanskriterier för slutlig bekräftelse. Ingen implementation utförd.
- 2026-10-26: Användaren bekräftade slutlig sammanfattning med ”Den ser bra ut!”.
  Specen markerad Redo; implementation är fortfarande ej påbörjad.
