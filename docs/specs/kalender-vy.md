# Kalender-vyn – historik, filter och dagens datum

- Status: Redo
- Senast uppdaterad: 2026-10-26
- Berörda dokument: [Designregler](../design-spec.md), [arkitektur](../architecture.md),
  [startsidemål](../migration/personal-homepage-target.md)
- Implementation och verifiering: Implementerad. App-/Kotlin-kontroller godkända; Supabase-integrationsprov återstår enligt begränsningen nedan.

## Problem och mål

Användare och vårdnadshavare ska kunna se lagens aktiviteter även efter att
aktivitetsdatumet passerat, oavsett deltagande. Kalendern ska tydligt visa
aktuell dag och ge en samlad bild för familjer med flera barn och lag.

## Omfattning

### Ingår

Historiska och kommande lagaktiviteter, tidigare lag under medlemsperioden,
månadsvis inläsning, dagens datum och navigering, barn-/lagfilter, gemensamma
aktivitetsposter med närvaro per barn samt borttagning/inställning enligt
kallelsens utskicksstatus.

### Ingår inte

Ändring av agendans tidsurval och nya sätt att registrera närvaro ingår inte.

## Användare, roller och flöden

1. Användaren öppnar kalendern på dagens datum med alla barn och lag första
   gången, annars med senast valda filter.
2. Användaren filtrerar vid flera barn/lag och bläddrar månadsvis bakåt eller
   framåt. ”I dag” återför kalendern till dagens datum.
3. Gemensamma aktiviteter visas en gång med separat närvarostatus per barn.
   Ledarens registrering är källa för faktisk närvaro.
4. Före utskick kan aktiviteten tas bort eller ställas in; efter utskick
   kan den bara ställas in. Inställda aktiviteter ligger kvar.

## Befintligt underlag

Läst i dokumentation och källkod, inte verifierat genom körning:

- `src/components/team-calendar.tsx` väljer initial månad från första
  aktiviteten, eller dagens datum när listan är tom, och bläddrar i ett
  redan tillhandahållet aktivitetsunderlag.
- Designreglerna och M07B beskriver ett kommande urval som döljer inställda
  och avslutade aktiviteter. Denna kalenderförändring utökar det urvalet.
- `src/components/personal-home.tsx` har i dag ett lagval åt gången eller
  ”Alla lag”. ”Behöver svar” och lagvalet filtrerar både agenda och kalender.
  Ett barnfilter finns inte i denna komponent. Lagvalet återställs om laget
  saknas i det tillgängliga underlaget.

## Krav

- K-001: Visa alla aktiviteter för användarens lag, både passerade och kommande, oavsett deltagande.
- K-002: Behåll historik från tidigare lag för perioden då barnet tillhörde laget.
- K-003: Läs in aktiviteter en kalendermånad i taget när användaren bläddrar framåt eller bakåt.
- K-004: Om flera barn omfattas av samma aktivitet visas en gemensam post med separat närvarostatus per barn.
- K-005: Öppna kalendern på dagens datum.
- K-006: Markera dagens datum med en tydlig ram, särskiljbar från närvaromarkeringarna.
- K-007: Knappen ”I dag” tar användaren tillbaka till dagens datum.
- K-008: Personfilter ska kunna väljas när antalet personer användaren har
  tillgång till via relationer är större än 1. Utan aktiva barn behövs inget
  personfilter. Den egna personen räknas när användaren är aktiv deltagare
  eller ledare; egen person och ett aktivt barn ger därför personfilter.
  Detta ersätter den tidigare regeln om flera barn.
- K-009: Lagfilter visas bara när det finns flera relevanta lag.
- K-010: Lagfiltret visar lag för valda personer. Vid enbart barnurval visas
  de valda barnens lag; när även egen person väljs ingår dennes relevanta lag.
