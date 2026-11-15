# Rotationsträning – planering, kallelser och uppföljning

- Status: Redo
- Senast uppdaterad: 2026-11-16
- Berörda dokument: [Ordlista](../../GLOSSARY.md),
  [kalender](kalender-vy.md), [närvaroregistrering](narvaroregistrering.md),
  [aktiviteter](hantera-aktiviteter.md), [trupp](hantera-trupp.md),
  [capability-signaler](../capability-signals.md),
  [arkitektur](../architecture.md), [säkerhetsarkitektur](../security-architecture.md)
- Implementation och verifiering: Ej påbörjad inom denna spec.
  Besluten är bekräftade genom intervju; befintliga implementationer har inte
  verifierats genom körning.

## Problem och mål

En lagledare för exempelvis F2016 behöver kunna planera och följa sina spelares
rotationsträning med äldre lag i samma klubb. Det äldre laget erbjuder ett
antal platser per vecka. Det egna lagets ledare fördelar dem och familjerna
behöver få ett schema i god tid för att planera andra träningstider och skjuts.

Kallelser visar erbjudanden och svar, men säger inte om spelaren faktiskt
deltog. Om en spelare exempelvis varit sjuk och missat sin vecka behöver
ledaren kunna ta hänsyn till det inför nästa fördelning.

Målet är en sammanhängande capability för rotationsplanering, kallelser och
uppföljning. Lagets veckovy ger överblick över egna spelares aktiviteter med
andra klubblag. Ett separat händelseflöde ingår inte.

## Omfattning

### Ingår

- Rotationsgrupp, period med fast deltagarlista och manuell veckofördelning.
- Utkast, samlad publicering och information till berörda familjer.
- Koppling till äldre lagets schemalagda kallelser efter dess godkännande.
- Ömsesidiga byten av hela rotationsveckor samt ledarvalda ersättare.
- Närvarouppföljning per träning och underlag inför kommande perioder.
- Ledarens veckovy med egna spelares träningar och matcher hos andra klubblag.
- Varningar för tidskrockar och motsvarande signal till assistenten.

### Ingår inte

- Ett separat tidsordnat händelseflöde.
- Ett spelarflöde över lagkompisars kallelsesvar.
- Automatisk fördelning av spelare eller automatiskt tilldelad kompensation.
- Automatisk bedömning av sjukdom, frånvaroorsak eller träningsbelastning.
- Restid i tidskrocksbedömningen.
- Krav på extern LOK-stödsexport eller en ny bidragsrapportering.
- Automatisk schemaläggning av rotation till matcher. Matcher ingår i ledarens
  informationsöverblick; den beslutade rotationsplaneringen gäller träning.

## Användare, roller och flöden

### Roller

- **Ordinarie lagets ledare:** väljer periodens spelare, fördelar platser,
  publicerar, hanterar ersättare och följer faktisk närvaro.
- **Arrangerande lagets ledare:** anger erbjudna platser, aktiverar inkludering
  i schemalagda kallelser och hanterar aktivitetens kallelser och närvaro.
- **Vårdnadshavare:** ser barnets publicerade tilldelningar, svarar på kallelser
  och föreslår eller accepterar byten för barnet.
- **Assistenten:** uppmärksammar ledaren på konkreta tidskrockar. Den fattar
  inte beslut om fördelning, återbud eller ersättare.

### Huvudflöde

1. Det äldre laget erbjuder ett antal platser för respektive vecka.
2. F2016-ledaren skapar en period med en ögonblicksbild av rotationsgruppen.
3. Ledaren fördelar spelare manuellt på veckorna. Båda träningarna under en
   vecka tilldelas samma spelare. Tidigare deltagande och markeringen
   ”erbjud nytt tillfälle” ger stöd.
4. Ledaren granskar utkastet och publicerar schemat samlat för familjerna.
5. Det äldre lagets schemalagda kallelser inkluderar veckans tilldelade
   spelare, om dess ledare aktiverat kopplingen. Publicerat schema och
   utskickad kallelse är skilda steg.
6. Familjerna svarar. Ledaren ser kallelser och svar i veckovyn.
7. Det äldre laget registrerar närvaro per träning i sitt vanliga flöde.
   Registreringen används i dess LOK-stödsunderlag och rotationsuppföljningen.
8. Ledaren följer utfallet och tar ställning till nya erbjudanden nästa period.

### Alternativa flöden

