# Kodägda discipliner

Fotboll är det första kodägda disciplinpaketet, `football` version `1.0.0`,
i `src/lib/disciplines/football.ts`. Paketet definierar spelformer 3v3, 5v5,
7v7, 9v9 och 11v11 samt stabila positionsidentifierare. Dessa är planeringsval,
inte en katalog över förbundens ålders- eller tävlingsregler.

## Definition och koppling

Paketet är källan för scheman, namn, kategorier och UI-definitioner.
Databasens befintliga `disciplines`-tabell behålls som katalog för stabila
främmande nycklar. Paketet slås upp via `key`, aldrig genom ett hårdkodat UUID
eller ett översatt namn. Systemvyn visar paketdefinitionen skrivskyddad och
serveråtgärden nekar försök att redigera dess katalogmetadata.

Sektionens `discipline_id` kopplar dess lag till paketet. Vid kontroll av UIK
2026-10-08 (Europe/Stockholm, 2026-10-07 UTC) var fotbollssektionen redan kopplad till `football`; F2016 och F2013
hade inga egna disciplinöverskrivningar. Ingen dataskrivning behövdes.
Kopplingen gäller det nya paketet när appversionen driftsätts.

Äldre klubb-/lagöverstyrningar finns kvar av kompatibilitetsskäl. Om en sådan
överstyrning avviker från sektionen laddas inget sektionspaket. Denna ändring
migrerar inte andra klubbars disciplinval. Ett framtida steg kan flytta alla
kopplingar till sektionsnivå efter kontroll av konflikter.

`loadActivityConfiguration` returnerar ett serialiserbart `disciplinePackage`
för sektionen när kopplingen är entydig. Befintlig API-behörighet, RLS och
filtrering av aktivitetstyper gäller fortfarande; generella typer finns kvar.
Samma paketöversikt visas i systemets disciplinadministration och under
sektionens/lagets aktivitetsinställningar.

## Fältscheman

| Objekt | Fält |
| --- | --- |
| Sektion | Inga extrafält ännu |
| Lag | Spelform, önskad matchtrupp (`targetTeamSize`), önskat antal målvakter |
| Lagmedlemskap | Tröjnummer och positioner |
| Matchtillfälle | Spelform, perioder, minuter per period, hemma/borta/neutral, lagkapten (`captainPersonId`) |
| Aktivitetsdeltagande | Matchens tröjnummer och position |

Zod-definitioner är gemensam källa för typ-/fältvalidering och exporterade
JSON Schema. `validateDisciplineData` kräver explicit paketversion och lägger
därtill domänkontroller för truppstorlek, målvaktsbehov och dubbla positioner.
Validering ger ingen behörighet; framtida skrivkommandon måste kontrollera
klubb, objekt och användare separat.

Alla fält är valfria. Paketet sätter inga automatiska åldersregler, periodtider
eller truppstorlekar. Antal spelare på planen är skilt från önskad matchtrupp.
Nummerintervallet 0–999 är en teknisk inmatningsgräns, ingen tävlingsregel.
Närvaro och avstängningar ingår inte i dessa extrafält.

## Leveransens gräns och nästa steg

Denna version levererar paket, validering, JSON Schema, sektionsuppslag och
inspektion i befintligt GUI. Den inför inte lagring eller redigeringsformulär
för extravärden och ändrar inga aktiviteter eller personuppgifter. Assistenten
får inte anta att ett lag spelar 7v7 bara för att formatet finns i paketet.

Nästa steg är versionsrefererad lagring med behörighetskontroller och formulär
för lagets värden, därefter lagmedlemskap och aktiviteter. Vid aktivitetskapande
ska förval kopieras uttryckligen, inte läsas dynamiskt så att gamla matcher
ändras. Äldre paketversioner ska behållas så länge sparade data använder dem;
nuvarande version är en katalogdefinition, inte en migrering av sparade värden.

Admin-GUI för paket ska främst stödja val, konfiguration och uppgraderingar.
En generell editor för godtyckliga schemastrukturer är uppskjuten. Ingen extern
pluginkod eller MCP-funktionalitet installeras av detta paket.

## Spelarreferenser och villkorade fält

`captainPersonId` är ett valfritt person-UUID på aktiviteten, inte ett namn eller
flera separata deltagarflaggor. Fältets `x-player-reference` i JSON Schema och
paketets `fieldRules` beskriver målobjekt, spelarurval och tillämpning.
`teamPlayers` betyder lagets spelare; `acceptedActivityPlayers` betyder spelare
som tackat ja till just aktiviteten och är förvalt urval. Det senare kan även
omfatta behörigt inbjudna spelare från andra lag i samma klubb. Ledare och
målsmän ska inte ingå bara för att de tackat ja. Tom lista ska förbli tom,
inte automatiskt utökas till hela truppen.

Lagkapten gäller den befintliga katalogtypen `match-tavling` i kategorin
`competition`. En annan tävlingstyp blir inte automatiskt en match. Villkoret
använder stabil slug och kategori, inte visningsnamnet. Ytterligare matchtyper
kan läggas till uttryckligen i paketets regel.

`footballFieldsForActivity` väljer synliga fält. Vid validering av en lagkapten
krävs dessutom `PlayerReferenceContext`: serverhämtad aktivitetstyp, vald tillåten
källa och aktuella behörighetsfiltrerade kandidat-ID:n. Typ, källa och vald person
kontrolleras igen även om ett dolt fält skickats. Kontexten får aldrig komma från
formuläret eller modellen. Databasadaptern ska verifiera klubb/lag, deltagarroll
och svar vid sparandet; en tidigare laddad lista räcker inte. En lagkapten som
senare tackar nej behöver uttrycklig omprövning, inte en tyst ersättare.

Den här leveransen implementerar deklaration, fältval och validering. Den
hämtar inte personlistor eller visar en fungerande spelare-väljare ännu; dessa
kopplas på tillsammans med lagringen av extrafälten. Ett sparat val kan då
visas som exempelvis ”Tilda – lagkapten” via behörigt personuppslag.
Namnbytet till `targetTeamSize` görs före första publicering av paketet; det
finns ännu inga lagrade disciplinvärden att migrera.