- K-011: Första gången visas alla barn och lag. Därefter minns kalendern senast valda filter.
- K-012: Samma filter gäller för passerade och kommande aktiviteter.
- K-013: Ledarens registrering av faktisk närvaro styr markeringen.
- K-014: Skilj på deltog, deltog inte och deltagande okänt.
- K-015: Saknad närvaroregistrering betyder okänt, inte frånvaro.
- K-016: Kommande aktiviteter visas neutralt. Anmälningsstatus styr inte närvarofärgen.
- K-017: Färg kompletteras med text eller ikon.
- K-018: Gemensamma aktiviteter visar separat status per barn.
- K-019: Innan kallelser har skickats kan aktiviteten tas bort eller ställas in.
- K-020: Efter att kallelser skickats kan aktiviteten bara ställas in. Alternativet ”Ta bort” är då inte tillgängligt.
- K-021: Borttagna aktiviteter försvinner ur kalendern.
- K-022: Inställda aktiviteter ligger kvar, tydligt märkta ”Inställd”, utan närvaromarkering.
- K-023: Person- och lagfilter ska stödja flerval, med ”Alla” som standard
  första gången. Användaren kan visa exempelvis två av tre barn eller två
  valda lag tillsammans. Därefter återanvänds senast valda filter enligt K-011.
- K-024: ”Behöver svar” ska filtrera både agenda och kalender och vara av
  som standard. När filtret är av visas hela urvalet enligt barn-/lagfiltren,
  inklusive historiska och inställda aktiviteter i kalendern. När filtret är
  på visas bara aktiviteter som behöver svar; historiska och inställda
  aktiviteter ingår då inte.
- K-025: Vid val av ett eller flera barn ska användarens egna aktiviteter
  döljas, så att barnurvalet visar de valda barnens aktiviteter inom valda lag.
  Om även ”Mina aktiviteter” väljs ska egna aktiviteter kombineras med de
  valda barnens aktiviteter. Enbart ”Mina aktiviteter” visar eget urval.
- K-026: En användare som är aktiv deltagare eller ledare ska kunna välja
  sina egna aktiviteter. När personfiltret inte behövs ska åtkomsten till
  egna aktiviteter bestå utan ett personval.
- K-027: För en ledare ska ”Mina aktiviteter” omfatta alla aktiviteter i
  lag där användaren är ledare, även innan kallelser har skickats och utan
  krav på personlig kallelse eller tilldelat ledaruppdrag på aktiviteten.
  Övriga regler för datumurval, inställda aktiviteter och filter gäller fortsatt.
- K-028: När endast barn väljs ska aktiviteter riktade enbart till ledare
  döljas, även om barnen tillhör aktivitetens lag. Barnens träningar visas
  oavsett personlig kallelse eller deltagande. Ett ledarmöte i användarens
  ledarlag visas om även ”Mina aktiviteter” väljs.

- K-029: Senast valda person- och lagfilter ska sparas per enhet och
  användarkonto. Urvalet ska inte synkroniseras mellan enheter. Ett kontos
  sparade urval får inte återanvändas för ett annat konto på samma enhet.

- K-030: Vid hämtning av en månad ska laddningsindikering visas för den
  valda månaden.
- K-031: Vid laddningsfel ska ett felmeddelande och ”Försök igen” visas.
  Laddningsfel får aldrig presenteras som en tom kalender.
- K-032: Först efter lyckad hämtning utan träffar ska texten
  ”Inga aktiviteter för valt urval denna månad” visas.

## Data, integrationer och kvalitetskrav

Läs aktiviteter, lag, barnrelationer, medlemsperioder, utskicksstatus,
inställningsstatus och ledarregistrerad närvaro. Urvalet behöver stödja en
kalendermånad i taget. Befintliga behörighetsregler gäller även historik:
filter eller tidigare medlemskap ger inte åtkomst till andra familjers närvaro.
Familjekalendern använder svensk tid enligt befintliga designregler.
Tekniska kontrakt behöver inventeras vid implementation. Laddnings-, fel- och
tomlägen följer K-030–K-032.

## Acceptanskriterier

- AK-001 (K-001, K-013, K-015): En passerad aktivitet finns kvar även om barnet inte deltog eller närvaro saknas.
- AK-002 (K-002): Aktiviteter från tidigare lag visas för barnets medlemsperiod.
- AK-003 (K-003): Bläddring framåt och bakåt laddar aktiviteter en månad i taget.
- AK-004 (K-005, K-006, K-007): Dagens datum visas vid öppning, markeras med ram och kan nås via ”I dag”.
- AK-005 (K-008, K-009): Utan aktiva barn visas inget personfilter. Med
  flera tillgängliga personer via relationer ska personfilter kunna väljas.
  Lagfilter visas bara när det finns flera relevanta lag. En aktiv ledare
  eller deltagare med ett aktivt barn ska få personfilter.
