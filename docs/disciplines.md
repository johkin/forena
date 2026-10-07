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
| Lag | Matchförval: spelform, önskad matchtrupp (`targetTeamSize`), målvakter, perioder och minuter per period |
| Lagmedlemskap | Tröjnummer och positioner |
| Matchtillfälle | Kopierade matchförval samt hemma/borta/neutral och lagkapten (`captainPersonId`) |
| Aktivitetsdeltagande | Matchens tröjnummer och position |

Zod-definitioner är gemensam källa för typ-/fältvalidering och exporterade
JSON Schema. `validateDisciplineData` kräver explicit paketversion och lägger
därtill domänkontroller för truppstorlek, målvaktsbehov och dubbla positioner.
Validering ger ingen behörighet; databasens RPC kontrollerar dessutom klubb,
objekt, användare och aktuellt spelarurval vid varje anrop.

Alla fält är valfria. Paketet sätter inga automatiska åldersregler, periodtider
eller truppstorlekar. Antal spelare på planen är skilt från önskad matchtrupp.
Nummerintervallet 0–999 är en teknisk inmatningsgräns, ingen tävlingsregel.
Närvaro och avstängningar ingår inte i dessa extrafält.

## Lagring och native-formulär

`private.football_values` lagrar versionsrefererad JSONB per lag, lagmedlemskap,
match eller matchdeltagare. Medlemskapets värden är förankrade i lag + person;
personens övriga lag får egna värden. Tabellen har RLS och saknar direkta
klienträttigheter. Den är fotbollens lagring, inte en generell plugininstallation.

`GET/PUT /api/football-fields` använder den inloggade användarens Supabase-klient
och RPC:n `football_fields`. RPC:n härleder klubben från laget och verifierar
sektion, disciplin, objekt, behörighet, schemavärden och spelarreferenser.
Lagförval kräver lagets behörighet för aktivitetsförval, spelaruppgifter kräver
`roster.manage` och match-/deltagaruppgifter kräver `activity.manage`.
Dessa första formulär är hanteringsvyer, även vid läsning. Ingen extra åtkomst
ges till vanliga medlemmar eller via assistenten/MCP.

Varje skrivning skickar den revision som visades i formuläret. En samtidig
ändring ger konflikt utan att skriva över sparade värden. GUI:t behåller utkastet
och erbjuder uttrycklig omladdning. Skrivningar loggas med objekt, aktör och
revision; själva fältvärdena kopieras inte till loggen.

Fälten visas som vanliga formulär i befintliga vyer:

- **Matchförval** under lagets aktivitetsinställningar.
- **Spelaruppgifter** på spelarens profil i lagets medlemsvy.
- **Matchuppgifter** i matchens detaljvy, med lagkaptensval.
- **Spelarnas matchuppgifter** i samma detaljvy för matchens tröjnummer/position.

Databasens insert-trigger kopierar lagets förval en gång till varje ny match,
även vid generering av en serie. Befintliga matcher fylls inte retroaktivt och
ändras inte när lagförval ändras. Matchens värden kan sedan redigeras separat;
ändringen markerar tillfället som ett serieundantag. Importerade, inställda och
avslutade aktiviteter är skrivskyddade. Matchfält visas bara för `match-tavling`
i kategorin `competition`, inte för träning.

Pluginfunktioner är fortfarande planerade och ska visas som tydligt namngivna
tillägg, exempelvis i en tilläggspanel/flik. Disciplinens ordinarie fält ska inte
kräva att användaren förstår paketscheman eller plugininstallationer. Gröna kortet
är uppskjutet som möjlig första plugin; inget sådant fält ingår här.

Paketversioner måste behållas så länge lagrade värden använder dem. En generell
schemaeditor, paketuppgraderingsflöden, pluginlagring och plugin-MCP återstår.

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

Spelarlistorna hämtas med samma behörighetskontroll som värdena. Ett val som inte
längre är tillåtet behålls synligt men måste bytas eller tas bort innan sparande.
Servern verifierar urvalet på nytt; tom lista utökas aldrig automatiskt.
Namnbytet till `targetTeamSize` görs före första publicering och lagring.
