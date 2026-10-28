# Publik klubbsida – information, nyheter och ansökningsformulär

- Status: Redo
- Senast uppdaterad: 2026-10-28
- Berörda dokument: [Arkitektur](../architecture.md), [Designregler](../design-spec.md), [Säkerhet](../security-architecture.md), [Administration](administration.md), [Lagmedlemmar och ansökningar](hantera-trupp.md), [Funktionell likvärdighet](../migration/feature-parity.md)
- Implementation och verifiering: Ej påbörjad. Kravspecen och slutlig sammanfattning är godkända. Ingen implementation beställd.

## Problem och mål

Ge klubben en publik plats för information, nyheter och ansökningsformulär.
Diskussionen utgår från hur klubbens identitet ska fungera när en person har
kopplingar till flera klubbar och behöver en samlad personlig översikt.

## Omfattning

### Ingår

- Publikt tillgänglig klubbsida.
- Möjlighet för klubben att publicera nyheter och skapa ansökningsformulär.
- Formulär för medlemsansökan till lag, fotbollsskola och läger.
- Gemensam grundmodell för lag, fotbollsskola och läger med skilda typer.
- Klubbidentitet, verifierad egen domän och relationen till den neutrala personliga översikten.

### Ingår inte

Ingen implementation är beställd.
Medlemsansökningars befintliga krav ägs av Lagmedlemmar-specen och ska inte
skrivas över av obekräftade antaganden om generella formulär.
Automatisk platsgaranti, väntelista och betalning i Förena ingår inte i första
versionen. Pris och instruktioner för extern betalning får visas enligt K-028.
Automatiska mejl och pushutskick vid nyhetspublicering ingår inte i första
versionen; ett framtida utskicksflöde specificeras separat enligt K-043.

## Användare, roller och flöden

1. Systemadmin verifierar och ansluter klubbens domän. Klubbadmin förvaltar
   klubbidentiteten och klubb-/sektions-/gruppadministrationen följer sina mandat.
2. Besökaren öppnar klubb-/gruppsidan utan inloggning och ser dess publika
   nyheter och öppna ansökningsformulär. Andra klubbars innehåll visas inte.
3. Redaktörer skapar, förhandsgranskar och publicerar eller schemalägger
   nyheter med vald målgrupp. Behöriga samarbetar och kan avpublicera.
4. Gruppadmin förvaltar formulär för lag, fotbollsskola eller läger. Sökanden
   skickar ansökan med basuppgifter och eventuella kompletterande frågor.
5. Ansökan verifieras och granskas enligt Lagmedlemmar-specen. Ansvarig ledare
   godkänner eller avslår, med godkännande till just den sökta gruppen.
6. Inloggning bevarar klubbens sammanhang. Ett uttryckligt val öppnar den
   neutrala appens personliga översikt med behöriga uppgifter från flera klubbar.

## Krav

- K-001: Klubbens sida ska vara publikt tillgänglig utan krav på medlemskap
  eller inloggning för att läsa publikt innehåll.
- K-002: Klubben ska kunna publicera nyheter på sin publika plats.
- K-003: Klubben ska kunna skapa ansökningsformulär som besökare kan hitta
  via klubbsidan. Formulären ska stödja medlemsansökan till lag, fotbollsskola
  och läger. Anpassning följer K-024–K-034 och mottagarflöden följer
  K-004–K-006 samt Lagmedlemmar-specen.
- K-004: Anmälningar för samtliga tre ändamål ska alltid godkännas av
  ansvarig team-/lagledare. Inskickad anmälan får inte automatiskt bli ett
  godkänt medlemskap eller deltagande. Åtkomst till granskning ska följa den
  befintliga separata ansökningsbehörigheten inom respektive grupp.
- K-005: Ordinarie lag, fotbollsskola och läger ska använda samma grundmodell
  för deltagare, ledare, aktiviteter, ansökningsgranskning och behörigheter.
  En typ ska skilja lag, fotbollsskola och läger åt. Den gemensamma gruppmodellen
  avser verksamhetsgrupper, inte befintliga undergrupper inom ett lag.
- K-006: Godkänd ansökan ska knyta personen till den grupp ansökan avser.
  Deltagande i fotbollsskola eller läger får inte automatiskt ge medlemskap
  i ett annat, ordinarie lag. K-004:s ledargodkännande gäller alla tre typerna.
- K-007: Klubbens domän och gruppsökväg ska ge en sammanhängande upplevelse
  med den klubbens identitet och innehåll. Exempel på önskad adress är
  `www.ursvikik.se/t/f2016`. Den klubbavgränsade upplevelsen ska inte visa
  andra klubbars aktiviteter, branding eller navigeringslänkar, även om
  användaren har åtkomst till dem genom samma konto.
- K-008: En separat neutral Förena-app ska kunna visa personliga uppgifter
  från flera klubbar enligt användarens faktiska behörigheter. Klubbvyn får
  ha en tydlig länk till denna app; bytet ska vara ett uttryckligt val, inte
  ett automatiskt byte till en annan klubbs sammanhang.
- K-009: Nyheter ska kunna publiceras på klubb-, sektions- och lagnivå.
  Exempelvis ska F2016 kunna ha egna nyheter på sin sida. Publiceringens
  behörigheter följer K-010–K-011, synlighet K-012 och visning mellan nivåer K-013.
- K-010: Publicering ska vara en separat tilldelningsbar behörighet, avgränsad
  till klubb, sektion eller lag. En person ska kunna utses till redaktör inom
  området utan att bli administratör. Ansvar som tränare ska inte automatiskt
  ge publiceringsrätt. Tilldelningsmandat regleras i K-020.
- K-011: Administratörer ska få publicera inom sitt administrativa område.
  Systemadmin behöver först bli klubbadmin för att publicera klubbens innehåll.
  Systemrollen ensam ger inte publiceringsrätt, automatisk klubbroll eller
  generell verksamhetsåtkomst.
