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
