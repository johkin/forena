# Aktiviteters tidsregler (version 1)

Regelmotorn används i aktivitetsdialogen och serverns skrivvägar för enstaka
aktiviteter, serier och kallelser. Gemensamma aktivitetstyper kan kopplas till
en disciplin och administreras under `/system/activity-types`. Lokala specialtyper
behåller sin föreningsägare; oförändrade tidigare standardtyper migreras till den
gemensamma katalogen med bibehållna aktivitets- och dokumentkopplingar.

Standardvärden lagras i `activity_defaults` och administreras på system-, klubb-,
sektions- och lagnivå. Föreningens vy finns under `/o/<slug>/activity-settings`.
Samma sida låter behöriga användare välja eller återställa ärvd disciplin.
Disciplinkatalogen administreras fortsatt under `/system/disciplines`.

## Tidsregler och varaktighet

`duration` är en faktisk aktivitetslängd, till exempel `PT1H30M` eller `PT90M`.
Endast heltalstimmar och heltalsminuter accepteras, totalt 1–10080 minuter (sju dygn).
Dagar, månader, år, negativa värden och bråkdelar är inte tillåtna för längden.

En regel beräknar i stället en tidpunkt. Det är Förenas begränsade,
Grafana-inspirerade syntax, inte Grafanas fullständiga uttrycksspråk.

| Uttryck | Betydelse |
| --- | --- |
| `start-10m` | Tio faktiska minuter före start |
| `start-6d` | Sex kalenderdagar före, samma lokala klockslag |
| `start-144h` | Exakt 144 timmar före start |
| `start/d` | Början av aktivitetsdagen |
| `start-1d/d` | Början av dagen före aktivitetsdagen |
| `deadline-2h` | Två timmar före sista svarstid |

En regel består av `start` eller `deadline`, högst fyra avdrag med `d`, `h`
eller `m`, och valfritt `/d` sist. Operationerna sker från vänster till höger.
Varje avdrag innehåller 1–6 siffror i både applikation och databas.
Avdragen begränsas till nominellt 366 dagar och regeln till 80 tecken.
Plustecken, `now`, godtyckliga funktioner, veckor/månader/år och avrundning till
andra enheter accepteras inte. Parsern använder inte `eval`.

Kallelse, samling och svarstid måste referera till `start`. Påminnelser måste
referera till `deadline`. Cirkulära regler kan inte uttryckas.

## Tidszon och sommartid

Alla kalenderoperationer använder den uttryckligt angivna IANA-tidszonen för
föreningen. Serverns eller webbläsarens tidszon ska aldrig användas implicit.
`d` flyttar kalenderdatum; `h` och `m` flyttar faktisk tid. Därför kan
`start-6d` och `start-144h` skilja sig vid en tidsomställning.

Vid kalenderaritmetik väljs det tidigare ögonblicket för ett upprepat
klockslag, och ett överhoppat klockslag flyttas fram med luckans storlek.
Vid direkt inmatning av aktivitetens start avvisas däremot ett klockslag
som inte finns, så att användaren kan välja en giltig start.
`/d` betyder dagens första giltiga lokala klockslag; normalt 00.00, men inte
nödvändigtvis det i tidszoner där midnatt hoppas över.

Regelmotorn använder `Intl` och verifierar möjliga lokala tider genom
rundresor till lokal tid. Datumintervallet är 1900–9999. Ändra inte dessa
semantiska regler utan ny regelversion och migrationsbeslut. Förvalsregler
ska lagra `ACTIVITY_TIME_RULE_VERSION` tillsammans med värdena.

## Standardvärden

`resolveActivityDefaults` är en ren funktion som tar en behörighetskontrollerad
kontext och redan hämtade rader. Den returnerar regler och ursprung per fält.
Den gör inga databasfrågor och är inte en behörighetskontroll.

```text
Lag > Sektion > Klubb > System > reservvärde
```

- `null` och utelämnat fält betyder ärv.
- `start` eller `start-0m` är uttryckliga nollavstånd, inte ärv.
- `[]` betyder inga påminnelser. En lista ersätter hela den ärvda listan.
- Varje rad avser exakt en aktivitetstyp och ett organisatoriskt mål.
- Rader från annan förening, sektion, lag eller typ används inte.
- Flera matchande rader på samma nivå är ett fel, inte en godtycklig prioritering.
- Resultatet innehåller rad-ID, nivå och revision för varje fält.
- `invitationMode` och målgrupper ingår inte bland standardvärdena.