- AK-006 (K-010): Val av barn begränsar lagfiltret till barnets lag.
- AK-007 (K-011): Alla barn och lag visas första gången; senast valda filter återanvänds därefter.
- AK-008 (K-004, K-018): En aktivitet för flera barn visas en gång med separat närvarostatus per barn.
- AK-009 (K-014, K-015, K-017): Okänd närvaro kan särskiljas från registrerad frånvaro, även utan färgseende.
- AK-010 (K-016): Kommande aktiviteter har neutral närvaromarkering oavsett anmälningsstatus.
- AK-011 (K-019, K-020): Borttagning är möjlig före utskickade kallelser, men inte efter.
- AK-012 (K-021, K-022): Inställda aktiviteter ligger kvar med markeringen ”Inställd” och utan närvaromarkering; borttagna aktiviteter syns inte.
- AK-013 (K-023, K-011): Givet tre barn och flera lag, när användaren väljer
  två barn och två av deras lag, ska kalendern visa aktiviteter för det
  kombinerade urvalet. Första öppningen visar ”Alla”; en senare öppning
  återanvänder de senast valda filtren.

- AK-014 (K-024): När kalendern öppnas med ”Behöver svar” av ska även
  historiska och inställda aktiviteter inom barn-/lagurvalet visas. När
  användaren slår på filtret ska endast aktiviteter som behöver svar visas,
  i både agenda och kalender. När filtret slås av återställs hela urvalet.

- AK-015 (K-025): Givet egna aktiviteter och aktiviteter för flera barn,
  när användaren väljer enbart ett barn, ska barnets aktiviteter inom valda
  lag visas och användarens egna samt övriga barns aktiviteter döljas.

- AK-016 (K-026, K-008): En aktiv deltagare eller ledare ska kunna visa
  sina egna aktiviteter. Utan aktiva barn visas de utan personfilter.

- AK-017 (K-008, K-023, K-025, K-026): Givet en ledare med ett aktivt barn
  och ett ledarmöte där endast ledare kallas, ska personfiltret erbjuda eget
  urval och barnet. ”Mina aktiviteter” ska inkludera ledarmötet. Eget urval
  ska kunna kombineras med ett eller flera valda barns aktiviteter.

- AK-018 (K-027): Givet en ledare och en aktivitet i ledarens lag utan
  skickade kallelser, när ”Mina aktiviteter” väljs, ska aktiviteten ingå.
  En aktivitet får inte döljas ur detta urval för att ledaren saknar personlig
  kallelse eller tilldelat uppdrag på just aktiviteten.

- AK-019 (K-028, K-025, K-027): Givet ett barn och en ledare i samma lag
  med en barnträning och ett ledarmöte, när endast barnet väljs, ska träningen
  visas även utan personlig kallelse medan ledarmötet döljs. När även
  ”Mina aktiviteter” väljs ska båda aktiviteterna visas, utan dubbletter.

- AK-020 (K-029, K-011): Givet olika person-/lagurval på två enheter,
  när samma konto återvänder till kalendern, ska respektive enhet återställa
  sitt eget urval utan att ändra den andra enhetens. Ett annat konto på samma
  enhet ska använda sitt eget sparade urval eller första förvalet ”Alla”.

- AK-021 (K-030): Vid månadsbyte med pågående hämtning ska den valda
  månaden visa laddningsindikering.
- AK-022 (K-031): Givet ett misslyckat månadsanrop ska kalendern visa
  felmeddelande med ”Försök igen”, utan text som påstår att månaden är tom.
  Återförsök ska hämta den valda månaden med aktuella filter.
- AK-023 (K-032): Givet en lyckad hämtning utan aktiviteter inom valt
  urval ska ”Inga aktiviteter för valt urval denna månad” visas. Texten får
  inte visas medan hämtningen pågår eller när hämtningen misslyckats.

## Implementation och verifiering

Kalendern har ett separat månads-API i Next och Kotlin. Agendans tidsurval är
oförändrat. Gränssnitt, flerval och filterminne delas mellan apparna. Kotlin
återanvänder befintlig närvarodialog genom en adapter; kalendern inför inget
nytt registreringssätt. Produktkravens status är fortsatt Redo.

