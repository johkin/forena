# Mitt konto

- Status: Redo
- Senast uppdaterad: 2026-10-30
- Berörda dokument: [Säkerhetsarkitektur](../security-architecture.md), [Autentisering](../migration/authentication.md), [Funktionell likvärdighet](../migration/feature-parity.md), [Lagmedlemmar](hantera-trupp.md), [Telegram](telegram-bot.md), [Designregler](../design-spec.md)
- Implementation och verifiering: Ej påbörjad för denna spec.

## Problem och mål

Mitt konto ska låta användaren både hantera egna uppgifter och inloggning
och förstå sina klubb- och barnkopplingar i React/Kotlin. Kontoplatsen ska
vara gemensam över klubbar. Användaren har förtydligat att det inte borde
finnas användare utan klubbtillhörighet; livscykelreglerna preciseras nedan.

## Befintligt underlag

Granskat i dokumentation och källkod 2026-10-30; inte provat i gränssnittet:

- Nexts `/profile` visar visningsnamn, skrivskyddad inloggningsadress,
  föreningslänkar, MCP-anslutning och Telegram-inställningar.
- Namnändring i Next uppdaterar både kontoprofilen och kontots kopplade
  personposter. Skrivingarna är separata och kan ge delvis sparat resultat.
  Detta är nuläge, inte ett godkänt krav på målappen.
- React/Kotlin har inloggning, registrering, e-postverifiering,
  lösenordsåterställning, magic links och passkeyregistrering/lista/borttagning.
  Säkerhetssidan samlar även Telegram, push och assistentminnen.
- Funktionsmatrisen anger profil, personkopplingar, e-postbyte och
  kontoadministration som återstående områden.
- Personer är klubbavgränsade. Personåtkomst kontrolleras uttryckligen i
  Kotlin; en social relation ger inte automatiskt åtkomst.
- Lagmedlemmar-specens K-014–K-015 reglerar godkännande av
  vårdnadshavarkopplingar. En vårdnadshavare får inte själv ge andra åtkomst.
  Nya kontoflöden måste samordnas med dessa bekräftade regler.

## Omfattning

### Ingår

- Egna profiluppgifter och byte av inloggningsadress.
- Lösenord, passkeys och möjlighet att logga ut andra sessioner.
- Översikt över egna person- och barnkopplingar.
- Ingångar till Telegram, push och AI-anslutningar.
- Samtyckt läsåtkomst för föräldrar efter 18-årsdagen samt 30 dagars
  övergångstid före kontoborttagning utan kvarvarande klubbkoppling.
- Explicit sammankoppling av godkända personkopplingar för samma barn
  mellan klubbar, utan automatisk personnummerbaserad identifiering.

### Ingår inte

- Implementation är inte beställd genom denna intervju.
- Generell notifieringspolicy och permanent personradering specificeras
  separat. Automatisk kontoborttagning efter förlust av sista klubbkopplingen
  ingår här enligt K-025–K-026 och K-038.
- Insamling och personnummerbaserad identifiering får en separat spec
  för insamling, verifiering, rättelser och personer utan svenskt personnummer.
  Denna feature ska inte införa sådan insamling.

## Användare, roller och flöden

Kontot kan ha kopplingar i flera klubbar genom eget medlemskap,
vårdnadshavaråtkomst, administratörsroll eller godkänd följaråtkomst.
Systemadministratörer är undantagna från kravet på klubbkoppling.
Aktivering kräver godkänd ansökan eller inbjudan. Vid förlust av sista
kopplingen gäller övergångstiden i K-011.

## Krav

- K-001: Mitt konto ska stödja både hantering av egna uppgifter/inloggning
  och förståelse av egna klubb- och barnkopplingar.
- K-002: Mitt konto ska vara gemensamt över användarens klubbar.
- K-003: Användare ska tillhöra minst en klubb enligt K-006 och K-009,
  med undantag för systemadministratörer och övergångstiden i K-011.
- K-004: Första versionen ska omfatta egna profiluppgifter, byte av
  inloggningsadress, lösenord, passkeys, utloggning av andra sessioner,
  översikt över egna person-/barnkopplingar och ingångar till Telegram,
  push och AI-anslutningar. Integrationernas godkända specar styr respektive
  flöde; Mitt konto ska ge kontobundna ingångar till dessa.
- K-005: Generell notifieringspolicy och permanent personradering
  specificeras separat. Automatisk kontoborttagning enligt K-025–K-026
  och K-038 ingår här; tekniska raderings- och bevarandedetaljer samordnas
  med separat datalivscykel.
- K-006: Eget medlemskap, godkänd vårdnadshavaråtkomst eller en
  administratörsroll inom klubben ska räcka som klubbtillhörighet.
  Systemadministratörer får vara undantag utan klubbkoppling.
- K-007: Kontoaktivering ska kräva godkänd ansökan eller inbjudan med
  godkänd klubbkoppling. Ansökan ska kunna skickas och verifieras före
  aktivering utan ett aktivt verksamhetskonto. Teknisk förregistrering får
  inte i sig ge verksamhetsåtkomst.
- K-008: När den sista klubbkopplingen upphör ska kontot kunna tas bort.
  Tid, förvarning och omfattning följer K-025–K-026 och K-038.
  Detta är inte ett beslut att radera
  klubbarnas personposter, medlemskapshistorik eller andra kontons data.
