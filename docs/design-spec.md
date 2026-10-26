# Förena – gränssnittets designregler

## Next-appen är förlagan

Alla migrerade och nya funktioner ska följa Next-appens utseende och arbetsflöden.
Behåll sidstruktur, navigation, texter, formulär, dialoger och interaktioner.
Använd samma produktionskomponenter och samma CSS-ingång, `src/app/ui-styles.css`,
i båda apparna. Den gemensamma ingången bevarar Next-appens kaskadordning och
förhindrar att samma dialog får olika layout i Vite. En backendadapter får
anpassa transport och behörighetskontroll, men ska inte införa en egen design.

Funktioner som ännu inte har flyttats ska redovisas som återstående. En
layoutjämförelse eller en informationssida innebär inte att funktionen är färdig.
Verifiera berörda produktionsvyer i båda apparna på mobil och desktop.

## Komponentsidan är den gemensamma UI-referensen

Alla UI-element som används i systemet ska finnas representerade på `/components`.
Det gäller både grundelement och sammansatta komponenter: knappar, formulärfält,
väljare, personlistor, kort, tabeller, navigation, dialoger, notifieringar och
specialiserade vykomponenter för administration, discipliner och tillägg.

- Exemplen ska använda samma produktionskomponenter och design-token som de
  verkliga vyerna. Separata demonstrationskopior av markup eller CSS räcker inte.
- Visa relevanta varianter och tillstånd: normalt, hover, tangentbordsfokus,
  valt/delvis valt, inaktiverat, laddning, tomt, fel och lyckat resultat.
  Interaktiva komponenter ska kunna provas med syntetiska data utan skarpa utskick
  eller ändringar av verksamhetsdata.
- Nya eller ändrade UI-element ska uppdateras på komponentsidan i samma PR som
  implementationen. Ett UI-arbete är inte färdigt förrän exemplen speglar beteendet
  och utseendet som användaren möter.
- Återanvänd befintliga gemensamma komponenter i alla berörda vyer. Om ett nytt
  behov kräver en variant ska den ingå i den gemensamma komponenten och visas på
  komponentsidan; undvik lokala kopior och sidunika stilundantag.
- Kontrollera både komponentsidan och de berörda användarflödena på mobil och
  desktop, inklusive tangentbord, kontrast och att innehållet ryms inom skärmen.

Komponentsidan ska vara en aktuell, gemensam referens för hela systemet.
Dessa regler beskriver kravet; befintliga luckor i galleriet ska fyllas när de
berörda UI-delarna ändras och innebär inte att dagens galleri redan är komplett.

Den nya browserpiloten återanvänder `AppHeaderFrame`, `AppShellFrame`,
`ApplicationMenu`, `NavigationLinksView`, `AppFooter` och `ActivityInvitationResponse`. Next-appens
sidskal använder samma byggdelar. `PasswordLoginForm` och de nya pilotvarianterna
visas på `/components` i båda apparna, med lokala syntetiska data och utan
inloggning eller verksamhetsskrivningar. Menyns fokuslås, Escape och mobila
scrollås delar samma implementation. Se [frontendinstruktionen](../frontend/README.md).

Den avskilda kallelsesidan använder `AppShell` och `ActivityInvitationResponse`
utan egna meny-, header- eller footer-kopior. Kontomenyns `session`-variant
visar familjens kallelser och utloggning utan profil, administration och
notiser. Samma `AppMenuContent` visas på `/components` i ett inaktiverat
exempel som inte loggar ut den som granskar komponenterna.

Kontomenyn använder samma navigationsklass som övriga menyer. Personliga
länkar ligger på varsin rad med minst 44 px hög tryckyta, även i mobilpanelen.

## Kotlin-webbens Min översikt

Vite och Next delar `PersonalHome`, `PersonalOverview`, `TeamCalendar`,
`OverviewInvitationResponse` och `personal-overview.css`. Min översikt har
Förena · Personligt och ingressen från målbilden, Agenda/Kalender,
filterchips, Kommande aktiviteter med räknare och Mina lag och föreningar.
Behöver svar är ett av/på-filter med antal aktiviteter inom valt lag.
Efter sista svarstid gråas vanliga deltagares svarsknappar ut och kallelsen
ingår inte i Behöver svar. Verifierad `activity.manage` för aktivitetens lag
ger undantag från svarstiden, fram till aktivitetens slut. En visad rolletikett
som Ledare ger inte i sig undantag. Samma villkor används på kallelsesidan,
i agendan och i kalenderns urval; servern kontrollerar varje skrivning.
Inställda och avslutade aktiviteter kan aldrig besvaras genom undantaget.
Alla lag är förvalt; lagchips visar förening och lag och kombineras med
svarsfiltret. Varje aktivitet visas en gång i datumordning. Båda vyerna
behåller samma filter; ett tomt urval har förklarande text och tillgängliga filter.
Varje aktivitet grupperar namngivna personrader. Utan skickad kallelse visas
Ingen kallelse ännu; annars visas svar och direkta Kommer/Kan ej-knappar.
Personraderna är komprimerade med namn, status och svarsknappar på samma rad.
Förnamn används när det är unikt bland översiktens personer, annars läggs
efternamnets initial till och vid fortsatt namnkrock visas hela namnet.
Varje person räknas en gång över alla aktiviteter; samma kortnamn används i
alla filterurval och båda visningslägena. Hjälpmedel och knapparnas etiketter
behåller fullständiga namn. På mobil utelämnas den dekorativa avataren;
knapparnas sidopadding minskas men tryckytan är minst 44 × 44 px och radien
12 px. Långa namn får radbrytas. Vid mycket smalt utrymme eller förstorad text
får knapparna flytta ned för att undvika överlappning och horisontell scroll.

Ett bekräftat svar uppdaterar personraden, svarsfiltrets urval och räknare.
Aktiviteten ligger kvar i urvalet tills inga relevanta kallelser återstår;
den finns fortfarande bland alla aktiviteter. Kommentar bevaras vid snabbsvar.
Samma kallelse är låst under skrivning, andra personers
knappar förblir tillgängliga. Fel visas vid personraden. Detaljvyn visar plats,
samling, lokala tider och kallelsens kommentar, även när aktivitetsläsningen
kommer från lagmedlemskap och ingen kallelse finns.