| Acceptanskriterium | Krav | Implementation och evidens |
| --- | --- | --- |
| AK-001 | K-001, K-013, K-015 | Implementerat och verifierat: historik oberoende av svar/närvaro i `personal-dashboard.test.ts` och `ApiTest` (`calendar reads exactly one Stockholm month…`). |
| AK-002 | K-002 | Implementerat och verifierat: datumgiltiga medlemsperioder i samma datatester samt befintligt API-test för föreningslokala medlemsgränser. |
| AK-003 | K-003 | Implementerat och verifierat: månad i API, halvöppna Stockholmgränser, sommartid och årsskifte i `personal-calendar.test.ts`, route-test och browserbläddring. |
| AK-004 | K-005–K-007 | Implementerat och verifierat i browser: dagens ram/`aria-current`, öppningsmånad och I dag, även när aktuell månad redan visas. |
| AK-005 | K-008, K-009 | Implementerat och verifierat: filtertrösklar i `calendar-filters.test.tsx`, egna personer i API-snapshot och gemensamt UI-exempel. |
| AK-006 | K-010 | Implementerat och verifierat: personurval avgränsar laglistan i `personal-calendar.test.ts`. |
| AK-007 | K-011 | Implementerat och verifierat: Alla som förval samt minne i `calendar-filters.test.tsx`. |
| AK-008 | K-004, K-018 | Implementerat och verifierat: en aktivitetsknapp med separata personrader, renderer- och browserprov. |
| AK-009 | K-014, K-015, K-017 | Implementerat och verifierat: Deltog/Deltog inte/Deltagande okänt med text, skilda färger och tillgängligt knappinnehåll; enhetstest och browser. |
| AK-010 | K-016 | Implementerat och verifierat: framtida aktivitet ger ingen faktisk närvarostatus, oberoende av svar; `personal-calendar.test.ts`. |
| AK-011 | K-019, K-020 | Implementerat. Kotlin-API verifierat före/efter utskick, även utan svar. Supabase-RPC och pgTAP-prov tillagda; Supabase-integrationskörningen är blockerad enligt begränsningen nedan. |
| AK-012 | K-021, K-022 | Implementerat. Kotlin verifierar borttagningsmarkering och 404; UI visar Inställd utan närvaro. Supabase-integration återstår att köra. |
| AK-013 | K-023, K-011 | Implementerat och verifierat: kombinerade person-/lagurval i `personal-calendar.test.ts`; filterminne i `calendar-filters.test.tsx`. |
| AK-014 | K-024 | Implementerat och verifierat: gemensamt svarsvillkor bevarat; befintliga översikts-/svarstester och kalenderns browserexempel. |
| AK-015 | K-025 | Implementerat och verifierat: barnurval utesluter egna och andra barns rader, enhetstest och browser. |
| AK-016 | K-026, K-008 | Implementerat och verifierat: egna aktiviteter består utan personfilter och vid inaktuellt sparat barnurval; enhetstest. |
| AK-017 | K-008, K-023, K-025, K-026 | Implementerat och verifierat: Mina aktiviteter kombineras med barn, medan ledarmöten avskiljs från barnens rader; urvals- och API-test. |
| AK-018 | K-027 | Implementerat och verifierat: medlems-/ledarrader skapas utan personlig kallelse; `personal-dashboard.test.ts` och kalenderns API-test. |
| AK-019 | K-028, K-025, K-027 | Implementerat och verifierat: okallad barnträning visas, enbart ledaraktivitet döljs för barn; data- och API-test. Supabases målgruppshjälpare behöver fortfarande integrationsköras. |
| AK-020 | K-029, K-011 | Implementerat och verifierat: olika konton/enheter har olika lagringsnycklar och egna urval; `calendar-filters.test.tsx`. |
| AK-021 | K-030 | Implementerat och verifierat: separat laddningsläge för vald månad, abort av ersatta anrop och exempel på `/components`. |
| AK-022 | K-031 | Implementerat och verifierat: fel med Försök igen, inget falskt tomt resultat; API-route-test och browser. |
| AK-023 | K-032 | Implementerat och verifierat i browser: exakt tomtext först efter lyckad hämtning; fel visas separat. |