- K-009: Vårdnadshavaråtkomst ska upphöra på 18-årsdagen. Den myndiga
  personen ska kunna godkänna fortsatt följaråtkomst för föräldern och
  återkalla den när som helst. Denna separata åtkomst ska räknas som
  klubbkoppling för förälderns konto. Ingen automatisk förlängning av
  vårdnadshavaråtkomst ska ske.
- K-010: Följaråtkomst enligt K-009 ska vara skrivskyddad och omfatta
  barnets matchkalender samt matchernas tid, plats och resultat. Den ska
  inte ge åtkomst till barnets kallelsesvar, kommentarer eller närvarohistorik,
  och inte ge rätt att svara eller ändra åt barnet. Oberoende rättigheter
  påverkas inte; följaråtkomsten i sig ger endast det avgränsade läsurvalet.
- K-011: När den sista klubbkopplingen upphör ska kontot behållas i
  30 dagar före borttagning. Användaren ska få förvarning och kunna få en
  ny godkänd koppling före borttagning. Övergångstiden ska inte förlänga
  tidigare åtkomst till barnets uppgifter. Exakt tid, aviseringar och
  tillåtna kontoåtgärder anges i K-025 och K-038.
- K-012: Användaren ska själv kunna ändra sitt namn och telefonnummer.
  Byte av inloggningsadress ska hanteras genom ett separat verifierat flöde.
  Användarens eget födelsedatum ändras av klubbadministrationen eftersom
  det påverkar åldersregler.
- K-013: Ändring av eget namn och telefonnummer ska slå igenom på
  användarens egna kopplade personposter i samtliga klubbar. Berörda
  uppdateringar ska framgå tydligt före sparande. Barnens uppgifter ska
  inte ändras som följd av att föräldern ändrar sina egna uppgifter.
- K-014: Föräldrar ska kunna redigera barnets uppgifter från Mitt konto.
  Rätten gäller fram till 18-årsdagen och omfattar namn, födelsedatum,
  telefon, kontaktadress och adress. Ändring av födelsedatum ska loggas
  och åldersstyrd åtkomst räknas om direkt. Behörigheten ska bygga på
  godkänd vårdnadshavaråtkomst, inte en obekräftad uppgift om föräldraskap.
- K-015: Barnets medlemskap, lagroller, tröjnummer, position, närvaro och
  administrativa behörigheter ska fortsatt hanteras genom respektive
  behöriga klubbflöde. Vårdnadshavarens självservice ger inte nya
  rättigheter att ändra dessa uppgifter.
- K-016: Vårdnadshavaren ska kunna föreslå tillägg eller borttagning av
  andra vårdnadshavare från Mitt konto. Klubben ska godkänna ändringen
  innan någon får eller förlorar åtkomst. Ett sparat förslag ska inte i sig
  ändra relation eller åtkomst. Godkännandets behörighet följer
  Lagmedlemmar-specens K-014–K-015.
- K-017: Ändringar av barnets person- och kontaktuppgifter ska slå igenom
  i alla kopplade klubbar där den redigerande föräldern har godkänd
  vårdnadshavaråtkomst. Berörda klubbar ska framgå tydligt före sparande.
  Rätten ska inte spridas till andra klubbar genom denna synkronisering.
- K-018: Varje godkänd vårdnadshavare ska kunna ändra barnets uppgifter
  utan den andras godkännande. Ändringshistorik ska finnas. Om två redigerar
  samma underlag samtidigt ska den senare sparningen stoppas med bevarat
  utkast så att tidigare ändringar inte skrivs över av misstag.
- K-019: Barnets kontaktadress ska hållas åtskild från dess eventuella
  inloggningsadress. Rätt att redigera kontaktuppgifter ska inte i sig ge
  rätt att ändra barnets inloggningsadress, lösenord eller passkeys.
  Barnets eget konto regleras i K-032 och K-035.
- K-020: Byte av egen inloggningsadress ska kräva ny autentisering med
  lösenord eller passkey samt verifiering av den nya adressen. Den gamla
  adressen ska gälla tills bytet är klart och få ett säkerhetsmeddelande
  efter genomfört byte. Bytet ska inte slå samman kontot med ett befintligt
  konto. Länkens giltighet och avbrott regleras i K-029.
- K-021: Byte av egen inloggningsadress eller lösenord ska logga ut andra
  sessioner. Den aktuella sessionen får fortsätta efter verifieringen.
  Lösenordsåterställning ska logga ut alla tidigare sessioner.
- K-022: Mitt konto ska visa aktiva sessioner och registrerade passkeys.
  Användaren ska kunna logga ut en enskild session eller alla andra
  sessioner samt namnge och ta bort passkeys. Säkerhetsändringar ska kräva
  ny autentisering enligt avgränsningen och perioden i K-030.
  Sessionslistans uppgifter anges i K-039.
- K-023: Efter 18-årsdagen ska föräldern kunna skicka en förfrågan om
  följaråtkomst. Den myndiga personen ska godkänna med sitt eget verifierade
  konto och kunna se och återkalla godkännandet i Mitt konto.
- K-024: Följaråtkomstens matchurval ska omfatta publicerade matcher för
  de lag personen tillhör. Urvalet ska inte röja om personen är kallad,
  har svarat eller faktiskt deltar. K-010:s gränser för uppgifter och
  skrivåtgärder gäller fortsatt.
