# Arbetspass och bemanning

- Status: Redo
- Senast uppdaterad: 2026-10-27
- Berörda dokument: [Befintligt bemanningsschema](../activity-duty-schedule.md), [Aktivitetshantering](hantera-aktiviteter.md), [Designregler](../design-spec.md#deltagare-och-arbetsuppgifter), [Arkitektur](../architecture.md), [Säkerhetsarkitektur](../security-architecture.md), [Funktionell likvärdighet](../migration/feature-parity.md), [Kalender](kalender-vy.md), [AI-assistent](ai-assistent.md)
- Implementation och verifiering: Specen är godkänd. Ingen implementation beställd inom denna spec. Befintligt stöd i äldre appen och godkända krav är inte samma sak som implementerat stöd i React/Kotlin.

## Problem och mål

Samla grundflödet för arbetspass och bemanning i en separat featurespec för
den nya appen, med befintlig funktion som underlag. Ledare ska kunna planera
bemanning och familjer hantera sina åtaganden. Kraven nedan sammanfattar
intervjuns beslut och har bekräftats av användaren.

## Omfattning

### Ingår

- Bekräftat för specarbetet: ta fram en separat spec med befintligt
  bemanningsflöde och redan godkända aktivitetskrav som underlag.
- Skapa, redigera och avboka uppgifter, pass och platser.
- Familjens bokning och ledarens tilldelning.
- Flytt, byte, ersättare och godkännanden.
- Notifieringar till berörda.
- Registrerat genomförande, historik och förslag på rättvis fördelning.

### Ingår inte

- Specarbetet innebär inte en beställning av implementation.
- Kalenderexport ingår inte.
- Kalenderns och AI-assistentens egna funktioner behåller sina separata
  specar; kopplingarna till bemanningsflödet beskrivs här.
- Ledargodkännande av familjens bokning ingår inte; bokningar gäller direkt.
- Separat utskick för att be laget boka nya öppna pass ingår inte.
  Sådan samordning kan ske i befintlig privat chatt, följt av frivillig
  bokning i bemanningsvyn. Detta ändrar inte ersättarförfrågan enligt K-044.

## Användare, roller och flöden

### Beslutade huvudflöden

- Behörig ledare skapar namngivna uppgiftsupplägg på en aktivitet,
  väljer bemanningsläge och anger tider, platser, instruktioner och vikt.
- Vid öppen bokning bokar familjen för en person som den får företräda.
  Vid tilldelat schema granskar ledaren ett fördelningsförslag före
  publicering. Familjen väljer vem som faktiskt utför arbetet.
- Familjen kan samordna via kontaktuppgifter inom laget och ordna byte
  eller ersättare. I tilldelat läge kvarstår ansvaret tills någon tar över.
- Ledaren förhandsgranskar passändringar och får systemstöd att lösa
  berörda bokningar. Konflikter lämnar tidigare bokningar oförändrade.
- Ledaren registrerar genomförande per bokad plats. Spårbara rättelser
  uppdaterar underlaget för framtida fördelning.

### Kartlagt nuläge – bakgrund, inte automatiskt nya krav

- Arbetsuppgifter kan finnas på alla lagaktiviteter, inte bara aktivitetstypen
  Arbetspass: exempelvis kiosk, sekretariat, materialansvar eller bakning.
- Ledaren skapar uppgifter med namn/typ, tidsperiod eller deadline, passlängd,
  antal platser och instruktioner. Ett intervall kan delas i pass; sista
  passet kortas vid behov. Första/sista pass kan få särskilda instruktioner.
- Uppgiftsserien beskriver pass inom en aktivitet och är skild från en
  aktivitetsserie över flera datum.
- Familjen bokar för sig själv eller ett barn och ledaren kan tilldela
  personer. Befintligt upplägg knyter bokningen till personen/barnet; familjen
  väljer vilken vuxen som utför arbetet.
- Direktbokning är standard, med valbart ledargodkännande och tidsgränser.
  Flytt till ledig plats, byte med upptagen plats och begäran om ersättare
  har egna förslags-/godkännandeflöden.
- Familjer ser lediga/bokade platser men inte andra familjers identiteter.
- Registrerat genomförande är separat från bokning och kallelsesvar.
  Genomförda uppgifter skyddas mot ändring/borttagning i befintligt stöd.
- Ledaren kan få ett fördelningsförslag baserat på registrerad historik,
  granska och justera det före sparande.
- Ändringar kontrollerar aktuella rättigheter och revisioner; historik
  bevaras och notifieringar går till berörda konton/målsmän och ledare.

Källor: `docs/activity-duty-schedule.md`,
`src/components/activity-duty-schedule.tsx`, `duty-series-form.tsx`,
`duty-management.tsx`, `duty-assignment-preview.tsx` och
`docs/migration/feature-parity.md`. Nuläget är läst, inte nyverifierat genom
körning inom denna intervju. Migreringsmatrisen anger bemanningsflödet som
återstående i React/Kotlin.

## Krav

### Redan godkända kopplingar till aktivitetshanteringen

- K-001: Vid tidsändring ska reglerna i aktivitetsspecens K-020–K-023 och
  K-040 gälla: val per aktivitet, utan förval, mellan att behålla bokningar
  eller öppna för ny bokning. Bevarande kräver giltig plats för alla och
  kan innebära manuell omplacering. Bokade personer informeras; behållna
  bokningar kräver inte ny bekräftelse.
- K-002: Nya tillfällen vid serieförlängning eller tillagd veckodag ska ärva
  seriens gemensamma bemanningsupplägg men ha tomma bokningar enligt
  aktivitetsspecens K-025. Individuellt anpassade scheman blir inte
  automatiskt mall och personbokningar kopieras inte till nya aktiviteter.
- K-003: Aktivitetsspecens K-026–K-029, K-037–K-038 och K-043–K-046 gäller
  för bemanningens koppling till aktivitetsändringar: rättigheter,
  mottagaravgränsning, samlade meddelanden, atomärt sparande, historik,
  läsläge, utkastskydd och skydd mot automatisk återkomst. Den nya specen ska
  precisera bemanningens egna flöden utan att tyst ändra dessa beslut.

### Omfattning

- K-004: Den nya appen ska stödja hela bemanningsflödet: skapa, redigera
  och avboka uppgifter/pass/platser, familjens bokning, ledarens tilldelning,
  flytt/byte/ersättare/godkännanden, notifieringar, registrerat genomförande,
  historik och förslag på rättvis fördelning.
- K-005: Kalenderexport ingår inte. Kalenderns och AI-assistentens egna
  funktioner ska behålla sina separata specar, med kopplingarna till
  bemanningens flöden beskrivna i denna spec.

### Bokningens personkoppling

- K-006: Bokning och registrerat genomförande ska tillhöra barnet eller
  medlemmen även när en annan vuxen utför arbetet. Familjen ska själv avgöra
  vem som arbetar; den vuxnes namn ska inte behöva registreras. Historik
  och fördelningsförslag ska därmed följa barnet/medlemmen, inte den vuxne
  som råkar utföra ett visst pass.
- K-007: Familjens självservice ska endast tillåta bokning för användaren
  själv eller ett barn/en person som kontot har rätt att företräda. Personen
  ska ha en aktiv spelarrelation till laget eller en personlig kallelse till
  den aktuella aktiviteten. En kallelse till en annan aktivitet ska inte ge
  bokningsrätt här. Självservice får inte användas för att boka åt andra familjer.
- K-008: Inom laget ska bokade personers namn vara synliga så att familjer
  kan kontakta andra målsmän för samordning. Befintlig generell anonymisering
  av andra familjers bokningar ska därför inte behållas för visning inom laget.
  Vilka tittare som omfattas av "inom laget" regleras av K-009. Vilka namn
  och kontaktuppgifter som visas regleras av K-010. Regeln avser
  insyn i bokningar, inte rätt att boka eller ändra andra familjers åtaganden.
- K-009: Namnvisning inom laget ska gälla aktiva lagmedlemmar och deras
  registrerade målsmän/ombud. Behöriga ledare ska se bokningarnas namn enligt
  sin administrativa åtkomst. Gäster som endast har en personlig kallelse
  till aktiviteten och saknar lagrelation ska se egna/företrädda personers
  namn, medan andra familjers platser visas som bokade utan namn.
- K-010: Användaren ska kunna trycka på en bokad medlems namn för att
  öppna kontaktuppgifter. För barn ska registrerade målsmäns namn,
  mobilnummer och e-post visas där uppgifterna finns. För vuxna medlemmar
  ska deras egna kontaktuppgifter visas. Ring-, SMS- och mejlknappar ska
  öppna enhetens vanliga appar. Kontaktuppgifterna får endast visas för
  aktiva lagmedlemmar, deras registrerade målsmän/ombud och behöriga ledare
  enligt K-009; personligt kallade gäster utan lagrelation ska inte få dessa
  kontaktuppgifter för andra familjer.
- K-011: Bemanningsschema ska höra till en aktivitet och kunna användas
  på alla aktivitetstyper, inte bara aktivitetstypen **Arbetspass**. En
  aktivitet ska kunna ha flera olika uppgifter med egna pass och platser,
  exempelvis kiosk på match, materialansvar på träning och bakning till
  avslutning.
- K-012: En uppgift ska ha en av tre tidsformer: **Bemanningspass** med
  start- och sluttid, **Deadline** med senaste tid för leverans/genomförande
  eller **Ingen särskild tid**, där uppgiften hör till aktiviteten utan eget
  klockslag. Ledaren ska välja tidsform per uppgift. Uppgifter med start och
  slut ska kunna delas upp i flera pass.
- K-013: Ledaren ska kunna ange tidsintervall, passlängd och antal platser
  per pass. Intervallet ska delas i pass med angiven längd och det sista
  passet kortas vid behov, exempelvis 10–15 med tvåtimmarspass till 10–12,
  12–14 och 14–15. Varje pass ska initialt få angivet antal separat
  bokningsbara platser; antalet ska sedan kunna justeras för ett enskilt pass.
- K-014: Uppgifter ska kunna ha tider före eller efter aktivitetens egna
  start-/sluttider, exempelvis kiosk 13–16 för match 14–15.30 eller en
  leveransdeadline kvällen före. Aktivitetens egentliga tid ska inte behöva
  ändras för att rymma uppgiften. Uppgiftens tider ska visas tydligt separat
  från aktivitetens tider. Detta utökar äldre appens krav på att uppgifter
  ska rymmas inom aktivitetens period. Bokningsgränser följer K-015 och
  genomförande-/redigeringsregler följer K-037–K-043 och K-049.
- K-015: Självservicebokning ska stänga vid bemanningspassets start eller
  uppgiftens deadline. För uppgifter utan egen tid ska aktivitetens start
  användas. Ledaren ska kunna ange en tidigare stängning. En inställd
  aktivitet ska stänga all självservice. Ett senare pass ska därför kunna
  vara bokningsbart även efter aktivitetens start eller slut, medan själva
  aktivitetens uppgifter fortsatt är i läsläge enligt aktivitetsspecen.
  Detta preciserar läsläget utan att återaktivera aktiviteten.
- K-016: En giltig bokning av ledig plats inom självservicegränsen ska
  gälla direkt. Familjens bokning ska inte kräva ledargodkännande och inget
  separat godkännandeflöde eller aktivitetsval för bokningsgodkännande ska
  ingå. Flytt, byte och ersättare följer K-018/K-019/K-029.
- K-017: Familjen ska kunna avboka ett eget/företrätt pass före samma
  stängningsgräns som gäller för bokning enligt K-015 när valt bemanningsläge
  tillåter egen avbokning enligt K-020. Platsen ska då bli ledig
  igen och den tidigare bokningen sparas i historiken. Efter gränsen ska
  familjen behöva kontakta en ledare för ändringen. Ledaren ska kunna välja
  en tidigare stängningsgräns för laget/aktiviteten enligt K-015 när längre
  framförhållning behövs.
- K-018: Familjen ska kunna flytta en egen/företrädd persons bokning direkt
  till en annan ledig plats inom samma aktivitet utan ledargodkännande,
  när både ursprungs- och målplatsen har öppen bokning. I tilldelat schema
  ska direkt flytt till ledig plats nekas eftersom den lämnar ursprungspasset
  obemannat; där används byte eller övertagande enligt K-019/K-029.
  Självservice ska vara öppen för både det gamla och det nya passet.
  Flytten ska ske som allt eller inget: om den nya platsen hinner bokas av
  någon annan ska den gamla bokningen behållas oförändrad.
- K-019: Byte med en annan familjs bokade plats ska göras genom en
  bytesförfrågan som den andra familjen måste godkänna, utan krav på
  ledargodkännande. Båda ursprungliga bokningarna ska gälla tills bytet
  genomförts. Bytet ska ske tillsammans och självservice ska fortfarande
  vara öppen för båda passen vid genomförandet. Om förfrågan avböjs, blir
  inaktuell eller löper ut ska ursprungliga bokningar behållas.
- K-020: Avbokningsregler ska vara valbara beroende på om ledaren lägger
  ut ett tilldelat schema eller lämnar bemanningen öppen för bokning.
  När ledaren lagt ut ett tilldelat schema ska målsmannen ansvara för att
  hitta ersättare och inte kunna frigöra bokningen så att passet riskerar
  att bli obemannat. Detta ersätter det tidigare generella beslutet om fri
  avbokning före stängningsgränsen. Bemanningslägena regleras av K-021.
  Lägets placering och förval följer K-023, direkt flytt K-018.
  Regler för byten och övertaganden ska behålla ansvaret
  tills ersättningen faktiskt genomförts.
- K-021: Två bemanningslägen ska stödjas: **Tilldelat schema**, där ledaren
  fördelar passen och målsmannen ansvarar för sitt pass tills ett byte eller
  övertagande genomförts, samt **Öppen bokning**, där familjer bokar frivilligt
  och kan avboka före stängningsgränsen enligt K-017. Vanlig avbokning ska
  inte vara tillåten i tilldelat läge; familjen får ordna byte eller ersättare.
- K-022: Plattformen ska kunna föreslå ett tilldelat bemanningsschema
  baserat på tidigare arbetspass. Ett genererat förslag ska inte i sig
  tilldela eller flytta bokningar. Belastningsmåttet följer K-024.
  Historikurval och tidsperiod följer K-027, granskning/publicering K-030.
  Kompletterande fördelningsregler följer K-031–K-036 och K-045/K-046.
- K-023: Bemanningsläget ska väljas uttryckligen per uppgiftsupplägg inom
  aktiviteten, utan förvalt alternativ. En aktivitet ska exempelvis kunna
  ha sekretariat i tilldelat läge och bakning som öppen bokning. Samtliga
  pass genererade från samma upplägg ska följa dess valda läge. Plattformens
  historikbaserade fördelningsförslag ska användas för tilldelade scheman.
- K-024: Fördelningsförslag ska använda **viktade passtimmar**, beräknade
  som schemalagd passlängd i timmar multiplicerad med belastningsvikt.
  Standardvikten ska vara 1 och ledaren ska kunna ändra vikten per
  uppgiftsupplägg eller enskilt pass. Exempelvis ska två timmars försäljning
  med vikt 1 ge två passtimmar, två timmars stängning med vikt 2 ge fyra
  och fyra timmars försäljning med vikt 1 ge fyra. Förslaget ska prioritera
  lägst sammanlagd belastning per medlem enligt K-026. Deadlineuppgifter
  och uppgifter utan egen tid ska använda tidsunderlag enligt K-025.
  Vikt 2 är ett valbart exempel, inte ett automatiskt förval för
  alla stängningspass.
- K-025: För deadlineuppgifter och uppgifter utan egen tid ska ledaren
  ange uppskattad tidsåtgång per bokad plats. Den uppskattade tiden ska
  multipliceras med belastningsvikten för att beräkna passtimmar vid
  genomförande. Exempelvis ska bakning uppskattad till 1,5 timmar per familj
  med vikt 1 ge medlemmen 1,5 passtimmar. Uppskattningen ska endast påverka
  fördelningsunderlaget, inte deadline eller aktivitetens tider.
- K-026: Fördelningsförslaget ska väga samman registrerat genomförda
  passtimmar och belastningen från redan bokade framtida pass. När flera
  nya tilldelningar föreslås ska den beräknade belastningen uppdateras efter
  varje placering, så att även det nya schemat fördelas successivt.
  Genomförda, framtida bokade och nu föreslagna passtimmar ska visas separat;
  planerat arbete får inte framställas som utfört.
- K-027: Fördelningsunderlaget ska begränsas till samma lag och omfatta
  registrerat genomförda uppgifter i både tilldelat och öppet läge samt
  framtida bokningar enligt K-026. Tidsperioden ska vara valbar, med
  **innevarande säsong** som förval i stället för innevarande kalenderår.
  Ledaren ska kunna välja historik högst tio år bakåt. Andra lags arbetspass
  ska inte automatiskt räknas in. Säsongsdatum bestäms vid implementation
  av discipliner enligt K-028. Den valda perioden avgränsar underlaget för
  schemaförslaget, både genomförda pass och redan bokade framtida pass.
  Ledaren kan välja en annan period än innevarande säsong inför genereringen.

- K-028: Säsongsregeln ska anges på disciplinen och kunna överstyras av
  sektionen. Laget använder sektionens regel om sådan finns, annars
  disciplinens. Någon separat säsongsöverstyrning per lag ska inte finnas.
  Exakta datum och disciplinernas säsongsförval bestäms när discipliner
  implementeras och är inte ett blockerande beslut i denna spec.

- K-029: I tilldelat schema ska familjen kunna markera sin bokning som
  **Söker ersättare**. Bokningen och ansvaret ska ligga kvar tills en annan
  bokningsbehörig person/familj tar över platsen. Övertagandet ska ske utan
  ledargodkännande och byta ansvar atomärt; ingen obemannad mellanperiod
  får uppstå. Passets självservicegräns enligt K-015 gäller även övertagandet.

- K-030: Ledaren ska kunna granska och manuellt justera ett genererat
  schemaförslag innan publicering. Först vid publicering ska nya tilldelningar
  bli gällande och berörda familjer aviseras. Att generera eller justera
  förslaget ska inte ändra bokningar eller avisera familjer. Befintliga
  bokningar ska behållas när ett nytt förslag genereras.

- K-031: Vid schemagenerering ska ledaren kunna kryssa i **Undanta barn
  vars målsman har ledarroll i laget**. Urvalet ska då utelämna barn med
  registrerad målsman som har ledarroll i samma lag. Ledaruppdrag i andra
  lag ska inte i sig ge undantag. Befrielsen ska inte hindra frivillig
  bokning, och ledaren ska se vilka barn som undantas och varför.
  Detta är första lösningen i stället för den tidigare diskuterade
  generella regelmodellen. Föreningsförval med sektions-/laganpassning
  är en möjlig senare utökning, inte ett krav för första lösningen.
  Kryssrutan ska vara ikryssad som förval. Ledaren ska kunna avmarkera
  den för att inkludera dessa barn i fördelningsunderlaget.

- K-032: Ledaren ska kunna välja bort enskilda personer från det aktuella
  schemaförslagets deltagarurval, utöver ledarbarnsundantaget enligt K-031.
  Bortvalet ska gälla just det förslag som genereras och inte införa en
  permanent befrielseregel, ta bort befintliga bokningar eller hindra
  frivillig bokning.

- K-033: Schemaförslaget ska inte tilldela samma barn/medlem flera pass
  som överlappar i tid. Kontrollen ska omfatta både befintliga bokningar
  och nya föreslagna tilldelningar. Om ingen i urvalet kan tilldelas utan
  överlapp ska platsen lämnas ofördelad och tydligt visas för ledaren att
  lösa före publicering. Motsvarande spärr i övriga bokningsflöden följer K-034.

- K-034: Överlappande arbetspass för samma barn/medlem ska inte tillåtas,
  oavsett ålder eller bokningsflöde. Spärren ska gälla vid manuell tilldelning,
  frivillig bokning, flytt, byte, övertagande och publicering av schema.
  Kontrollen ska göras mot det resulterande schemat; vid konflikt ska
  ändringen nekas och tidigare bokningar behållas. Varning med möjlighet
  att ändå fortsätta ska inte erbjudas. Plattformen får inte förutsätta
  att en målsman eller annan vuxen kan utföra ett överlappande pass,
  exempelvis åt en myndig spelare.

- K-035: Automatisk schemagenerering ska föreslå högst ett arbetspass
  per barn/medlem och aktivitet, räknat över aktivitetens uppgiftsupplägg.
  En person som redan har ett bokat pass i aktiviteten ska därför inte
  få ytterligare ett automatiskt föreslaget pass där. Ettpassgränsen ska
  inte hindra familjen från att frivilligt boka fler pass som inte
  överlappar. Överlappsspärren enligt K-034 gäller alltid.
- K-036: Om fördelningen inte går ihop med högst ett pass per person
  ska plattformen kunna föreslå längre pass och färre passbyten.
  Ändrad passindelning ska vara ett separat, granskningsbart förslag som
  ledaren godkänner innan det används. Befintliga pass och bokningar får
  inte ändras automatiskt när schemaförslaget genereras. Exakta regler
  för ändring av redan bokade pass följer K-001 och K-040–K-043/K-049.

- K-037: Ledaren ska kunna registrera genomförande per bokad plats som
  **Genomfört** eller **Ej genomfört**. En plats utan registrering ska
  visas som **Ej registrerat**, vilket inte får likställas med uteblivet
  arbete. Endast registrerat genomförda pass ska ge historiska passtimmar
  enligt K-024/K-025. Att ett pass har passerat ska inte automatiskt
  markera det genomfört eller ge genomförda passtimmar.

- K-038: Ledaren ska kunna rätta genomföranderegistrering i efterhand.
  Historiken ska visa vem som ändrade vad och när. Vid registrering av
  genomförande ska tidsunderlag, vikt och beräknade passtimmar sparas
  för den bokade platsen; tidsunderlaget är passlängd enligt K-024 eller
  uppskattad tidsåtgång enligt K-025. Senare ändringar av uppgiftsupplägget
  får inte automatiskt skriva om redan intjänade passtimmar. Rättelser
  ska slå igenom i fördelningsunderlaget utan att tidigare uppgifter
  försvinner ur ändringshistoriken.

- K-039: Schemaförslaget ska varna om den valda underlagsperioden innehåller
  passerade pass med bokade platser som fortfarande har status
  **Ej registrerat**. Varningen ska visa att jämförelsen av tidigare
  arbetsinsats är ofullständig och göra det möjligt för ledaren att
  identifiera och komplettera registreringen före fördelning. Saknad
  registrering får inte framställas som bekräftat uteblivet arbete.

- K-040: Ledaren ska kunna redigera ett enskilt arbetspass eller hela
  uppgiftsupplägget. Vid ändring av hela upplägget ska individuellt
  ändrade pass hoppas över. Före sparandet ska en förhandsvisning visa
  berörda pass och vilka individuella undantag som hoppas över.
  Redigering får inte skriva om genomförandehistorik enligt K-038;
  ändringar av bokade pass och minskad kapacitet följer K-001/K-041/K-042.

- K-041: Om en ändring tar bort bokade bemanningsplatser ska ledaren
  först behöva lösa varje berörd bokning genom flytt eller uttrycklig
  avbokning. Systemet ska stödja ledaren i att identifiera och lösa de
  berörda bokningarna; de får inte försvinna automatiskt. Ändringen ska
  inte kunna sparas med olösta bokningar. Berörda familjer ska aviseras
  om genomförda ändringar. Flyttar ska följa överlappsspärren i K-034.
  Systemstödet följer K-042.

- K-042: Vid borttagna bokade platser ska systemet visa berörda bokningar
  och föreslå lediga ersättningspass utan tidskrockar för personen.
  Ledaren ska kunna godkänna eller ändra flyttförslagen och uttryckligen
  välja avbokning där ingen lösning finns. Ursprungliga bokningar ska
  gälla tills ändringen sparats. Alla ändringar ska visas samlat före
  sparandet och genomföras tillsammans som allt eller inget. Om ett
  ersättningspass inte längre är ledigt eller en annan konflikt uppstår
  ska tidigare bokningar behållas och förslaget behöva uppdateras.

- K-043: Pass med registrerat genomförande ska inte kunna tas bort eller
  få tider eller kapacitet ändrade, vare sig enskilt eller genom ändring
  av hela uppgiftsupplägget. Passet och dess bokningar ska bevaras som
  historiskt underlag. Ledaren ska fortfarande kunna rätta själva
  genomföranderegistreringen med ändringshistorik enligt K-038.

- K-044: Markeringen **Söker ersättare** ska synas i lagets bemanningsvy.
  Familjen ska kunna välja att skicka en ersättarförfrågan till laget
  och kunna återta sökningen tills någon tagit över. Ursprunglig bokning
  och ansvar ska ligga kvar under sökningen enligt K-029. Återtagen
  sökning ska inte längre kunna användas för övertagande. Namn och
  kontaktuppgifter ska följa åtkomstgränserna i K-008–K-010.

- K-045: Schemaförslagets grundurval ska vara lagets aktiva
  spelare/medlemmar, med ledarbarnsundantag enligt K-031 och individuella
  bortval enligt K-032. Ledaren ska dessutom kunna välja att ta med
  personer som är personligen inbjudna till just aktiviteten. Dessa
  gäster ska inte ingå automatiskt utan ledarens uttryckliga val.
  En personlig inbjudan till en annan aktivitet ska inte räcka.

- K-046: Fördelningsförslaget ska ta hänsyn till när personen senast
  arbetade. Den som arbetade mer nyligen ska få lägre prioritet, så att
  tiden mellan arbetspassen blir så lång som möjligt. Lägst sammanlagda
  viktade passtimmar enligt K-024/K-026 ska styra först; längst tid sedan
  senaste arbetspasset ska avgöra när belastningen är lika.
  Någon lottning är inte beslutad.

- K-047: Berörda familjer ska aviseras när ledaren tilldelar, flyttar
  eller avbokar arbetspass och när ett byte eller övertagande genomförts.
  Aviseringar ska följa familjens kanalinställningar och samlas när flera
  pass ändras samtidigt. Mottagare och innehåll ska följa person-/familje-
  åtkomsten och får inte exponera andra familjers uppgifter utanför
  beslutade åtkomstgränser. Avisering ska utgå från genomförd ändring,
  inte från ett osparat förslag.

- K-048: Ledaren ska kunna ställa in påminnelser om bokade arbetspass
  separat från aktivitetens kallelsepåminnelser. Påminnelserna ska räknas
  från passets egen starttid eller uppgiftens deadline, inte från
  aktivitetens tider när dessa skiljer sig åt. Mottagare ska vara den
  familj som har bokningen vid utskicket, med kanalinställningar och
  åtkomstgränser enligt K-047. En tidigare bokad familj ska inte få
  påminnelsen efter genomfört byte eller övertagande.
  För uppgifter utan egen tid eller deadline ska påminnelser räknas från
  aktivitetens start.

- K-049: Passets tider och kapacitet ska låsas när passet börjar. För
  deadlineuppgifter ska låsningen ske vid deadline och för uppgifter utan
  egen tid vid aktivitetens start. Genomförande ska fortfarande kunna
  registreras och rättas efter låsningen enligt K-037/K-038. Framtida
  pass ska förbli redigerbara även om den tillhörande aktiviteten har
  avslutats, med skydd för registrerat genomförande enligt K-043.

- K-050: Varje uppgiftsupplägg ska ha ett namn och stöd för gemensamma
  instruktioner. Ledaren ska kunna ange särskilda instruktioner för
  enskilda pass, exempelvis städinstruktioner för sista cafépasset.
  Passet ska samtidigt kunna ha egen belastningsvikt enligt K-024.
  Individuell instruktion ska omfattas av skyddet för individuella
  ändringar enligt K-040.

- K-051: Belastningsvikten ska kunna anges som ett positivt decimaltal,
  med 1 som normalvikt. Noll och negativa vikter ska nekas; befrielse
  hanteras genom deltagarurvalet enligt K-031/K-032. Beräkningen ska
  stödja exempelvis två timmar × vikt 1,5 = tre passtimmar.

- K-052: Lagets återanvändbara uppgiftstyper, exempelvis café,
  sekretariat och bakning, ska finnas kvar och kunna väljas när ett
  uppgiftsupplägg skapas. Senare ändringar i katalogen ska inte
  automatiskt ändra redan skapade pass eller deras historik.

- K-053: Något separat bemanningsutskick för att be laget boka nya öppna
  pass ska inte ingå. Ledare och familjer kan samordna privat i en
  befintlig chatt, varefter familjen bokar frivilligt i bemanningsvyn
  enligt vanliga behörighets- och bokningsregler. Detta beslut gäller
  rekrytering till nya öppna pass, inte den redan beslutade förfrågan
  om ersättare för en befintlig bokning enligt K-044.

Eventuella ytterligare produktkrav ges stabila ID:n från K-054.

## Data, integrationer och kvalitetskrav

Befintliga begrepp är aktivitet, uppgiftsupplägg, pass, bemanningsplats,
bokning/tilldelning, ändringsförslag och registrerat genomförande.
Beroenden är person-/familjeåtkomst, aktivitetsbehörigheter, notifieringar,
kalenderöversikt, historik och AI-assistent. Teknik från äldre implementation
är underlag, inte ett beslut att flytta dess databasmekanismer till Kotlin.
Mobil och Safari på iOS behöver ingå i kvalitetskraven för de berörda flödena.

Kontaktvyn ska återanvända registrerade uppgifter som är avsedda för
kontaktvisning, med tillämpliga åtkomstkontroller. Rätt att se en kontaktvy
innebär inte rätt att exponera interna konto-/autentiseringsuppgifter.
Äldre appens kontaktkatalog och säkerhetsdokumentation är underlag för
genomförandet; namnvisningen inom bemanning ska följa K-008–K-010.

## Acceptanskriterier

- AK-001 (K-001): Givet två aktiviteter med bokade pass som flyttas genom en
  serieändring, ska användaren kunna göra olika uttryckliga bokningsval per
  aktivitet, utan förval, enligt aktivitetsspecens kriterier för bevarande,
  ny bokning och omplacering.
- AK-002 (K-002): Givet ett gemensamt bemanningsupplägg och bokningar på
  befintliga aktiviteter, när nya tillfällen skapas genom serieförlängning,
  ska upplägget finnas på de nya aktiviteterna utan kopierade personbokningar.
- AK-003 (K-003): När en aktivitetsändring påverkar bemanning ska tillämpliga
  kriterier i den godkända aktivitetsspecen fortsatt gälla. Granskning av den
  nya bemanningsspecen får inte ersätta dem med motstridiga regler.
- AK-004 (K-004): Leveransen ska kunna verifieras från ledarens skapade
  bemanningsbehov via familjens bokning eller ledarens tilldelning till
  tillämpligt ändrings-/godkännandeflöde, notifiering och registrerat
  genomförande. Historik och fördelningsförslag ska ingå i verifieringen;
  detaljerade kriterier anges nedan för respektive flöde.
- AK-005 (K-006): Givet att en familj bokar ett pass för Emma och en
  förälder utför arbetet, ska bokningen och registrerat genomförande tillhöra
  Emma. Bokning och genomförande ska kunna sparas utan den utförande vuxnes
  namn, och historik/fördelningsunderlag ska räknas på Emma.
- AK-006 (K-007): Givet ett konto med rätt att företräda Emma och Emmas
  aktiva spelarrelation till laget, ska kontot få boka för Emma. Utan sådan
  lagrelation ska en personlig kallelse till just aktiviteten kunna ge
  bokningsrätt. Enbart kallelse till en annan aktivitet, eller försök att boka
  för en person i en annan familj utan företrädarrätt, ska nekas.
- AK-007 (K-008): Givet en tittare som omfattas av den beslutade lagkretsen,
  när lagets bemanningsschema öppnas, ska andra familjers bokade personers
  namn kunna visas för samordning. Namnvisningen får inte ge rätt att boka
  eller ändra deras platser genom självservice. Exakt personkrets och
  kontaktväg kompletteras i följande krav; tittarkretsen följer K-009.
- AK-008 (K-009): Givet samma bemanningsschema ska en aktiv lagmedlem eller
  registrerad målsman/ombud till en sådan medlem kunna se bokningarnas namn.
  En behörig ledare ska se dem enligt sin administrativa åtkomst. En gäst
  utan lagrelation med endast personlig aktivitetskallelse ska se egna namn
  men inte namn på andra familjers bokningar.
- AK-009 (K-010): Givet en tittare inom tillåten lagkrets, när en bokad
  medlems namn öppnas, ska kontaktvyn för ett barn visa registrerade
  målsmäns namn och befintligt mobilnummer/e-post, och för en vuxen medlemmens
  egna uppgifter. Kontaktknappar ska öppna enhetens vanliga appar. Saknade
  uppgifter får inte krävas eller hittas på. En gäst utan lagrelation får
  inte hämta andra familjers kontaktuppgifter via samma vy eller API.
- AK-010 (K-011): Givet en aktivitet med annan typ än Arbetspass, ska en
  behörig ledare kunna lägga till flera bemanningsuppgifter, exempelvis
  kiosk och sekretariat, med separata pass/platser. Aktivitetsvalet får inte
  begränsa bemanning till typen Arbetspass och varje schema ska tillhöra
  den aktuella aktiviteten.
- AK-011 (K-012): Givet skapande av en uppgift ska ledaren kunna välja
  bemanningspass med start/slut, deadline eller ingen särskild tid. Ett
  bemanningsintervall ska kunna delas i flera pass, medan en deadline ska
  visas som senaste leverans-/genomförandetid och en tidlös uppgift inte
  kräva eget klockslag.
- AK-012 (K-013): Givet intervallet 10–15, tvåtimmarspass och två platser
  per pass ska granskningen visa 10–12, 12–14 och 14–15 med två separat
  bokningsbara platser vardera. Efter sparande ska antalet platser kunna
  justeras för ett enskilt pass enligt K-040–K-043/K-049.
- AK-013 (K-014): Givet en aktivitet 14–15.30 ska en behörig ledare kunna
  granska och spara ett bemanningspass 13–16 utan att ändra aktivitetens
  start eller slut. En leveransuppgift med deadline kvällen före ska också
  kunna sparas. Uppgifts- och aktivitetstider ska kunna urskiljas i visningen.
- AK-014 (K-015): Givet en aktivitet som slutar 15.30 och ett separat
  bemanningspass som börjar 16.00, ska en i övrigt behörig familj kunna boka
  det passet efter 15.30 men före dess start, om ingen tidigare stängning
  angetts. Exakt vid passets start ska bokning stänga. Deadlineuppgifter
  ska stänga vid sin deadline och tidlösa uppgifter vid aktivitetens start.
  Tidigare ledarvald stängning och inställd aktivitet ska stoppa självservice.
- AK-015 (K-016): Givet en person med bokningsrätt, en ledig plats och
  öppen självservice, när familjen bekräftar bokningen ska den gälla direkt
  och platsen visas som bokad för personen. Den får inte hamna i väntan på
  ledargodkännande och formuläret ska inte erbjuda en inställning som kräver
  sådant bokningsgodkännande.
- AK-016 (K-017, K-020): Givet en egen/företrädd persons bokning, ett
  bemanningsläge som tillåter egen avbokning och öppen självservice för
  passet, när familjen avbokar ska platsen bli ledig och
  tidigare bokning finnas kvar i historiken. Från stängningsgränsen ska samma
  självserviceåtgärd nekas och familjen hänvisas till ledare, utan att bokningen
  frigörs. En tidigare ledarvald stängning ska följas.
- AK-017 (K-018): Givet öppen bokning på både ursprungs- och målplats,
  en bokning och en annan ledig plats inom samma aktivitet med öppen
  självservice för båda, ska familjen kunna flytta
  bokningen direkt utan ledargodkännande. Om någon annan bokat målplatsen
  före sparandet ska flytten nekas och ursprungsbokningen finnas kvar. Stängd
  självservice för endera passet ska också neka familjens direkta flytt.
  Direkt flytt från eller till tilldelat schema ska nekas och den gamla
  bokningen behållas.
- AK-018 (K-019): Givet två familjers bokade platser med öppen självservice,
  när den första familjen föreslår byte ska båda bokningarna vara oförändrade
  tills den andra familjen godkänt. Ett giltigt godkännande ska byta båda
  bokningarna tillsammans utan ledargodkännande. Avslag, inaktuell förfrågan
  eller stängd självservice för endera passet ska lämna båda bokningarna kvar.
- AK-019 (K-020): Givet ett tilldelat schema där målsmannen ansvarar för
  ett pass, ska familjen inte kunna frigöra bokningen genom vanlig avbokning
  så att ansvaret försvinner innan ersättare finns. Tidigare generell
  avbokningsrätt enligt K-017 får inte kringgå lägets ansvarsregel.
- AK-020 (K-021): Givet en uppgift i tilldelat läge ska familjens bokning
  gälla tills byte eller övertagande genomförts, utan vanlig avbokning. I
  öppet läge ska frivillig bokning och avbokning före stängningsgränsen
  stödjas. Inställning av läge ska inte förväxlas med godkännande av bokning.
- AK-021 (K-022): Givet registrerad historik över tidigare arbetspass ska
  plattformen kunna ta fram ett förslag för tilldelat schema. Att hämta
  förslaget ska inte ändra befintliga bokningar eller göra nya tilldelningar.
  Historikens urval och fördelningsutfall kompletteras efter följande beslut.
- AK-022 (K-021, K-023): Givet en aktivitet med uppgiftsuppläggen
  sekretariat och bakning ska ledaren kunna välja tilldelat respektive
  öppet läge utan att något varit förvalt. Alla pass inom respektive
  upplägg ska följa dess regler. Fördelningsförslag ska kunna användas för
  det tilldelade upplägget utan att tilldela det öppna uppläggets platser.
- AK-023 (K-024): Givet genomförda pass enligt exemplen två timmar med
  vikt 1, två timmar med vikt 2 och fyra timmar med vikt 1, ska respektive
  belastning vara 2, 4 och 4 passtimmar. Ett nytt upplägg ska ha vikt 1
  som förval, med möjlighet till viktändring på upplägget och ett enskilt
  pass. Vid lika framtida bokad belastning ska lägre genomförd belastning
  ge högre prioritet i förslaget enligt K-026.
- AK-024 (K-025): Givet bakning med deadline, uppskattad tidsåtgång 1,5
  timmar per plats och vikt 1, när en medlems bokade plats registreras som
  genomförd ska den ge 1,5 passtimmar. En annan plats med samma upplägg ska
  ge den genomförande medlemmen samma insats, utan att deadline eller
  aktivitetens start/slut flyttas av uppskattningen.
- AK-025 (K-026): Givet två medlemmar med lika genomförda passtimmar men
  olika framtida bokad belastning ska den med lägre sammanlagd belastning
  prioriteras. Efter en föreslagen placering ska dess passtimmar ingå i
  jämförelsen inför nästa placering. Visningen ska skilja på genomförda,
  redan framtida bokade och nu föreslagna timmar och inte märka dem alla som utförda.
- AK-026 (K-027): Givet ett lag med tillämplig innevarande säsong, när
  fördelningsförslaget öppnas ska säsongen vara förvald och perioden gå
  att ändra. Registrerat genomförda uppgifter ska omfattas oavsett öppet
  eller tilldelat läge, men andra lags pass ska inte automatiskt påverka
  underlaget. Historikstart mer än tio år bakåt ska nekas. Om ledaren väljer
  en annan period ska både genomförda och redan bokade framtida pass i
  underlaget avgränsas till den perioden; pass utanför den ska inte räknas in.

- AK-027 (K-028): Givet en disciplin med säsongsregel ska dess lag ärva
  regeln. Om sektionen anger en annan regel ska sektionens lag använda
  den i stället. Säsongsregel ska inte kunna överstyras per lag.

- AK-028 (K-029): Givet en tilldelad bokning, när familjen markerar
  **Söker ersättare** ska ursprunglig bokning och ansvar ligga kvar. När en
  behörig ersättare tar över inom självservicegränsen ska bokningen och
  ansvaret övergå tillsammans utan ledargodkännande. Misslyckat eller
  konkurrerande övertagande får inte frigöra bokningen eller ge dubbla bokningar.

- AK-029 (K-022, K-030): Givet ett schema med befintliga bokningar, när
  ledaren genererar och justerar ett nytt förslag ska befintliga bokningar
  behållas och inga nya tilldelningar eller aviseringar ske. Ledaren ska
  kunna granska det justerade förslaget. Först vid publicering ska de nya
  tilldelningarna gälla och berörda familjer aviseras.

- AK-030 (K-031): Givet ett barn vars registrerade målsman har ledarroll
  i laget ska undantaget vara ikryssat som förval. Med ikryssat undantag
  ska barnet utelämnas från
  automatisk tilldelning och visas med undantagsorsak. Ledarroll endast
  i ett annat lag ska inte utlösa undantaget. Utan ikryssat undantag ska
  regeln inte filtrera bort barnet. Barnet ska fortfarande kunna boka
  frivilligt om det i övrigt är behörigt.

- AK-031 (K-032): Givet en person i schemaförslagets deltagarurval, när
  ledaren väljer bort personen ska inga nya tilldelningar föreslås för
  den personen i det aktuella förslaget. Befintliga bokningar ska behållas,
  frivillig bokningsbehörighet ska inte ändras och bortvalet ska inte
  skapa ett permanent undantag för framtida schemaförslag.

- AK-032 (K-033): Givet en person med ett bokat eller redan föreslaget
  pass ska schemaförslaget inte tilldela personen ett ytterligare pass
  som överlappar detta. Om samtliga personer i urvalet har överlappande
  pass ska platsen vara ofördelad och synlig för ledaren i granskningen,
  utan att en överlappande tilldelning skapas automatiskt.

- AK-033 (K-034): Givet en person med ett bokat pass ska frivillig bokning
  eller manuell tilldelning av ett överlappande pass nekas utan möjlighet
  att bekräfta sig förbi spärren. Detsamma ska gälla om flytt, byte,
  övertagande eller publicering skulle skapa överlapp i slutresultatet.
  Tidigare bokningar ska bevaras. Utfallet ska vara detsamma för en myndig
  spelare och ett barn med registrerade målsmän.

- AK-034 (K-035): Givet en aktivitet med flera uppgiftsupplägg ska samma
  person inte få mer än ett pass genom automatisk fördelning. Ett redan
  bokat pass ska räknas med i gränsen. Familjen ska däremot kunna boka
  ytterligare ett pass frivilligt om det inte överlappar och övriga
  bokningsvillkor är uppfyllda.
- AK-035 (K-036): Givet att ett schema inte kan fyllas med högst ett pass
  per person ska plattformen kunna visa ett alternativ med längre pass
  och färre passbyten. Att ta fram alternativet ska inte ändra pass eller
  bokningar. Ledaren ska kunna granska och godkänna indelningen innan
  den används i fördelningsförslaget.

- AK-036 (K-037): Givet en bokad plats utan genomföranderegistrering ska
  den visas som **Ej registrerat**, även efter att passet passerat, och
  inte ge historiska passtimmar. När ledaren markerar **Genomfört** ska
  platsens viktade passtimmar räknas på den bokade personen. Markeringen
  **Ej genomfört** ska vara särskiljbar från avsaknad av registrering
  och inte ge historiska passtimmar.

- AK-037 (K-038): Givet ett pass registrerat som genomfört med tidsunderlag
  två timmar och vikt två ska dess fyra historiska passtimmar behållas
  om uppgiftsuppläggets vikt eller tid senare ändras. När ledaren rättar
  registreringen till **Ej genomfört** ska timmarna inte längre räknas
  som genomförda i fördelningsunderlaget. Historiken ska visa tidigare
  och nytt värde, ansvarig för rättelsen och tidpunkten.

- AK-038 (K-039): Givet passerade pass med bokade platser markerade
  **Ej registrerat** inom vald period, när schemaförslaget tas fram ska
  ledaren se en varning om ofullständigt underlag och kunna identifiera
  registreringarna som saknas. De ska inte visas som **Ej genomfört**.
  När saknade registreringar kompletterats ska underlaget uppdateras.

- AK-039 (K-040): Givet ett uppgiftsupplägg med flera pass varav ett
  individuellt ändrat ska ledaren kunna välja att redigera ett enskilt
  pass eller hela upplägget. Vid ändring av hela upplägget ska det
  individuella undantaget behållas. Före sparandet ska förhandsvisningen
  visa de pass som ändras och det pass som hoppas över.

- AK-040 (K-041): Givet bokade platser som skulle tas bort av en ändring
  ska systemet identifiera berörda bokningar och stödja ledaren i att
  flytta eller uttryckligen avboka dem. Så länge någon är olöst ska
  sparandet blockeras och tidigare bokningar behållas. När ändringen
  genomförs ska berörda familjer aviseras; ingen bokning får tas bort
  som en automatisk följd av kapacitetsminskningen.

- AK-041 (K-042): Givet bokningar på platser som ska tas bort ska
  systemet föreslå lediga ersättningspass utan överlapp och låta ledaren
  granska, ändra eller uttryckligen välja avbokning. Förhandsvisningen
  ska omfatta alla ändringar. Ett giltigt sparande ska genomföra dem
  tillsammans. Om en föreslagen plats hunnit bokas ska ingen del av
  ändringen genomföras och ursprungliga bokningar ska behållas.

- AK-042 (K-043): Givet ett pass med registrerat genomförande ska försök
  att ta bort det eller ändra dess tider eller kapacitet nekas även via
  uppgiftsupplägget. Pass och bokningar ska bevaras. Rättelse av
  genomföranderegistreringen ska fortfarande vara möjlig enligt K-038
  och lämna spårbar ändringshistorik.

- AK-043 (K-044): Givet en bokning markerad **Söker ersättare** ska den
  synas i lagets bemanningsvy med tillämplig åtkomstbegränsning. Familjen
  ska kunna välja att skicka en förfrågan till laget. Om familjen återtar
  sökningen före ett övertagande ska ursprunglig bokning behållas och
  förfrågan inte längre gå att ta över från. Ett redan genomfört
  övertagande ska inte kunna återtas genom att återta sökningen.

- AK-044 (K-045): Givet aktiva spelare/medlemmar i laget och personligen
  inbjudna gäster till aktiviteten ska grundurvalet innehålla lagets
  aktiva personer efter beslutade undantag. Gästerna ska inte ingå förrän
  ledaren uttryckligen väljer att ta med dem. Personer med enbart en
  personlig inbjudan till en annan aktivitet ska inte kunna tas med på
  den grunden.

- AK-045 (K-046): Givet två i övrigt likvärdiga personer där den ena
  arbetade mer nyligen ska den som arbetade för längre tid sedan
  prioriteras i schemaförslaget. Vid olika sammanlagda viktade passtimmar
  ska däremot lägst belastning prioriteras även om den personen arbetade
  mer nyligen.

- AK-046 (K-047): När ledaren tilldelar, flyttar eller avbokar ett pass,
  eller när ett byte eller övertagande genomförs, ska berörda familjer
  aviseras enligt sina kanalinställningar. Flera passändringar som
  genomförs tillsammans ska ge samlad information per mottagare och
  kanal med rätt åtkomstavgränsning. Ett osparat förslag ska inte avisera.

- AK-047 (K-048): Givet ett arbetspass vars start skiljer sig från
  aktivitetens ska påminnelsen räknas från passets start. För en
  deadlineuppgift ska den räknas från deadline. Om bokningen bytt familj
  före utskicket ska den nya familjen få påminnelsen enligt sina
  kanalinställningar och den tidigare familjen inte längre få den.
  Ändring av arbetspasspåminnelser ska inte ändra kallelsepåminnelser.
  För en uppgift utan egen tid eller deadline ska påminnelsens tidpunkt
  beräknas från aktivitetens start.

- AK-048 (K-049): Givet ett påbörjat pass ska ändring av dess tider eller
  kapacitet nekas. Motsvarande ska gälla vid passerad deadline respektive
  aktivitetens start för uppgifter utan egen tid. Genomförande ska kunna
  registreras och rättas även därefter. Ett framtida, ännu inte låst pass
  ska kunna redigeras trots att själva aktiviteten har avslutats.

- AK-049 (K-050): Givet ett namngivet caféupplägg med gemensamma
  instruktioner ska ledaren kunna lägga till särskilda städinstruktioner
  och egen vikt på sista passet utan att ändra övriga pass. Instruktionerna
  ska vara tillgängliga för den som bokar eller tilldelas passet.
  Individuellt ändrade instruktioner ska bevaras vid uppläggsändring
  enligt K-040.

- AK-050 (K-051): Givet ett tvåtimmarspass med vikt 1,5 ska belastningen
  vara tre passtimmar. Normalvikten ska vara 1. Försök att ange noll
  eller negativ vikt ska nekas och får inte användas för att undanta
  en person från fördelningen.

- AK-051 (K-052): Givet en uppgiftstyp i lagets katalog ska ledaren
  kunna välja den vid skapande av uppgiftsupplägg. Om typen senare
  ändras ska redan skapade pass och deras historik vara oförändrade.

- AK-052 (K-053): När ledaren skapar nya öppna pass ska flödet inte
  erbjuda ett separat bemanningsutskick till laget. En familj som
  samordnat privat ska kunna boka ett ledigt pass frivilligt om
  vanliga behörighets- och bokningsvillkor är uppfyllda.

Övriga kriterier läggs till mot bekräftade krav efter varje intervjuomgång.

## Bekräftade beslut och motiv

- 2026-10-27: Användaren beställde en separat spec för arbetspass med tidigare
  presenterad funktionsdokumentation som underlag. Ingen implementation beställd.
- Redan godkända kopplingar till aktivitetshanteringen förs in som K-001–K-003;
  dessa behöver inte beslutas om på nytt.
- 2026-10-27: Användaren bekräftade hela bemanningsflödet som omfattning,
  inklusive familjens självservice, ledarverktyg, genomförande, historik och
  fördelningsförslag. Kalenderexport ingår inte och kalender/AI behåller egna specar.
- 2026-10-27: Bokning och genomförande tillhör barnet/medlemmen även när
  en annan vuxen arbetar. Familjen väljer utförare och behöver inte registrera
  den vuxnes namn. Historik och fördelning följer barnet/medlemmen.
- 2026-10-27: Självservice gäller egna/företrädda personer med aktiv
  spelarrelation eller personlig kallelse till den aktuella aktiviteten.
  Andra aktiviteters kallelser ger inte rätt här och andra familjer får
  inte bokas genom självservice.
- 2026-10-27: Användaren valde namnvisning inom laget för att kunna kontakta
  andra målsmän. Förslaget att behålla anonymisering för alla familjer valdes
  bort. Lagkrets, vilka namn som visas och kontaktväg återstår att precisera.
- 2026-10-27: Namnvisning gäller aktiva lagmedlemmar och deras registrerade
  målsmän/ombud samt behöriga ledare enligt administrativ åtkomst. Personligt
  kallade gäster utan lagrelation ser bara egna namn och övriga som bokade.
- 2026-10-27: Användaren bekräftade kontaktvy från bokad medlems namn, med
  registrerade målsmäns namn/mobil/e-post för barn och egna kontaktuppgifter
  för vuxna. Kontaktknappar öppnar enhetens appar och samma lagkrets avgränsar
  åtkomsten; gäster får inte andra familjers kontaktuppgifter.
- 2026-10-27: Bemanning hör till en aktivitet och stöds på alla
  aktivitetstyper. Samma aktivitet kan ha flera uppgifter med egna pass
  och platser; typen Arbetspass är ingen förutsättning.
- 2026-10-27: Användaren bekräftade tidsformerna bemanningspass,
  deadline och ingen särskild tid, valda per uppgift, med möjlighet att
  dela tidsintervall i flera pass.
- 2026-10-27: Ledaren anger intervall, passlängd och antal platser per pass.
  Sista passet kortas vid behov. Platser bokas separat och antalet kan
  justeras för ett enskilt pass.
- 2026-10-27: Användaren tillät uppgifter före/efter aktivitetens egna tider,
  med separat tydlig tidsvisning. Äldre appens begränsning till aktivitetens
  period ska inte behållas. Boknings-/livscykelföljder preciseras i senare krav.
- 2026-10-27: Bokning stänger vid passets start, uppgiftens deadline eller
  aktivitetens start för tidlösa uppgifter, med möjlighet till tidigare
  ledarvald stängning. Inställning stänger all självservice. Senare pass kan
  bokas även efter aktivitetens slut, utan att dess egna uppgifter lämnar läsläge.
- 2026-10-27: Användaren angav att ledare inte behöver godkänna bokning.
  Bokningar ska därför gälla direkt utan valbart bokningsgodkännande.
  Flytt-, bytes- och ersättarflödenas eventuella godkännanden är inte avgjorda.
- 2026-10-27: Familjen får avboka eget/företrätt pass före bokningens
  stängningsgräns. Platsen blir ledig och historiken bevaras. Efter gränsen
  behövs ledarkontakt; ledaren kan välja tidigare stängning för framförhållning.
- 2026-10-27: Familjen får direkt flytta en bokning till ledig plats inom
  samma aktivitet utan ledargodkännande, när båda passens självservice är
  öppen. Konflikt om målplatsen lämnar den gamla bokningen oförändrad.
- 2026-10-27: Byte med annan familj kräver den andra familjens godkännande
  men inte ledarens. Båda bokningarna gäller tills ett atomärt byte genomförts,
  med öppen självservice för båda. Avslag/inaktualitet/utgång ändrar inget.
- 2026-10-27: Användaren korrigerade regeln om fri avbokning: ledaren ska
  kunna lägga ut ett tilldelat schema där målsmannen måste ordna ersättare,
  eller lämna bemanningen öppen att boka. Avbokningsbeteendet ska vara
  valbart utifrån detta. Modellen och följderna preciseras i nästa omgång.
- 2026-10-27: Användaren bekräftade lägena Tilldelat schema och Öppen
  bokning, med kvarstående ansvar i tilldelat läge respektive fri avbokning
  före gränsen i öppet läge. Användaren betonade att plattformen ska kunna
  föreslå schema baserat på tidigare arbetspass.
- 2026-10-27: Läget väljs uttryckligen per uppgiftsupplägg utan förval och
  gäller dess genererade pass. En aktivitet kan blanda tilldelade och öppna
  uppgifter. Historikförslag används för tilldelat schema.
- 2026-10-27: Användarens "Js" tolkades som ja till schemalagd
  passlängd i timmar × vikt = passtimmar, standardvikt 1, justerbar vikt
  per upplägg/pass och prioritering av lägst summa genomförda passtimmar.
  Tidsunderlag för deadline/tidlösa uppgifter preciseras därefter.
- 2026-10-27: Deadlineuppgifter och tidlösa uppgifter får uppskattad
  tidsåtgång per bokad plats, som multipliceras med vikten för historik/
  fördelning utan att ändra deadline eller aktivitetens tider.
- 2026-10-27: Förslaget ska även väga in framtida bokade pass och uppdatera
  belastningen efter varje föreslagen placering. Utförda, framtida bokade
  och nu föreslagna passtimmar visas separat för att inte blanda plan med genomförande.
- 2026-10-27: Användaren bekräftade underlag inom samma lag, genomförda
  uppgifter i båda lägen och valbar tidsperiod med högst tio års historik.
  Förvalet ska vara innevarande säsong, inte kalenderåret som föreslogs.
- 2026-10-27: Säsongsregel anges på disciplin med sektionsöverstyrning,
  utan lagöverstyrning. Exakta datum och förval lämnas till implementation
  av discipliner; bemanningen ska använda den tillämpliga regeln.
- 2026-10-27: Bekräftade innevarande säsong som grund för schemaförslag,
  med möjlighet för ledaren att välja en annan underlagsperiod.

- 2026-10-27: Bekräftade **Söker ersättare** i tilldelat läge med kvarstående
  ansvar tills behörig ersättare tar över utan ledargodkännande. Direkt flytt
  till ledig plats tillåts inte i tilldelat schema.

- 2026-10-27: Bekräftade granskning och manuell justering före publicering,
  då nya tilldelningar börjar gälla och familjer aviseras. Ny generering
  behåller befintliga bokningar.

- 2026-10-27: Bekräftade konfigurerbar befrielse från tilldelning som
  föreningsförval med anpassning på sektion och lag. Befrielsen hindrar
  inte frivillig bokning, och undantag med orsak ska synas för ledaren.

- 2026-10-27: Avgränsade första lösningen till en kryssruta som undantar
  barn vars registrerade målsman har ledarroll i samma lag. Den ersätter
  den tidigare diskuterade generella regelmodellen som första omfattning.

- 2026-10-27: Bekräftade möjlighet att välja bort enskilda personer från
  just det aktuella schemaförslaget utan fler automatiska befrielseregler.

- 2026-10-27: Bekräftade att automatisk fördelning undviker överlappande
  pass för samma barn/medlem och visar olösta platser som ofördelade.

- 2026-10-27: Avvisade förslaget om bekräftningsbar överlappsvarning vid
  manuell tilldelning och frivillig bokning. Krockar för samma person ska
  blockeras; myndiga spelare kan inte förutsättas få hjälp av målsman.

- 2026-10-27: Bekräftade högst ett pass per person och aktivitet vid
  automatisk tilldelning, med möjlighet att frivilligt boka fler utan
  överlapp. Plattformen kan föreslå längre pass och färre passbyten,
  med granskning och godkännande av ledaren innan indelningen används.

- 2026-10-27: Bekräftade ledarregistrerat genomförande per bokad plats,
  med **Genomfört**, **Ej genomfört** och **Ej registrerat** som skilda
  tillstånd. Endast registrerat genomförande ger historiska passtimmar.

- 2026-10-27: Bekräftade rättelse av genomförande med ändringshistorik
  samt sparat tidsunderlag och vikt så att senare uppläggsändringar inte
  skriver om historiskt intjänade passtimmar.

- 2026-10-27: Bekräftade varning i schemaförslaget om passerade pass
  saknar genomföranderegistrering inom vald underlagsperiod.

- 2026-10-27: Bekräftade redigering av enskilt pass eller hela
  uppgiftsupplägget, med förhandsvisning och bevarade individuella undantag.

- 2026-10-27: Bekräftade att bokningar på platser som tas bort måste
  flyttas eller uttryckligen avbokas före sparande, med systemstöd och
  avisering till berörda familjer. Det konkreta stödet följer K-042.
- 2026-10-27: Bekräftade förslag på lediga ersättningspass utan tidskrockar,
  ledarens granskning/justering och uttryckliga avbokning samt gemensamt
  sparande av samtliga ändringar.

- 2026-10-27: Bekräftade skydd mot borttagning och ändrade tider eller
  kapacitet för pass med registrerat genomförande. Pass och bokningar
  bevaras, med fortsatt möjlighet till spårbar rättelse av genomförandet.

- 2026-10-27: Bekräftade synlig ersättarsökning i bemanningsvyn,
  valbar förfrågan till laget och återtagande fram till övertagande,
  med oförändrad ursprungsbokning under sökningen.

- 2026-10-27: Bekräftade grundurval av lagets aktiva spelare/medlemmar
  efter beslutade undantag, med uttryckligt tillval av personligen
  inbjudna gäster till just aktiviteten.

- 2026-10-27: Bekräftade lägre prioritet för den som arbetade mer nyligen,
  för att få så lång tid mellan arbetspassen som möjligt. Hur detta vägs
  mot skillnader i viktade passtimmar behöver klargöras.

- 2026-10-27: Bekräftade att lägst sammanlagda viktade passtimmar styr
  först och att längst tid sedan senaste arbetspasset avgör vid lika belastning.

- 2026-10-27: Bekräftade avisering till berörda familjer vid ledartilldelning,
  flytt, avbokning och genomförda byten/övertaganden, enligt kanalinställningar
  och med samlad information vid samtidiga passändringar.

- 2026-10-27: Bekräftade separata arbetspasspåminnelser från passets
  starttid eller deadline till den familj som har bokningen vid utskicket.

- 2026-10-27: Bekräftade låsning av tider och kapacitet vid passets start,
  deadline respektive aktivitetens start för tidlösa uppgifter. Senare
  pass förblir redigerbara oberoende av aktivitetens slut, och genomförande
  kan registreras/rättas även efter låsningen.

- 2026-10-27: Bekräftade namn och gemensamma instruktioner per upplägg
  samt särskilda instruktioner för enskilda pass, exempelvis städning
  på sista cafépasset med egen belastningsvikt.

- 2026-10-27: Bekräftade positiva decimalvikter med normalvikt 1,
  utan möjlighet att använda vikt 0 för befrielse.

- 2026-10-27: Bekräftade lagets återanvändbara uppgiftstyper och skydd
  mot att senare katalogändringar automatiskt ändrar skapade pass/historik.

- 2026-10-27: Avgränsade bort separat förfrågan om att boka nya öppna
  pass. Användaren hänvisade till privat chatt och därefter frivillig
  bokning. Beslutet ändrar inte tidigare bekräftad ersättarsökning.

## Obekräftade antaganden och förslag

- Generella befrielseregler med organisatoriskt arv och permanent manuell
  befrielse är möjliga framtida utökningar, inte del av första lösningen.
- Tidigare poängförslag är ersatt av bekräftade viktade passtimmar.
- Exakta säsongsdatum bestäms vid implementation av discipliner enligt
  K-028. Tidigare exempel på fotbolls-/innebandydatum är inte beslutade.
- Manuellt periodval om en säsongsregel saknas och lottning vid helt
  lika fördelningsunderlag har diskuterats men är inte beslutade krav.
- Det kartlagda nuläget är bakgrund. Kraven K-001–K-053 anger beslutat
  beteende och får inte ersättas av motstridiga äldre appregler.

## Öppna frågor

- Inga blockerande produktfrågor återstår inom den godkända omfattningen.
- Disciplinernas exakta säsongsdatum och förval beslutas i det separata
  disciplinsarbetet. Detta blockerar inte bemanningsspecens godkännande,
  men säsongsförvalet är ett integrationsberoende vid implementation.

## Bekräftelse

Intervjuns beslut är sammanställda i K-001–K-053 med AK-001–AK-052.
Användaren godkände den samlade kravsammanfattningen och status Redo
2026-10-27. Godkännandet innebär ingen beställning av implementation.

## Ändringshistorik

- 2026-10-27: Skapade utkast med kartlagt nuläge, ärvda aktivitetsbeslut och
  öppna produktfrågor inför intervjun.
- 2026-10-27: Bekräftade full omfattning och avgränsning mot kalenderexport
  samt kalenderns och AI-assistentens separata specar.
- 2026-10-27: Bekräftade personkoppling för bokning, genomförande,
  historik och fördelning utan krav på utförande vuxens namn.
- 2026-10-27: Bekräftade person-/lagavgränsning för självservice och
  skydd mot bokning åt andra familjer eller med annan aktivitets kallelse.
- 2026-10-27: Beslutade namnvisning inom laget för samordning mellan
  målsmän, med fortsatt separata skrivrättigheter och återstående precisering.
- 2026-10-27: Preciserade namnvisningens tittarkrets och gästernas
  begränsade insyn utan rätt att se andra familjers namn.
- 2026-10-27: Bekräftade kontaktvyn, kontaktfält och enhetens kontaktappar
  med samma beslutade åtkomstgräns som namnvisningen.
- 2026-10-27: Bekräftade aktivitetsanknuten bemanning på alla aktivitetstyper
  och flera separata uppgifter inom samma aktivitet.
- 2026-10-27: Bekräftade tre tidsformer och delbara bemanningsintervall.
- 2026-10-27: Bekräftade passgenerering, kortare sista pass och separat
  bokningsbara platser med möjlighet till enskild kapacitetsjustering.
- 2026-10-27: Utökade stödet till uppgifter före och efter aktivitetens tider
  utan att ändra aktivitetens egna tider.
- 2026-10-27: Bekräftade egna bokningsgränser för pass/deadline, tidigare
  stängning och fortsatt bokning av senare pass efter avslutad aktivitet.
- 2026-10-27: Valde direkt giltiga bokningar utan ledargodkännandeflöde,
  med separat fortsatt beslut om godkännanden vid ändringar.
- 2026-10-27: Bekräftade fri självserviceavbokning före gränsen med bevarad
  historik och ledarkontakt för senare ändring.
- 2026-10-27: Bekräftade direkt och atomär flytt till ledig plats inom
  samma aktivitet, utan ledargodkännande och med båda passens tidsgränser.
- 2026-10-27: Bekräftade samtyckt familjebyte utan ledargodkännande,
  bevarade ursprungsbokningar och gemensamt byte inom båda passens tidsgränser.
- 2026-10-27: Ändrade tidigare generell fri avbokning till lägesberoende
  regler enligt användarens förtydligande om tilldelat schema och öppen bokning.
- 2026-10-27: Bekräftade tvålägesmodellen och krav på plattformens
  historikbaserade förslag till tilldelat bemanningsschema.
- 2026-10-27: Bekräftade läge per uppgiftsupplägg utan förval och
  fördelningsförslag för tilldelade scheman.
- 2026-10-27: Sparade användarens förslag om viktade passpoäng för
  belastning, exempelvis dubbla poäng för caféstängning med städning.
  Modellen och exakta värden återstår att bekräfta.
- 2026-10-27: Användaren vidareutvecklade måttet till tid × vikt =
  passtimmar i stället för fasta passpoäng. Sparade som aktuellt förslag
  inför bekräftelse av formel och tidsunderlag.
- 2026-10-27: Bekräftade viktade passtimmar enligt schemalagd tid × vikt,
  standardvikt 1 och justerbar vikt per upplägg/pass, med lägst genomförd
  belastning som fördelningsprioritet.
- 2026-10-27: Bekräftade uppskattad tid per plats för deadline/tidlösa
  uppgifter som grund för viktade passtimmar utan ändrade uppgiftstider.
- 2026-10-27: Bekräftade framtida bokad belastning och successiv uppdatering
  under fördelningsförslaget, med tydligt separerade genomförda/bokade/föreslagna timmar.
- 2026-10-27: Bekräftade samma lag, båda bemanningslägen och valbar period;
  ändrade periodförvalet till innevarande säsong enligt användarens tillägg.
- 2026-10-27: Sparade förslag om disciplinstyrd säsongsregel, med fotboll
  som kalenderår och innebandy över årsskiftet. Exakta förval och överstyrning
  inväntar bekräftelse.
- 2026-10-27: Bekräftade säsongsregel på disciplin med sektionsöverstyrning,
  utan egen överstyrning per lag. Exakta säsongsdatum återstår att bekräfta.
- 2026-10-27: Flyttade beslut om exakta säsongsdatum och disciplinförval
  till implementation av discipliner enligt användarens avgränsning.
- 2026-10-27: Bekräftade förvald innevarande säsong och ledarens möjlighet
  att basera genererat schema på annan period; preciserade periodvalet i K-027.
- 2026-10-27: Bekräftade ersättarsökning och direkt behörigt övertagande
  med kvarstående ansvar fram till övertagandet; spärrade direkt flytt till
  ledig plats i tilldelat schema.
- 2026-10-27: Bekräftade granskningsbart och justerbart schemaförslag,
  publicering som gräns för tilldelning/avisering och bevarade befintliga bokningar.
- 2026-10-27: Sparade klubbens undantag för ledarbarn som underlag för
  fortsatt intervju om konfigurerbar befrielse från tilldelade arbetspass.
- 2026-10-27: Bekräftade befrielseregler med föreningsförval och
  sektions-/laganpassning, fortsatt frivillig bokning och synlig undantagsorsak.
- 2026-10-27: Förtydligade behovet som möjlighet att ange vilka personer
  som inte behöver arbeta. Ingen automatisk roll-/familjeregel beslutades;
  sparade manuell befrielsemarkering som förslag till grundflöde.
- 2026-10-27: Användaren föreslog i stället en inledande kryssruta för
  att bortse från personer med ledarroll. Avgränsning till ledaren själv
  respektive ledarens barn behöver klargöras innan kravet fastställs.
- 2026-10-27: Bekräftade kryssrutan som undantar barn vars målsman har
  ledarroll i samma lag. Uppdaterade K-031 och AK-030 till första lösningen;
  generell regelmodell och organisatoriska förval lämnas som senare möjlighet.
- 2026-10-27: Ändrade kryssrutans förval till ikryssat enligt användarens
  önskemål. Ledaren kan avmarkera för att inkludera ledarbarn i fördelningen.
- 2026-10-27: Bekräftade individuellt bortval i aktuellt schemaförslag;
  lade till K-032 och AK-031 utan permanenta manuella befrielseregler.
- 2026-10-27: Bekräftade överlappskontroll i automatiskt schemaförslag
  och tydlig visning av ofördelade platser; lade till K-033 och AK-032.
- 2026-10-27: Beslutade hård spärr mot personens överlappande arbetspass
  även i manuella flöden och självservice. Lade till K-034 och AK-033.
- 2026-10-27: Sparade inriktningen ett pass per person och tillfälle samt
  förslaget om alternativa passlängder vid fördelningsproblem. Exakt
  omfattning och godkännandeflöde preciseras i nästa intervjuomgång.
- 2026-10-27: Bekräftade ettpassgräns per person/aktivitet för automatisk
  tilldelning, frivilliga extra pass utan överlapp och granskat förslag
  om längre pass. Lade till K-035–K-036 och AK-034–AK-035.
- 2026-10-27: Bekräftade registrerat genomförande som grund för historiska
  passtimmar och separata statusar per bokad plats; lade till K-037 och AK-036.
- 2026-10-27: Bekräftade spårbara rättelser av genomförande och sparat
  tids-/viktunderlag för historiska passtimmar; lade till K-038 och AK-037.
- 2026-10-27: Bekräftade synlig varning om ofullständig genomförandehistorik
  vid schemaförslag; lade till K-039 och AK-038.
- 2026-10-27: Bekräftade redigeringsomfattning för arbetspass och upplägg,
  förhandsvisning samt överhoppade individuella undantag; lade till K-040 och AK-039.
- 2026-10-27: Bekräftade systemstödd hantering av bokningar vid borttagna
  platser, utan automatisk förlust av bokningar; lade till K-041 och AK-040.
- 2026-10-27: Bekräftade granskningsbara ersättningsförslag och atomärt
  sparande av flyttar/avbokningar; lade till K-042 och AK-041.
- 2026-10-27: Bekräftade skydd för pass med registrerat genomförande;
  lade till K-043 och AK-042.
- 2026-10-27: Bekräftade synlig och återtagbar ersättarsökning med valbar
  förfrågan till laget; lade till K-044 och AK-043.
- 2026-10-27: Bekräftade grundurval och uttryckligt tillval av personligen
  inbjudna gäster; lade till K-045 och AK-044.
- 2026-10-27: Bekräftade prioritering efter tid sedan senaste arbetspass;
  lade till K-046 och AK-045 med öppen viktning mot passtimmar.
- 2026-10-27: Fastställde prioriteringsordningen i K-046 och AK-045:
  lägst sammanlagda viktade passtimmar först, därefter längst tid sedan
  senaste arbetspasset vid lika belastning.
- 2026-10-27: Bekräftade familjeaviseringar för genomförda tilldelningar,
  flyttar, avbokningar, byten och övertaganden; lade till K-047 och AK-046.
- 2026-10-27: Bekräftade fristående arbetspasspåminnelser och aktuell
  bokad familj som mottagare; lade till K-048 och AK-047.
- 2026-10-27: Bekräftade aktivitetens start som utgångspunkt för
  påminnelser om uppgifter utan egen tid eller deadline.
- 2026-10-27: Bekräftade passens egna låsningstider och fortsatt
  genomföranderegistrering; lade till K-049 och AK-048.
- 2026-10-27: Bekräftade namn och instruktioner för upplägg/pass;
  lade till K-050 och AK-049.
- 2026-10-27: Bekräftade positiva decimalvikter och nekad noll-/negativ
  vikt; lade till K-051 och AK-050.
- 2026-10-27: Bekräftade återanvändbara uppgiftstyper i lagets katalog;
  lade till K-052 och AK-051.
- 2026-10-27: Avvisade separat bokningsförfrågan för nya öppna pass;
  lade till avgränsning, K-053 och AK-052.
- 2026-10-27: Sammanställde huvudflöden och ersatte inaktuella öppna
  frågor med kravhänvisningar inför samlad bekräftelse. Status fortsatt Utkast.
- 2026-10-27: Användaren godkände sammanfattningen och att specen markeras
  Redo. Ingen implementation beställd.