Evidens finns i [urvalstester](../../src/lib/personal-calendar.test.ts),
[filtertester](../../src/components/calendar-filters.test.tsx),
[datatester](../../src/data/personal-dashboard.test.ts),
[route-tester](../../src/app/api/me/calendar/route.test.ts),
[Kotlin-API-tester](../../backend/src/test/kotlin/se/forena/api/ApiTest.kt) och
[pgTAP-provet](../../supabase/tests/calendar_lifecycle_test.sql).
Det gemensamma browserexemplet finns i
[BrowserFrontendExamples](../../src/components/browser-frontend-examples.tsx).

### Verifieringsbegränsning

Supabase-imagen kunde inte packas upp i miljöns Docker-lagring (`no space left
on device`). `supabase db reset --local` och `supabase test db` kunde därför
inte ansluta till en lokal Supabase-databas. Den nya legacy-migrationen och
dess pgTAP-prov är skrivna men inte integrationsverifierade. Kotlin använder
sin egen isolerade PostgreSQL-testdatabas; dess migrations-/API-resultat
redovisas separat och ersätter inte Supabase-provet.

### Slutkontroller

- Hela TypeScript-sviten: 140 testfiler, 1 190 godkända tester.
- Efter sista mobilnavigeringsändringen: 17 riktade UI-/urvalstester godkända.
- `npm run typecheck`: godkänd för Next och Vite.
- `npm run lint` samt riktad slutlint av ändrade TypeScript-filer: godkända.
- `npm run build` och `npm run frontend:build`: godkända.
- OpenAPI/TypeScript-kontrakt genererat från den riktiga Spring-servern;
  `backend/contract`-kontrollen är godkänd.
- Slutliga Kotlin-API-/tids-/arkitekturtester: 17 godkända, inklusive
  kallelsegräns för radering, närvarobehörighet, personåtkomst och dagens
  månadsurval. Uppgraderingstesternas omkörning gav 18 godkända fall
  från tom installation och tidigare schemaversioner.
- Browser: Next och Vite på 390 respektive 1 440 px. Månadsbyte, I dag,
  historik, status per person, laddning, fel/återförsök, tom månad,
  barnurval samt borttagningsknappen före/efter utskick är kontrollerade.
  Inga JavaScript-fel eller horisontell överrinning noterades.
- Supabase: blockerad lokal integrationskörning enligt begränsningen ovan.


## Bekräftade beslut och motiv

- 2026-10-26, fortsatt intervju, svar 10: Användaren bekräftade slutlig
  sammanfattning och avgränsningar med ”ja”. Exakta färger och ikoner lämnas
  till implementationen, inom K-006 och K-014–K-017. Agendans tidsurval och
  sättet att registrera närvaro ligger utanför ändringen. Specen är Redo.
- 2026-10-26, fortsatt intervju, svar 9: Månadsvis laddningsindikering,
  felmeddelande med ”Försök igen” och tomtext först efter lyckad hämtning
  accepterades. Laddningsfel får inte se ut som en tom kalender.
- 2026-10-26, fortsatt intervju, svar 8: Det räcker att minnas filterval
  per enhet; synkronisering mellan enheter behövs inte.
- 2026-10-26, fortsatt intervju, svar 7: Aktiviteter enbart för ledare
  döljs vid enbart barnurval. Barnets träningar visas oavsett kallelse eller
  deltagande; ledarmöten i användarens ledarlag inkluderas när eget urval väljs.
- 2026-10-26, fortsatt intervju, svar 6: ”Mina aktiviteter” för ledare
  omfattar alla aktiviteter i lag där användaren är ledare, även innan
  kallelser. Ett snävare urval utifrån egen kallelse/uppdrag valdes inte.
- 2026-10-26, fortsatt intervju, svar 5: Ledarmöten med enbart kallade
  ledare är ett konkret exempel på egna aktiviteter. Även ledare ska räknas
  i personurvalet och kunna kombinera ”Mina aktiviteter” med valda barn.
- 2026-10-26, fortsatt intervju, svar 4: Egna aktiviteter ska kunna väljas
  för aktiva deltagare och ledare. Utan aktiva barn behövs inget personfilter.
  Användaren anger fler än 1 person tillgänglig via relationer som tröskel
  för personfilter; detta ersätter flera-barn-regeln. Egen persons roll i
  antalsberäkningen förtydligades i svar 5.
- 2026-10-26, fortsatt intervju, svar 3: Ett barnurval ska dölja egna
  aktiviteter. Användaren föreslog dessutom ett eget val för ”Mina aktiviteter”;
  utformning och samspel med barnfiltret förtydligades i svar 4–5.