- K-012: Redaktören ska välja synlighet per nyhet: publik eller endast för
  medlemmar. Medlemsnyheter ska endast visas för behöriga inom den valda
  klubben, sektionen eller laget. Även rubrik och ingress ska döljas för
  obehöriga; enbart inloggning eller medlemskap i en annan klubb räcker inte.
  Läsurval och upphörande regleras i K-018–K-019.
- K-013: Klubbnyheter ska visas på klubbens, sektionernas och lagens sidor
  inom samma klubb. Sektionsnyheter ska visas på sektionens och dess lags
  sidor. Lagnyheter ska visas på det egna lagets sida. Nyhetens avsändare ska
  alltid framgå. Visning på en underliggande sida får inte utöka nyhetens
  åtkomst: originalets medlemsbegränsning ska behållas och kontrolleras även där.
- K-014: En nyhet ska innehålla rubrik, ingress, formaterad text och valfri
  huvudbild. Redigering och visning ska följa gemensamma designregler.
- K-015: Nyheter ska kunna sparas som utkast och förhandsgranskas före
  publicering. De ska kunna publiceras direkt eller schemaläggas till valt
  datum och klockslag. Schemalagda tidpunkter ska följa svensk tid enligt
  administrationsspecens gemensamma tidszonsregel.
- K-016: En publicerad nyhet ska kunna ändras eller avpubliceras av behörig
  publicerare. Ändringar och avpublicering ska ha ändringshistorik.
  Utkast, samarbete, historikåtkomst och schemalagd kontroll följer K-021–K-023.
- K-017: Den neutrala appens personliga översikt ska samla relevanta nyheter
  från personens och barnens klubbar, sektioner och grupper. Varje nyhet ska
  visa tydlig avsändare och endast visas en gång även om flera barn omfattas
  eller samma nyhet återfinns på flera nivåer. Medlemsnyheternas åtkomstkrav
  ska gälla även i den samlade översikten. Detta ändrar inte klubbdomänens
  avgränsning till den egna klubben enligt K-007.
- K-018: Medlemsnyheter ska vara läsbara för aktiva medlemmar i området
  och deras behöriga vårdnadshavare samt för administratörer och redaktörer
  med rättigheter inom området, även utan eget medlemskap. En aktiv lagkoppling
  ska ge tillgång till lagets, dess sektions och klubbens medlemsnyheter.
  Detta ger inte åtkomst till andra lags eller sektioners egna medlemsnyheter.
  Systemrollen ensam ger ingen sådan verksamhetsåtkomst enligt administrationsspecen.
- K-019: Nyhetsåtkomst som bygger på medlemskap ska upphöra när medlemskapet
  avslutas enligt dess datumgiltighet. Oberoende aktiva rättigheter ska behållas.
  Vårdnadshavaråtkomst kräver fortsatt behörig relation enligt Lagmedlemmar-specen;
  en tidigare relation eller tidigare medlemskap ska inte ensamt ge åtkomst.
- K-020: Klubbadmin ska få utse och återkalla redaktörer inom klubben.
  Sektions- och lagadmin ska få göra det inom sitt eget område. Publiceringsrätt
  ska kunna tilldelas separat eller ingå i klubbens behörighetsprofiler för lag.
  Profilerna ger fortsatt endast rättigheter inom tilldelat lag och får inte
  ge administratörsroller eller rätt att ändra profildefinitioner.
- K-021: Behöriga redaktörer och administratörer ska inom sitt område få
  granska och ändra varandras utkast och nyheter samt läsa ändringshistoriken.
  Åtkomst ska avgöras av aktuellt områdesmandat, inte av att personen en gång
  skapade nyheten. Systemroll ensam ger inte redaktionell åtkomst enligt K-011.
- K-022: Utkast och förhandsgranskningar ska endast vara tillgängliga för
  områdets behöriga redaktörer och administratörer. Vanlig rätt att läsa
  publicerade medlemsnyheter ger inte tillgång till utkast eller förhandsgranskning.
- K-023: Vid schemalagd publicering ska kontrolleras att den som schemalagt
  nyheten fortfarande har publiceringsrätt för området. Om rättigheten saknas
  ska publiceringen stoppas. En annan behörig person ska kunna granska och
  aktivera publiceringen igen. Stoppad publicering får inte göra nyheten
  tillgänglig för den avsedda läsarmålgruppen utan ett nytt behörigt beslut.
- K-024: Ansökningsformulären ska ha en gemensam bas där namn, födelsedatum
  och kontakt-/vårdnadshavaruppgifter följer den godkända Lagmedlemmar-specen.
  Klubbens anpassning får inte kringgå basens krav för minderåriga, verifiering
  eller ledarens godkännande. Formuläret ska tydligt ange sökt lag/skola/läger.
- K-025: Klubben ska kunna komplettera formuläret med egna frågor för en
  viss fotbollsskola eller ett läger och välja om varje fråga är obligatorisk.
  Exempel är val av deltagarvecka. Frågetyper, ändringsregler och
  förvaltningsmandat regleras i K-031–K-034.
- K-026: Hälsouppgifter ska inte ingå i första versionens ansökningsformulär,
  i enlighet med Lagmedlemmar-specens avgränsning. Egna frågor får inte
  användas för att införa insamling av sådana uppgifter i denna leverans.
- K-027: Ansvarig ledare ska manuellt bedöma platstillgång och godkänna
  eller avslå varje ansökan. Första versionen ska inte ge automatisk
  platsgaranti eller ha väntelista. En inskickad ansökan är inte en tilldelad plats.
- K-028: Fotbollsskola och läger ska kunna visa pris och betalningsinstruktioner.
  Betalningen ska ske utanför Förena. Första versionen ska inte införa ett
  betalningssystem eller behandla en inskickad/godkänd ansökan som bevis på betalning.
- K-029: Fotbollsskolor och läger ska ligga under en sektion precis som lag,
  i strukturen klubb → sektion → lag/fotbollsskola/läger. De ska ärva
  sektionens disciplin och omfattas av samma områdesavgränsade administration.
  Deras verksamhetstyp får inte användas för att kringgå klubb-/sektionsgränser.
