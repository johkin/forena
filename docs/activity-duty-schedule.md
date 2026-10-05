# Arbetsuppgifter och bemanningsschema

En aktivitet är ramen. `activity_duties` beskriver uppgifter med tidsintervall,
deadline eller ingen tid. Varje `activity_duty_slots` är en verklig plats som
börjar tom (`person_id = null`) och kan tilldelas en spelare. Familjen väljer
vilken vuxen som arbetar. En plats har revisionsnummer och separat genomförande.
Samma spelare kan ha flera olika uppgifter, men inte två platser i samma behov.

Ledaren kan dela ett datumintervall i exempelvis tvåtimmarspass och ange antal
platser per pass. Sista passet kortas om perioden inte går jämnt ut. Öppnings-
och stängningsinstruktioner läggs på första respektive sista passet. Bakning
kan i stället ha en leveransdeadline. Tider tolkas i föreningens tidszon.

## Självservice och ändringsförslag

- Familjen bokar för ett eget barn eller sig själv, med aktiv spelarrelation
  till laget eller en personlig kallelse. Ledare kan tilldela valbara personer.
- Familjer ser lediga/bokade platser men inte andra familjers namn eller ID:n.
- Direktbokning är standard; ledaren kan kräva godkännande och sätta en deadline
  för självservice, senast aktivitetens start. Uppgiftens tidigare start/deadline
  begränsar också självservice.
- `activity_duty_change_requests` representerar bokningsförfrågan, flytt till
  ledig plats, byte med upptagen plats eller begäran om ersättare.
- Byte kräver mottagande familjs godkännande. Ledargodkännande kan också krävas.
  Begäran om ersättare kräver alltid ledargodkännande för att frigöra platsen.
- Tilldelningen behålls medan förslaget väntar. Förslag kan avböjas eller återtas.
  Revisionskontroll gör ett förslag inaktuellt om någon berörd plats har ändrats.
- Bokningar och ändringar sker atomärt med lås per aktivitet. Två konkurrerande
  bokningar kan aldrig få samma plats; ett byte uppdaterar båda platserna ihop.
- Bokning skapar ingen kallelse och ändrar inte ett kallelsesvar. Egna bokningar
  inkluderas ändå i familjens aktivitetsöversikt.

## Behörighet och lagring

De tre tabellerna har RLS och saknar direkta klientgrants. Begränsade RPC:er
använder explicit verifierad användare, familjekoppling, aktivitetsbehörighet
och förening. SECURITY DEFINER behövs för att atomärt överföra tilldelningar
mellan familjer och returnera ett dataminimerat schema utan generell tabellåtkomst.
Privata hjälpfunktioner saknar klient-EXECUTE och alla funktioner har tom search_path.
Skrivningar loggas med aktör, kommando och tidigare tilldelning i `audit_log`.

Äldre uppgiftstilldelningar från kallelsen migreras till tidlösa uppgifter och
platser med bibehållet genomförande. De gamla kolumnerna finns kvar som
kompatibilitetsdata, men gamla HTTP-skrivningar ger 410. Historikfunktionen
läser nu verkliga platser och visar högst 20 påbörjade uppgifter inom behörigt lag.

## Återstående arbete

Automatiska notifieringar för ändringsförslag, kalenderexport av enskilda pass,
redigering/radering av redan publicerade behov och sammanvägd rättviseranking
kommer senare. Väntande förslag visas i aktivitetens schema; inget mejl eller
push skickas i den här versionen. Automatisk krockkontroll mellan aktiviteter
är fortfarande en separat roadmap-punkt.
