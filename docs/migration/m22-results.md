# M22: Delresultat och nästa prov

Datum: 2026-10-18. PR #98 är mergad som
`2e0af8f3dc2756ee2d0dcbdfb7c4090f642a495f`.
Denna avgränsade fortsättning har mål och acceptanskriterier i
[M22](tasks/m22-vercel-delivery.md). Backendens runtimekod och schema är
oförändrade; ett lokalt två-JVM-prov har lagts till i befintligt processprov
och aktiverats i CI. Hela M22 är ännu inte klar.

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

## Vad som kan köras härnäst

1. **Långt återtag inom aktiv request:** skapa en syntetisk BLOCK-händelse med
   60 s fördröjning, observera beständig oavslutad post utan apptrafik, vänta
   ut inaktivitet och begär autentiserat återtag. Håll requesten aktiv tills
   effekten är sparad. Upprepa återtag och kontrollera unik effekt i DB.
   Detta bevisar manuell återtagning efter inaktivitet, inte schemalagd väckning.
2. **Samtidiga återtag i molnet:** samma prov från två klientanrop. För att
   påstå två Vercel-instanser krävs olika instans-ID:n; två HTTP-anrop räcker
   inte. Lokala provet ovan bevisar redan konkurrens mellan två JVM:er.
En läsande kontroll i testdatabasen cirka 15:07 UTC visade att den ursprungliga
60-sekundershändelsen fortfarande hade status PROCESSING, en försöksrad och
varken effekt eller kvittens. Nästa workerprov måste därför även hantera
avbrutna PROCESSING-poster, inte bara FAILED.

3. **Schemalagd väckning:** implementera ett avgränsat workeranrop med
   tidsbudget och återtag av kvarvarande poster utan att varje ID skickas av
   klienten. Välj därefter Vercel Cron i testprojektets production-miljö eller
   verifiera en extern schemaläggare, exempelvis befintlig Supabase Cron.
   [Supabase Cron](https://supabase.com/docs/guides/cron) stöder HTTP-jobb
   och korta intervall; [schemaläggningsguiden](https://supabase.com/docs/guides/functions/schedule-functions)
   beskriver pg_cron, pg_net och Vault. Testprojektet har Vault 0.3.1 installerat;
   pg_cron 1.6.4 och pg_net 0.20.4 är tillgängliga men inte installerade. Det
   ger ett möjligt prov utan tredje leverantör eller uppgraderad Vercelplan.
   Själva HTTP-väckningen, tidsgränserna och previewåtkomsten är fortfarande
   otestade. Inga extensions har aktiverats.
4. **Krasch efter effekt före kvittens:** kräver en kontrollerad felpunkt som
   dagens provkod saknar. Kör separat från befintlig CRASH, som kraschar
   före effekten. Verifiera både den hållbara effekten och leveransposten.

Fortsatta autentiserade molnprov kräver att testklienten får en begränsad
DB-credential, provtoken och godkänd previewåtkomst. Det tidigare nekade
överföringssteget inväntar uttryckligt godkännande; hemliga värden från
föregående verktygssession finns inte kvar i denna sessions minne och ska
inte återskapas ur loggar. Skyddade värden kan behöva provisioneras på nytt
för en ny testpreview utan att ändra den gamla deploymentens bevis.

Ingen automatisk schemaändring, cronaktivering, production-deploy eller
planändring ingår i denna del. Ingen testklient i Vercel Sandbox har startats.
Ordinarie Förena och dess data/utskick är oförändrade.

Full kostnadsbild, leverans-SLO, återtag efter upprepade avbrott, anslutningsbudget
och ett slutligt hostingbeslut återstår. Dagens kraschprov bevisar DB-idempotens,
inte exakt ett externt mejl.