- K-025: Övergångstiden i K-011 ska vara exakt 30 × 24 timmar från att
  sista klubbkopplingen upphör. E-post ska skickas när perioden börjar och
  en påminnelse sju dagar före borttagning. Under perioden ska användaren
  kunna hantera sitt konto och ta emot en ny godkänd koppling men sakna
  verksamhetsåtkomst. En ny godkänd klubbkoppling ska stoppa borttagningen;
  förlust av endast en av flera kopplingar ska inte starta perioden.
- K-026: Efter övergångstiden utan ny godkänd klubbkoppling ska
  inloggningskontot, passkeys, sessioner, anslutningsbehörigheter och privata
  assistentsamtal tas bort. Klubbarnas personposter och verksamhetshistorik
  ska behållas enligt separata regler. En ny registrering ska inte automatiskt
  återfå gamla behörigheter. Tekniska raderings- och bevarandedetaljer
  samordnas med separat datalivscykelspec.
- K-027: Profiländringar som berör flera klubbar ska sparas tillsammans:
  antingen lyckas hela ändringen eller så ändras inget. Vid fel ska
  utkastet behållas så att användaren kan försöka igen. Detta gäller
  såväl egna uppgifter som barnuppgifter inom beslutat behörigt urval.
- K-028: Om ett felaktigt födelsedatum redan har stoppat förälderns
  åtkomst ska klubben behöva rätta datumet genom behörigt flöde. Föräldern
  ska kunna begära rättelse men inte själv återställa förlorad åtkomst.
  En fortfarande behörig förälder ska fortsatt kunna ändra födelsedatum
  enligt K-014. Detta ger inte åtkomst till skyddade uppgifter genom
  enbart en begäran om rättelse.
- K-029: Ett påbörjat e-postbyte ska kunna avbrytas och ersättas.
  Verifieringslänken ska gälla i 30 minuter. En ny begäran ska göra den
  gamla länken ogiltig. Misslyckad verifiering ska lämna adressen oförändrad.
  En adress som används av ett annat konto får inte tas över.
- K-030: Ny autentisering för byte av inloggningsadress, lösenordsbyte
  och hantering av passkeys ska gälla i fem minuter. Vanlig utloggning och
  återkallning av sessioner ska fungera direkt utan denna extra autentisering.
  Sista passkeyn får tas bort om ett annat fungerande inloggningssätt finns
  kvar. Detta preciserar vilka säkerhetsändringar K-022 avser.
- K-031: Godkända vårdnadshavare och klubbens behöriga
  medlemsadministratörer ska kunna se historik över barnets profiländringar.
  Historiken ska visa vem som ändrade, när och vilka uppgifter som ändrades,
  begränsat till den egna klubbens uppgifter. Följaråtkomst efter 18 år
  ska inte ge tillgång till historiken.
- K-032: Barnets eget konto ska aktiveras genom personlig inbjudan från
  klubbens behöriga medlemsadministration och verifiering av barnets egen
  e-postadress. Förälderns ändringar av kontaktuppgifter ska inte
  automatiskt skapa eller ta över barnets konto.
- K-033: Följaråtkomst efter 18 år ska godkännas separat per klubb.
  Den myndiga personen ska se vilken klubb och vilka lag godkännandet
  gäller. Matchurvalet ska följa personens aktuella lagtillhörighet.
  Följaråtkomsten i klubben ska upphöra när den följda personens sista
  klubbkoppling där upphör.
- K-034: Tills vidare ska klubbarnas godkända personkopplingar och
  förälderns uttryckliga bekräftelse användas för att koppla ihop samma
  barn mellan klubbar. Namn, födelsedatum eller e-post får inte ensamt
  skapa kopplingen automatiskt. Sammankoppling ska inte ge åtkomst i en
  klubb där godkänd vårdnadshavaråtkomst saknas. Personnummerbaserad
  identifiering och insamling ska specificeras separat, inklusive
  verifiering, rättelser och personer utan svenskt personnummer.
- K-035: Barn utan egen e-post ska kunna använda plattformen genom
  godkända vårdnadshavare. Eget konto ska vara frivilligt och kräva barnets
  egen verifierade e-post. Förälderns adress ska inte användas som barnets
  inloggning. Detta ändrar inte att verksamhetspersonen kan finnas utan konto.
- K-036: Förfrågan om följaråtkomst ska visas i den myndigas Mitt konto
  och aviseras till personens egen verifierade e-postadress. Förfrågan ska
  gälla i 30 dagar och kunna nekas. Om eget konto saknas ska personen
  först aktivera det genom klubbens inbjudningsflöde; förälderns förfrågan
  ska inte i sig aktivera konto eller ge följaråtkomst.
- K-037: En felaktig sammankoppling av barnposter ska kunna brytas från
  Mitt konto. Det ska stoppa framtida gemensamma profiluppdateringar men
  inte ändra klubbarnas personposter, historik eller godkända
  vårdnadshavaråtkomst. Tidigare felaktigt uppdaterade uppgifter ska
  rättas separat. Sammankoppling är inte en sammanslagning av personposter.
- K-038: Varning och planerat borttagningsdatum ska visas tydligt i
  Mitt konto under övergångstiden. Tillfälliga fel vid aviseringsmejl ska
  leda till nya leveransförsök men inte förlänga tidsgränsen på
  30 × 24 timmar. Kontoborttagning ska ske enligt tidsgränsen även om
  aviseringsmejlen inte når fram.
- K-039: Sessionslistan ska visa webbläsare/enhet, senaste aktivitet och
  vilken session som är aktuell. Osäker enhetsinformation ska anges
  tydligt. Exakt geografisk plats behöver inte visas.