- Två familjer byter hela veckor efter ömsesidig accept. Ledargodkännande
  krävs inte, men båda veckorna måste vara inom samma period och äldre lag,
  och ingen av veckorna får ha börjat.
- Återbud gör platsen ledig. Ledaren väljer om och vem som erbjuds platsen.
- Ledaren kan uttryckligen ändra deltagare och tilldelningar i en pågående
  period. Ändring av själva subgruppen ändrar inte perioden.
- Återtagen kallelse tas bort från den ledaröverblick som denna spec tillför.
  Aktiviteten ligger kvar om andra egna spelare fortfarande är kallade.
  Detta betyder inte att arrangörens aktivitet eller närvarohistorik raderas.
- Efter passerad träning utan närvaroregistrering visas ”Närvaro ej
  registrerad”, aldrig bekräftad frånvaro.

## Krav

- K-001: Rotationsgruppen ska vara en subgrupp med spelare som är aktuella
  för rotationsträning.
- K-002: En rotationsperiod ska spara en ögonblicksbild av gruppens deltagare.
  Senare tillägg och borttagningar i gruppen får inte ändra periodens schema
  eller historik. Ledaren ska kunna ändra perioden uttryckligen.
- K-003: Det arrangerande laget ska kunna ange erbjudet antal platser per
  vecka. Ordinarie lagets ledare ska fördela platserna manuellt inom erbjudet
  antal. En tilldelning ska omfatta hela veckan med båda träningarna.
- K-004: Schemat ska kunna förberedas som utkast, granskas och publiceras
  samlat. Varje berörd familj ska se barnets tilldelade tillfällen, datum,
  tid, plats och arrangerande lag. Familjer ska informeras när deras
  publicerade tilldelningar ändras.
- K-005: Arrangerande lagets ledare ska först aktivera att rotationsspelare
  inkluderas i dess schemalagda kallelser. Urvalet vid utskick ska följa
  aktuella tilldelningar per vecka, inte hela rotationsgruppen.
- K-006: En familj ska kunna föreslå byte av hela rotationsveckor. Byte ska
  genomföras efter båda familjernas accept utan ledargodkännande, endast
  inom samma period och äldre lag och innan någon av veckorna börjat.
  Varje spelare ska behålla en hel vecka och kapaciteten ska bevaras.
- K-007: Ett genomfört byte ska uppdatera schema och eventuella redan
  skickade kallelser för båda veckorna. Nya svar ska krävas för de nya
  tillfällena; tidigare ja-svar får inte följa med som nya accepter.
  Systemet ska kontrollera att berörda kallelser kan uppdateras innan
  bytet genomförs.
- K-008: Tidskrock vid byte ska ge en varning som visar berörda aktiviteter
  före bekräftelse, men inte stoppa bytet.
- K-009: Vid återbud ska platsen visas som ledig. Ledaren ska välja
  eventuell ersättare; systemet får inte själv tilldela en ersättare.
- K-010: Arrangerande lagets vanliga närvaroregistrering ska vara källa för
  rotationsuppföljningen. Ordinarie lagets ledare ska inte behöva registrera
  samma närvaro igen. Spelaren ingår i arrangerande lagets LOK-stödsunderlag.
- K-011: Kallelse, kallelsesvar och faktisk närvaro ska vara skilda uppgifter.
  Närvaro ska följas per träning och kunna summeras som exempelvis
  ”1 av 2 träningar”. Saknad registrering ska visas som okänd närvaro.
- K-012: Inför nästa period ska ledaren ha stöd av tidigare faktiskt
  deltagande, som ska väga tyngre än antal kallelser. Ledaren ska kunna
  markera ”erbjud nytt tillfälle” efter helt eller delvis missad vecka.
  Frånvaro får inte automatiskt skapa förtur eller en ny tilldelning.
- K-013: Ordinarie lagets veckovy ska för dess ledare visa lagets egna
  aktiviteter samt andra klubblags träningar och matcher där spelare i
  det egna laget kallats. Egna spelare definieras av deras medlemskap i
  det ordinarie laget.
- K-014: Samma externa aktivitet ska visas en gång med individuell status
  för berörda egna spelare. Nej-svar ska ligga kvar. Återtagen kallelse ska
  däremot inte ligga kvar för spelaren i denna överblick.
- K-015: Den tillförda lagövergripande insynen ska vara tillgänglig för det
  ordinarie lagets ledare även om de inte leder det arrangerande laget,
  men begränsas till egna spelare. Den ger inte insyn i hela äldre lagets
  deltagarlista och ger inte rätt att ändra dess kallelser eller närvaro.
  Ledaren ska kunna öppna aktivitetens tid, plats och egna spelares status.