Disciplinen hör till aktivitetstypens tillämplighet. Den är inte ytterligare
en nivå i arvet. Personliga preferenser ingår inte i gemensamma aktivitetsförval.

## Exempel för UI och assistent

```ts
const resolved = resolveActivityDefaults(
  { activityTypeId, organizationId, sectionId, teamId },
  authorisedDefaultRows,
);
const preview = previewRuleSingleActivity({
  startsOn: "2026-10-08",
  startTime: "18:00",
  timeZone: "Europe/Stockholm",
  rules: resolved.rules,
});
```

`previewRuleWeeklySeries` beräknar alla tider separat för varje tillfälle.
Serien lagrar inte `durationMinutes`; längden används bara för att skapa
tillfällenas fasta start- och sluttider.
Spara inte en UTC-offset eller den första träningens klockslag som mall för
resten av serien. Perioden är högst 366 dagar och antalet tillfällen högst 100.

Kallelse ska ligga före svarstid, påminnelser strikt mellan dem och svarstiden
senast vid aktivitetsstart. Påminnelser sorteras efter beräknad tidpunkt;
dubbletter avvisas även om uttrycken skiljer sig (t.ex. `-2h` och `-120m`).
`inspectScheduleAgainstNow` flaggar passerade tider men flyttar eller skickar
inte någonting. Vid skapande flyttas en passerad kallelsetid till nu i förhandsgranskningen
och vid sparande. Passerade påminnelser hoppas över; sista svarstid måste
fortfarande ligga i framtiden.

## Bakåtkompatibilitet

Den befintliga `invitationScheduleForOccurrence` accepterar fortfarande
minutavstånd och de gamla deadline-värdena. Den kan även ta `{ rules }`.
Nya anrop ska använda hela `reminderSendAts`; `reminderSendAt` är endast en
kompatibilitetsprojektion av den första påminnelsen, inte hela schemat.

Det gamla `previous-midnight` behåller betydelsen början av dagen före
aktiviteten. Det ändras inte tyst till `start/d`. En gammal `1d`-deadline
behåller exakt 1440 minuter; nya `start-1d` använder kalenderdagar.
Alla fyra befintliga tester i `activity-series.test.ts` finns också med som
regressionsfall i den fristående testkörningen.

## Appintegration och behörighet

- Systemadmin administrerar gemensamma typer och systemförval. Klubbadmin
  administrerar klubbförval, sektionsadmin sin sektion och lag med
  `activity.manage` sina lagförval. Plattformens roll ger inte klubbbehörighet.
- Sparning använder en smal RPC med serverkontroll, databaskontroll, målvalidering
  och förväntad revision. En samtidig ändring ger konflikt och kräver omladdning.
- Tomt förvalsfält återställer arv. `[]` stänger av påminnelser. GUI:t visar varje
  upplöst värde och dess ursprung. Disciplinen begränsar tillgängliga typer, inte
  organisationsarvet. Typer utan disciplin gäller alla verksamheter.
- Aktivitetsdialogen hämtar lagets tillgängliga typer och förval. Vid byte av typ
  ändras enbart orörda fält på nya aktiviteter. Explicit längd/samling i AI-utkast
  och sparade aktiviteter bevaras. Förhandsgranskning visar riktiga tider för
  samling, slut, kallelse, svarstid och alla påminnelser.
- Ingen kallelse eller målgrupp förväljs. Saknad målgrupp blir aldrig alla.
  För serier används schemaläggning; läget Skicka nu med personval gäller enstaka aktiviteter.
  Vid skapande av både enstaka aktiviteter och serier blir en passerad
  kallelsetid direktutskick till valda målgrupper. Förhandsgranskningen visar
  ”Direkt vid sparande”. Utskicket blir omedelbart förfallet och hanteras av
  den ordinarie notifieringsarbetaren. Omschemaläggning av en befintlig aktivitet
  kräver fortsatt en framtida tid eller ett explicit Skicka nu.
- Servern validerar regler och beräknar varje serietillfälle separat i föreningens
  tidszon. Aktiviteter, serietillfällen och kallelser lagrar enbart de beräknade
  tidpunkterna; inga kopior av tidsuttrycken sparas på aktiviteten eller serien.
  Alla påminnelser sparas atomärt via aktivitetens `reminder_send_ats` och en
  trigger. Ett ogiltigt schema rullar tillbaka aktiviteten och dess påminnelser.