Klientnavigering behåller dokument, header och meny. Förenings-/laggenvägarna
öppnar vyer för den personliga aktivitetsmängden. På lagets sida visas dessutom
lagets aktivitetshantering för behöriga användare. Headerns klocka öppnar kallelser som behöver svar.
AI-anslutningslänken förblir dold i Vite tills motsvarande integration finns.
Interaktiva varianter av hela startsidan finns på `/components`, med isolerade
exempeldata. Ingen demokallelse får skriva till produktions-API:t.

Lagvyn visar **Ny aktivitet** vid lagrubriken för användare
som finns i backendens lista över lag med aktivitetsbehörighet. Knappen öppnar
den befintliga aktivitetsredigeraren på samma sida med laget förvalt. Vanligt medlemskap ger
inte knappen; backend kontrollerar behörigheten på nytt när formuläret hämtas
och sparas. Varianten finns i aktivitetshanteringens exempel på `/components`.

## Personlig startsida

Användarens tre mobilbilder från 2026-10-22 är målbild även för Kotlin-webben.
[Startsidemålet](migration/personal-homepage-target.md) anger sektionernas
ordning, personrader utan kallelse, räknare, roller och konkreta acceptansfall.
Den avgränsade Kotlin-piloten ovan är inte den färdiga startsidan.

`/` är den inloggade användarens Förena-brandade **Min översikt**, utan vald
klubb. Visa Agenda/Kalender med filterchips och en gemensam aktivitetslista,
sist **Mina lag och föreningar** med användarens roller. Agenda är grundläge
på mobil; kalender är ett uttryckligt alternativ och visar samtliga familjens
aktiviteter oavsett lag, klubb eller disciplin när Alla lag är valt och svarsfiltret är av. Ett arbetsyteval begränsar aldrig
den personliga sidan. Visa även aktiviteter med nej-svar; en aktivitet förekommer
en gång med separata namn/svar för berörda familjemedlemmar.

Klubb och lag framgår på varje aktivitetsrad. Agendan och aktivitetsdialogen
visar klubbens lokala tid; familjekalendern använder uttryckligen svensk tid för
att kunna jämföra aktiviteter från klubbar i olika tidszoner. Dialogen använder
aktivitetens egen klubb och lag, inte någon tidigare vald arbetsyta. Familjen
ser alla publicerade kommande aktiviteter i egna och barnens lag, även innan
kallelser skickats. Medlemskap eller egen lagåtkomst måste omfatta aktivitetens
lokala datum. Gästkallelser och bokade arbetsuppgifter ingår också. Svar visas
först när kallelsen har skickats. Utkast, inställda och avslutade aktiviteter
ingår inte i denna kommande-vy.

**Min översikt** finns i den gemensamma inloggade menyn även på klubb-/lagsidor.
Inloggning utan uttrycklig returadress går hit; djupa länkar behåller sitt mål.
Nya konton får ett tomt läge med vägledning, inte en godtyckligt vald klubb.
Föreningslänkarna visar användarens föreningsroll även utan lagroll. En koppling
via ett barn utan eget föreningsmedlemskap märks inte med en påhittad roll.
Offline visas en statisk Förena-sida med ”Du är offline” och ”Försök igen”,
utan föregående kontos aktiviteter eller namn.
Föreningsassistenten förblir knuten till klubb/sektion/lag; en personlig
assistent över flera klubbar ingår inte i denna version.

## Grundform

Utgå från en telefon på 320–390 CSS-pixlar. Visa först det användaren behöver
göra, därefter detaljer. Samma komponent ska ha samma form och betydelse i
översikt, aktivitet, kallelse och närvaro. Större skärmar kan visa fler kolumner
utan att ändra arbetsflödet. Ingen vy får kräva horisontell sidskroll.

| Del | Regel |
| --- | --- |
| Bakgrund | Varm ljus yta `#faf9f3`; kort och dialoger `#ffffff` |
| Text | `#19231a`; sekundär `#5f6861`; primär åtgärd `#1e3f20` |
| Linjer | `#e5e0d8`, tunna och konsekventa |
| Primär knapp | Skogsgrön, vit text, 12 px radie, minst 44 px tryckyta |
| Sekundär knapp | Vit med tunn linje, mörk text, 12 px radie |
| Destruktiv åtgärd | Ljus röd yta och röd text, 12 px radie |
| Fält | Varm ljus yta, tunn linje, 12 px radie och tydligt fokus |
| Kort/dialog | 16 px radie, låg skugga; innehållet får scrolla |
| Typografi | Newsreader för huvudrubriker, Plus Jakarta Sans för gränssnitt |

### Designkälla och komponentreferenser

[DESIGN.md](../DESIGN.md) och bifogade [desktop-](../public/design/components-desktop.html)
och [mobilexempel](../public/design/components-mobile.html) är designreferenser.
PNG-bilderna finns bredvid HTML-filerna. `/components` visar produktionskomponenter
med samma tokens och länkar till referenserna. HTML-filerna bevaras och använder
externa CDN-resurser; appen använder egen CSS och lokalt paketerade typsnitt.
Referenserna får CSP-sandbox utan `allow-same-origin`, med blockerade
nätverksanrop och formulär. De får inte använda appens session eller lagring.
Mobilreferensen tillåter zoom.

Källmaterialet skiljer sig mellan YAML, löptext och HTML. Appens beslut är
bakgrund `#faf9f3` och lime `#e0eb78` från HTML, skogsgrön åtgärd `#1e3f20`,
kort 16 px och kontroller 12 px från komponentreglerna. Värden samlas som
CSS-variabler i `globals.css`. Svar får färg och text: kommer (grönt), kan inte
(rött), ej svarat (bärnsten). Gemensamma kontroller är minst 44 px höga och
närvarorader minst 48 px. Befintlig hamburger-/sidomeny och verksamhetsflöden
behålls; referensens bottennavigation och nya funktioner kräver separat beslut.


## Gemensamma menyer, header och footer

Alla sidor ska använda centrala komponenter för navigation, sidhuvud och sidfot
enligt [arkitekturen](architecture.md). Det gäller även inloggning, profil,
publika vyer och administration på förenings-, sektions-, lag- och systemnivå.
En ny sida ska inte skapa en egen meny, header eller footer genom kopierad JSX.