- K-030: Fotbollsskola och läger ska kunna ha start- och slutdatum för
  arrangemanget. När perioden passerat ska deltagare och historik behållas;
  inget ska raderas automatiskt. Arrangemangsdatum är inte en säsongsuppgift
  på ordinarie lag och beslutar inte i sig medlemskapens eller behörigheternas
  slutdatum, enligt K-035. Ansökningsperioden hanteras separat enligt K-033.
- K-031: Gruppens administratör ska kunna anpassa ansökningsformuläret.
  Klubb- och sektionsadmin ska också få göra det inom sina områden.
  Publiceringsrätt eller rätt att granska ansökningar ger inte i sig rätt att
  ändra formulärdefinitionen. Befintliga basfält och hälsodataavgränsningen gäller.
- K-032: Egna frågor ska stödja kort text, längre text, enval och flerval.
  Varje fråga ska kunna vara obligatorisk eller valfri enligt K-025.
- K-033: Formulär ska kunna öppnas och stängas manuellt eller med datum.
  Inskickning ska bara tillåtas när formuläret är öppet, även genom API-anrop
  eller från en sida som öppnades före stängningen. Lägen och datumgränser
  följer K-044–K-045.
- K-034: En inskickad ansökan ska behålla frågorna och svaren så som de såg
  ut vid inskickningen. Senare ändringar av formulärets frågor, alternativ
  eller obligatoriska fält får inte skriva om den inskickade ansökan.
- K-035: Arrangemangets slutdatum ska hållas separat från deltagarnas
  gruppkopplingar och åtkomst. Att ett läger eller en fotbollsskola passerat
  slutdatum får inte automatiskt avsluta dessa. Behörig administratör ska
  kunna avsluta gruppkopplingarna med datum enligt Lagmedlemmar-specens
  medlemsregler. Fram till dess ska fortsatt giltiga rättigheter exempelvis
  kunna ge tillgång till efterinformation. Oberoende regler om återkallning,
  medlemsgiltighet och vårdnadshavaråtkomst gäller fortsatt.
- K-036: Klubben ska kunna anpassa logotyp, klubbnamn, profilfärger och
  omslagsbild. Gemensamma sidmallar och navigation ska använda klubbens
  identitet. Samma klubbidentitet ska gälla på sektionernas och gruppernas sidor.
- K-037: Första versionen ska inte erbjuda egen CSS eller fritt byggda
  sidlayouter. Klubbens visuella anpassning ska ske inom de gemensamma mallarna,
  med bibehållna design- och tillgänglighetsregler. Full återskapning av klubbens
  befintliga webbplats ingår inte.
- K-038: Klubben ska alltid ha en adress i Förena och dessutom kunna ansluta
  en egen domän eller subdomän. Samma klubb- och gruppinnehåll ska visas med
  klubbens identitet oavsett adress. Förena-adressen till klubben är en
  klubbavgränsad vy, skild från den neutrala personliga flerklubbsöversikten.
- K-039: Systemadmin ska ansluta klubbens domän efter verifiering av
  ägarskapet. Appen ska koppla det godkända domännamnet till rätt klubb och
  sökvägen till rätt grupp. DNS hanterar inte sökvägar. Om klubbens befintliga
  webbplats behålls på samma domän kräver en Förena-sökväg där att webbplatsen
  vidarebefordrar de aktuella sökvägarna till Förena. Konfiguration av en verklig
  domän ingår inte i specarbetet.
- K-040: Klubbadmin ska hantera klubbens logotyp, profilfärger och omslagsbild.
  Sektions- och lagadmin får inte ändra klubbprofilen. Klubbnamn följer
  administrationsspecens strukturmandat och ska användas konsekvent i profilen.
- K-041: Samma Förena-konto ska användas på samtliga klubbadresser och i
  den neutrala appen. Inloggningen får tillfälligt ske på Förenas centrala
  adress, men inloggning från en klubbsida ska återföra användaren till samma
  klubb och sida. Skyddade direktlänkar ska behållas genom inloggningen.
- K-042: Inloggning får inte automatiskt växla användaren till den samlade
  personliga översikten. Byte till den neutrala appen ska ske genom ett tydligt
  val. Gemensamt konto innebär inte gemensamma behörigheter mellan klubbar.
  Återgång får endast ske till verifierade klubbadresser eller godkända
  Förena-adresser; godtycklig returadress får inte bli en öppen omdirigering.
- K-043: Första versionen ska visa publicerade nyheter på berörda sidor och
  i den personliga översikten enligt K-013 och K-017, utan automatiska mejl
  eller pushutskick från nyhetspublicering. Ett framtida utskicksflöde ska
  specificeras separat med mottagarval och notifieringsinställningar. Detta
  ändrar inte befintliga bekräftelser och beslut i medlemsansökningsflödet.
- K-044: Nya formulär ska börja stängda. Administratören ska kunna välja
  mellan manuellt läge med uttryckligt öppet/stängt och datumstyrt läge.
  Datumstyrt läge ska tillåta inskickning från startdatum kl. 00.00 till och
  med slutdatumets hela dag i `Europe/Stockholm`, med stängning vid nästa
  dags början. Administratören ska kunna byta läge; båda lägena får inte
  samtidigt ge motstridiga öppningsbeslut.
- K-045: Stängning av formulär ska hindra nya ansökningar men inte påverka
  redan inskickade ansökningar eller deras granskning. Stängning ska inte
  behandlas som automatiskt avslag eller avslut av befintliga gruppkopplingar.
- K-046: Nyheter och formulär ska följa administrationens sparskydd:
  samtidiga ändringar ska stoppas med begripligt fel och bevarat utkast.
  Sparfel får inte lämna en delvis sparad ändring. Aktuell behörighet ska
  kontrolleras vid skrivning även från en redan öppen sida.
- K-047: Avpublicering och byte till medlemsnyhet ska slå igenom på alla
  berörda sidor och i den personliga översikten. Direktlänkar och nya
  hämtningar ska kontrollera aktuell publiceringsstatus och åtkomst.
  Avpublicerad nyhet får inte visas för vanliga läsare; medlemsnyhets rubrik,
  ingress och innehåll ska nekas obehöriga även om nyheten tidigare var publik.