- 2026-10-26, fortsatt intervju, svar 2: ”Behöver svar” behålls i både
  agenda och kalender och är av som standard. Användaren accepterade att
  historiska och inställda aktiviteter döljs när filtret är på.
- 2026-10-26, fortsatt intervju, svar 1: Flerval för både barn och lag
  accepterat, med ”Alla” som första förval, för att kunna jämföra valda barn
  och lag tillsammans.
- Alla lagaktiviteter ska visas oavsett deltagande, även historiska aktiviteter
  från tidigare lag under barnets medlemsperiod.
- Ledare registrerar närvaro. Kommande aktiviteter visas neutralt så att
  anmälningsstatus inte förväxlas med faktisk närvaro.
- Användaren föreslog barn-/lagfilter vid flera alternativ och accepterade
  alla som första förval samt att senaste filterval sparas därefter.
- Gemensam post för flera barn och separat närvarostatus accepterades.
- Dagens ram, öppning på dagens datum och knappen ”I dag” accepterades.
- Användaren beslutade om en månads inläsning i taget i båda riktningarna.
- Inställda aktiviteter behålls. Borttagning tillåts bara före utskick.

## Obekräftade antaganden och förslag

Inga obekräftade produktförslag återstår. Exakta färger, ikoner och teknisk
lagring av filterval är implementationsval inom de bekräftade kraven.

## Öppna frågor

Inga blockerande produktfrågor återstår från intervjun.

## Bekräftelse

Intervjuns enskilda svar och accepterade rekommendationer är sparade från
2026-10-26. Användaren bekräftade den slutliga sammanfattningen och
avgränsningarna med ”ja” i fortsatt svar 10. Status är Redo.
Implementation beställd och utförd 2026-10-26 enligt denna spec.

## Ändringshistorik

- 2026-10-26: Implementation beställd och genomförd; lagt till spårbar verifieringsmatris och redovisat blockerad Supabase-kontroll.

- 2026-10-26: Slutlig sammanfattning och avgränsningar bekräftade i svar 10.
  Markerat specen Redo och stängt återstående frågor. Implementation är
  fortsatt ej påbörjad.
- 2026-10-26: Sparat fortsatt svar 9 om laddning, återförsök och tomma
  månader, med K-030–K-032 och AK-021–AK-023. Sammanfattning inväntar bekräftelse.
- 2026-10-26: Sparat fortsatt svar 8 om filterval per enhet, med
  kontoseparerad lagring i K-029 och AK-020. Ingen enhetssynkronisering.
- 2026-10-26: Sparat fortsatt svar 7 om barnurval och aktiviteter enbart
  för ledare, med K-028 och AK-019.
- 2026-10-26: Sparat fortsatt svar 6 om alla lagaktiviteter i ledarens
  eget urval även före kallelser, med K-027 och AK-018.
- 2026-10-26: Sparat fortsatt svar 5 med ledarmöte som acceptansfall.
  Förtydligat egen person i filtertröskeln, kombinerade personval och lagurval.
- 2026-10-26: Sparat fortsatt svar 4 om personfilter utifrån relationer och
  egna aktiviteter för deltagare/ledare. Uppdaterat K-008, K-023 och AK-005,
  lagt till K-026 och AK-016; personräkningens själv-relation återstår.
- 2026-10-26: Sparat fortsatt svar 3 i K-025 och AK-015. Noterat förslaget
  om ”Mina aktiviteter” och kvarstående beslut om personfiltrets utformning.
- 2026-10-26: Sparat fortsatt svar 2 om ”Behöver svar” i båda vyerna,
  av som standard, med K-024 och AK-014.
- 2026-10-26: Sparat fortsatt svar 1: flerval för barn och lag, med ”Alla”
  som standard. Lagt till K-023 och AK-013; stängt frågan om flerval.
- 2026-10-26: Återupptagit intervjun enligt grill-me. Inventerat befintligt
  lagval och svarsfiltret inför återstående produktbeslut.
- 2026-10-26: Sparat intervjuns beslut och acceptanskriterier.
- 2026-10-26: Rättat felaktig M07C-placering till `docs/specs/` enligt
  grill-me och specmallen från main, PR #191. Skilt bekräftade krav från
  antaganden och öppna frågor. Alla 22 krav och 12 acceptansutfall bevarade.