- **Menyer:** Använd en gemensam menykomponent och centrala menydefinitioner.
  Samma destination ska ha samma benämning och ordning i samma kontext. Markera
  aktuellt val tydligt. Mobilmenyn och desktopnavigationen ska utgå från samma
  definitioner, inte ha separata listor av länkar.
- **Header:** Använd den gemensamma headerkomponenten. Varumärke, arbetsyteval,
  menyknapp och relevanta kontoåtgärder ska placeras och fungera konsekvent.
  Systemadministrationen får ha en tydligt markerad variant men inte en egen
  fristående headerimplementation.
- **Footer:** Använd den gemensamma footerkomponenten. Återkommande länkar och
  information ska definieras centralt och visas konsekvent där de är relevanta.
  Sidfoten ska kunna radbrytas på telefon och får inte täcka innehåll eller
  åtgärdsknappar.
- **Kontext och behörighet:** Anpassa innehållet genom props eller gemensam
  konfiguration. Visa bara relevanta och tillåtna menyval. En avskalad variant
  för exempelvis inloggning ska använda samma komponenter, inte kopior.
- **Tillgänglighet:** Tangentbordsnavigation, fokus, stängning med Escape och
  eventuell scrollåsning ska hanteras i den gemensamma menykomponenten.
  Undvik dubbla headers, menyer och footers när layouter nästlas.

Vid ändringar i dessa komponenter ska berörda sidtyper kontrolleras både på
telefon och desktop, inklusive publikt läge, inloggat läge och systemadmin.
Kontrollera att navigationen är nåbar, att aktivt val och behörighetsstyrda
länkar är korrekta och att ingen horisontell sidskroll uppstår.

## Formulär och dialoger

### Flytande föreningsassistent

- Inloggade klubb-, sektions- och lagsidor använder samma pratbubbla från
  sidskalet. Utloggade och systemadministrativa sidor visar inte assistenten.
- Mobil öppnar en dialog nära full skärm; från 768 px visas en kompakt panel
  nere till höger. Safe area och tangentbordets synliga viewport respekteras.
- Rubriken visar assistentens namn, arbetsyta och aktuell sida. Samtalet
  bevaras vid minimering; ett nytt svar markeras på knappen.
- Dialogen låser bakgrundens scroll, håller tangentbordsfokus inom dialogen,
  stängs med Escape och återför fokus till knappen. Aktivitetsdialoger öppnas
  efter att assistenten minimerats, så att två dialoger inte konkurrerar.
- Konversationen scrollar; skrivfält och stängknappar förblir nåbara. Knappen
  får inte täcka sidans fasta sparåtgärder eller andra öppna dialoger.

- Dela långa formulär i namngivna delar. Aktivitetens grunduppgifter och tid
  ligger först; kallelsen är en hopfällbar del vid redigering.
- Placera kort hjälp bakom en `?` intill den uppgift den förklarar. Fältets namn,
  fel och viktig information som påverkar beslut ska alltid vara synliga.
- Håll huvudåtgärden nåbar längst ned i en lång dialog. Ge den en kort,
  handlingsbeskrivande text. Låt tangentbord, större text och fokus fungera.
- Visa en förhandsgranskning innan aktiviteter eller utskick skapas. Markera
  tydligt att ett val i formuläret inte skickas förrän användaren bekräftar.

## Personer och målgrupper

- Två listor används när personer flyttas mellan lägen: exempelvis
  **Ej närvarande / Närvarande** och **Ej valda / Valda**. Hela raden är
  tryckbar. Visa antal i rubrikerna och dela in varje lista i ledare, spelare
  och övriga roller. En tom kategori tar ingen plats.
- Visa förnamn när det är entydigt i laget, annars förnamn och efternamnets
  initial; använd hela namnet om initialen inte räcker. Hjälpmedel ska alltid
  få personens fullständiga namn.
- Schemalagda kallelser kan kombinera flera roller och undergrupper. Mottagarna
  bestäms vid utskick och dubletter tas bort. Vid **Skicka nu** väljs exakt vilka
  personer som ska få kallelsen.

Kontrollera ändrade vyer på 320, 375, 390 och 768 CSS-pixlar och i desktop.
Verifiera att `document.documentElement.scrollWidth <= innerWidth`, att
dialogen kan scrollas med touch och att bakgrunden är stilla.

## Truppen

- Medlemslistan och undergrupper är två separata vyer. Listan har sökning,
  gruppfilter. Visa ledare först, därefter spelare och sedan övriga roller som
  förekommer i truppen. Tomma rollavsnitt visas inte. Gruppval använder samma
  ordning och visar varje person en gång, även vid flera roller. Hela medlemsraden
  öppnar profilen; fullständigt namn används i medlemsadministrationen.
- Profilen samlar medlemsuppgifter, undergrupper, registrerade målsmän och barn
  som tillhör det aktuella laget. Redigering öppnas uttryckligen från profilen.
- Undergruppens personval visar två listor på större skärmar. På telefon växlar
  användaren mellan **Ej i gruppen** och **I gruppen**, med antal i båda valen.
  Sökningen filtrerar listorna utan att ändra gjorda val.
- Namn och medlemsval sparas uttryckligen med en nåbar knapp. Borttagning av en
  grupp kräver bekräftelse och påverkar inte personernas medlemskap i laget.
- Vyerna använder `roster.manage`. Ledarnas funktioner visas från lagets ansvar;
  namnredigering ändrar inte roller eller ansvar.

React/Kotlin-vyn `/teams/{id}/members` delar `TeamRosterWorkspace`, medlemslista
och gruppredigerare med Next-appen. Lagvyn och den gemensamma menyn visar Truppen
för serververifierad `roster.manage`. `/components` i båda apparna har samma
interaktiva truppexempel med profil, redigering, dubbla roller, gruppval, tomt
underlag, laddning, sparande, fel och nekad behörighet. Ett sparfel behåller
namn och gjorda personval. Gamla gruppversioner avvisas; användaren hämtar
senaste versionen genom att uppdatera sidan. Kotlin har ännu inte Next-appens
disciplinfält eller e-postinbjudningar i profilen.

## Kompakta aktivitetsvyer och komponentreferens

