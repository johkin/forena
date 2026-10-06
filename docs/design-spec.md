# Förena – gränssnittets designregler

## Grundform

Utgå från en telefon på 320–390 CSS-pixlar. Visa först det användaren behöver
göra, därefter detaljer. Samma komponent ska ha samma form och betydelse i
översikt, aktivitet, kallelse och närvaro. Större skärmar kan visa fler kolumner
utan att ändra arbetsflödet. Ingen vy får kräva horisontell sidskroll.

| Del | Regel |
| --- | --- |
| Bakgrund | Varm ljus yta `#f7f5ed`; kort och dialoger `#fffefa` |
| Text | Mörk grön `#173f35`; sekundär text `#557069` |
| Linjer | `#dfe4df`, tunna och konsekventa |
| Primär knapp | Fylld mörkgrön, vit text, 10 px hörnradie |
| Sekundär knapp | Vit med tunn linje, mörkgrön text, 10 px hörnradie |
| Destruktiv åtgärd | Ljus röd yta och röd text, samma 10 px hörnradie; separat från primär åtgärd |
| Fält | Vit yta, tunn linje, minst 9–10 px hörnradie och tydlig fokusmarkering |
| Kort/dialog | 14–18 px hörnradie; dialogens innehåll får scrolla utan att bakgrunden rör sig |

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

Tidsval använder den gemensamma `FiveMinuteTimeField`: timmar 00–23 och minuter
00, 05, 10 … 55. Samma kontroll visas på komponentsidan. Befintliga tider och
utkast mellan femminutersstegen bevaras tills användaren ändrar minutvalet.

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
Arbetsuppgifter visas hopfällbart för arbetspass, med separat markering för
utfört arbete, och visas för familjen i den personliga kallelsen.

Bemanningsschema visar uppgifter som rader med tid/deadline och lediga platser.
Familjer väljer barn före bokning och granskar varje ändring. Andra familjer
visas som ”Bokad av annan familj”. Väntande förslag visas utan att ersätta den
nuvarande tilldelningen. Ledaren använder samma vy med tilldelning, genomförande,
schemagenerering och självserviceregler. Alla kontroller radbryts på telefon.

Bemanningsschemats redigering, uppgiftstyper och fördelningsförslag ligger i
hopfällbara avsnitt. Fördelningsförslag visar period, registrerat underlag och
motivering per spelare, och kan justeras före gemensam förhandsgranskning.
Förhandsgranskningen anger när familjer notifieras. Genomförd historik visas
som låst, och ändrade platsrevisioner kräver uppdatering före nytt försök.

### Familjens lagvy

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


### Assistentens historikresultat

Historiksvar visar period, lag, unika personer och registrerade deltagartillfällen.
Aktiviteter visas i en hopfällbar lista med datum, tid och registrerat antal.
Saknad närvarorapport visas uttryckligen och betyder inte frånvaro. En begränsad
personlista påverkar inte databasens fullständiga summering. För mig och För laget
är öppna från början och kan fällas ihop med tangentbord eller tryck på rubriken.

### Tomt lag och enhetlig navigation

Ett lag utan kommande aktiviteter visar lagöversikten med ett tydligt tomt läge.
Assistenten och ”Ny aktivitet” (för användare med `activity.manage`) finns kvar.
Tidigare aktiviteter med saknad närvaro och öppna uppgifter visas fortfarande.

Alla sidtyper delar `AppShell`: vänstermeny från 768 pixlar och endast
hamburgermeny på telefon. Publika sidor ska inte ha en extra egen vänstermeny.
Sidfoten kommer från rotlayouten och ligger efter innehållet utan att täcka det.
Aktuell sida markeras i gemensamma menykomponenter och administrativa länkar
visas utifrån verifierad åtkomst.