- K-016: Ledarens tillagda överblick ska inte visas som ett nytt gemensamt
  flöde för spelare eller föräldrar. Familjens åtkomst till barnets schema
  och kallelser kvarstår enligt K-004 och K-006.
- K-017: När en spelare tackat ja till två aktiviteter med överlappande
  aktivitetstider ska veckovyn markera spelaren och båda aktiviteterna.
  Assistenten ska kunna uppmärksamma ledaren på samma krock, även mellan
  ordinarie lag och äldre lag. Restid ska inte räknas in.
- K-018: Vanliga kallelser, svar och närvaro ska ge information.
  Assistentens åtgärdssignal ska i första versionen avse den konkreta
  tidskrocken enligt K-017, inte varje vanlig uppdatering.

## Data, integrationer och kvalitetskrav

### Domänunderlag

Perioden behöver beskriva ordinarie lag, arrangerande lag, deltagarlista,
veckor, erbjudna platser, tilldelningar och publiceringsstatus. Byten behöver
knytas till de två familjernas accept och berörda tilldelningar.
Närvaroutfall läses från arrangerande lagets aktivitetsregistrering.

Detta är domänbehov, inte beslut om tabeller, API:er eller lagringsformat.
Den tekniska modellen ska tas fram mot befintlig kod vid implementation.

### Befintliga gränssnitt och regler

- Återanvänd [närvarons modell](narvaroregistrering.md): kallelsesvar är inte
  närvaro och saknad rapport är inte frånvaro. Skapa inte en parallell
  närvarokälla för rotation.
- Utöka [kalenderns befintliga vyer](kalender-vy.md) med ledarens urval.
  Återtagen personlig kallelse ska inte blandas ihop med en inställd
  aktivitet; denna spec ändrar inte kalenderns allmänna inställningsregler.
- Koppla till [aktiviteters kallelser](hantera-aktiviteter.md) och befintliga
  schemalagda utskick. Bestäm konkret kontrakt vid implementation.
- Integrera tidskrockar med [capability-signaler](../capability-signals.md).
  Befintlig dokumentation anger signalåtkomst för signalens eget lag;
  denna spec kräver ett avgränsat underlag för ordinarie lagets egna spelare
  över laggränser. Den utvidgningen behöver implementeras uttryckligen.
- Behörighet för periodändringar, publicering, byten och läsning ska
  kontrolleras på servern enligt [säkerhetsarkitekturen](../security-architecture.md).
  Ingen klubböverskridande insyn följer av rotation.
- Byten får inte presenteras som genomförda när schema och berörda kallelser
  inte har uppdaterats. Samtidiga försök får inte överskrida platserna eller
  använda samma tilldelning i två genomförda byten.
- LOK-stöd avser återanvändning av arrangerande lagets närvarounderlag,
  inte verifierad extern rapportering eller nya regler för bidragsberäkning.

## Acceptanskriterier

- AK-001 (K-001, K-002): Givet en skapad period med Elsa och Tilda, när Elsa
  tas bort och en ny spelare läggs till i subgruppen, ska periodens deltagare
  och tilldelningar ligga kvar tills ledaren uttryckligen ändrar perioden.
- AK-002 (K-003): Givet två erbjudna platser en vecka, ska ledaren kunna
  tilldela två spelare till båda träningarna, utan att kunna överskrida
  platserna i den slutliga fördelningen.
- AK-003 (K-004): När ledaren publicerar ett granskat utkast, ska berörda
  familjer få tillgång till sina barns veckor med datum, tid, plats och lag.
  Ändring av publicerad tilldelning ska informera berörd familj.
- AK-004 (K-005): Utan arrangerande lagets aktivering ska rotationen inte
  automatiskt lägga till kallelsemottagare. Med aktivering ska utskicket
  kalla just de spelare som tilldelats den aktuella veckan.
- AK-005 (K-006, K-007): När två familjer accepterat ett tillåtet byte, ska
  båda hela veckorna byta spelare utan ledargodkännande, med uppdaterade
  kallelser och nya obesvarade svar för de nya tillfällena.
- AK-006 (K-006): Byte ska nekas om någon av veckorna börjat eller om
  veckorna tillhör olika perioder eller arrangerande lag. Ingen tilldelning
  ska ändras på grund av enbart ena familjens accept.