- Aktivitetsdetaljer visas i en kort sammanfattning med datum, tid, samling och
  plats. Serietillhörighet är en liten markering.
- Bemanning visas som rader med kortnamn och svar, ledare först och därefter
  spelare. Grupprubriker visar antal kallade och antal som kommer.
- Teknisk aktivitetshistorik visas inte i den vanliga aktivitetsdialogen.
  Händelser behålls i databasen för spårbarhet och felsökning. Leveransstatus
  finns kvar i en hopfällbar del.
- Formulärdelar skiljs åt med tunna linjer. Datum och tid har innehållsanpassad
  bredd; kontroller ska ha minst 44 px höjd och rymmas även i Safari på iOS.
- På lagets sidor finns hela menyn i vänsterspalten från 768 CSS-pixlar
  (dator och iPad). Under 768 pixlar används endast hamburgermenyn.
  Arbetsyteval, konto och lagnavigation kommer från samma komponent i båda lägen.
- [Komponentsidan](/components) visar interaktiva exempel med syntetiska data.
  Aktivitetsdialogerna återanvänder produktionskomponenterna i skrivskyddat
  demoläge så att exempel inte kan skapa aktiviteter eller utskick.

## Aktivitetsinställningar

System, klubb, sektion och lag använder samma formulär för standardvärden.
Visa ärvt värde och källa per fält. Listvalet ”Ärv från överordnad nivå”
innebär arv och en tom påminnelselista är ett avstängningsval. Redigera typer i hopfällbara
rader och samla nivåval i en radbrytande navigation. Aktivitetens typval ändrar
bara orörda nya fält. Förhandsgranskningen visar tider i föreningens tidszon.
Kallelsemottagare och utskicksläge väljs alltid uttryckligen av ledaren.

Alla absoluta datum- och tidsval använder de gemensamma komponenterna nedan. Tidsreglagen bevarar minutprecision; äldre separata femminuterslistor används inte.

Relativa tider väljs från listor med svenska texter, exempelvis ”6 dagar innan”.
Uttryck som `start-6d` är interna värden och visas inte i kontroller eller hjälptexter.
Påminnelser har ett listval per rad, borttagningsknapp och ”Lägg till påminnelse”.
Visa tydligt att påminnelser räknas före sista svarstid, övriga tider före start.
Administratörer anpassar listorna med antal, enhet och valfri dagens början;
listorna ärvs separat från förvalen. Äldre/egna val utanför listan visas läsbart
som nuvarande värde och bevaras tills användaren väljer en annan tid.

Aktivitetsdialogens listor filtreras mot verkliga tidpunkter i föreningens tidszon:
kallelse före vald svarstid, svarstid efter kallelse och senast vid start,
påminnelser strikt mellan kallelse och svarstid utan sammanfallande tider.
Kontrollen gäller samtliga serietillfällen, även över sommar-/vintertid.
Ett redan valt värde som blir ogiltigt behålls, markeras och måste ändras eller
tas bort före sparande. Datum, tid och serieval räknar om listorna direkt.
Ogiltig/ofullständig period blockerar tidsvalen tills den rättats.
Listkonfiguration nekar nollförskjutning för kallelse/påminnelse utan dagens
början. Förval från äldre data ändras inte; full schemavalidering finns kvar.
Nollförskjutning med dagens början visas som ”Vid början av aktivitetsdagen”
respektive ”Vid början av dagen för sista svarstid”.


## Deltagare och arbetsuppgifter

Aktivitetsdialogens deltagarval har namnsökning inom klubben (minst två tecken,
högst 30 träffar), fullständiga namn och aktuella lag för att skilja personer åt.
Valda personer ligger kvar när sökningen ändras. Spelare föreslås som spelare;
övriga kräver uttryckligt rollval. Kallelse och ledaranmälan har var sin tydlig
förhandsgranskning. Redan kallade döljs och dubbleringar nekas på servern.
Arbetsuppgifter visas för alla lagaktiviteter, med separat markering för
utfört arbete, och visas för familjen i den personliga kallelsen.
En tom uppgiftspanel visas bara för behörig hanterare. Assistentens massförslag
visar exakt aktivitetslista med datum, tid, import/hemma-markering, kapacitet och
vilka uppgifter som redan finns. Spara uppgifter och Avvisa är separata knappar;
varken modelltext eller ja i chatten sparar. Kortet radbryts på telefon och
anger att tidskopplingen gäller hela aktiviteten, inte framtida importer.

Bemanningsschema visar uppgifter som rader med tid/deadline och lediga platser.
Familjer väljer barn före bokning och granskar varje ändring. Andra familjer
visas som ”Bokad av annan familj”. Väntande förslag visas utan att ersätta den
nuvarande tilldelningen. Ledaren använder samma vy med tilldelning, genomförande,
schemagenerering och självserviceregler. Alla kontroller radbryts på telefon.

Bemanningsschemats redigering, uppgiftstyper och fördelningsförslag ligger i
hopfällbara avsnitt. Fördelningsförslag visar period, registrerat underlag och
motivering per spelare, och kan justeras före gemensam förhandsgranskning.
Förhandsgranskningen anger när familjer notifieras. Tilldelningsförslag visas
i en tabell per datum med tid, uppgift och spelare (med platsnummer). Samma dag
visas bara klockslagen i raderna; vid dygnsbyte visas båda datumen. Namn och
kolumner radbryts utan horisontell sidskroll. Gamla statusmeddelanden rensas
när en ny ändring granskas eller sparas; hämtat schema betyder inte sparat förslag.
Genomförd historik visas som låst, och ändrade platsrevisioner kräver uppdatering före nytt försök.

### Familjens lagvy

- **För mig** visar bara aktiviteter där personen har en skickad kallelse eller
  en bokad arbetsuppgift. Lagmedlemskap räcker inte för att visa lagets nästa
  aktivitet; en familjemedlems kallelse gör inte andra personer kallade.
- Familjens kallelser och bokade arbetsuppgifter samlas i en rad per aktivitet.
  Visa lag, aktivitet och tid en gång samt namn och svarstatus för varje berörd
  person med ”Kommer”/”Kan ej” direkt på översikten. Räknaren visar antalet
  aktiviteter. Klick på aktivitetsrubriken öppnar den gemensamma dialogen för
  detaljer och kommentarer. Svarsknapparna är separata från rubrikens knapp.