## Data, integrationer och kvalitetskrav

Berörda områden: klubbidentitet, publicerat innehåll, nyheter, formulär och
koppling till ansökningsgranskning. Publik tillgång till klubbsidan innebär
inte i sig att medlemsuppgifter, formulärsvar eller privata aktiviteter blir
publika; befintliga säkerhetsregler gäller. Önskad egen klubbadress beskrivs
i K-007; domänverifiering, hosting och eventuell integration med klubbens
befintliga webbplats följer K-038–K-039. Tekniska kontrakt för hosting,
certifikat och inloggning mellan adresser behöver preciseras inför implementation.
Ingen domänändring är beställd.

Basfält, verifiering, dubblettgranskning, godkännande/avslag, personkopplingar,
vårdnadshavaråtkomst och ansökningshistorik följer Lagmedlemmar-specen inom
den gemensamma gruppmodellen. Kompletterande formulärsvar omfattas av samma
granskningsbehörighet och blir inte publika genom att formuläret är publikt.
Behörighet att läsa en grupps nyheter ger inte rätt att läsa dess ansökningar.

Befintliga design- och säkerhetsregler gäller även nyhetsredigering,
bildhantering, egna frågor och central inloggning. Gemensamma
produktionskomponenter och CSS återanvänds enligt AGENTS.md. Verifieringen
ska omfatta mobil/desktop, tangentbord, laddnings-/tomma tillstånd och
begripliga fel med bevarade utkast. Privata svar och medlemsnyheter får inte
exponeras genom offentliga förhandsgranskningar eller cache som kringgår åtkomst.

## Acceptanskriterier

- AK-001 (K-001): En utloggad besökare ska kunna öppna klubbsidan och läsa
  dess publika innehåll utan omdirigering till inloggning.
- AK-002 (K-002): En behörig publicerare ska kunna publicera en nyhet som
  med synligheten publik därefter kan läsas av en utloggad besökare på
  klubbens publika plats. Medlemsnyheter följer K-012.
- AK-003 (K-003): Klubben ska kunna skapa ett ansökningsformulär och göra
  det åtkomligt från klubbsidan för vart och ett av ändamålen medlemsansökan
  till lag, fotbollsskola och läger. Svarshanteringen ska följa K-004–K-006,
  K-024–K-034 och Lagmedlemmar-specen.
- AK-004 (K-004): En inskickad ansökan till lag, fotbollsskola eller läger
  ska invänta ansvarig ledares godkännande och inte ensam ge godkänt medlemskap
  eller deltagande. Befintliga verifieringskrav för lagansökan gäller fortsatt.
- AK-005 (K-005): Var och en av typerna lag, fotbollsskola och läger ska kunna
  hantera deltagare, ledare, aktiviteter, granskning och behörigheter genom
  samma grundflöden, med rätt verksamhetstyp angiven.
- AK-006 (K-004, K-006): Vid godkännande av anmälan till en fotbollsskola
  eller ett läger ska deltagaren knytas till just den gruppen. Inget medlemskap
  i ett annat lag ska skapas som bieffekt och andra gruppkopplingar ska bevaras.
- AK-007 (K-007): En användare med behörighet i både Ursvik och AIK som
  öppnar Ursviks klubbdomän och F2016-sökväg ska se Ursviks identitet och
  gruppinnehåll, utan AIK:s aktiviteter, branding eller navigeringslänkar.
  Inloggning får inte automatiskt växla vyn till en samlad översikt över klubbar.
- AK-008 (K-008): Ett uttryckligt val av länken till den neutrala Förena-appen
  ska kunna öppna en samlad personlig vy med uppgifter från båda klubbarna,
  förutsatt faktisk åtkomst. Den neutrala appen ska inte bära en enskild klubbs branding.
- AK-009 (K-009): En behörig publicerare ska kunna skapa en nyhet för en
  klubb, en sektion respektive ett lag. Lagets egna nyheter ska kunna läsas
  på lagets sida; de får inte knytas till en annan klubb som bieffekt.
- AK-010 (K-010): En person med publiceringsrätt för ett lag ska kunna
  publicera dess nyheter utan administratörsroll, men nekas publicering i
  andra områden. Enbart tränaransvar ska inte ge publiceringsrätt.
- AK-011 (K-011): Klubb-, sektions- och lagadmin ska kunna publicera inom
  sitt administrativa område men inte i andra klubbar eller utanför sitt mandat.
  Behörighetskontrollerna ska gälla även direkta API-anrop.
- AK-012 (K-012): En publik nyhet ska kunna läsas utan inloggning. En
  medlemsnyhet ska visas för behöriga inom sitt valda område men inte för
  utloggade eller konton utan åtkomst dit. Rubrik, ingress och innehåll ska
  döljas för obehöriga även i listor, sökresultat och direkta API-anrop.
- AK-013 (K-013): En klubbnyhet ska synas på den egna klubbens, sektionernas
  och lagens sidor; en sektionsnyhet på den egna sektionens och dess lags
  sidor; en lagnyhet på det egna lagets sida. Avsändaren ska framgå även på
  underliggande sidor. En sektionsnyhet får inte ärvas av en annan sektion och
  en lagnyhet får inte ärvas av ett annat lag.
- AK-014 (K-012, K-013): En medlemsbegränsad klubb- eller sektionsnyhet som
  visas på en lagsida ska förbli dold för besökare utan rätt att läsa originalet,
  inklusive rubrik och ingress. Ingen nyhet får ärvas mellan olika klubbar.
- AK-015 (K-014): En nyhet ska kunna skapas och visas med rubrik, ingress
  och formaterad text, både med och utan huvudbild.
- AK-016 (K-015): En behörig publicerare ska kunna spara ett utkast och
  förhandsgranska det innan publicering. Direktpublicering ska göra nyheten
  tillgänglig för vald målgrupp; en schemalagd nyhet ska inte visas för denna
  målgrupp före valt datum och klockslag i svensk tid.