- Redigering av aktivitetens start, slut och samling ändrar endast uttryckligen
  angivna tidpunkter. Kallelseschemat ligger kvar; omschemaläggning kräver ett
  uttryckligt val i kallelsefunktionen. Tidsuttryck är beräkningsunderlag i
  förval och skapandets förhandsgranskning, inte en del av sparade aktiviteter.
- Sparade aktiviteter räknas aldrig om vid en ändring av standardvärden. En
  arkiverad/omklassificerad typ hindrar nya aktiviteter men bevarar historikens
  redigering. Direkta databasskrivningar kontrollerar lokal typägare och disciplin.
- Dokumentkopplingar behåller sin organisation även med gemensamma typ-ID:n.
  Alla berörda kopplingar/behörighetsfrågor matchar både typ och organisation.
- Ledarassistenten får samma upplösta förval som dialogen i strukturerad kontext.
  Inställningarna ska inte dupliceras som fritextminne. Ett bekräftat AI-kommando
  för att ändra förval återstår; administration sker via GUI:t i denna version.

Menyer och header återanvänds från gemensamma komponenter. Systemförval är en
separat administration och läggs inte i minneshanteringens vanliga systemflik.

## Testning

Kör `node tests/run-activity-timing.mjs` från repots rot. Det använder repots
TypeScript-kompilator (eller `tsc` i PATH), strikt typkontrollerar kärnan,
kompilerar till en temporär katalog och kör samma testfall som Vitest-wrappern.
Wrappern `src/lib/activity-time-rules.test.ts` ingår i vanliga `npm test`.
Ingen npm-installation eller nätverksåtkomst används av den fristående
körningen om TypeScript redan finns.

Kör även `supabase db reset --local` och `supabase test db` mot en lokal teststack.
`activity_defaults_test.sql` verifierar revisionskonflikter, scope/tenant-isolering,
rollgränser, disciplintillämplighet, historik och atomära påminnelseskrivningar.

## Valbara tider

`activity_defaults.values.options` innehåller valbara tider för `duration`,
`gatheringRule`, `invitationRule`, `responseDueRule` och `reminderRules`.
Varje lista har 1–32 unika giltiga värden med fältets ankare. Utelämnat fält
eller `null` ärver listan; en lokal lista ersätter hela den överordnade listan.
Förval och listor har separata ursprung i `resolveActivityDefaults`.
Systemlistorna seedas för gemensamma typer; kodens grundlistor används när data
saknas, exempelvis för en ny typ. Behörigheter och revisionskontroll är desamma
som för övriga aktivitetsförval.

UI visar ”6 dagar innan” för `start-6d`, ”2 timmar innan” för `deadline-2h`
och markerar dagens början för `/d`. Ankaret förklaras vid respektive kontroll.
Kalenderdagar och förflutna timmar hålls åtskilda även i etiketterna.
Tidigare val som inte finns i en ändrad lista behålls som läsbara alternativ.
Påminnelser hanteras som separata listval, maximalt fem utan dubbletter.
Administratörer lägger till tider med antal/enhet, utan uttrycksinmatning.
Listvalen används endast när tider beräknas för nya aktiviteter eller ett
uttryckligt nytt kallelseschema. Migrationen ändrar inga fasta aktivitetstider
eller påminnelsescheman.

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


Enstaka aktiviteter anges med startdatum/starttid och slutdatum/sluttid.
Förvalets längd föreslår slutet tills användaren väljer ett eget slut.
Längden beräknas från de två tidpunkterna i föreningens tidszon, även över
sommartidsbyten. Serier använder fortsatt en längd per tillfälle. Kalendern
visar varje berörd lokal dag; ett slut exakt vid midnatt räknas inte som
aktivitet på den nya dagen.

Vid skapande av enstaka aktiviteter eller serier kan den beräknade kallelsetiden redan
ha passerat. Då sätts den fasta utskickstiden till sparögonblicket; senare
tillfällen behåller den valda tidsregeln. Förhandsgranskningen visar ”Direkt
vid sparande”. Passerade påminnelser hoppas över och sista svarstid måste
fortfarande ligga framåt i tiden. Servern räknar om schemat vid sparande.
Den ordinarie notifieringsarbetaren materialiserar målgruppen och köar dessa
kallelser vid nästa körning, precis som övriga förfallna kallelser. Detta gäller
nya aktiviteter och serier; inga befintliga aktivitets- eller standardscheman skrivs om.
