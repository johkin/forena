# Administration – klubbstruktur, roller och inbjudningar

- Status: Redo
- Senast uppdaterad: 2026-10-28
- Berörda dokument: [Arkitektur](../architecture.md#klubbstruktur-och-onboarding), [Säkerhet](../security-architecture.md), [Designregler](../design-spec.md), [Befintlig Kotlin-administration](../migration/activity-management.md), [Funktionell likvärdighet](../migration/feature-parity.md), [Lagmedlemmar](hantera-trupp.md), [Discipliner](discipliner.md), [AI-assistent](ai-assistent.md)
- Implementation och verifiering: Kravspecen och slutlig sammanfattning är godkända. Ingen implementation beställd inom denna intervju. Nuläget nedan är läst i kod och dokumentation, inte funktionstestat här.

## Problem och mål

Ta fram en sammanhållen spec för administration vid migrering från Next till
React/Kotlin. Målet är att bevara Next-appens befintliga administrationsflöden
för system-, klubb-, sektions- och lagadministration och precisera förbättringar
under intervjun.

## Omfattning

### Ingår

- Skapa och ändra klubbar, sektioner och lag.
- Tilldela och återkalla administratörsroller.
- Hantera ansvar och behörigheter separat, exempelvis tränare respektive lagadmin.
- E-postinbjudningar till administratörer med acceptans, utgång och återkallning.
- Skydd för historik och mot att sista administratören försvinner.
- Alla fyra nivåer: system, klubb, sektion och lag, med Next som förlaga.

### Ingår inte

Specarbetet beställer inte implementation. Medlemsansökningar,
vårdnadshavarkopplingar, discipliner och assistentinställningar behåller sina
befintliga specar; här beskrivs kopplingarna till dem.
Självregistrering av klubbar ska inte finnas i målappen enligt svar 2.
Flytt av lag mellan sektioner och radering av hela klubbar ingår inte i första
versionen, enligt svar 14.
Arkivering av lag och sektioner ingår inte; det kräver en separat spec enligt
svar 25. Objekt med historik behålls och radering tillåts bara enligt K-030.

## Befintligt underlag

- Next har systemstartsida, klubblista, klubbmetadata, sektioner, lag och
  administratörsvyer. Systemets klubbskapande och självregistrering delar en
  trestegsguide med första sektion och valfritt första lag.
- Next har e-postinbjudningar till system- och klubbadministratörer med
  uttrycklig acceptans från rätt verifierade e-postadress och hantering av
  utgångna/avbrutna länkar. Klubbadminvyn skiljer leveransstatus från roll.
- Next skiljer lagrelation, ansvar (exempelvis tränare) och systembehörighet.
  Befintlig klubbvy kan tilldela målsmän ansvar och behörighetsprofil i ett lag.
  Vyns begränsning till målsmän är nuläge, inte ett beslutat framtida krav.
- Kotlin har bootstrap av första systemadmin, klubb/sektion/lag,
  direkt tilldelning till verifierade befintliga konton, återkallning,
  borttagningsskydd och audit. E-postinbjudningar återstår.
- Systemrollen ger ingen automatisk verksamhetsåtkomst i Kotlin; en klubbroll
  tilldelas uttryckligen. Sista systemadmin och sista klubbadmin skyddas.
- Äldre arkitekturtext och Kotlin-körguiden beskriver delvis olika
  behörighetsgränser. Målmodell och avsiktliga skillnader måste anges uttryckligen.

Källor: `src/app/system/`, `src/app/setup/`,
`src/app/o/[organizationSlug]/admin/`,
`src/app/o/[organizationSlug]/s/[sectionSlug]/admin/teams/`,
`src/app/system-admin-invite/`, `src/app/club-admin-invite/`,
`src/components/club-administration.tsx`,
`src/components/club-administrators.tsx`,
`backend/src/main/kotlin/se/forena/api/administration/` och länkade dokument.

## Användare, roller och flöden

Målroller: systemadministratör, klubbadministratör, sektionsadministratör,
lagadministratör och mottagare av inbjudan. Nexts särskilda klubbägare ska
inte finnas som roll i målappen, enligt K-020.

1. Första systemadmin aktiverar sin roll genom det befintliga engångsflödet.
2. Systemadmin skapar och granskar klubb med första sektion och valfritt lag.
   Därefter tilldelas eller bjuds första klubbadmin in separat.
3. Klubbadmin förvaltar strukturen och delegerar till sektions-/lagadmin inom
   beslutat mandat. Inbjuden administratör verifierar rätt adress och accepterar.
4. Klubbadmin förvaltar behörighetsprofiler. Lagadmin tilldelar profiler och
   direkta behörigheter, granskar rättighetskällor och återkallar per källa.
5. Administratörer granskar historik inom sitt område. Struktur- och
   behörighetsändringar följer revisionsskydd, datumgiltighet och skydd för sista admin.

## Krav

- K-001: Administrationen ska omfatta system, klubb, sektion och lag, med
  Next-appens befintliga funktioner som grund och specificerade ändringar nedan.
- K-002: Behöriga administratörer ska kunna skapa och ändra klubbar, sektioner
  och lag samt tilldela och återkalla administratörsroller enligt mandaten i
  K-007–K-011, K-019, K-021, K-024 och K-047.
- K-003: Ansvar och systembehörighet ska hanteras som separata begrepp.
- K-004: E-postinbjudningar ska stödja acceptans, utgång och återkallning.
  Gemensamma regler för alla administrativa nivåer anges i K-012–K-015.
- K-005: Administrationsändringar ska skydda historik och förhindra att sista
  system- eller klubbadministratören försvinner. Sektioner och lag får sakna
  egen administratör enligt K-022. Systemroller och eget utträde följer K-024–K-025.
- K-006: Medlemsansökningar, vårdnadshavarkopplingar, discipliner och
  assistentinställningar ska följa sina befintliga specar. Administrationens
  kopplingar till dem ska beskrivas utan konkurrerande regler.
- K-007: Endast systemadministratörer får skapa klubbar i React/Kotlin.
  Vanliga konton får inte skapa klubbar genom självregistrering, direktlänk
  eller API-anrop. Klubbadministratören tilldelas eller bjuds in separat efter
  skapandet. Självregistrering från Next är ett uttryckligt bortvalt flöde i
  första versionen, för att minska dubbletter och skapande utan föreningens mandat.
- K-008: Systemadministratörer får hantera klubbuppgifter, sektioner, lag och
  klubbadministratörer utan klubbroll. Systemrollen ger ingen automatisk åtkomst
  till verksamhetens medlemsuppgifter, kallelser eller närvaro. Sådan åtkomst
  kräver en separat, uttryckligen tilldelad och loggad klubbroll. Klubbskapande
  ska inte automatiskt tilldela skapande systemadministratör en klubbroll.
  Systemadministratörens självtilldelning regleras i K-019.
- K-009: Klubbadministratörer ska inom den egna klubben kunna bjuda in och
  återkalla andra klubbadministratörer samt utse sektions- och lagadministratörer.
  Den sista klubbadministratören får inte återkallas. Behörigheten får inte
  användas för tilldelningar i andra klubbar eller av systemroller.
- K-010: Sektionsadministratörer ska kunna utse och återkalla
  lagadministratörer inom sin egen sektion. Klubbadministratörer hanterar
  sektionsadministratörerna; sektionsrollen ger inte rätt att utse eller
  återkalla sektionsadministratörer.
- K-011: Lagadministratörer ska kunna tilldela avgränsade behörigheter inom
  sitt eget lag, exempelvis för närvaro och kallelser. Sektions- eller
  klubbadministratörer hanterar lagadministratörerna; lagrollen ger inte rätt
  att utse eller återkalla lagadministratörer. Katalog och återkallning följer
  K-035 och profilreglerna i K-036–K-042.
- K-012: Administratörsinbjudningar ska på alla nivåer ange rollen och dess
  omfattning: systemet, en viss klubb, sektion eller ett visst lag. Mottagaren
  får skapa konto vid behov men måste ha verifierat den e-postadress som
  inbjudan skickades till. Rollen får aktiveras först efter uttrycklig acceptans.
- K-013: Inbjudningslänken ska vara giltig i sju dagar och kunna återkallas.
  Återkallade eller utgångna inbjudningar får inte ge någon roll.
  Giltigheten är 7 × 24 timmar från att inbjudan skapas; vid eller efter
  utgångstidpunkten är länken ogiltig. Automatiska leveransförsök får inte
  förlänga giltigheten.
- K-014: En ny inbjudan till samma e-postadress och roll inom samma område
  ska ersätta den gamla. Den ersatta länken får inte kunna ge någon roll.
  Inbjudningar till andra roller eller områden ska inte ersättas av detta.
- K-015: Vid acceptans ska aktuell behörighet kontrolleras: inbjudaren måste
  fortfarande få tilldela den aktuella rollen inom det aktuella området.
  Om behörigheten saknas får inbjudan inte aktivera någon roll.
- K-016: Administrationsvyn ska skilja mellan väntande leverans, skickad,
  leveransfel, accepterad, utgången och återkallad inbjudan. Leveransstatus
  får inte förväxlas med aktiverad administratörsroll.
- K-017: Åtgärden **Skicka ny inbjudan** ska skapa en ny länk med ny
  giltighetstid enligt K-013 och göra den gamla länken ogiltig enligt K-014.
- K-018: Upprepad acceptans får inte skapa dubbla roller. Om rollen redan
  aktiverats genom inbjudan ska detta visas. En gammal accepterad inbjudan får
  aldrig återaktivera en roll som senare återkallats; upprepad acceptans får
  inte behandlas som ett nytt tilldelningsbeslut.
- K-019: En systemadministratör ska kunna tilldela sig själv klubbadminrollen
  i en vald klubb genom åtgärden **Bli klubbadministratör**. Åtgärden ska kräva
  uttrycklig bekräftelse och loggas. Ingen inbjudan från en befintlig klubbadmin
  krävs. Rollen ska vara separat från systemrollen och ge klubbadminens
  behörigheter endast inom den valda klubben.
- K-020: Målappen ska ha en gemensam klubbadminroll utan särskild klubbägare.
  Alla klubbadministratörer ska ha samma mandat inom klubben. Ingen ska få
  särskilda rättigheter genom att ha skapat klubben eller varit först utsedd.
  Skyddet för sista klubbadministratören enligt K-009 gäller fortsatt.
  Nexts separata ägarroll är ett uttryckligt bortval vid migreringen.
- K-021: Klubbadministratörer ska kunna återkalla sektions- och
  lagadministratörsroller inom sin egen klubb.
- K-022: Sektioner och lag får sakna egen administratör, eftersom överordnad
  administratör kan hantera dem. Återkallning av sista sektions- eller lagadmin
  ska därför vara tillåten för en behörig överordnad administratör.
- K-023: Återkallning ska omedelbart ta bort behörigheterna som kommer från
  den återkallade rollen. Medlemskap, historik och oberoende tilldelade roller
  ska bevaras. Ett fortsatt inloggat konto får inte fortsätta använda den
  återkallade rollens behörigheter genom en redan öppen sida eller API-anrop.
- K-024: Endast systemadministratörer ska få bjuda in och återkalla andra
  systemadministratörer. Den sista systemadministratören får inte tas bort.
  Inbjudningar följer K-012–K-018; väntande inbjudningar räknas inte som
  aktiva systemadministratörer. Första systemadminens bootstrap följer K-053.
- K-025: En administratör ska kunna lämna sin egen roll. Sista system- eller
  klubbadministratören måste först ordna en ersättare som accepterat rollen;
  en enbart skickad inbjudan räcker inte. Detta gäller inte sektions-/lagadmin,
  eftersom dessa områden får sakna egen administratör enligt K-022.
  Eget utträde ger ingen rätt att ändra andra administratörers roller utöver
  den tidigare beslutade delegeringsmodellen.
- K-026: Systemadmin ska skapa en klubb i den gemensamma skapandeguiden med
  klubbuppgifter och unik webbadress. Tidszon ska inte vara ett fält i guiden.
  Systemets tidszon utan användarval regleras i K-029.
- K-027: Vid klubbskapande ska en första sektion med disciplin krävas; ett
  första lag ska vara valfritt. Hela strukturen ska granskas före sparande och
  sparas atomärt. Vid fel får ingen halvfärdig klubbstruktur skapas.
- K-028: Efter klubbskapandet ska första klubbadministratören tilldelas eller
  bjudas in i ett separat steg. En nyskapad klubb får sakna klubbadmin tills
  detta steg är klart; systemvyn ska tydligt visa detta. Undantaget gäller den
  initiala tillsättningen, inte återkallning av sista klubbadmin enligt K-009.
- K-029: Alla klubbar i målappen ska använda svensk tid, `Europe/Stockholm`,
  utan administratörsval av tidszon. Sommar- och vintertid ska hanteras
  automatiskt. Aktiviteters klockslag ska visas i denna tidszon oavsett
  användarens enhets- eller webbläsartidszon. Kalenderoperationer och
  aktivitetsregler ska använda den uttryckliga IANA-zonen, inte fast UTC-offset.
- K-030: Endast tomma sektioner och lag utan kopplade medlemmar, aktiviteter
  eller annat sparat underlag får raderas. Klubbens sista sektion får inte
  raderas. Sparad historik får inte tas bort för att kringgå borttagningsskydden.
- K-031: Borttagning av sektion eller lag ska kräva uttrycklig bekräftelse.
  Om åtgärden blockeras ska användaren få en begriplig förklaring till varför.
  Backend ska kontrollera att borttagningen är tillåten vid själva skrivningen,
  även om objektet var tomt när bekräftelsedialogen öppnades.
- K-032: Flytt av lag mellan sektioner och radering av hela klubbar ska inte
  erbjudas i första versionen. Detta är en uttrycklig avgränsning av målappen.
- K-033: Namn på klubb, sektion och lag ska kunna ändras utan att deras
  adressnamn ändras automatiskt. Klubbens webbadress ska kunna ändras separat,
  med kontroll att den är ledig och varning om att gamla länkar slutar fungera.
  Sektioners och lags egna adressnamn ska behållas i första versionen; de ska
  inte erbjudas separat redigering. Byte av klubbadress ändrar dock den
  gemensamma klubbdelen av underliggande adresser.
- K-034: Lag ska inte ha någon säsongsuppgift i målappen. Varken skapande
  eller redigering ska kräva eller erbjuda säsong som laguppgift.
  Detta beslut ändrar inte i sig historik eller datumgiltighet för medlemskap.
- K-035: Följande fasta lagbehörigheter ska kunna tilldelas separat: hantera
  aktiviteter, hantera kallelser och bemanning, registrera och rätta närvaro,
  hantera lagmedlemmar samt granska medlemsansökningar. Lagadmin ska kunna
  tilldela och återkalla dem inom sitt lag. Mottagaren behöver inte vara målsman.
  Ansvar som tränare ska inte automatiskt ge någon av dessa behörigheter.
- K-036: Behörighetsprofiler ska kunna anpassas per klubb och samla flera
  behörigheter som tilldelas i en operation. Profilerna ska inte vara enbart
  fasta och gemensamma för alla klubbar. Exakta förvaltningsmandat och
  profilförvaltning regleras i K-039–K-042. Kombination med direkt
  tilldelning regleras i K-037–K-038.
- K-037: En person ska kunna ha både direkt tilldelade behörigheter och flera
  behörighetsprofiler. Effektiva rättigheter ska vara summan av de aktiva
  tilldelningarna inom respektive lag; en profil får inte sprida lagåtkomst
  utanför tilldelningens område.
- K-038: Vyn ska visa varifrån varje behörighet kommer och vad en
  återkallning påverkar. Borttagning av en direkt tilldelning eller profil
  ska inte ta bort rättigheter som personen fortfarande får från en annan
  aktiv tilldelning. Överlapp ska inte skapa dubbla effektiva behörigheter.
- K-039: Klubbadmin ska kunna skapa och ändra klubbens behörighetsprofiler
  med de fem lagbehörigheterna i K-035. Profiler får inte ge administratörsroller
  eller rätt att förvalta profiler. En klubbs profiler tillhör endast den klubben.
- K-040: Lagadmin ska kunna tilldela och ta bort profiler inom sitt eget lag.
  Detta ger inte rätt att ändra profildefinitionen eller tilldela i andra lag.
- K-041: Ändringar i en profils behörighetsinnehåll ska gälla även befintliga
  tilldelningar. Före bekräftelse ska berörda personer och förändrade rättigheter
  visas, med hänsyn till överlapp med andra aktiva tilldelningar enligt K-038.
  Profilen får inte ändras innan administratören bekräftat konsekvenserna.
- K-042: En profil som används ska kunna arkiveras för att stoppa nya
  tilldelningar. Befintliga tilldelningar och deras rättigheter ska behållas
  tills de återkallas. Arkivering får inte behandlas som massåterkallning.
- K-043: Administratörer ska kunna se en skrivskyddad ändringshistorik som
  visar vem som ändrade vad och när. Historiken ska omfatta strukturändringar
  i klubb/sektion/lag, roll- och behörighetstilldelningar och återkallningar,
  inbjudningar och acceptanser samt profiländringar och arkivering.
- K-044: Historikens åtkomst ska följa administratörens aktuella område.
  Systemadmin ser struktur och administratörsroller; klubbadmin ser sin klubbs
  historik; sektions- och lagadmin ser relevanta ändringar inom sitt område.
  Enbart systemroll får inte genom historiken ge den verksamhetsåtkomst som
  kräver separat klubbroll enligt K-008. Gränserna gäller även direkta API-anrop.
- K-045: Administratörsroller, separata behörigheter och profiltilldelningar
  ska gälla tills vidare som standard och kunna få valfria start- och slutdatum.
  Rättigheter ska aktiveras och upphöra automatiskt enligt giltigheten, utan
  krav på manuell återkallning. Startdatum gäller från kl. 00.00 och slutdatum
  gäller hela den angivna dagen i `Europe/Stockholm`; rättigheten upphör vid
  nästa dags början. Sommar-/vintertid hanteras enligt K-029.
- K-046: En tidsbegränsning av system- eller klubbadmin får inte lämna
  systemet eller klubben utan administratör. Samma skydd som vid återkallning
  ska gälla. Systemet och varje klubb som fått sin första administratör ska
  ha minst en aktiv administratör utan slutdatum på respektive nivå.
  Den sista sådana administratören får lämna, återkallas eller få slutdatum
  först när en annan administratör har en aktiv roll utan slutdatum.
  En väntande inbjudan eller framtida start räcker inte som ersättare.
- K-047: Strukturmandaten ska vara följande: systemadmin hanterar
  klubbuppgifter, sektioner och lag i alla klubbar; klubbadmin hanterar den
  egna klubbens uppgifter, sektioner och lag; sektionsadmin får ändra den egna
  sektionens namn och skapa, ändra och ta bort lag i sektionen; lagadmin får
  ändra det egna lagets namn. Borttagningsskydden gäller alltid. Disciplinval
  och disciplinbyte följer den redan godkända disciplinspecen.
  Klubbskapande är fortsatt förbehållet systemadmin enligt K-007.
- K-048: Om någon annan ändrat samma uppgifter ska sparandet stoppas.
  Administratörens utkast ska behållas så att aktuellt underlag kan läsas in
  och ändringen göras om. En äldre revision får inte skriva över en nyare.
- K-049: Ett misslyckat sparande får inte visas som lyckat eller lämna
  delar av den begärda ändringen sparade. Återkallad behörighet ska neka
  sparande även om sidan öppnades innan återkallningen. Backend ska kontrollera
  aktuell behörighet vid skrivningen; dolda knappar ersätter inte kontrollen.
  Ett senare fel vid extern mejlleverans ska skiljas från ett sparfel enligt
  inbjudningarnas separata leveransstatus i K-016.
- K-050: Arkivering av lag och sektioner ska lämnas till en separat spec.
  Första versionen ska behålla objekt med historik och endast tillåta radering
  av tomma objekt enligt K-030. Detta ändrar inte reglerna för arkivering av
  behörighetsprofiler enligt K-042 eller personarkivering i Lagmedlemmar-specen.
- K-051: Arkiverade behörighetsprofiler ska vara låsta för innehållsändring
  tills klubbadmin återaktiverar dem. Befintliga tilldelningar fortsätter
  gälla och kan återkallas enligt K-042. Efter återaktivering får profilen
  åter ändras och tilldelas enligt de vanliga reglerna.
- K-052: Behörighetsprofiler ska arkiveras i stället för att raderas för
  att bevara historiken. Gränssnitt och verksamhets-API får inte erbjuda
  fysisk radering av profiler. Arkivering och återaktivering ska loggas.
- K-053: Första systemadmin ska aktiveras genom det befintliga engångsflödet
  för en i förväg utpekad, verifierad e-postadress. Den första registrerade
  användaren får ingen automatisk administratörsroll. Flödet får inte kunna
  återanvändas efter aktivering; befintliga bootstrap-skydd ska behållas.
- K-054: En inbjudan får accepteras först när utskicket registrerats som
  skickat. Vid leveransfel eller oklar leveransstatus måste administratören
  skicka en ny inbjudan. Enbart leverantörens möjliga leverans får inte ersätta
  en beständig statusregistrering.
- K-055: Samtidig acceptans och återkallning av en inbjudan får inte lämna
  en aktiv roll från den återkallade inbjudan. Kontroller och skrivningar ska
  samordnas så att återkallningen inte kan kringgås av ett pågående acceptansförsök.

Befintliga repo-, säkerhets- och designregler gäller fortsatt.

## Data, integrationer och kvalitetskrav

Berörda data är klubb-/sektions-/lagmetadata, konton, personkopplingar,
administrativa tilldelningar, ansvar, giltighetsdatum, inbjudningar,
e-postleverans och ändringshistorik. Befintlig data och implementerade delar
ska skiljas från beslutade målkrav. Kotlin-backend äger validering,
behörighetskontroller, transaktioner, giltighet och revisionsskydd.

Next-appens produktionskomponenter, gemensamma navigering och CSS ska
återanvändas enligt AGENTS.md och designreglerna, med beslutade bortval av
ägare, säsong och tidszonsfält. Verifiering ska omfatta mobil och desktop,
tangentbord, laddnings-/tomma tillstånd och begripliga fel utan förlorade utkast.
Administratörsinbjudningar använder målappens autentisering och gemensamma
e-postleverans; en sparad inbjudan och en levererad inbjudan är olika tillstånd.

## Acceptanskriterier

- AK-001 (K-007): Ett inloggat konto utan systemadministratörsroll ska nekas
  klubbskapande även genom direkt API-anrop; ingen klubb eller tillhörande
  struktur ska skapas.
- AK-002 (K-007): En systemadministratör ska kunna skapa en klubb och därefter
  tilldela eller bjuda in dess administratör i ett separat steg.
- AK-003 (K-008): Ett konto med enbart systemroll ska kunna administrera
  klubbstruktur och klubbadministratörer, men nekas läsning av medlemsuppgifter,
  kallelser och närvaro även genom direkta API-anrop.
- AK-004 (K-008): Efter att en systemadministratör skapat en klubb ska kontot
  sakna automatisk klubbroll. En separat uttrycklig rolltilldelning ska loggas
  och ge endast den tilldelade rollens åtkomst inom den aktuella klubben.
- AK-005 (K-009): En klubbadministratör ska kunna bjuda in en ytterligare
  klubbadministratör, återkalla en annan klubbadministratör när minst en finns
  kvar samt utse sektions- och lagadministratörer inom sin klubb.
- AK-006 (K-009): Försök att återkalla sista klubbadministratören ska nekas
  utan ändrad tilldelning. Samtidiga återkallningar får inte lämna klubben utan
  klubbadministratör. En väntande inbjudan räknas inte som en aktiv administratör.
- AK-007 (K-009): En klubbadministratör ska nekas tilldelningar i en annan
  klubb och tilldelning av systemroller, även genom direkta API-anrop.
- AK-008 (K-010): En sektionsadministratör ska kunna utse och återkalla en
  lagadministratör i den egna sektionen, men nekas samma åtgärder i andra
  sektioner och nekas hantering av sektionsadministratörer även via API.
- AK-009 (K-011): En lagadministratör ska kunna tilldela en avgränsad
  behörighet för närvaro eller kallelser inom sitt lag, men nekas tilldelningar
  i andra lag och hantering av lagadministratörsroller även via API.
- AK-010 (K-012): Inbjudan ska visa avsedd roll och omfattning. En mottagare
  med ett nytt eller befintligt konto ska kunna acceptera efter verifiering av
  rätt e-postadress. Att öppna länken eller registrera konto ska inte ge rollen.
- AK-011 (K-012): Ett konto med annan eller overifierad e-postadress ska nekas
  acceptans utan att någon roll aktiveras.
- AK-012 (K-013): En giltig inbjudan ska kunna accepteras inom sjudagarsperioden.
  Efter utgång eller återkallning ska samma länk nekas utan rolltilldelning.
  Precis före skapandetid + 168 timmar är länken tidsmässigt giltig; vid och
  efter denna tidpunkt ska acceptans nekas. Leveransförsök får inte flytta gränsen.
- AK-013 (K-014): Efter ny inbjudan till samma adress, roll och område ska den
  gamla länken vara ogiltig. Inbjudan till annan roll eller annat område ska
  förbli opåverkad.
- AK-014 (K-015): Om inbjudaren förlorat rätten att tilldela rollen före
  acceptansen ska mottagaren nekas rollaktivering, även med rätt verifierad
  e-postadress och en länk som ännu inte löpt ut.
- AK-015 (K-016): Administrationsvyn ska visa skilda tillstånd för väntande
  leverans, skickad, leveransfel, accepterad, utgången och återkallad.
  Ett skickat mejl får inte visas som en aktiverad roll.
- AK-016 (K-017): **Skicka ny inbjudan** ska ge en ny länk med 168 timmars
  giltighet från det nya skapandet och omedelbart göra den tidigare länken ogiltig.
- AK-017 (K-018): Om samma mottagare accepterar en redan accepterad inbjudan
  och rollen fortfarande är aktiv ska vyn visa att rollen redan aktiverats,
  utan ytterligare rolltilldelning.
- AK-018 (K-008, K-019): En systemadministratör utan klubbroll ska före
  bekräftelse av **Bli klubbadministratör** sakna verksamhetsåtkomst via
  systemrollen. Efter bekräftelse ska en separat klubbadminroll finnas i den
  valda klubben och tilldelningen vara loggad. Ingen annan klubb får påverkas.
- AK-019 (K-020): Två klubbadministratörer i samma klubb ska ha samma
  klubbadminmandat oavsett tilldelningsordning och vem som skapat klubben.
  Varken gränssnitt eller API ska erbjuda en separat klubbägarroll eller kräva
  en sådan för klubbadministrativa åtgärder.
- AK-020 (K-021, K-022): En klubbadmin ska kunna återkalla sista sektionsadmin
  eller lagadmin inom klubben. Behörig överordnad administratör ska fortsatt
  kunna hantera området. Återkallning i en annan klubb ska nekas.
- AK-021 (K-023): Efter slutförd återkallning ska nästa skyddade API-anrop
  nekas om det kräver den återkallade rollen, även med samma inloggade session
  och en redan öppen administrationsvy. Medlemskap och historik ska bevaras.
- AK-022 (K-023): Om kontot har en oberoende tilldelad roll ska den finnas kvar
  efter återkallningen och fortsatt ge sina egna behörigheter inom sitt område.
- AK-023 (K-024): En systemadmin ska kunna bjuda in och återkalla en annan
  systemadmin när minst en aktiv systemadmin blir kvar. Konton utan systemroll
  ska nekas dessa åtgärder även via API. Samtidiga återkallningar får inte
  ta bort den sista systemadministratören.
- AK-024 (K-025): En system- eller klubbadmin ska kunna lämna sin egen roll
  när en annan aktiv administratör finns inom samma område. Om kontot är sist
  ska utträdet nekas även om en ersättare bjudits in men inte accepterat.
  Efter ersättarens acceptans ska utträdet tillåtas.
- AK-025 (K-022, K-025): En sektions- eller lagadmin ska kunna lämna sin egen
  roll även om området därefter saknar egen administratör. Oberoende roller,
  medlemskap och historik ska bevaras enligt K-023.
- AK-026 (K-026, K-027): Skapandeguiden ska innehålla klubbuppgifter, unik
  webbadress, en obligatorisk första sektion med disciplin och valfritt första
  lag, följt av granskning. Inget tidszonsfält ska visas.
- AK-027 (K-027): Om någon del av klubbstrukturen inte kan sparas ska hela
  skapandet återställas. En redan upptagen webbadress ska inte kunna skapa en
  dubblett, heller inte vid samtidiga skapandeförsök.
- AK-028 (K-028): En klubb utan första aktiverade klubbadmin ska tydligt
  markeras som sådan i systemvyn. En skickad men ej accepterad inbjudan får
  inte visas som att klubben har en aktiv klubbadministratör.
- AK-029 (K-026, K-029): Klubbskapande ska använda `Europe/Stockholm` utan
  tidszonsval. Samma aktivitet ska visa samma svenska datum och klockslag på
  enheter inställda på olika tidszoner. Sommar-/vintertidsövergångar ska följa
  zonens regler och befintliga regler för kalenderdagar respektive faktisk tid.
- AK-030 (K-030, K-031): En behörig administratör ska kunna radera ett tomt
  lag eller en tom sektion efter bekräftelse, förutsatt att minst en sektion
  finns kvar i klubben. Avbruten bekräftelse ska inte ändra något.
- AK-031 (K-030, K-031): Radering av sista sektionen eller av ett lag eller
  en sektion med kopplade medlemmar, aktiviteter eller annat sparat underlag
  ska nekas utan dataförlust och med begriplig förklaring. Samma skydd ska
  gälla vid API-anrop och när beroenden tillkommit efter öppnad dialog.
- AK-032 (K-032): Första versionen ska inte erbjuda flytt av lag mellan
  sektioner eller radering av hela klubbar genom gränssnitt eller verksamhets-API.
- AK-033 (K-033): Vid namnbyte ska befintliga adressnamn behållas. Separat
  byte av klubbadress ska kräva en ledig adress och visa varningen om gamla
  länkar. Samtidiga försök att ta samma klubbadress får inte ge dubbletter.
  Sektioners och lags egna adressnamn ska inte kunna redigeras separat.
- AK-034 (K-034): Skapa/redigera lag ska fungera utan säsongsuppgift och
  inte visa något säsongsfält. Lag ska inte kräva säsong i verksamhets-API:t.
  Ändringar av laguppgifter får inte skriva om medlemskap eller historik.
- AK-035 (K-035): Lagadmin ska kunna tilldela och återkalla var och en av de
  fem lagbehörigheterna separat inom sitt lag, även för en mottagare som inte
  är målsman. Enbart ansvarstilldelningen tränare ska inte ge dessa rättigheter.
- AK-036 (K-036): Två klubbar ska kunna ha egna profiler med olika innehåll.
  Tilldelning av en profil ska kunna ge dess samlade behörigheter i en operation.
  Ändring av en klubbs profil får inte ändra en annan klubbs profil.
- AK-037 (K-037, K-038): En person som får närvaro direkt och närvaro samt
  kallelser genom en profil ska ha båda behörigheterna. Om profilen tas bort
  ska direkt tilldelad närvaro behållas och kallelsebehörigheten upphöra om
  ingen annan aktiv källa ger den. Vyn ska visa de separata källorna.
- AK-038 (K-037, K-038): Flera överlappande profiler ska kunna tilldelas
  samma person utan dubbla effektiva rättigheter. Tilldelning i ett lag ska
  inte ge profilens rättigheter i ett annat lag. Borttagning av en källa ska
  bevara rättigheter från kvarvarande aktiva källor.
- AK-039 (K-039, K-040): Klubbadmin ska kunna förvalta klubbens profiler.
  Lagadmin ska kunna tilldela/ta bort dem i sitt lag men nekas ändring av
  profildefinitioner och tilldelning i andra lag, även via API. Försök att
  lägga administratörsroller i en profil ska nekas.
- AK-040 (K-041): Före en profiländring ska administratören se berörda personer
  och förändrade rättigheter. Efter bekräftelse ska ändringen gälla befintliga
  tilldelningar; vid avbrott ska tidigare profil och tilldelningar behållas.
  Behörigheter som även ges genom en annan källa ska framgå som kvarvarande.
- AK-041 (K-042): Efter arkivering ska nya tilldelningar av profilen nekas
  även via API. Befintliga tilldelningar ska ge samma rättigheter som före
  arkiveringen och kunna återkallas separat enligt kombinationsreglerna.
- AK-042 (K-043): Efter en genomförd struktur-, roll-, behörighets-,
  inbjudnings- eller profiländring ska en behörig administratör i historiken
  kunna se aktören, ändringen och tidpunkten. Historiken ska inte erbjuda
  redigering eller borttagning genom gränssnitt eller verksamhets-API.
- AK-043 (K-044): Klubbadmin ska kunna läsa sin klubbs historik men nekas
  andra klubbars historik. Sektions- och lagadmin ska endast få relevanta
  poster inom sitt område. Systemadmin utan klubbroll ska få struktur- och
  administratörsrollhistorik utan att få verksamhetens persondata via historiken.
- AK-044 (K-045): En tilldelning utan datumval ska gälla tills vidare.
  För en tilldelning med start-/slutdatum ska rättigheten saknas före start,
  finnas under giltigheten och upphöra automatiskt efter slut, även i samma
  inloggade session. Oberoende aktiva källor ska fortsatt gälla enligt K-038.
  Vid startdatumets kl. 00.00 ska tilldelningen vara aktiv; den ska vara giltig
  under hela slutdatumet och ogiltig från nästa dags kl. 00.00, i svensk tid.
- AK-045 (K-046): En kombination av giltighetsperioder och återkallningar
  som skulle lämna systemet eller klubben utan administratör ska inte tillåtas.
  Om endast en aktiv administratör saknar slutdatum ska återkallning, eget
  utträde och tillägg av slutdatum på denna roll nekas. Efter att en annan
  administratör har en aktiv roll utan slutdatum ska samma åtgärd kunna tillåtas.
  En ersättare med framtida start eller enbart väntande inbjudan ska inte räcka.
  Skyddet gäller även vid samtidiga ändringar.
- AK-046 (K-047): Varje administratörsroll ska kunna utföra strukturändringar
  enligt sitt mandat. Klubbadmin ska nekas ändringar i annan klubb,
  sektionsadmin i annan sektion och lagadmin i annat lag, även via API.
  Sektionsadmin ska nekas ändring av klubbuppgifter och lagadmin ska nekas
  skapande/borttagning av lag eller ändring av sektion. Tillåtna roller ska
  fortfarande nekas borttagning som bryter K-030 och disciplinbyte som bryter
  disciplinspecens skydd.
- AK-047 (K-048): Om två administratörer öppnar samma version och den ena
  sparar en ändring ska den andras gamla sparande nekas. Det andra utkastet
  ska finnas kvar och den första sparade ändringen får inte skrivas över.
- AK-048 (K-049): Ett fel under en administrativ skrivning ska återställa
  hela den begärda ändringen och visas som fel. Efter återkallning av aktörens
  behörighet ska sparande från en redan öppen sida nekas utan skrivning.
- AK-049 (K-018): När en inbjudan accepterats och rollen senare återkallats
  ska återbesök eller upprepad acceptans av samma inbjudan inte återaktivera
  rollen, även om kontot har rätt verifierad e-postadress.
- AK-050 (K-050): Första versionen ska inte erbjuda arkivering av lag eller
  sektioner. Objekt med historik ska behållas och nekas radering enligt K-030.
- AK-051 (K-051): Innehållsändring och ny tilldelning av en arkiverad profil
  ska nekas, medan befintliga tilldelningar fortfarande ger rättigheter och
  kan återkallas. Efter klubbadminens återaktivering ska ändring och tilldelning
  åter tillåtas enligt respektive mandat och revisionsskydd.
- AK-052 (K-052): En profil ska kunna arkiveras och återaktiveras med
  bibehållen ändringshistorik och loggning av båda åtgärderna. Fysisk radering
  ska inte erbjudas via gränssnitt eller verksamhets-API.
- AK-053 (K-053): Endast det i förväg utpekade verifierade kontot ska kunna
  aktivera första systemadmin. Ett annat förstaregistrerat konto ska nekas.
  Efter aktivering ska bootstrap inte kunna köras igen.
- AK-054 (K-054): En länk med väntande, misslyckad eller okänd registrerad
  leveransstatus ska nekas acceptans utan rolltilldelning. Administratören ska
  kunna skapa en ny inbjudan; den gamla länken blir då ogiltig enligt K-014.
- AK-055 (K-055): Ett verkligt samtidigt acceptans- och återkallningsförsök
  ska efter avslut inte lämna någon aktiv roll från den återkallade inbjudan.
  Upprepad acceptans får inte ändra detta resultat.

Verifieringen
behöver omfatta tillåtna och nekade flöden, återkallning, samtidiga ändringar,
inbjudningslivscykel, sparfel samt gemensamma Next-/React-vyer på mobil och desktop.

## Bekräftade beslut och motiv

- 2026-10-28: Användaren vill ta fram en spec för administration efter
  inventeringen av områden som saknar samlad featurespec.
- 2026-10-28, svar 1: Användaren godkände föreslagen omfattning med
  ”Det låter bra, kör!”: alla fyra nivåer, struktur, roller, separata ansvar och
  behörigheter, inbjudningslivscykel, historik och skydd för sista administratören.
  Avgränsningen mot befintliga specar godkändes samtidigt.
- 2026-10-28, svar 2: Endast systemadministratörer får skapa klubbar i första
  versionen. Användaren godkände begränsningen med ”Ja” efter att ha frågat om
  vem som helst skulle kunna skapa en klubb. Självregistrering väljs bort
  uttryckligen; klubbadministratören tilldelas eller bjuds in efter skapandet.
- 2026-10-28, svar 3: Användaren godkände att systemadmin får hantera
  klubbuppgifter, sektioner, lag och klubbadministratörer, medan verksamhetens
  persondata kräver en separat, uttrycklig och loggad klubbroll.
- 2026-10-28, svar 4: Klubbadministratörer får själva bjuda in och återkalla
  andra klubbadministratörer samt utse sektions- och lagadministratörer inom
  klubben. Sista klubbadministratören skyddas. Syftet är att klubben ska kunna
  hantera personalbyten utan systemadministratörens hjälp.
- 2026-10-28, svar 5: Användaren godkände att sektionsadmin utser och
  återkallar lagadmin inom sin sektion, medan klubbadmin hanterar sektionsadmin.
  Lagadmin får tilldela avgränsade behörigheter inom laget, exempelvis närvaro
  och kallelser; sektions- eller klubbadmin hanterar lagadministratörerna.
- 2026-10-28, svar 6: Gemensamma inbjudningsregler godkända på alla nivåer:
  tydlig roll och omfattning, konto kan skapas vid behov, rätt verifierad
  e-postadress, uttrycklig acceptans, sju dagars giltighet, återkallning,
  ersättning av tidigare inbjudan för samma adress/roll/område samt aktuell
  kontroll av inbjudarens tilldelningsrätt vid acceptans.
- 2026-10-28, svar 7: Giltighet 7 × 24 timmar från skapandet godkänd;
  automatiska leveransförsök förlänger inte tiden. Vyn ska skilja väntande
  leverans, skickad, leveransfel, accepterad, utgången och återkallad.
  **Skicka ny inbjudan** ersätter länken och startar ny giltighet.
  Upprepad acceptans ger inga dubbla roller och visar om rollen redan aktiverats.
- 2026-10-28, svar 8: Användaren valde att systemadmin kan bli klubbadmin,
  enligt förslaget om en uttrycklig åtgärd med bekräftelse och loggning, utan
  krav på inbjudan från befintlig klubbadmin.
- 2026-10-28, svar 9: Användaren valde ”Ja, skippa ägare”. En enda
  klubbadminroll ska finnas i målappen, med samma mandat för alla
  klubbadministratörer och fortsatt skydd för den sista.
- 2026-10-28, svar 10: Klubbadmin får återkalla sektions- och lagadmin i
  klubben. Sektioner och lag får sakna egen administratör eftersom överordnad
  admin kan hantera dem. Återkallning tar direkt bort rollens behörigheter men
  bevarar medlemskap, historik och oberoende tilldelade roller.
- 2026-10-28, svar 11: Endast systemadmin får bjuda in och återkalla andra
  systemadministratörer; sista systemadmin skyddas. Administratörer får lämna
  sin egen roll, men sista system- eller klubbadmin måste först ha en ersättare
  som accepterat rollen.
- 2026-10-28, svar 12: Användaren vill skippa tidszon och godkände övrigt
  föreslaget skapandeflöde: unik webbadress, obligatorisk första sektion med
  disciplin, valfritt första lag, granskning och atomärt sparande, följt av
  separat första admintilldelning/inbjudan. Klubben får initialt sakna admin
  och detta ska synas i systemvyn. Beslutet tar bort tidszonsvalet från guiden;
  systemets tidszonsregel är ännu inte fastställd.
- 2026-10-28, svar 13: Användaren godkände `Europe/Stockholm` som gemensam
  tidszon för alla klubbar, med automatisk sommar-/vintertid och samma visade
  aktivitetsklockslag oavsett mobilens tidszon. Detta löser frågan i svar 12.
- 2026-10-28, svar 14: Endast tomma sektioner/lag utan kopplade medlemmar,
  aktiviteter eller annat sparat underlag får raderas. Sista sektionen skyddas.
  Borttagning kräver bekräftelse och blockering ska förklaras. Lagflytt mellan
  sektioner och radering av hela klubbar lämnas utanför första versionen.
- 2026-10-28, svar 15: Användaren valde bort säsongsuppgift på lag och
  godkände övriga adress-/namnregler: namnbyte ändrar inte adress automatiskt,
  klubbadress kan ändras separat med ledighetskontroll och varning om brutna
  gamla länkar, sektioners/lags adressnamn behålls i första versionen.
- 2026-10-28, svar 16: Användaren godkände de fem separat tilldelningsbara
  lagbehörigheterna, lagadminens tilldelning/återkallning, mottagare utan
  målsmanskoppling och att ansvar inte automatiskt ger behörighet. Frågade
  därefter om flera behörigheter kan grupperas och tilldelas i en operation.
- 2026-10-28, svar 17: Användaren valde anpassningsbara behörighetsprofiler
  per klubb och frågade om en person kan få både separata roller och profiler.
  Kombinationens regler är ännu inte bekräftade.
- 2026-10-28, svar 18: Användaren godkände kombination av direkta behörigheter
  och flera profiler. Rättigheterna läggs ihop inom respektive lag, varje källa
  ska visas och återkallning av en källa bevarar rättigheter från andra aktiva
  källor. Detta löser kombinationsfrågan i svar 17.
- 2026-10-28, svar 19: Klubbadmin skapar/ändrar profiler av de fem
  lagbehörigheterna; profiler ger inte administratörsroller. Lagadmin tilldelar
  och tar bort profiler i sitt lag. Profiländringar gäller befintliga personer
  efter visning och bekräftelse av vilka personer/rättigheter som påverkas.
  Använda profiler kan arkiveras för att stoppa nya tilldelningar utan att
  befintliga tilldelningar försvinner.
- 2026-10-28, svar 20: Skrivskyddad ändringshistorik godkänd för struktur,
  roller/behörigheter, inbjudningar/acceptanser och profiländringar/arkivering.
  Den visar vem, vad och när. Systemadmin ser struktur och administratörsroller,
  klubbadmin klubbens historik och sektions-/lagadmin relevanta ändringar inom
  respektive område.
- 2026-10-28, svar 21: Användaren godkände tillsvidare som standard med
  valfria start- och slutdatum för roller, separata behörigheter och
  profiltilldelningar. Rättigheter upphör automatiskt. Tidsbegränsning får
  inte lämna systemet eller klubben utan administratör.
- 2026-10-28, svar 22: Startdatum gäller från kl. 00.00 och slutdatum hela
  dagen i svensk tid. Systemet och varje klubb som fått sin första admin måste
  ha minst en aktiv admin utan slutdatum. Den sista sådana adminen kan lämna
  eller tidsbegränsas först när en annan har en aktiv roll utan slutdatum.
- 2026-10-28, svar 23: Strukturmandaten godkända: systemadmin hanterar
  klubbuppgifter/sektioner/lag i alla klubbar, klubbadmin motsvarande inom sin
  klubb, sektionsadmin sektionens namn och skapande/ändring/borttagning av dess
  lag, lagadmin egna lagets namn. Borttagningsskydd gäller alltid och
  disciplinval/-byte följer disciplinspecen.
- 2026-10-28, svar 24: Gamla revisioner stoppas med bevarat utkast och
  möjlighet att läsa in aktuellt underlag. Sparfel får inte ge lyckat resultat
  eller delvis sparande. Återkallad behörighet nekar sparande från öppen sida.
  Gammal accepterad inbjudan får aldrig återaktivera senare återkallad roll.
- 2026-10-28, svar 25: Användaren godkände att arkivering av lag och sektioner
  avgränsas till en separat spec. Första versionen behåller objekt med historik
  och tillåter bara radering när objekten är tomma enligt tidigare beslut.
- 2026-10-28, svar 26: Arkiverade behörighetsprofiler är låsta för
  innehållsändring tills klubbadmin återaktiverar dem. Befintliga tilldelningar
  gäller och kan återkallas. Efter återaktivering kan profilen åter ändras
  och tilldelas. Profiler arkiveras i stället för att raderas för historikens skull.
- 2026-10-28, svar 27: Befintlig engångsaktivering av första systemadmin
  behålls för en utpekad verifierad adress; först registrerad blir inte admin.
  Acceptans kräver registrerat skickat utskick; leveransfel/oklar status kräver
  ny inbjudan. Samtidig acceptans och återkallning får inte lämna en aktiv roll
  från den återkallade inbjudan.

## Obekräftade antaganden och förslag

- Håll eget konto/profil utanför denna spec.

## Öppna frågor

- Disciplinbyte följer disciplinspecen; arkivering av lag/sektion har avgränsats
  till en separat spec enligt K-050.
- Samordning: fotbollsspecens historik använder säsongsfilter. Denna spec
  tar bort säsong som laguppgift men beslutar inte hur rapportperioder ska
  definieras; ett sådant filter får inte kräva ett säsongsfält på laget.
- Profiländringars samtidighet följer revisionsskyddet i K-048, inklusive
  arkivering och återaktivering. Arkiverade profilers livscykel följer K-051–K-052.
- Inga blockerande produktfrågor återstår inom den beslutade omfattningen.
  Slutlig sammanfattning och spec är bekräftade; status är Redo.
  Profiländringar ska följa revisionsskyddet i K-048.

## Bekräftelse

2026-10-28: Användaren bekräftade slutlig sammanfattning och spec med ”Ja”.
Bekräftelsen omfattar K-001–K-055, AK-001–AK-055 och dokumenterade
avgränsningar. Inga blockerande produktfrågor återstår. Status är Redo.
Godkännandet gäller specen och innebär ingen beställning av implementation.

## Ändringshistorik

- 2026-10-28: Skapat utkast med kartlagt nuläge, förslag till omfattning och
  öppna beslutsgrenar inför första intervjuomgången.
- 2026-10-28: Sparat svar 1 med bekräftad omfattning och krav K-001–K-006.
- 2026-10-28: Sparat svar 2, krav K-007 och AK-001–AK-002 om att endast
  systemadministratörer får skapa klubbar; självregistrering väljs bort.
- 2026-10-28: Sparat svar 3, K-008 och AK-003–AK-004 om systemrollens
  strukturmandat och separat klubbroll för verksamhetsåtkomst.
- 2026-10-28: Sparat svar 4, K-009 och AK-005–AK-007 om klubbadministratörens
  delegering och skydd för sista klubbadministratören.
- 2026-10-28: Sparat svar 5, K-010–K-011 och AK-008–AK-009 om
  sektions-/lagadministratörers delegeringsgränser.
- 2026-10-28: Sparat svar 6, K-012–K-015 och AK-010–AK-014 om gemensam
  inbjudningslivscykel på alla administrativa nivåer.
- 2026-10-28: Sparat svar 7, preciserat K-013/AK-012 och lagt till
  K-016–K-018 och AK-015–AK-017 för leveransstatus, omsändning och upprepad acceptans.
- 2026-10-28: Sparat svar 8, K-019 och AK-018 om systemadminens uttryckliga
  och loggade självtilldelning som klubbadmin.
- 2026-10-28: Sparat svar 9, K-020 och AK-019 om en gemensam
  klubbadminroll utan särskild ägarroll.
- 2026-10-28: Sparat svar 10, K-021–K-023 och AK-020–AK-022 om
  återkallning, tillåtna tomma administratörsroller på sektions-/lagnivå och
  bevarande av medlemskap, historik och oberoende roller.
- 2026-10-28: Sparat svar 11, K-024–K-025 och AK-023–AK-025 om
  systemadminhantering, skydd för sista systemadmin och eget utträde.
- 2026-10-28: Sparat svar 12, K-026–K-028 och AK-026–AK-028 om
  skapandeguiden utan tidszonsfält och separat initial tillsättning av klubbadmin.
- 2026-10-28: Sparat svar 13, K-029 och AK-029 om gemensam svensk tidszon
  utan användarval och enhetsoberoende visning av aktivitetsklockslag.
- 2026-10-28: Sparat svar 14, K-030–K-032 och AK-030–AK-032 om
  borttagningsskydd, bekräftelse och avgränsning för lagflytt/klubbradering.
- 2026-10-28: Sparat svar 15, K-033–K-034 och AK-033–AK-034 om namn,
  adresser och bortvald säsongsuppgift på lag; noterat beroendet till rapportfilter.
- 2026-10-28: Sparat svar 16–17, K-035–K-036 och AK-035–AK-036 om
  separata lagbehörigheter och klubbunika profiler; kombinationsregler kvarstår.
- 2026-10-28: Sparat svar 18, K-037–K-038 och AK-037–AK-038 om
  kombination, överlapp, synliga behörighetskällor och återkallning per källa.
- 2026-10-28: Sparat svar 19, K-039–K-042 och AK-039–AK-041 om
  profilförvaltning, konsekvensgranskning, genomslag på befintliga tilldelningar
  och arkivering utan återkallning.
- 2026-10-28: Sparat svar 20, K-043–K-044 och AK-042–AK-043 om
  skrivskyddad ändringshistorik med områdesavgränsad åtkomst.
- 2026-10-28: Sparat svar 21, K-045–K-046 och AK-044–AK-045 om
  valfria giltighetsdatum, automatiskt upphörande och skydd för sista admin.
- 2026-10-28: Sparat svar 22 och preciserat K-045–K-046/AK-044–AK-045
  med inkluderande datum i svensk tid och minst en aktiv admin utan slutdatum.
- 2026-10-28: Sparat svar 23, K-047 och AK-046 om strukturmandat på
  system-, klubb-, sektions- och lagnivå.
- 2026-10-28: Sparat svar 24, K-048–K-049 och AK-047–AK-049 samt
  preciserat K-018 om konflikter, atomärt sparande och förbrukade inbjudningar.
- 2026-10-28: Sparat svar 25, K-050 och AK-050 om separat spec för
  arkivering av lag och sektioner.
- 2026-10-28: Sparat svar 26, K-051–K-052 och AK-051–AK-052 om låsta
  arkiverade profiler, återaktivering och bevarad historik utan fysisk radering.
- 2026-10-28: Sparat svar 27, K-053–K-055 och AK-053–AK-055 om första
  admin, leveransgrind och samtidig acceptans/återkallning. Sammanställt flöden
  och kvalitetskrav inför slutlig bekräftelse; status kvarstår Utkast.
- 2026-10-28: Användaren godkände slutlig sammanfattning och spec.
  Markerat Redo med 55 krav och 55 acceptanskriterier; ingen implementation beställd.