- AK-017 (K-016): En behörig publicerare ska kunna ändra en publicerad nyhet
  med sparad ändringshistorik och därefter avpublicera den. Avpublicerad nyhet
  ska inte längre visas som publicerad på ursprungssidan eller ärvande sidor.
- AK-018 (K-017): En person med barn i olika klubbar ska i den neutrala
  översikten kunna se relevanta nyheter från båda klubbarna och deras
  sektioner/grupper, med tydlig avsändare. En nyhet som berör flera barn eller
  ärvs till flera relevanta grupper ska visas en gång.
- AK-019 (K-007, K-012, K-017): Nyhetssamlingen ska inte visa medlemsnyheter
  utan aktuell åtkomst. En användares flerklubbskopplingar får inte göra att
  en annan klubbs nyheter visas i den klubbavgränsade upplevelsen.
- AK-020 (K-018): En aktiv lagmedlem och dess behöriga vårdnadshavare ska
  kunna läsa lagets, sektionens och klubbens medlemsnyheter men inte andra
  lags/sektioners egna medlemsnyheter utan separat åtkomst. Administratörer
  och redaktörer ska kunna läsa inom sitt mandat även utan medlemskap.
- AK-021 (K-019): Efter medlemskapets slut ska nästa hämtning neka
  medlemsnyheter om ingen annan aktiv rättighet ger åtkomst. Ett konto med
  annan aktiv lagkoppling eller oberoende roll ska behålla den åtkomst som
  följer av den källan. Återkallad vårdnadshavaråtkomst ska inte ge fortsatt läsrätt.
- AK-022 (K-020): Klubb-, sektions- och lagadmin ska kunna tilldela och
  återkalla publiceringsrätt inom respektive område, men nekas tilldelning
  utanför sitt mandat. En lagprofil ska kunna innehålla publiceringsrätt och
  kombineras med direkt tilldelning enligt administrationsspecens källregler.
- AK-023 (K-011): Ett konto med endast systemroll ska nekas publicering av
  klubbens innehåll. Efter uttrycklig tilldelning av klubbadminroll ska kontot
  få publicera inom den klubben men inte i andra klubbar genom systemrollen.
- AK-024 (K-021): Två behöriga redaktörer i samma område ska kunna granska
  och redigera varandras utkast/nyheter och läsa historiken. En redaktör utanför
  området ska nekas motsvarande åtkomst även via direkta API-anrop.
- AK-025 (K-022): En vanlig medlem, utloggad besökare eller annan obehörig
  ska nekas utkast och förhandsgranskning även med direktlänk. Om en redaktör
  förlorat sitt mandat ska tidigare författarskap inte ensamt ge fortsatt åtkomst.
- AK-026 (K-023): Om schemaläggarens publiceringsrätt återkallas eller löper
  ut före publiceringstidpunkten ska nyheten inte publiceras automatiskt.
  En annan behörig person ska efter granskning kunna aktivera publiceringen
  igen; en person utan publiceringsrätt ska nekas detta.
- AK-027 (K-024): Ansökan till lag, fotbollsskola och läger ska följa samma
  grundkrav för namn, födelsedatum, kontakt/vårdnadshavare och verifiering som
  Lagmedlemmar-specen. Egna frågor får inte ta bort dessa krav eller ge
  automatiskt godkännande. Sökande ska se vilken grupp ansökan gäller.
- AK-028 (K-025): Klubben ska kunna lägga till en fråga för en viss
  fotbollsskola eller ett läger och markera den obligatorisk eller valfri.
  Saknat svar på en obligatorisk fråga ska hindra inskickning med begripligt
  fel; en valfri fråga ska kunna lämnas obesvarad.
- AK-029 (K-026): Första versionens formulär och deras anpassning ska inte
  erbjuda insamling av allergier eller andra hälsouppgifter. Befintliga sådana
  fält från äldre formulär ska inte kopieras till leveransen.
- AK-030 (K-004, K-027): En ansökan ska invänta ledarens manuella beslut om
  godkännande eller avslag och inte ge automatisk plats eller väntelisteplats.
  Inskickad ansökan får inte presenteras som en bekräftad plats.
- AK-031 (K-028): En fotbollsskola eller ett läger ska kunna visa pris och
  instruktioner för betalning utanför Förena. Ansökan och godkännande ska
  fungera utan integrerad betalning och får inte visas som betalningsbekräftelse.
- AK-032 (K-005, K-029): Lag, fotbollsskola och läger ska kunna placeras i
  en sektion och ärva dess disciplin. Klubb-/sektions-/gruppadministration
  ska följa samma områdesgränser för alla tre verksamhetstyperna.
- AK-033 (K-030): En fotbollsskola eller ett läger ska kunna få start- och
  slutdatum. Efter slutdatum ska deltagare och historik finnas kvar utan
  automatisk radering. Ordinarie lag ska fortsatt sakna säsongsuppgift.
- AK-034 (K-031): Gruppadmin ska kunna ändra sin grupps formulär och
  klubb-/sektionsadmin motsvarande inom sina områden. Konton med enbart
  publiceringsrätt eller ansökningsgranskning ska nekas formulärändring,
  liksom administratörer utanför området.
- AK-035 (K-032): Klubben ska kunna skapa frågor av samtliga fyra typer:
  kort text, längre text, enval och flerval. Sökanden ska kunna fylla i dem
  enligt typ och få begripligt fel om obligatoriskt svar saknas.
- AK-036 (K-033): Administratören ska kunna öppna/stänga formuläret manuellt
  eller med datum. Stängt formulär ska neka inskickning även från tidigare
  öppnad sida eller direkt API-anrop, utan att skapa en ansökan.
- AK-037 (K-034): Efter en formulärändring ska en tidigare inskickad
  ansökan fortfarande visa sina ursprungliga frågor, svarsalternativ och svar.
  En ny ansökan ska använda den aktuella formulärversionen.
