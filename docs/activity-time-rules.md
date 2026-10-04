# Aktiviteters tidsregler (version 1)

Detta är en fokuserad implementation av regelmotorn och upplösningen av
standardvärden. Den ändrar inte databasens katalog med aktivitetstyper,
inför inte lagring eller administration av `activity_defaults`, och kopplar
inte automatiskt nya fält till aktivitetsmodalens formulär. Integrationens
återstående delar beskrivs nedan. Inget i dessa funktioner skickar kallelser.

## Tidsregler och varaktighet

`duration` är en faktisk aktivitetslängd, till exempel `PT1H30M` eller `PT90M`.
Endast heltalstimmar och heltalsminuter accepteras, totalt 1–1440 minuter.
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
semantiska regler utan ny regelversion och migrationsbeslut. Persistenta regler
bör lagra `ACTIVITY_TIME_RULE_VERSION` tillsammans med värdena.

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
Spara inte en UTC-offset eller den första träningens klockslag som mall för
resten av serien. Perioden är högst 366 dagar och antalet tillfällen högst 100.

Kallelse ska ligga före svarstid, påminnelser strikt mellan dem och svarstiden
senast vid aktivitetsstart. Påminnelser sorteras efter beräknad tidpunkt;
dubbletter avvisas även om uttrycken skiljer sig (t.ex. `-2h` och `-120m`).
`inspectScheduleAgainstNow` flaggar passerade tider men flyttar eller skickar
inte någonting. Ett passerat schema behöver ett uttryckligt användarbeslut.

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

## Återstående appintegration

Följande är INTE implementerat i denna fokuserade patch:

1. Migrera föreningsägda aktivitetstyper till systemets gemensamma katalog med
   disciplin, med bibehållna referenser från aktiviteter och serier.
2. Lagra `activity_defaults` med RLS, unika mål, revisionskontroll och GUI för
   klubb/sektion/lag; endast systemadmin administrerar systemnivån.
3. Låt aktivitetsdialogen läsa de upplösta förvalen och uppdatera enbart
   orörda fält på nya aktiviteter. Visa riktiga tider och värdenas ursprung.
4. Uppdatera och testa samtliga skrivvägar (enstaka, serie, redigering och
   kallelse) så att nya regler valideras på servern och alla påminnelser
   sparas atomärt. Sparade aktiviteter behåller sina tidsstämplar.
5. Ge assistenten samma upplösta förval och ett separat bekräftat kommando
   för att ändra dem; skapa inte ett andra fritextminne med samma inställning.

Kallelsemottagare och utskicksläget ingen/nu/schemalagd ska fortfarande väljas
explicit. Saknad målgrupp får inte bli alla. System-fliken ska inte införas
i den vanliga minneshanteringen. Menyer, header och footer återanvänds från
gemensamma komponenter.

## Testning

Kör `node tests/run-activity-timing.mjs` från repots rot. Det använder repots
TypeScript-kompilator (eller `tsc` i PATH), strikt typkontrollerar kärnan,
kompilerar till en temporär katalog och kör samma testfall som Vitest-wrappern.
Wrappern `src/lib/activity-time-rules.test.ts` ingår i vanliga `npm test`.
Ingen npm-installation eller nätverksåtkomst används av den fristående
körningen om TypeScript redan finns.