- AK-007 (K-007): Om berörda kallelser inte kan uppdateras, ska bytet inte
  visas som genomfört och inte lämna ett delvis ändrat schema.
- AK-008 (K-008): Om ett föreslaget byte ger krock med en aktivitet spelaren
  redan tackat ja till, ska familjen se berörda aktiviteter och kunna
  bekräfta bytet trots varningen.
- AK-009 (K-009): Vid återbud ska ledaren se en ledig plats. Ingen annan
  spelare ska automatiskt tilldelas den.
- AK-010 (K-010, K-011): När äldre lagets ledare registrerar Elsa närvarande
  på ena träningen och frånvarande på den andra, ska uppföljningen visa
  ”1 av 2 träningar” med samma närvarounderlag som arrangerande laget.
- AK-011 (K-011): Efter passerad träning utan närvaroregistrering ska vyn
  visa ”Närvaro ej registrerad” även om spelaren tackat ja eller nej.
- AK-012 (K-012): Efter missad eller delvis genomförd vecka ska ledaren
  kunna markera ”erbjud nytt tillfälle” och se markeringen samt tidigare
  deltagande inför nästa fördelning. Ingen ny plats ska tilldelas automatiskt.
- AK-013 (K-013, K-014): Om Elsa och Tilda kallats till samma F2015-träning,
  ska F2016-ledaren se en aktivitet med bådas individuella status. Elsas
  nej-svar ska finnas kvar. Återtas hennes kallelse, ska Tildas post bestå.
- AK-014 (K-015, K-016): F2016-ledaren ska kunna läsa tid, plats och egna
  spelares status hos F2015 utan att vara F2015-ledare. Samma åtkomst ska
  inte ge rätt att läsa andra F2015-spelares status eller ändra närvaro.
  En familj ska kunna läsa barnets schema utan att få ledarens lagöverblick.
- AK-015 (K-017, K-018): Om Elsa tackat ja till överlappande aktiviteter i
  F2016 och F2015, ska båda aktiviteterna och hennes namn ingå i varningen
  och assistentens underlag. Enbart kort restid utan tidsöverlapp ska inte
  ge denna signal.
- AK-016 (K-006, K-007): Vid samtidiga accepter av konkurrerande byten ska
  högst ett kunna använda samma tilldelning och erbjuden kapacitet bevaras.

## Bekräftade beslut och motiv

- Veckovyn ersätter idén om ett separat flöde: informationen blir användbar
  i planeringen och uppdateringar behöver inte skapa brus.
- Rotationsträning är en egen capability för planering och uppföljning,
  inte enbart en extra lista över kallelsesvar.
- Gruppens aktuella medlemskap och periodens fasta deltagarlista är skilda
  begrepp för att redan kommunicerade scheman ska bestå.
- Samma spelare deltar hela veckan så att både spelaren och äldre laget
  får möjlighet att lära känna varandra.
- Byten mellan familjer behöver inte ledargodkännande när samma spelare
  behåller varsin hel vecka inom samma period och äldre lag.
- Faktisk närvaro väger tyngre än erbjudanden vid nästa planering.
  Ledaren avgör om helt eller delvis missat deltagande motiverar nytt erbjudande.
- Nej-svar behålls som information. Återtagna kallelser tas bort ur
  överblicken för att minska brus.
- Tidskrockar är konkreta signaler till assistenten; de stoppar inte byten.

## Obekräftade antaganden och förslag

Inga ytterligare produktförslag ska räknas som beslut. Automatisk
spelaroptimering, generell belastningsbedömning, extern bidragsexport och
automatisk matchrotation är inte beställda.

## Öppna frågor

Inga blockerande produktfrågor återstår för den bekräftade omfattningen.
Vid implementation behöver befintliga kontrakt för undergrupper,
schemalagda kallelser, lagöverskridande läsbehörighet och capability-signaler
undersökas och den tekniska lösningen dokumenteras. Det innebär inte att
funktionaliteten redan finns eller är verifierad.

## Bekräftelse

Användaren bekräftade den samlade målbilden med ”ja” efter intervjufråga
Q38 och sammanfattningen, 2026-11-16. Specen dokumenterar dessa beslut.
Status Redo avser godkända krav, inte implementerad funktion.

## Ändringshistorik

- 2026-11-16: Sammanställt bekräftade beslut från Q1–Q38 och godkänd
  slutlig målbild. Ursprunglig flödesidé avgränsades till ledarens veckovy
  och en capability för rotationsträning.
