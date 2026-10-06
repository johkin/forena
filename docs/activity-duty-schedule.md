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

## Ändringsförslagens livslängd

Vid aktivitetens start blir väntande förslag utgångna. Ett privat databasjobb
kör varje minut (högst 100 aktiviteter per körning); även läsning av ett
påbörjat schema stänger kvarvarande förslag. Godkännande efter start kan inte
ändra tilldelningar, oavsett om bakgrundsjobbet hunnit köras. Ledare kan
fortfarande tilldela platser direkt.

Schemat returnerar alla öppna förslag och högst de 20 senaste avslutade som
användaren har rätt att se. Avslutade förslag raderas 30 dagar efter
aktivitetens sluttid. Tilldelningar, genomförda arbetsuppgifter och audit-logg
behålls. Ingen kvot begränsar familjens normala ändringar; städningen är inte
ett generellt skydd mot automatiserade massanrop före aktivitetens start.

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

## Redigering och notifieringar

Ledaren kan ändra tider, instruktioner och antal platser. Antalet kan bara
minskas genom att ta bort lediga platser. Borttagning av en uppgift är en
avbokning: platser stängs och tilldelningar frigörs, medan poster och tidigare
tilldelningar i audit-loggen behålls. Uppgifter med registrerat genomförande
låses för redigering och borttagning. Uppgiftstyper kan döpas om och inaktiveras;
namnet sparas separat på varje befintlig uppgift så att historiken inte döps om.

Alla ändringar kontrollerar revision under aktivitetslåset. En ny bokning
ogiltigförklarar en gammal redigeringsförhandsvisning. Redigering/avbokning
stänger berörda väntande ändringsförslag.

Förslag, slutliga beslut, manuella tilldelningar och schemaändringar köar
notiser transaktionellt till berörda personers konton/målsmän samt lagets
behöriga ledare. Samma mottagare får högst en köpost per händelse även vid
flera roller. Notiser innehåller inga andra familjers identiteter och använder
befintlig worker: push först, mejl som reserv. Väntande förslagsnotiser som
ännu inte börjat skickas ersätts när beslut fattas. Workern måste driftsättas
med det nya innehållsstödet; migrationskörning i sig skickar inga notiser.

## Förslag på fördelning

Ledaren väljer historikens startdatum (innevarande år är förvalt, högst tio år
bakåt). Behörighetskontrollerad statistik räknar genomförda uppgifter inom
samma lag, inklusive antal per uppgiftstyp och senaste typen. Ej registrerat
arbete räknas inte som genomfört; siffrorna visas därför som registrerad
historik och är inte ett bevis på att någon aldrig arbetat.

Förslaget fyller lediga platser deterministiskt: lägst antal genomförda först,
sedan annan uppgift än den senaste och sedan färre av samma typ. Lika underlag
avgörs med namn/ID. Redan tilldelade personer hoppas över och varje person får
högst en ny plats i automatförslaget. Högst 100 platser föreslås åt gången;
övriga lämnas lediga. Ledaren kan justera eller hoppa över varje tilldelning.
En uttrycklig förhandsgranskning visar mottagarna före sparande och notifiering.
Tilldelningarna sparas atomärt med nya behörighets- och revisionskontroller;
en ändrad plats gör att hela förslaget måste granskas på nytt.

## Återstående arbete

Kalenderexport av enskilda pass är uppskjuten. Automatisk krockkontroll mellan
aktiviteter, matchurval och assistentverktyg över historiken är fortsatt
separata roadmap-punkter. Fördelningsförslaget kontrollerar inte tillgänglighet
mot andra aktiviteter eller fördelning mellan olika lag.

### Bokning, kallelse och närvaro

En tilldelad plats är ett åtagande för spelarens familj och visas som
**Bokad arbetsuppgift** i den personliga översikten även utan en kallelserad.
En kallelse är en förfrågan, en bokning är en konkret uppgift och närvaro eller
genomförande registreras efteråt. Tilldelning skapar inte ett påhittat
kallelsesvar. Familjen föreslår ändringar i schemat.