- K-040: När förälderns åtkomst till barnet upphör ska föräldern inte
  få ändra barnets uppgifter, även från ett redan öppet formulär. Detta
  omfattar födelsedatum och innebär att K-028:s klubbrättelse gäller efter
  åtkomstförlust. Oberoende rättigheter bedöms enligt sina egna regler;
  upphörd föräldraåtkomst får inte användas som behörighetsgrund.

## Data, integrationer och kvalitetskrav

Befintlig säkerhetsarkitektur och godkända specifikationer gäller som
underlag. Kontouppgifter, klubbarnas personuppgifter och delegerad åtkomst
ska hållas isär enligt kraven ovan.

### Härledda verifierings- och implementationsvillkor

Dessa tillämpar beslutade krav och befintlig säkerhetsarkitektur:

- Kontrollera aktuellt konto, klubb, åtkomst och underlagsversion vid
  skrivning. Ett kontobyte, utgången session eller förlorad behörighet får
  inte låta ett gammalt formulär ändra tidigare kontots eller barnets data.
- K-029 gäller även samtidiga e-postbytesförsök: använd länk får inte
  återanvändas och ersatt begäran får inte vinna senare. Byte ska vara
  kontobundet och inte kunna sparas för ett annat inloggat konto.
- Fel i säkerhetsmeddelandets leverans får inte återställa en redan
  sparad adressändring. Använd befintlig beständig leveransmodell för
  meddelanden; inloggningshemligheter får inte exponeras i fel eller loggar.
- Ett alternativt fungerande inloggningssätt enligt K-030 ska vara
  aktivt och verifierat i befintlig autentisering. En ifylld kontaktadress
  eller ofärdig registrering räcker inte.
- Skyddade uppgifter följer befintlig no-store- och kontobyteshantering.
  Utkast som bevaras vid fel får inte visas för ett annat konto.
- Följ gemensamma designregler för mobil, desktop, tangentbord och
  laddnings-, tom-, fel- och behörighetsförlusttillstånd. Berörda
  produktionskomponenter ska representeras på `/components`.
- Före implementation av kontoborttagning behöver beroenden och
  anslutningar inventeras. Uppfyll K-026 utan att radera klubbarnas delade
  historik/minnen eller lämna giltiga autentiseringsuppgifter. Tekniska
  lagrings- och backupdetaljer hör till datalivscykelarbetet; de är inte
  färdigställda genom denna intervju.

## Acceptanskriterier

- AK-001 (K-001, K-002): Ett konto med tillhörighet i två klubbar ska
  kunna nå sin kontohantering och se sina behöriga kopplingar i båda klubbarna
  från samma kontoplats.
- AK-002 (K-006): Eget medlemskap, godkänd vårdnadshavaråtkomst och
  klubbavgränsad administratörsroll ska var för sig kunna ge klubbtillhörighet.
  En systemadministratör ska kunna ha konto utan klubbkoppling.
- AK-003 (K-007): En ansökan ska kunna skickas och verifieras före
  godkännande utan att ge verksamhetsåtkomst. Konto får aktiveras först
  genom godkänd ansökan eller inbjudan med godkänd klubbkoppling.
- AK-004 (K-009, K-010): När barnet fyller 18 ska tidigare
  vårdnadshavaråtkomst upphöra. Utan den myndigas godkännande får ingen
  följaråtkomst uppstå. Efter godkännande ska föräldern kunna läsa
  matchkalender, tid, plats och resultat men nekas barnets kallelsesvar,
  kommentarer, närvarohistorik och skrivåtgärder genom denna åtkomst.
- AK-005 (K-009): Vid återkallad följaråtkomst ska nya läsningar via den
  åtkomstgrunden nekas. Kvarvarande oberoende rättigheter ska bevaras.
- AK-006 (K-008, K-011): Förlust av sista klubbkopplingen ska starta
  30 dagars övergångstid och ge förvarning före borttagning. En ny godkänd
  klubbkoppling under perioden ska stoppa borttagningen. Förlust av en av
  flera klubbkopplingar ska inte starta kontoborttagning.
- AK-007 (K-012, K-013): När användaren sparar eget namn eller
  telefonnummer ska berörda egna personposter i alla kopplade klubbar
  uppdateras enligt förhandsinformationen. Barnens uppgifter ska förbli
  oförändrade. Eget födelsedatum ska inte kunna ändras genom självservice.
- AK-008 (K-014): En godkänd vårdnadshavare ska före barnets 18-årsdag
  kunna ändra namn, födelsedatum, telefon, kontaktadress och adress.
  Födelsedatumsändring ska loggas och omedelbart påverka åldersstyrd
  åtkomst. Enbart följaråtkomst efter 18 år ska nekas dessa ändringar.
- AK-009 (K-015): Vårdnadshavaråtkomst i Mitt konto ska inte ge rätt att
  ändra medlemskap, lagroller, tröjnummer, position, närvaro eller
  administrativa behörigheter. Oberoende klubbbehörigheter gäller fortsatt.
- AK-010 (K-016): När en vårdnadshavare föreslår att en annan läggs till
  eller tas bort ska åtkomsten förbli oförändrad fram till behörigt
  klubbgodkännande. Avslag ska inte ändra befintliga relationer eller åtkomst.
- AK-011 (K-017): Om barnet har personkopplingar i flera klubbar ska
  ändringen uppdatera de kopplingar där föräldern har godkänd åtkomst,
  enligt informationen före sparande. Personposter i andra klubbar ska
  inte ändras genom denna åtgärd.
