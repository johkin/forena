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