- Lagets publika sida ska fungera även utloggad och ha en synlig inloggningslänk
  som återvänder till samma lag. Kontobyte laddar om sidan utan föregående kontos
  klientcache.
- Truppen öppnar en sökbar kontaktlista för lagets medlemmar och målsmän;
  administration kräver fortsatt `roster.manage`.
- Närvaro nås per aktivitet, inte från huvudmenyn.
- Ett enda möjligt barn visas som text i platsbokningen. Flera val ger en lista.
- Hämta senaste schemat visar laddning, klart eller fel. En tilldelning visas
  som **Bokad arbetsuppgift** i För mig. Ändringar görs i uppgiftsschemat, inte
  genom ett separat Kommer/Kan inte-svar.


### Kallelser i nya serier

Vid skapande av en serie visar kallelsedelen att passerade utskickstider innebär
utskick direkt när serien sparas. Förhandsgranskningen visar ”Direkt vid sparande”
för dessa tillfällen och endast kommande påminnelser. En passerad sista svarstid
är fortsatt ett fel som kräver ett nytt val.

### Assistentens historikresultat

Historiksvar visar period, lag, unika personer och registrerade deltagartillfällen.
Kallelsesvar visar i stället källag, mottagarlag, unika spelare och kallelsetillfällen.
Aktivitetsnamn som nämns i svaret är klickbara och öppnar samma dialog.
Om inga aktivitetsnamn länkas i svaret visas högst fem daterade aktivitetslänkar.
Ingen separat hopfällbar aktivitetslista visas.
Saknad närvarorapport visas uttryckligen och betyder inte frånvaro. En begränsad
personlista påverkar inte databasens fullständiga summering. För mig och För laget
är öppna från början och kan fällas ihop med tangentbord eller tryck på rubriken.

Aktivitetsnamn i assistentens historik är tangentbordsåtkomliga knappar med
minst 44 pixlars tryckyta. Klick öppnar den befintliga aktivitetsdialogen på
samma sida. Under hämtningen visas laddningsstatus och vid nekad åtkomst ett
begripligt fel. Stängning återför fokus till aktivitetsknappen.
Dialogen monteras utanför chattens DOM-underträd så att den ljusa dialogytan
behåller vanliga textfärger och inte begränsas av meddelandelistans scrollområde.
Historikens knappar, sekundärtext och fokusmarkeringar ärver sin omgivnings
textfärg och fungerar även på assistentens mörka bakgrund. Chattbubblornas
textregler gäller endast själva meddelandet, inte nästlade kort eller dialoger.

### Tomt lag och enhetlig navigation

Ett lag utan kommande aktiviteter visar lagöversikten med ett tydligt tomt läge.
Assistenten och ”Ny aktivitet” (för användare med `activity.manage`) finns kvar.
Tidigare aktiviteter med saknad närvaro och öppna uppgifter visas fortfarande.

Alla sidtyper delar `AppShell`: vänstermeny från 768 pixlar och endast
hamburgermeny på telefon. Publika sidor ska inte ha en extra egen vänstermeny.
Sidfoten kommer från rotlayouten och ligger efter innehållet utan att täcka det.
Aktuell sida markeras i gemensamma menykomponenter och administrativa länkar
visas utifrån verifierad åtkomst.

### Medlemsansökans e-postverifiering

Efter inskick visar sidan ”Inväntar e-postverifiering”, att ansökan är sparad,
vilken målsman som ska bekräfta och att länken gäller i 24 timmar. Ett misslyckat
utskick visar ett begripligt fel och omskick utan att uppgifterna behöver fyllas
i igen. Formuläret för omskick kräver målsman 1:s adress och anger utskicksgränsen.
Verifieringslänken öppnar en publik sida med en tydlig bekräftelseknapp och
möjlighet till omskick även när länken gått ut. Samtliga sidor återanvänder AppShell.
Kansliets kort visar tekniska ansökningsuppgifter under ”Ansökningsinformation”;
tider visas i föreningens tidszon. Äldre ansökningar visar att verifiering saknas.

### Uttrycklig redigering och flera uppgifter

Schemat öppnas i visningsläge. **Redigera arbetsuppgifter** visar skapande,
uppgiftsredigering, uppgiftstyper och självserviceregler. Bokning, tilldelning
och genomförandemarkering fungerar även i visningsläge. Ändringar granskas
och sparas separat; att avsluta redigeringen sparar inga formulärutkast.

Förhandsgranskning av genererade pass visar varje intervall, antal platser och
instruktioner före sparande. I redigeringsläget kan ledaren markera flera
uppgifter eller **Markera alla** och **Ta bort markerade**, högst 100 åt gången.
En gemensam förhandsgranskning visar uppgifterna och antalet bokningar som
frigörs. Borttagningen är atomär: en ändrad revision eller ett genomförande
stoppar hela urvalet. Genomförda uppgifter kan inte markeras. Historik och
audit behålls, berörda ändringsförslag stängs och avbokningsnotisen köas en
gång per mottagare för urvalet. Förslag kan dessutom få egna utgångsnotiser.

Uppgiftsserier visas i redigeringsläget med namn och antal pass samt
**Redigera hela uppgiftsserien** och **Ta bort hela uppgiftsserien**.
Skapande och helserieredigering återanvänder samma formulär för period,
passlängd, platser och gemensamma instruktioner. Vid serieredigering visas
befintliga bokningar med tidigare och nya tider i förhandsgranskningen.
**Redigera enskilt pass** skiljs uttryckligen från hela serien. Ett genomfört
pass låser hela serien. Datum- och nummerfält ryms inom kolumner som radbryts
på telefon.

Avslutade aktivitetsdialoger visar uppgifter, kallelsesvar och arbetsbokningar i läsläge. Läsläget börjar efter sluttiden, inte starttiden. Behöriga ledare kan fortfarande justera närvaro; historikdialogen använder behörigheten för aktivitetens eget lag.

Assistentens aktivitetsnamn är klickbara direkt i svaret. Den separata expanderbara aktivitetslistan är borttagen. Om svaret inte nämner aktiviteter visas högst fem daterade aktivitetslänkar som en mening i svaret. Dubbla titlar identifieras med datum i länken.

## Disciplinfält och tillägg