- AK-012 (K-018): Båda godkända vårdnadshavarna ska var för sig kunna
  redigera. Om båda öppnar samma version och den första sparar ska den
  andras sparförsök stoppas med bevarat utkast. Den första ändringen ska
  behållas och en genomförd ändring ska finnas i historiken.
- AK-013 (K-019): Ändring av barnets kontaktadress ska inte ändra dess
  inloggningsadress eller ge rätt att byta dess lösenord eller passkeys.
- AK-014 (K-020): Utan ny autentisering och verifiering av den nya
  adressen ska inget e-postbyte genomföras. Fram till slutfört byte ska
  den gamla adressen gälla. Efter slutfört byte ska säkerhetsmeddelande
  skickas till den gamla adressen. En adress som tillhör ett annat konto
  får inte orsaka kontosammanslagning eller överta det andra kontots åtkomst.
- AK-015 (K-021): Efter byte av inloggningsadress eller lösenord ska
  tidigare andra sessioner nekas nya autentiserade anrop; den verifierade
  aktuella sessionen får fortsätta. Efter lösenordsåterställning ska
  samtliga tidigare sessioner nekas nya autentiserade anrop.
- AK-016 (K-022): Användaren ska kunna se sina aktiva sessioner och
  registrerade passkeys, logga ut en enskild session eller alla andra
  och namnge eller ta bort en passkey. Säkerhetsändringar utan giltig
  ny autentisering ska nekas. Ett konto ska inte kunna hantera ett annat
  kontos sessioner eller passkeys.
- AK-017 (K-023): En förälders förfrågan ska inte ensam ge följaråtkomst.
  Efter den myndigas godkännande genom eget verifierat konto ska åtkomsten
  kunna användas och godkännandet visas i den myndigas Mitt konto med
  möjlighet till återkallning.
- AK-018 (K-010, K-024): Föräldern ska genom följaråtkomst kunna läsa
  publicerade lagmatcher med tid, plats och resultat. Varken matchurval
  eller lämnade uppgifter ska avslöja den myndigas kallelse, svar eller
  faktiska deltagande. Kommentarer och närvarohistorik ska nekas.
- AK-019 (K-025): Om sista kopplingen upphör vid tidpunkten T ska kontot
  behållas före T + 30 × 24 timmar, med startavisering och påminnelse
  vid T + 23 × 24 timmar. Under perioden ska kontohantering och ny
  godkänd koppling fungera utan verksamhetsåtkomst. Ny godkänd koppling
  före borttagning ska stoppa den planerade borttagningen.
- AK-020 (K-026): När övergångstiden löpt ut utan ny godkänd koppling
  ska kontot och dess passkeys, sessioner, anslutningsbehörigheter och
  privata assistentsamtal tas bort. Klubbarnas personposter och
  verksamhetshistorik ska inte raderas av kontoåtgärden. Ny registrering
  med samma adress ska inte automatiskt få gamla behörigheter.
- AK-021 (K-027): Om ett fel inträffar vid uppdatering av en av flera
  berörda klubbposter ska ingen av profiländringarna sparas. Utkastet ska
  finnas kvar för nytt försök; tidigare lagrade värden ska behållas.
- AK-022 (K-014, K-028): En förälder som förlorat åtkomst på grund av
  lagrat födelsedatum ska nekas egen datumändring och kunna begära rättelse
  utan att återfå åtkomst genom begäran. Behörig klubbrättelse ska räkna om
  åldersstyrd åtkomst. Förälderns rätt att ändra datum före åtkomstförlust
  ska fortsatt fungera.
- AK-023 (K-020, K-029): En e-postbyteslänk ska inte fungera när dess
  30 minuters giltighet löpt ut, efter avbrott eller efter att en ny
  begäran ersatt den. Misslyckad verifiering ska inte ändra adressen.
  Verifiering av en adress som redan används ska inte överta ett annat konto.
- AK-024 (K-030): Inom fem minuter efter ny autentisering ska angivna
  säkerhetsändringar kunna utföras; efter perioden krävs ny autentisering.
  Utloggning och sessionsåterkallning ska fungera utan den extra
  autentiseringen. Borttagning av sista passkeyn utan annat fungerande
  inloggningssätt ska stoppas.
- AK-025 (K-031): Godkänd vårdnadshavare och behörig medlemsadministratör
  ska kunna se vem, när och vilka uppgifter som ändrades i barnets
  klubbavgränsade profilhistorik. Annan klubbs historik och historik
  efter enbart följaråtkomst ska nekas.
- AK-026 (K-019, K-032): Klubbens behöriga medlemsadministration ska
  kunna bjuda in barnet till eget konto. Aktivering ska kräva verifiering
  av barnets egen adress. Förälderns ändring av barnets kontaktuppgifter
  ska inte skapa konto eller ge kontroll över ett befintligt barnkonto.
- AK-027 (K-024, K-033): Ett godkännande av följaråtkomst i klubb A
  ska inte ge åtkomst i klubb B. Godkännandet ska visa klubb och berörda
  lag. Ändrad aktuell lagtillhörighet ska ändra matchurvalet. När den
  följda personens sista koppling i A upphör ska följaråtkomsten i A
  upphöra utan att oberoende åtkomst i B påverkas.
- AK-028 (K-017, K-034): En förälder med godkända personkopplingar
  för barnet i två klubbar ska uttryckligen kunna bekräfta att de gäller
  samma barn. Namn-, födelsedatums- eller e-postlikhet ska inte automatiskt
  koppla samman poster. Bekräftelsen ska inte ge nya rättigheter i andra
  klubbar eller införa insamling av personnummer.