- AK-038 (K-030, K-035): När arrangemangets slutdatum passerat ska en
  deltagares fortfarande aktiva gruppkoppling och rätt att läsa efterinformation
  inte upphöra enbart av det skälet. Efter separat avslut av gruppkopplingen
  ska medlemsbaserad åtkomst upphöra enligt medlemsreglerna utan förlorad historik.
- AK-039 (K-036): Klubbens valda logotyp, namn, profilfärger och omslagsbild
  ska användas i de gemensamma mallarna, med samma identitet för klubb,
  sektioner och grupper. En annan klubbs visuella inställningar får inte påverkas.
- AK-040 (K-037): Klubbanpassning ska inte erbjuda egen CSS eller fria
  sidlayouter. De gemensamma mallarnas navigation och tillgänglighetsregler
  ska fortsatt gälla när klubbens profilvärden används.
- AK-041 (K-007, K-038): Klubbens Förena-adress och dess anslutna egna
  domän ska visa samma klubb-/gruppinnehåll med samma klubbidentitet. En
  ansluten gruppsökväg ska lösa rätt grupp inom domänens klubb och inte kunna
  öppna en annan klubbs innehåll som om det tillhörde den aktuella klubben.
- AK-042 (K-039): Systemadmin ska kunna ansluta en egen domän/subdomän
  efter verifiering av ägarskapet. En overifierad domän ska inte aktiveras som
  klubbens adress. DNS-inställning ensam ska inte påstås dirigera enskilda sökvägar.
- AK-043 (K-040): Klubbadmin ska kunna ändra klubbens visuella profil men
  sektions-/lagadmin utan klubbadminroll ska nekas motsvarande ändring även
  via API. Ändring i en klubb får inte påverka en annan klubb.
- AK-044 (K-041): En utloggad användare som följer en skyddad direktlänk
  på klubbens adress ska efter gemensam inloggning återkomma till samma klubb
  och sida med aktuella behörigheter. Samma konto ska fungera även i den
  neutrala appen utan att ett nytt klubbkonto behöver skapas.
- AK-045 (K-007, K-042): Inloggning från en klubbadress ska inte automatiskt
  öppna den samlade flerklubbsöversikten. Först efter ett uttryckligt val ska
  användaren byta dit. En obehörig returadress ska nekas och gemensamt konto
  ska inte ge åtkomst till andra klubbars privata uppgifter.
- AK-046 (K-043): Publicering, schemalagd publicering och uppdatering av
  en nyhet ska inte automatiskt skapa mejl- eller pushutskick i första versionen.
  Den publicerade nyheten ska ändå visas på relevanta sidor och i den
  personliga översikten enligt åtkomst- och visningsreglerna.
- AK-047 (K-033, K-044): Ett nytt formulär ska neka inskickning tills det
  öppnats. Manuellt läge ska följa administratörens öppet/stängt-val. I
  datumstyrt läge ska det vara stängt före startdatum kl. 00.00 och från
  dagen efter slutdatum kl. 00.00, men öppet däremellan, enligt svensk tid.
  Byte till manuellt läge ska använda dess uttryckliga val i stället för datumregeln.
- AK-048 (K-045): Efter stängning ska en tidigare inskickad ansökan ligga
  kvar i oförändrad beslutsstatus och kunna granskas/godkännas/avslås av behörig
  ledare. Ny inskickning ska nekas utan att befintliga deltagare påverkas.
- AK-049 (K-046): Om två redaktörer/admin öppnar samma version och den ena
  sparar ska den andras äldre sparande nekas utan överskrivning och med
  bevarat utkast. Sparfel eller återkallad skrivbehörighet ska lämna hela den
  begärda ändringen osparad. Detta gäller både nyheter och formulärdefinitioner.
- AK-050 (K-012, K-047): Efter avpublicering ska nyheten inte lämnas till
  vanliga läsare genom direktlänk, listor eller nya hämtningar på någon
  berörd sida eller personlig översikt. Efter byte till medlemsnyhet ska
  motsvarande hämtningar neka obehöriga rubrik, ingress och innehåll.

## Bekräftade beslut och motiv

- 2026-10-28, svar 1: Användaren vill att klubbens plats är publikt
  tillgänglig och att klubben kan publicera nyheter och skapa ansökningsformulär.
- 2026-10-28, svar 2: Formulären ska gälla medlemsansökan till lag,
  fotbollsskola eller läger. Detta innebär ännu inget beslut om automatiskt
  deltagande, lagmedlemskap, kapacitet eller betalning för skola/läger.
- 2026-10-28, svar 3: Anmälan ska alltid godkännas av team-ledare.
  Användaren föreslog att fotbollsskola/läger kan fungera som lag och frågade
  hur egen domän och sökväg till lag kan leda till rätt plats. Gemensam
  gruppmodell och exakt domän-/ruttupplägg är ännu inte bekräftade.
- 2026-10-28, svar 4: Användaren godkände gemensam grundmodell med typerna
  lag, fotbollsskola och läger, med deltagare, ledare, aktiviteter och granskade
  ansökningar. Deltagande i ett läger ger inte medlemskap i ett ordinarie lag.
  Detta fastställer gruppmodellen från svar 3, men inte domän-/ruttupplägget.
- 2026-10-28, svar 5: Användaren preciserade målbilden med
  `www.ursvikik.se/t/f2016`: ska kunna se ut och bete sig som Ursviks webbplats,
  utan länkar till AIK. En länk till den obrandade appen kan däremot leda till
  uppgifter från flera klubbar. Exemplet anger produktbeteende, inte rätt att
  ändra den verkliga domänen. Tekniskt domänupplägg återstår.
- 2026-10-28, svar 6: Användaren godkände nyhetspublicering på klubb-,
  sektions- och lagnivå, inklusive egna nyheter på exempelvis F2016:s sida.
- 2026-10-28, svar 7: Publiceringsrätt ska kunna tilldelas separat till
  redaktörer inom klubb, sektion eller lag utan administratörsroll.
  Administratörer får publicera inom sitt område. Tränaransvar ger ingen
  automatisk publiceringsrätt.