Disciplinens ordinarie fält integreras i befintliga vyer med vanliga rubriker
och formulär, exempelvis Matchförval, Spelaruppgifter och Matchuppgifter.
Tekniska scheman och paketversioner hör till administrationens paketöversikt.
Framtida plugins visas däremot som namngivna tillägg i avgränsade paneler/flikar.
Konflikter vid sparande behåller utkastet; omladdning av servervärden är ett
uttryckligt val. Spelarväljare visar bara serverns tillåtna urval.


Disciplinformulär ägs av respektive paketkatalog och bäddas in via den gemensamma `DisciplineFields`-komponenten. De använder samma native formulärutseende och responsiva `discipline-*`-klasser; ingen extra pluginpanel införs.

## Sidskisser: befintliga arbetsflöden

Skisserna i `stitch_f_rena (2).zip` styr layouten för familjens översikt,
aktivitetsredigering, närvaro och bemanningsscheman. [Mappningen](design-sketches.md)
anger vad som används. `workflows.css` innehåller dessa avgränsade sidstilar och
återanvänder tokens från `globals.css`. Inga skisspecifika verksamhetsregler
eller externa scripts läggs till i produktionskomponenterna.

- Familjens översikt visar ett kort per aktivitet, med klubb/lag och separata
  svar per familjemedlem. Ej svarat får bärnstensmarkering. Kortet öppnar samma
  aktivitetsdialog som tidigare. Varje kallad person har en egen rad med
  ”Kommer” och ”Kan ej”. Rubriken öppnar detaljer; svarsknapparna öppnar ingen
  dialog. Samma kort används i lagets ”För mig” och familjens översikt.
  ”Behöver svar” visar alla berörda personer för aktiviteten, även redan svarande.
  Snabbsvar behåller kommentarer och visar väntande/fel per person.
  Inställda/avslutade aktiviteter och demoläge är skrivskyddade.
- Aktivitetsredigeraren har kort för detaljer, tid/samling och kallelse.
  Den kompletterande skissen i `stitch_f_rena (4).zip` används för en staplad
  kortlayout på både mobil och desktop: konfigurerade aktivitetstyper som knappar,
  kompakt veckoremsa, start/slut med femtonminutersreglage, passlängd och samlingsval.
  Veckovyn har veckonavigering, tangentbordsnavigation och direkt datuminmatning
  som alternativ. Alla sju dagar ryms i innehållsbredden. Samma dag och Flerdagars
  väljs med flikar ovanför kalendern. Flerdagars har en månadskalender där första
  klicket väljer start, andra klicket slut och ett tredje påbörjar ett nytt intervall.
  Omvänd ordning sorteras. Intervallet får ett sammanhängande grönt band,
  med samma runda mörkgröna ändpunkter och vita siffror som veckovyn. Flerdagars visar inga extra
  längd-/tidsstapelsummeringar. Uppgifters datum och tider använder samma
  `DateTimeRangeFields`, även för deadline. Förvalsursprung visas inte som ledtext.
  Längd anges genom start-/sluttid och snabbval; serier behåller konfigurerade
  längdval. Samling använder snabbval inklusive befintligt eget värde.
  Avsnittet Annan längd eller samling är borttaget. Befintliga minutvärden,
  slutdatum, tidszoner, serieval och förhandsgranskning bevaras.
- Närvaro visar faktiska antal, sökning och en filtrerbar enkolumnslista på
  mobil och desktop. Samma `PersonSelectionList` används för Skicka nu:
  spelare och ledare grupperas i en lista med gröna kryssrutor för valda personer.
  Sökning/filtrering ändrar
  aldrig urvalet eller antalet sparade personer; båda layouter delar urval.
- Bemanning visar kapacitet från registrerade platser och ett kort per uppgift.
  Skapa uppgift använder en enda ram med linjerade rubriker och fält, utan
  extra inre kort. Enskild redigering i ett uppgiftskort har ingen egen ram.
  Datumväljare och native datumfält ska krympa inom samma innehållsbredd.
  Egna bokningar markeras och byte/ersättare öppnas i ”Hantera ditt pass”. Andra
  familjer förblir anonymiserade. Ledarverktyg, skapa/ändra uppgifter och regler
  hålls i hopfällbara avsnitt. Samtliga skrivningar behåller förhandsgranskning.

Tidsmoduler har kompakta minus/plus-knappar som ändrar tiden med 15 minuter. Klockslaget är ett native tidsfält med minutprecision, även för uppgifter.

I tomt schema visas skapandet, men inte rättvis fördelning eller självserviceregler.
Fördelning visas endast med lediga, ej genomförda platser; spelarhistorik ligger
som underlag i samma avsnitt. Självservice använder `DateTimeRangeFields`.
Lagets återanvändbara uppgiftstyper hanteras intill uppgiftstypvalet vid skapande,
med tydlig information om att katalogen gäller hela laget. Arv från klubb och
sektion är ännu inte implementerat.

## Klubbadministration och onboarding

Systemets Klubb-sida har sökning, sidindelning och ett separat Skapa klubb-avsnitt.
Klubb och sektioner hanteras i samma formulärkomponent på plattforms- och
klubbnivå. Rubriker och fält staplas inom en innehållskolumn på telefon.
Sektionsrader visar antal lag och behåller sin adress vid namnbyte. Borttagning
kräver bekräftelse; sista sektionen och sektioner med lag har inaktiverad knapp.
Databasen kontrollerar dessutom sparade kopplingar.

Klubbskapandet har tre tydliga steg: Klubb, Första sektionen, Granska.
Adressnamn föreslås från klubbens namn och kan ändras. Sektionens namn föreslås
från vald disciplin. Ett första lag är ett uttryckligt tillval. Granskningen
visar hela strukturen innan den sparas. Bakåtnavigering och valideringsfel
bevarar utkastet. Inga förifyllda testklubbar eller exempelaktiviteter skapas.

Ogiltiga klubb- eller sektionsreferenser i administrationsformulär ger ett
begripligt fel och en återgång till en giltig vy. Klubbfel visas i klubböversikten
för systemadministratörer eller på Min översikt för klubbadministratörer.
Sektionsfel visas i den aktuella klubbens administration. Be användaren öppna
administrationen eller välja sektionen på nytt; visa inga råa valideringsfel.