- AK-029 (K-032, K-035): Ett barn utan egen e-post ska kunna finnas
  som verksamhetsperson utan inloggningskonto och hanteras av godkända
  vårdnadshavare. Eget konto ska kräva personlig inbjudan och barnets egen
  verifierade adress; förälderns adress ska inte bli barnets inloggning.
- AK-030 (K-023, K-036): En följarförfrågan ska visas i den myndigas
  Mitt konto och aviseras till den egna verifierade adressen. Nekad eller
  utgången förfrågan ska inte kunna ge åtkomst. Saknas aktiverat eget
  konto ska klubbens inbjudningsflöde krävas före godkännande.
- AK-031 (K-037): Efter bruten sammankoppling ska nya profiländringar
  inte spridas genom den tidigare kopplingen. Klubbarnas personposter,
  tidigare ändringshistorik och vårdnadshavaråtkomst ska bevaras. Tidigare
  felaktiga profilvärden ska inte automatiskt återställas.
- AK-032 (K-025, K-038): Under övergångstiden ska Mitt konto visa
  varning och planerat borttagningsdatum. Tillfälligt aviseringsfel ska
  återförsökas utan att flytta borttagningsdatumet. Om ingen ny godkänd
  koppling finns ska utebliven mejlleverans inte stoppa borttagning.
- AK-033 (K-022, K-039): Sessionslistan ska visa webbläsare/enhet,
  senaste aktivitet och aktuell session. Osäker enhetsinformation ska
  markeras; exakt geografisk plats ska inte krävas för att hantera sessioner.
- AK-034 (K-014, K-028, K-040): Om föräldern öppnar barnets formulär
  och sedan förlorar åtkomsten ska sparning av samtliga barnuppgifter
  nekas, inklusive födelsedatum. Ny autentisering ska inte i sig återge
  den förlorade barnåtkomsten.
- AK-035 (K-020, K-027, K-029): Förbrukad eller ersatt e-postbyteslänk
  ska nekas även vid samtidiga försök. Kontobyte under ett öppet profil-
  eller säkerhetsflöde ska inte tillåta ändring av det tidigare kontot.
  Mejlleveransfel efter bekräftat byte ska inte återställa adressen.
- AK-036 (K-004): Ingångar till Telegram, push och AI-anslutningar ska
  öppna respektive kontobundet inställningsflöde. Konto utan aktiverad
  integration ska kunna nå dess anslutningsflöde utan att visas som anslutet.

## Bekräftade beslut och motiv

- 2026-10-30: Användaren beställde en ny specintervju för Mitt konto.
- 2026-10-30, svar 1: Båda målen godkändes: hantera egna uppgifter och
  inloggning samt förstå klubb-/barnkopplingar.
- 2026-10-30, svar 2: Gemensamt konto över klubbar godkändes med tillägget
  ”det borde inte finnas användare som inte tillhör någon klubb”. Detta
  är inte tolkat som beslut om automatisk radering eller en viss spärrmodell.
- 2026-10-30, svar 3: Föreslagen första leveransomfattning godkändes,
  inklusive separat spec för detaljerade notifieringsregler och permanent
  kontoradering.
- 2026-10-30, svar 4: Rekommendationen om medlemskap,
  vårdnadshavaråtkomst eller administratörsroll som klubbkoppling samt
  undantag för systemadministratörer godkändes med ”ja”.
- 2026-10-30, svar 5: Aktivering först efter godkänd ansökan eller
  inbjudan godkändes, med möjlighet att ansöka och verifiera före aktivering.
- 2026-10-30, svar 6: Användaren bedömer att plattformens nytta sannolikt
  försvinner utan klubbkoppling och att kontot kan tas bort. Ingen exakt
  tidpunkt eller raderingsmodell har beslutats.
- 2026-10-30, fråga 6a från användaren: Utred eventuell grace-period när
  barn fyller 18 och föräldrar fortfarande vill följa barnets matcher.
  Detta är en öppen fråga, inte godkänd fortsatt åtkomst.
- 2026-10-30, svar 7: Den myndiga personen får godkänna och när som helst
  återkalla fortsatt följaråtkomst. Den räknas som klubbkoppling.
- 2026-10-30, svar 8: Föreslagen begränsad omfattning godkändes med
  tillägget ”någon slags read-only-funktion”. Se K-010 för exakt omfattning.
- 2026-10-30, svar 9: 30 dagars övergångstid med förvarning och möjlighet
  till ny godkänd koppling före borttagning godkändes. Ingen förlängd åtkomst
  till barnets uppgifter genom övergångstiden.
- 2026-10-30, svar 10: Namn och telefon får ändras själv; inloggningsadress
  byts genom separat verifierat flöde. Eget födelsedatum ändras av
  klubbadministrationen. Rekommendationen bekräftades med ”korrekt”.
- 2026-10-30, svar 11: Egna namn-/telefonändringar ska slå igenom i alla
  kopplade klubbar med tydlig information före sparande, utan att ändra barn.
- 2026-10-30, svar 12: Förslaget om enbart läsning av barnuppgifter
  avvisades: ”jag tycker att föräldrar ska kunna redigera allt, de är
  ansvariga för barnet”. Detaljomfattningen följs upp i nästa omgång.