- 2026-10-28, svar 8: Redaktören ska kunna välja publik eller endast för
  medlemmar per nyhet. Medlemsnyheter visas bara för behöriga inom vald klubb,
  sektion eller lag; rubrik och ingress ska också döljas för obehöriga.
- 2026-10-28, svar 9: Användaren godkände visning nedåt i strukturen:
  klubbnyheter på klubb-/sektions-/lagsidor, sektionsnyheter på sektionens och
  dess lags sidor och lagnyheter på egna lagets sida. Avsändaren framgår alltid
  och originalets medlemsbegränsning behålls.
- 2026-10-28, svar 10: Användaren godkände rubrik, ingress, formaterad text
  och valfri huvudbild; utkast och förhandsgranskning; direkt eller schemalagd
  publicering; samt ändring och avpublicering med ändringshistorik.
- 2026-10-28, svar 11: Användaren godkände nyheter i den neutrala personliga
  översikten från personens och barnens klubbar, sektioner och grupper, med
  tydlig avsändare, utan dubbletter vid flera barn och med bibehållen åtkomstkontroll.
- 2026-10-28, svar 12: Medlemsnyheter får läsas av aktiva medlemmar och
  behöriga vårdnadshavare samt områdets administratörer/redaktörer även utan
  medlemskap. Lagkoppling ger tillgång till lagets, sektionens och klubbens
  medlemsnyheter. Medlemsbaserad åtkomst upphör när medlemskapet avslutas;
  oberoende rättigheter behålls.
- 2026-10-28, svar 13: Klubbadmin utser/återkallar redaktörer inom klubben,
  sektions-/lagadmin inom eget område. Publiceringsrätt får tilldelas separat
  eller ingå i klubbens lagprofiler. Systemadmin behöver först bli klubbadmin
  för att publicera klubbens innehåll. Detta är en uttrycklig utökning av den
  tidigare administrationsspecens profilkatalog med publiceringsrätt.
- 2026-10-28, svar 14: Behöriga redaktörer och administratörer samarbetar
  inom sitt område, inklusive varandras utkast/nyheter och ändringshistorik.
  Utkast/förhandsgranskningar är endast tillgängliga för dem. Schemalagd
  publicering stoppas om schemaläggaren saknar publiceringsrätt vid publicering;
  annan behörig kan granska och aktivera den igen.
- 2026-10-28, svar 15: Gemensam formulärbas godkänd med namn, födelsedatum
  och kontakt-/vårdnadshavaruppgifter enligt medlemsansökan. Klubben kan lägga
  till egna frågor för en viss fotbollsskola/ett läger och välja obligatoriskt
  eller valfritt svar. Hälsouppgifter ingår inte i första versionen.
- 2026-10-28, svar 16: Ledaren bedömer platstillgång manuellt och godkänner
  eller avslår varje ansökan. Ingen automatisk platsgaranti eller väntelista.
  Fotbollsskola/läger får visa pris och betalningsinstruktioner men betalningen
  sker utanför Förena i första versionen.
- 2026-10-28, svar 17: Användaren godkände klubb → sektion →
  lag/fotbollsskola/läger, med ärvd disciplin och samma administration.
  Skola/läger kan ha arrangemangets start-/slutdatum. Deltagare och historik
  behålls efter perioden och inget raderas automatiskt.
- 2026-10-28, svar 18: Gruppadmin får anpassa formuläret, liksom klubb- och
  sektionsadmin inom sitt område. Egna frågor stöder kort/längre text,
  enval/flerval. Formulär kan öppnas/stängas manuellt eller med datum.
  Inskickade ansökningar behåller frågorna och svaren från inskickningstillfället.
- 2026-10-28, svar 19: Arrangemangets slutdatum hålls separat från
  deltagarnas gruppkoppling och åtkomst. Inget automatiskt avslut när skolan
  eller lägret tar slut. Behörig administratör avslutar kopplingarna separat
  med datum enligt medlemsreglerna, så att exempelvis efterinformation kan läsas.
- 2026-10-28, svar 20: Användaren bekräftade att logotyp, klubbnamn,
  profilfärger och omslagsbild räcker i första versionen. Gemensamma sidmallar
  och navigation används utan egen CSS/fria layouter, med samma klubbidentitet
  på sektioners och gruppers sidor.
- 2026-10-28, svar 21: Klubben har alltid en Förena-adress och får dessutom
  ansluta egen domän/subdomän med samma innehåll och identitet. Systemadmin
  ansluter efter verifierat ägarskap. Klubbadmin hanterar logotyp, färger och
  omslagsbild; sektions-/lagadmin får inte ändra klubbprofilen. Användaren
  godkände även förutsättningen att befintlig webbplats behöver vidarebefordra
  Förena-sökvägar när samma domän behålls där.
- 2026-10-28, svar 22: Samma Förena-konto används på alla klubbadresser och
  i neutral app. Central inloggning tillåts med återgång till samma klubb/sida
  och bevarad skyddad direktlänk. Ingen automatisk växling till samlad översikt;
  byte till neutral app sker genom tydligt val.
- 2026-10-28, svar 23: Användaren godkände nyhetsvisning på berörda sidor
  och i den personliga översikten utan automatiska mejl/pushutskick i första
  versionen. Framtida utskick får separat spec med mottagarval och inställningar.
- 2026-10-28, svar 24: Två öppningslägen godkända: manuellt öppet/stängt
  eller datumstyrt från startdatum kl. 00.00 till slutdatumets hela dag i svensk
  tid. Nya formulär börjar stängda och admin kan byta läge. Stängning påverkar
  inte inskickade ansökningar eller deras granskning.
- 2026-10-28, svar 25: Samma sparskydd som administrationen godkänt för
  nyheter/formulär: samtidiga ändringar stoppas med begripligt fel och bevarat
  utkast, ingen delvis sparad ändring vid sparfel. Avpublicering/byte till
  medlemsnyhet gäller alla berörda sidor/personlig översikt; direktlänkar och
  nya hämtningar kontrollerar aktuell åtkomst.

## Obekräftade antaganden och förslag

