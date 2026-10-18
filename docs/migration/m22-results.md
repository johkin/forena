# M22: Delresultat och nästa prov

Datum: 2026-10-18. PR #98 är mergad som
`2e0af8f3dc2756ee2d0dcbdfb7c4090f642a495f`.
Denna avgränsade fortsättning har mål och acceptanskriterier i
[M22](tasks/m22-vercel-delivery.md). Backendens runtimekod och schema är
oförändrade; ett lokalt två-JVM-prov har lagts till i befintligt processprov
och aktiverats i CI. Långt återtag efter inaktivitet är också verifierat i
riktig Vercel-preview. Hela M22 är ännu inte klar.

## Genomfört nu

| Kontroll | Verifierat resultat | Praktisk gräns |
| --- | --- | --- |
| Git-preview och region | `dpl_7EukpCutCTMULuJHsoqDkD2jHVjx` från `1c45d41` är READY. GET /actuator/health gav 200/UP den 18 oktober 15:01:34 UTC. Vercels runtime-loggar för samma request anger `region=fra1`. | Gäller denna deployment, inte bara önskad konfiguration. |
| Uppstart | Runtime-loggen anger 10,767 s för Spring-start och 12,002 s sedan JVM-start. | En start, inte p95 eller klientens hela svarstid. |
| Två separata JVM:er | Olika instans-ID:n verifierade genom effekter i samma lokala PostgreSQL. Tre omgångar med synkroniserade återtagningsanrop gav HTTP 200 från båda, en effekt och noll oavslutade publiceringar. | Lokalt PostgreSQL 17.6, inga Vercel-workers eller externa utskick. |
| Dubbla lyssnarförsök | I en första omgång sparades tre försök: ursprungligt BLOCK-försök och två återtag. Effekten förblev unik. | Registret får inte antas förhindra all parallell exekvering. |

[JSON-resultat från slutliga lokala körningen](evidence/m22-local-concurrency.json)
registrerar båda JVM:erna, samtliga tre omgångar och kraschprovet.

Källan till backend är identisk med M21:s
[SHA-256-manifest](evidence/vercel-probe-source-files.json).
Reproducera med låst JDK enligt [backend/README.md](../../backend/README.md):

```sh
python3 scripts/probe/local-lifecycle.py --concurrent-recovery
```

Provet kör även tidigare HTTP-/processdöds-/omstartsprov och städar båda JVM:erna
och den lokala Docker-databasen. Det använder endast hårdkodade lokala
testcredentials, inga molncredentials. Inga molnresurser skapas av skriptet.

## Verifierade driftförutsättningar

Vercels officiella dokumentation lästes 2026-10-18:

- [Container Runtime](https://vercel.com/docs/functions/runtimes/container):
  preview skalar ned efter 30 s utan trafik, production efter 5 min.
  Detta är förenligt med det tidigare misslyckade 60-sekundersprovet;
  det bevisar inte exakt varför just den körningens lyssnare avbröts.
- [Cron: usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing):
  Hobby tillåter högst daglig körning per jobb och har timprecision.
  Pro/Enterprise tillåter minutintervall. Ingen plan har uppgraderats.
- [Cron quickstart](https://vercel.com/docs/cron-jobs/quickstart):
  Vercel Cron körs endast på production-deployments. Preview räcker för
  manuella HTTP-prov men inte för verkligt schemalagt Vercel Cron.
- [Cron-hantering](https://vercel.com/docs/cron-jobs/manage-cron-jobs):
  `CRON_SECRET` skickas som Bearer-header; backend måste verifiera den.
  Misslyckade körningar återförsöks inte automatiskt och dubbla/missade
  anrop kan förekomma. Beständiga poster behöver återtas vid senare körning.

## Långt återtag i verklig Vercel-preview — godkänt

Deployment `dpl_B4MZhMxb7qsx53uAb7rmwLTtared` byggdes från Git-commit
`5dd9ff05d73bfcd89dd4b8d8116395d09b4f714f` med ny provtoken. Runtime-loggarna
anger fra1. Backendens kod och schema är samma som i M21. Testklienten var en
separat Vercel Sandbox, inte miljön där backendens JVM kördes.

| Prov | Före återtag | Aktiv HTTP-request | Efter upprepat återtag |
| --- | --- | --- | --- |
| Ursprunglig M21-händelse `22e40263-e8d3-451c-a7d2-e81bd9ec74b4` | PROCESSING i flera timmar; 0 effekter, 1 oavslutad post | 76 014 ms, HTTP 200; effekt 15:14:07.210100 UTC | 1 effekt, 0 oavslutade poster, 2 JVM-ID:n; upprepningen tog 15 981 ms |
| Ny BLOCK-händelse `5b546cc1-ad94-420c-99be-722cab1def51`, 60 s | 202 mottaget 15:14:24.475611 UTC; därefter 90 s utan appanrop; 0 effekter, 1 oavslutad post | 75 706 ms, HTTP 200; effekt 15:17:09.545816 UTC | 1 effekt, 0 oavslutade poster, 2 JVM-ID:n; upprepningen tog 16 124 ms |

[Molnresultat och klientens SHA-256](evidence/m22-cloud-recovery.json) innehåller
instans-ID:n och DB-observationerna. Ingen apppollning höll JVM:en aktiv under
inaktivitetsfönstret. Nytt instans-ID efteråt belägger omstart; vi har inte
mätt hela plattformens globala instansantal. Mätningen omfattar även eventuell
kallstart och är inte ett leverans-SLO eller en latensfördelning.

`python3 scripts/probe/cloud-recovery.py` reproducerar provet med
[klientkonfigurationen](../../backend/README.md). Valfria `PROBE_EXISTING_RUN_ID`
anger en befintlig oavslutad syntetisk körning. Hårdkoda inte det redan
slutförda körnings-ID:t ovan vid nästa prov. Klienten verifierar TLS och att
observationskontot inte kan skapa tabeller eller skriva effekter.

Det viktiga utfallet är att även en avbruten PROCESSING-post kan återtas.
Att bara leta efter FAILED räcker inte. Detta bevisar fortfarande manuell,
ID-styrd återtagning under en aktiv request, inte automatisk schemalagd väckning.

## Nästa avgränsade del av M22

1. **Schemalagd väckning:** implementera ett avgränsat workeranrop med
   tidsbudget och återtag av kvarvarande poster utan att varje ID skickas av
   klienten. Verifiera ålder, status, begränsat batchantal, timeout och att ett
   avbrutet försök återtas i en senare körning. Behåll Modulith-registret.
2. **Välj och prova schemaläggare:** Vercel Cron kräver testprojektets
   production-miljö; täta intervall kräver Pro/Enterprise. Alternativt kan
   [Supabase Cron](https://supabase.com/docs/guides/cron) göra HTTP-anrop med
   korta intervall. [Schemaläggningsguiden](https://supabase.com/docs/guides/functions/schedule-functions)
   beskriver pg_cron, pg_net och Vault. Testprojektet har Vault 0.3.1 installerat;
   pg_cron 1.6.4 och pg_net 0.20.4 är tillgängliga men inte installerade.
   Det möjliggör ett prov med befintliga två leverantörer. HTTP-timeout,
   previewåtkomst, secretrotation och faktisk schemalagd väckning måste provas.
3. **Samtidiga workers i molnet:** två HTTP-anrop bevisar inte två instanser.
   Registrera JVM-ID:n och jämför med det lokala två-JVM-provet. Prova även
   konkurrens om flera kvarvarande poster och återtag efter avbruten request.
4. **Krasch efter effekt före kvittens:** fastställ först transaktionsgränsen
   mellan DB-effekten och registerkvittensen. Lägg till en kontrollerad felpunkt;
   dagens CRASH kraschar före effekten och provar inte denna gräns. Bevisa
   förväntad rollback eller idempotent återtagning beroende på transaktionerna.
5. **Dimensionering och beslut:** mät anslutningar, upprepade kallstarter och
   faktisk kostnad för utveckling/test/produktion före hostingbeslut.

## Auktorisering och städning

Användaren har uttryckligen godkänt credentialöverföring för detta och kommande
isolerade test. Föregående hemligheter återskapades inte ur loggar. En ny
previewtoken provisionerades i testprojektet; runtime-lösenordet i Vercel
ändrades inte. Ett separat konto fick enbart SELECT på provtabellerna och
saknar superuser, BYPASSRLS, schemaskapande och rätt att skriva effekter.

Testklienten är stoppad efter cirka 8,3 minuter och observationskontots LOGIN
är avstängt. Vid nästa prov provisioneras nytt lösenord och LOGIN aktiveras
under provets livstid. Preview, begränsad roll och syntetiska resultat finns
kvar. Deployment Protection är aktiverat; temporär åtkomstlänk är inte sparad
här. Inga cronjobb, extensions, production-deployments eller planändringar
aktiverades. Verksamhetsschema och ordinarie Förena med data/utskick är oförändrade.

Externa utskick behöver fortfarande egen idempotens; en unik DB-effekt bevisar
inte exakt ett mejl. M22:s återstående delar ovan är dokumenterade, inte
startade som separata agenter eller GitHub Issues.