- 2026-10-30, svar 13: Föräldrar får fram till 18-årsdagen ändra barnets
  namn, födelsedatum, telefon, kontaktadress och adress. Födelsedatumsändring
  ska loggas och åldersstyrd åtkomst räknas om direkt.
- 2026-10-30, svar 14: Klubbens uppgifter behåller sina behöriga
  klubbflöden; vårdnadshavarens självservice gäller person-/kontaktuppgifter.
- 2026-10-30, svar 15: Vårdnadshavare får föreslå relationsändringar,
  men klubben godkänner innan annan vårdnadshavare får eller förlorar åtkomst.
- 2026-10-30, svar 16–18: Användaren svarade ”Ja för alla tre”. Barnets
  ändringar synkroniseras i klubbar med godkänd vårdnadshavaråtkomst och
  tydlig information före sparande. Varje godkänd vårdnadshavare får redigera
  utan den andras godkännande, med historik och konfliktskydd som bevarar
  utkastet. Barnets kontaktadress hålls skild från inloggningsadress och
  rätt att redigera kontaktuppgifter ger inte rätt att ändra kontots
  inloggningsadress, lösenord eller passkeys.
- 2026-10-30, svar 19–21: Användaren svarade ”Ja för alla tre frågor”.
  E-postbyte kräver ny autentisering med lösenord/passkey och verifiering
  av nya adressen; gamla adressen gäller fram till byte och meddelas efteråt.
  Ingen kontosammanslagning. Andra sessioner loggas ut vid adress-/lösenordsbyte,
  och alla tidigare sessioner vid lösenordsåterställning. Aktiva sessioner och
  passkeys visas med hantering enligt K-022 och ny autentisering vid
  säkerhetsändringar.
- 2026-10-30, svar 22–24: Användaren svarade ”Ja för alla tre”.
  Föräldern kan efter 18-årsdagen skicka förfrågan om följaråtkomst och
  den myndiga godkänner med eget verifierat konto samt kan se/återkalla den
  i Mitt konto. Matchurvalet är publicerade matcher för personens lag,
  utan uppgift om personlig kallelse, svar eller deltagande. Övergångstiden
  är exakt 30 × 24 timmar, med e-post vid start och sju dagar före
  borttagning. Kontohantering och ny koppling tillåts under perioden,
  verksamhetsåtkomst gör det inte.
- 2026-10-30, svar 25–27: Användaren svarade ”Ja för alla tre”.
  Godkände borttagning av inloggningskonto, passkeys, sessioner,
  anslutningsbehörigheter och privata assistentsamtal efter övergångstiden,
  med klubbarnas personposter/historik kvar enligt separata regler och utan
  automatisk återställning av gamla rättigheter vid ny registrering.
  Profiländringar i flera klubbar ska lyckas tillsammans eller inte alls,
  med bevarat utkast vid fel. Felaktigt födelsedatum som redan stoppat
  förälderns åtkomst rättas av klubben efter begäran; föräldern får inte
  återställa sin egen åtkomst.
- 2026-10-30, svar 28–30: Användaren svarade ”Ja för alla tre”.
  Godkände avbrytbart/ersättbart e-postbyte, 30 minuters verifieringslänk,
  oförändrad adress vid misslyckad verifiering och inget övertagande av
  upptagen adress. Ny autentisering för e-post-/lösenordsbyte och
  passkeyhantering gäller fem minuter; utloggning och återkallning av
  sessioner fungerar direkt. Sista passkeyn får tas bort när annat
  fungerande inloggningssätt finns. Barnets klubbavgränsade ändringshistorik
  får läsas av godkända vårdnadshavare och behöriga medlemsadministratörer,
  med vem/när/vilka uppgifter, utan historikåtkomst för följare efter 18 år.
- 2026-10-30, svar 31: Personlig inbjudan genom behörig
  medlemsadministration och verifiering av barnets egen e-post godkändes.
  Förälderns kontaktändringar ska inte skapa eller överta barnets konto.
- 2026-10-30, svar 32: Användaren frågade om personnummer borde vara
  identifieringsgrund och påpekade att personnummer ännu inte sparas.
  Detta är inte ett beslut att börja samla in personnummer eller ett
  godkännande av föreslagen manuell kopplingsmodell. Valet är öppet.
- 2026-10-30, svar 33: Separat godkännande av följaråtkomst per klubb,
  synlig klubb/lagomfattning, aktuellt lagurval och upphörande vid den
  följda personens sista klubbkoppling godkändes.
- 2026-10-30, svar 34: Användaren godkände att tills vidare använda
  klubbarnas godkända kopplingar och förälderns uttryckliga bekräftelse.
  Personnummerbaserad identifiering får separat spec för insamling,
  verifiering, rättelser och personer utan svenskt personnummer.
- 2026-10-30, svar 35–37: Användaren svarade ”Ja för alla tre”.
  Eget barnkonto är frivilligt, kräver egen verifierad e-post och får inte
  använda förälderns adress som barnets inloggning. Följarförfrågan visas
  i den myndigas Mitt konto, aviseras till egen verifierad adress, gäller
  30 dagar och kan nekas; eget konto aktiveras först genom klubbinbjudan.
  Felaktig sammankoppling kan brytas utan ändring av klubbposter, historik
  eller vårdnadshavaråtkomst; tidigare felvärden rättas separat.
- 2026-10-30, svar 38: Användaren svarade ”ändra direkt” på frågan om
  en begäran om födelsedatumsrättelse efter förlorad föräldraåtkomst.
  Det behöver klargöras om föräldern ska kunna ändra trots förlorad
  åtkomst eller om behörig klubbadministration ska rätta direkt utan
  separat ärendeflöde. Ingen ny utökad åtkomst är beslutad genom tolkning.
  K-028 och berörda acceptanskriterier inväntar precisering av detta svar.