- Den neutrala appens samlade personliga översikt visar tydlig klubbavsändare
  även på aktiviteter; nyheternas avsändare är beslutad i K-017.

## Öppna frågor

- Arrangemangsperiod och gruppkopplingars giltighet är separata enligt K-035.
  Placering inom sektion är beslutad och ingen säsongsuppgift på ordinarie lag införs.
- Formulärens öppningslägen och datumgränser är beslutade i K-044–K-045.
- Inloggningens produktbeteende är beslutat i K-041–K-042. Tekniska
  domän-/hosting-/autentiseringskontrakt preciseras inför implementation.
- Formulärens basfält, verifiering, granskning, status, åtkomst och historik
  återanvänder Lagmedlemmar-specen; egna frågor kompletterar enligt K-025–K-034.
- Inga blockerande produktfrågor återstår inom den beslutade omfattningen.
  Slutlig sammanfattning och spec är bekräftade; status är Redo.

## Bekräftelse

2026-10-28: Användaren bekräftade slutlig sammanfattning och spec med ”Ja”.
Bekräftelsen omfattar K-001–K-047, AK-001–AK-050 och dokumenterade
avgränsningar. Inga blockerande produktfrågor återstår. Status är Redo.
Godkännandet gäller specen och innebär ingen beställning av implementation.

## Ändringshistorik

- 2026-10-28: Skapat utkast med bekräftade krav på publik tillgång, nyheter
  och ansökningsformulär. Skilt dessa beslut från förslag om branding och domäner.
- 2026-10-28: Sparat svar 2 och preciserat K-003/AK-003 för lagansökan,
  fotbollsskola och läger. Deltagarflöden återstår att besluta.
- 2026-10-28: Sparat svar 3–4: obligatoriskt ledargodkännande och gemensam
  grundmodell med tre typer, K-004–K-006 och AK-004–AK-006. Domänupplägget
  kvarstår som förslag inför fortsatt diskussion.
- 2026-10-28: Sparat svar 5, K-007–K-008 och AK-007–AK-008 om klubbens
  egen upplevelse utan andra klubbars innehåll och separat neutral flerklubbsapp.
- 2026-10-28: Sparat svar 6, K-009 och AK-009 om nyheter på klubb-,
  sektions- och lagnivå.
- 2026-10-28: Sparat svar 7, K-010–K-011 och AK-010–AK-011 om separat
  publiceringsrätt, redaktörer och administratörers områdesavgränsade publicering.
- 2026-10-28: Sparat svar 8, K-012 och AK-012 om vald synlighet per nyhet
  och skydd av medlemsnyheters rubrik, ingress och innehåll.
- 2026-10-28: Sparat svar 9, K-013 och AK-013–AK-014 om visning nedåt
  i klubbstrukturen med tydlig avsändare och bibehållna åtkomstgränser.
- 2026-10-28: Sparat svar 10, K-014–K-016 och AK-015–AK-017 om
  nyhetsinnehåll, utkast, förhandsgranskning, schemaläggning och avpublicering.
- 2026-10-28: Sparat svar 11, K-017 och AK-018–AK-019 om relevanta
  nyheter i neutral personlig översikt med avsändare, deduplicering och åtkomstkontroll.
- 2026-10-28: Sparat svar 12, K-018–K-019 och AK-020–AK-021 om
  medlemsnyheters läsurval och upphörande av medlemsbaserad åtkomst.
- 2026-10-28: Sparat svar 13, K-020 och AK-022–AK-023 samt preciserat
  K-010–K-011 om redaktörstilldelning, lagprofiler och systemrollens gräns.
- 2026-10-28: Sparat svar 14, K-021–K-023 och AK-024–AK-026 om
  redaktionellt samarbete, skyddade utkast och schemalagd behörighetskontroll.
- 2026-10-28: Sparat svar 15, K-024–K-026 och AK-027–AK-029 om
  gemensam ansökningsbas, kompletterande frågor och undantag för hälsouppgifter.
- 2026-10-28: Sparat svar 16, K-027–K-028 och AK-030–AK-031 om
  manuell platsbedömning, avgränsad väntelista och betalning utanför Förena.
- 2026-10-28: Sparat svar 17, K-029–K-030 och AK-032–AK-033 om
  sektionsplacering, disciplinarv, arrangemangsdatum och bevarad historik.
- 2026-10-28: Sparat svar 18, K-031–K-034 och AK-034–AK-037 om
  formulärförvaltning, frågetyper, öppning/stängning och bevarade inskickade versioner.
- 2026-10-28: Sparat svar 19, K-035 och AK-038 om separat giltighet för
  arrangemang och gruppkoppling samt fortsatt åtkomst till efterinformation.
- 2026-10-28: Sparat svar 20, K-036–K-037 och AK-039–AK-040 om
  klubbidentitet i gemensamma mallar och avgränsning mot egen CSS/fria layouter.
- 2026-10-28: Sparat svar 21, K-038–K-040 och AK-041–AK-043 om
  Förena-adress, verifierad egen domän, gruppsökvägar och klubbprofilens mandat.
- 2026-10-28: Sparat svar 22, K-041–K-042 och AK-044–AK-045 om
  gemensamt konto, central inloggning med återgång och uttryckligt byte av sammanhang.
- 2026-10-28: Sparat svar 23, K-043 och AK-046 om nyhetsflöden utan
  automatiska mejl/pushutskick och separat framtida notifieringsspec.
- 2026-10-28: Sparat svar 24, K-044–K-045 och AK-047–AK-048 om
  manuellt/datumstyrt läge, stängda nya formulär och bevarad granskning efter stängning.
- 2026-10-28: Sparat svar 25, K-046–K-047 och AK-049–AK-050 om
  sparskydd och åtkomst efter avpublicering/synlighetsbyte. Sammanställt flöden
  och beroenden inför slutlig bekräftelse; status kvarstår Utkast.
- 2026-10-28: Användaren godkände slutlig sammanfattning och spec.
  Markerat Redo med 47 krav och 50 acceptanskriterier; ingen implementation beställd.