Adressnamn (slug) redigeras vid både klubbskapande och administration, med
fördröjd tillgänglighetskontroll, tydlig adressförhandsvisning och meddelanden
för upptaget namn och kontrollfel. Bokstäver normaliseras till gemener. Vid
ändring visas att äldre länkar behöver uppdateras. Tidszon väljs i en gemensam
dropdown med IANA-zoner, Sverige först och befintligt värde bevarat.
Disciplinens kategori väljs ur en administrerbar lista på disciplinsidan.
Kategorins syfte förklaras som gruppering; kodägda disciplinpaket visas fortsatt
skrivskyddade. Använda kategorier har inaktiverad borttagningsknapp.

Disciplinvalet för befintliga sektioner är inaktiverat när sektionen har lag,
sparade disciplinförval eller sektionsminnen. Fältet visar orsaken och skickar
den befintliga disciplinen dolt så att namnbyte fortfarande fungerar. Tomma
sektioner behåller ett aktivt disciplinval.

Spara sektion är formulärets primära åtgärd och använder den gröna primärknappen.

### Ny appversion

En gemensam diskret notifiering under sidhuvudet visar ”En ny version av Förena finns.”
och knappen ”Ladda om”, även i hemskärmsappen. Den radbryts på små skärmar,
respekterar safe area och ligger under dialoger. Texten annonseras som status
utan att flytta fokus. Användaren väljer när sidan laddas om; pågående formulär
avbryts inte automatiskt. Klick gör en full omladdning av aktuell adress.

Systemets klubbsida visar klubbadministratörer och inbjudningar. Knappen
Gör mig till klubbadministratör möjliggör första administratören i en tom
klubb. Inbjudningar visar väntande, utgångna och misslyckade utskick och kan
avbrytas. Borttagning av administratörsroll kräver bekräftelse och behåller
medlemskap; när sista administratören tas bort förklaras det i bekräftelsen.
Mottagaren ser klubbnamn och inloggat konto innan inbjudan accepteras.

Assistentknappen och båda menyerna använder samma inloggningsvillkor. En
inloggad användare ser assistenten även i en publik klubböversikt; detta ger
ingen extra åtkomst till klubbens data. Serverns behörighetskontroller gäller.

## Gemensamma datum- och tidsväljare

- `ActivityDatePicker`: enbart datum, med veckovy. Använd även för födelsedatum,
  seriens slutdatum och historikfilter. Direktinmatningen öppnas för tomma värden
  och bevarar obligatoriska fält och min-/maxgränser. Valfria datum kan tömmas;
  obligatoriska aktivitets- och uppgiftsdatum behåller sitt val vid tömningsförsök.
- `DateTimeRangeFields`: tidpunkt med veckovy och ett tidsreglage, utan flikar;
  intervall med Samma dag/Flerdagars ovanför kalendern och två tidsreglage.
- `ActivityRangeCalendar`: sammanhängande intervallband mellan två val. Bandet
  fortsätter på nästa veckorad och mellan månader. Färgen är `--calendar-range`
  (`#a8c89d`) med text `--on-calendar-range` (`#18371b`).
- `ActivityTimeStepper`: enbart klockslag, med ±15 minuter och direktinmatning
  av exakt tid. Ingen avrundning av befintliga minuter.
- Ingen synlig datumupprepning under kalendern och inga Start/Slut-etiketter
  på dagarna. Hjälpmedel får datum, ändpunkter och nästa val via tillgänglighetsnamn.
- Flikarnas hover använder grön bakgrund och vit text tillsammans.
- `/components#date-time-components` visar alla fyra varianter med appens
  verkliga komponenter. Delad kalender-/tids-CSS ligger i `date-time.css`;
  färgtokens ligger fortsatt i `globals.css`.

## Snabbval i personlistor

Komponentsidan visar `PersonSelectionList` med Alla, rollgrupper och namngivna
undergrupper. Snabbval lägger till gruppens personer; om alla redan är valda
avmarkeras gruppen. Övriga val bevaras. Delvis valda grupper visar antal och
ett mellanläge. Undergrupper kan överlappa och innehålla flera roller; varje
person väljs bara en gång. Knapparna radbryts på mobil.

## Hantera lag i sektion