- 2026-10-30, svar 39: Varning och borttagningsdatum i Mitt konto,
  återförsök vid tillfälliga mejlfel och bibehållen tidsgräns trots
  utebliven aviseringsleverans godkändes.
- 2026-10-30, förtydligande av svar 38: ”Om åtkomst upphör får man inte
  ändra någonting.” Tidigare klubbrättelse enligt K-028 gäller fortsatt;
  förlorad föräldraåtkomst ger ingen rätt att ändra barnets uppgifter.
- 2026-10-30, svar 40: Sessionslistans webbläsare/enhet, senaste
  aktivitet och aktuell session godkändes, med markerad osäker
  enhetsinformation och utan krav på exakt geografisk plats.

## Obekräftade antaganden och förslag

- Ingen särskild självservice för dataexport eller valfri omedelbar
  kontoradering är beslutad. Sådana tillägg behöver separat specifikation.

## Öppna frågor

- Inga kvarstående blockerande produktfrågor har identifierats.
- Slutlig sammanfattning och avgränsningar bekräftades 2026-10-30.
- Teknisk inventering för radering och befintliga integrationsflöden
  återstår inför implementation enligt villkoren ovan. Detta är inte
  genomförd implementation eller driftverifiering.

## Bekräftelse

Användaren bekräftade slutlig sammanfattning och avgränsningar 2026-10-30
med ”Ja”. Inga blockerande produktfrågor återstår. Status är Redo.
Implementation är inte beställd genom denna intervju. Teknisk inventering
och verifiering inför implementation återstår enligt villkoren ovan.

## Ändringshistorik

- 2026-10-30: Användaren bekräftade slutlig sammanfattning och
  avgränsningar med ”Ja”. Specen markerad Redo; ingen implementation utförd.
- 2026-10-30: Sparat förtydligande av svar 38 och svar 40 som
  K-039–K-040 och AK-033–AK-034. Samlat tidigare preciseringar i
  huvudkraven, dokumenterat härledda implementationsvillkor och
  AK-035–AK-036 samt förberett slutlig sammanfattning.
- 2026-10-30: Sparat svar 39 som K-038 och AK-032. Dokumenterat
  svar 38 som begärd ändring som kräver precisering av aktör/åtkomst,
  och fråga 40 som obesvarad.
- 2026-10-30: Sparat svar 35–37 som K-035–K-037 och
  AK-029–AK-031 om frivilligt barnkonto, följarförfrågans livscykel
  och rättelse av felaktig sammankoppling.
- 2026-10-30: Sparat svar 34 som K-034 och AK-028. Personnummer
  avgränsat till separat spec; explicit sammankoppling av klubbarnas
  godkända barnkopplingar ingår tills vidare.
- 2026-10-30: Sparat svar 31 och 33 som K-032–K-033 och
  AK-026–AK-027. Personnummerfrågan i svar 32 dokumenterad som öppet
  identifieringsval utan beslut om insamling eller automatisk koppling.
- 2026-10-30: Sparat svar 28–30. Lagt till K-029–K-031 och
  AK-023–AK-025 om e-postbytets livscykel, fem minuters ny autentisering
  och klubbavgränsad synlighet för barnets profilhistorik.
- 2026-10-30: Sparat svar 25–27. Lagt till K-026–K-028 och
  AK-020–AK-022 om kontoborttagningens omfattning, atomära
  profiländringar och klubbrättelse efter förlorad föräldraåtkomst.
- 2026-10-30: Sparat svar 22–24. Lagt till K-023–K-025 och
  AK-017–AK-019 om följarförfrågan, publicerade lagmatcher och exakt
  övergångstid med aviseringar och begränsad kontohantering.
- 2026-10-30: Sparat svar 19–21. Lagt till K-020–K-022 och
  AK-014–AK-016 om e-postbyte, sessionsåterkallning och säkerhetshantering.
- 2026-10-30: Sparat svar 16–18. Lagt till K-017–K-019 och
  AK-011–AK-013 om barnuppgifters synkronisering, flera vårdnadshavare,
  historik/konfliktskydd och separat kontosäkerhet.
- 2026-10-30: Sparat svar 13–15 om barnets redigerbara uppgifter,
  klubbflöden och godkända relationsändringar. Preciserat K-014 och lagt
  till K-015–K-016 samt AK-008–AK-010.
- 2026-10-30: Sparat svar 10–12 om egen profil, synkronisering mellan
  klubbar och önskad bred föräldraredigering. Skapat K-012–K-014 och AK-007;
  markerat barnredigeringens detaljomfattning som öppen.
- 2026-10-30: Sparat svar 7–9 om samtyckt läsåtkomst efter 18 år och
  30 dagars övergångstid. Skapat K-009–K-011 och AK-004–AK-006.
- 2026-10-30: Sparat svar 4–6 och användarfråga 6a. Skapat K-006–K-008
  och AK-002–AK-003; markerat gränsen mot 18-årsregeln och dataradering.
- 2026-10-30: Sparat svar 1–3 om båda målen, gemensamt konto,
  klubbtillhörighet och första leveransomfattning. Skapat K-001–K-005.
- 2026-10-30: Skapat intervjuutkast med granskat nuläge, beroenden och
  första förslag inför beslut om mål och omfattning.