Varje sektion i klubb- och systemadministrationen har länken **Hantera lag**,
även om den saknar lag. Sektionens översikt visar samma länk endast efter
serverkontrollerad behörighet. Lagformulären staplas i en kolumn med tunna
avdelare, gröna **Spara lag**/**Lägg till lag** och separat röd borttagning.
Namn och valfri säsong redigeras, medan lagets befintliga adress behålls.
Disciplinen visas som sektionens gemensamma värde. Tomt läge leder direkt
till skapaformuläret. Borttagning kräver bekräftelse och är inaktiverad med
förklaring om medlemmar eller sparat underlag finns. Serverfel och lyckat
sparande visas i aktuell sektion. Produktionskomponenten visas på
`/components#section-team-components` med tomt, ändringsbart och
borttagningsskyddat läge samt lokala interaktioner utan verksamhetsskrivningar.

## Telegram i profilen

Privat Telegram-koppling visas som egen samtyckessektion i Min profil, med
en aktiveringsknapp, automatisk statuskontroll och bortkoppling. Lag- och ledarchattar har lagval och
separat chattval; endast lag med serverkontrollerad truppbehörighet visas.
Gruppkoppling kräver uttrycklig bekräftelse, och den kortlivade länken öppnar
Telegrams gruppval. Samma produktionskomponenter och laddning, väntan, fel,
ej konfigurerat och aktiva tillstånd visas på `/components`.


### Telegram-meddelanden

Botmeddelanden följer samma svarsfärger och tydliga hierarki som appen:
barnets namn i rubriken, grupperade aktivitetsuppgifter och ett namngivet
sparat svar. Vald Kommer-knapp har grön `success`-stil och ✅; vald Kan inte
har röd `danger`-stil och ❌. Texten är alltid begriplig utan färg. Telegrams
klient bestämmer typsnitt, hörnradier och exakta färgnyanser. Disciplinen får
anpassa ikon och rubrik utan att ändra svarens betydelse eller personkoppling.

Botens kopplingshjälp leder till profilens befintliga samtyckessektion utan att
välja ett Telegram-konto. **Aktivera Telegram** har en kort samtyckestext
kopplad med `aria-describedby`; klicket lämnar samtycke och öppnar den
personliga startlänken direkt i samma flik. Användaren trycker sedan Start
i sin egen Telegram-chatt. Ingen separat kryssruta eller manuell
statusknapp ingår i normalflödet. **Öppna Telegram igen** är en sekundär
reservlänk om öppningen misslyckas. Profilen uppdaterar status automatiskt och erbjuder
möjlighet att försöka igen vid nätverksproblem. När länken går ut återgår profilen
till aktiveringsknappen och en ny länk utan omladdning. Utgången länk visas också i
`/components#telegram-example` tillsammans med övriga profiltillstånd.

## Administration och aktivitetshantering i React/Kotlin

`/administration` använder gemensam AppShell, klubbskapandets tre steg, ClubSlugInput, TimeZoneSelect och SectionTeamAdministration. Övergången till Granska sparar aldrig data; först Skapa klubb skickar kommandot, exakt en gång per bekräftelse. Rolltilldelning och återkallning visar konto och kräver uttrycklig bekräftelse. Lagrollens giltighet använder den gemensamma datumväljaren.

Lagets sida (`/teams/:id`) visar **Ny aktivitet** vid sidrubriken för användare som finns i serverns lista över hanterbara lag. Aktiviteter visas i de gemensamma aktivitetskorten och kalendern, utan en extra administrationslista. **Redigera** finns i öppnade aktivitetsdetaljer, med kallelseval även vid redigering. Skapandet erbjuder **En aktivitet** och **Aktivitetsserie** med veckodagar, slutdatum och förhandsgranskning. Laget är låst till sidans kontext; ingen lagväljare visas. Den personliga översikten har ingen global ingång för att skapa aktiviteter. Den äldre direktlänken `/activities/manage` finns kvar för kompatibilitet. Aktivitetshanteringen återanvänder ActivityEditorModal med kontobunden transport och uppdaterar listan utan dokumentomladdning. Inställning heter Ställ in och bevarar svar/historik. Dialogen återställer fokus och stöder Escape och avgränsad tangentbordsnavigation. Kallelser till direkt valda personer visas i appen; gränssnittet förklarar att externa meddelanden ännu inte levereras.

Komponentsidan visar samma administrations- och aktivitetskomponenter med lokala exempel för bootstrap, behörighet, formulär, laddning, tomma lägen och fel. Ingen verksamhetsskrivning görs av galleriet.

### Administration enligt Next-förlagan

`/system` använder samma `SystemAdministrationHome` i båda apparna. Menyns
systemlänkar, ordning och aktuell-sida-markering kommer från samma lista.
`ApplicationMenu` samlar gemensam menystruktur; endast serverkontrollerade
roller får administrativa länkar. Personlig navigation och konto har samma
separata avsnitt som i Next, med minst 44 px hög tryckyta.

Klubbar har sökning, sidindelning och Skapa klubb. Klubbdetaljer återanvänder
`ClubStructureAdministration`, med samma sektioner, fält, disciplinlås och
borttagningsskydd som Next för de funktioner backend stöder. Lag hanteras på
en separat sida via **Hantera lag**, inte som formulär under varje sektion.
Kataloger och minnen har ännu ingen Kotlin-hantering; deras informationssidor
säger detta tydligt och innehåller inga skenbara redigeringsverktyg.

`ui-parity-browser.mjs` jämför verkliga produktionskomponenter i båda apparna,
med exakt CSS och relativ geometri för samtliga element. Bildjämförelsen tillåter
endast avrundning med högst ett RGB-steg i högst 0,1 procent av pixlarna;
opacitet och bildmått måste vara identiska. Även en ensam större färgskillnad
eller en utbredd färgförskjutning stoppar kontrollen.
Next-utvecklingsindikatorn räknas inte som produktgränssnitt. Galleriet visar
samma systemmeny, översikt och administrativa navigering med lokala exempel.

### Aktivitetsdetaljernas navigering och redigering

Till min översikt använder den gemensamma `OverviewBackLink` med vänsterpil,
projektets gröna färg, fokusram och minst 44 px tryckyta ovanför sidrubriken.
Aktivitetens redigeringsåtgärd ligger i en egen rad i kortets övre vänstra hörn.
`ActivityEditButton` visar en pennikon med hjälpmedelsetikett och tooltip,
minst 44 × 44 px tryckyta och befintlig behörighetskontroll. Den ska inte
bryta aktivitetens löpande uppgifter. Båda elementen visas på `/components`.

## Kalender med historik och personurval

Kalenderalternativet i Min översikt hämtar en månad i taget, inklusive historiska
och inställda aktiviteter. Agenda behåller sitt kommande tidsurval. Person- och
lagchips stöder flerval och ”Alla”; eget urval heter ”Mina aktiviteter”.
Personfiltret visas när en barnrelation finns och fler än en person kan väljas;
lagfiltret visas vid flera relevanta lag och följer personvalet. Samma filter
används i båda vyerna. Senaste person-/lagval sparas per konto och enhet.
”Behöver svar” är av vid öppning och döljer avslutade/inställda aktiviteter när
filtret aktiveras.

Kalendern öppnas på dagens svenska datum, markerat med en inre ram och
`aria-current="date"`. ”I dag” återför till aktuell månad. Gemensamma aktiviteter
har en post med separat personrad: Deltog, Deltog inte eller Deltagande okänt.
Text kompletterar färg. Kommande aktiviteter är neutrala och inställda visar
Inställd utan närvaromarkering. Laddning, fel med Försök igen och lyckad tom
månad är olika tillstånd. Det gemensamma exemplet på `/components` visar dessa
varianter i både Next och Vite.

Aktivitetsredigeraren erbjuder Ställ in och, när servern bekräftat att inga
kallelser skickats, Ta bort. Reglerna tillämpas även på servern. Befintlig
närvaroregistrering återanvänds; kalendervyn har inga egna registreringskontroller.

På smala skärmar visar familjekalendern månadens dagar som läsbara dagsrader
med veckodag och aktivitetskort. På desktop används sjudagarsrutnätet.
Personnamn och närvarotext ska kunna läsas utan att brytas till enstaka bokstäver.
