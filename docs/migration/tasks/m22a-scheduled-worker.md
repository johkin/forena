# M22A: Begränsad worker och verklig Supabase Cron-väckning

Status: genomförd teknikdel, resultat i [rapporten](../m22-scheduler-results.md).
Beroende: M21/PR #98 och M22:s första del/PR #99 mergade.
Denna avgränsning bryts ut ur M22; M22:s hostingbeslut är fortfarande öppet.

## Bakgrund och filer

Läs [AGENTS.md](../../../AGENTS.md), [M22](m22-vercel-delivery.md),
[tidigare resultat](../m22-results.md), [ADR-009](../decisions.md) och
[backend/README.md](../../../backend/README.md).
Manuellt ID-styrt återtag fungerar efter previewns nedskalning. Nästa fråga är
om ett verkligt återkommande jobb kan väcka JVM:en och slutföra kvarvarande arbete.

Backendens delivery-modul och WorkerController exponerar workeranropet.
EffectControl skyddar försöksdata internt. ProbeSecurity skiljer provtoken från
workertoken. WorkerTest verifierar PostgreSQL-/HTTP-beteendet. Providerbootstrap,
testdata och städning finns i scripts/probe/scheduler-*; bevis i docs/migration/evidence.

## Mål och acceptanskriterier

1. Ny branch från aktuell main, separat PR och låsta versioner enligt M21.
2. Skyddat workeranrop utan klientangivna körnings-ID:n. Begränsa antal starter,
   tillgänglig tid och urvalets ålder; återta även övergivna PROCESSING-poster.
   Behåll Modulith som leveransregister och dokumentera faktiska API-begränsningar.
3. Separat maskincredential ska inte kunna skapa händelser eller köra CRASH.
   Logga kanal/aktör och resultat utan credentials.
4. Låt riktig Supabase Cron kalla Vercel efter inaktivitet och utan användartrafik.
   Prova 1 s och 60 s arbete samt kontrollerad HTTP-timeout. Kontrollera register,
   effekter, instans-ID:n, senare körningar och dubblettålighet.
5. Testa workerbehörigheter, färskhet, batch, budget, concurrency och idempotens
   med JUnit/Testcontainers; kör befintliga relevanta kontroller.
6. Provider-SQL körs endast i forena-kotlin. Lås provets livslängd/antal anrop,
   skydda credentials och verifiera städning av jobb, Vault och HTTP-loggar.

## Ingår inte och nästa överlämning

Ingen verksamhetsmigrering, riktiga utskick, egen outbox, produktionsdeploy
eller planuppgradering. Kostnads-/lastprov och faktisk schemalagd JVM-krasch
hör till kvarvarande M22. Rapportera pg_net:s plattformsägda PUBLIC-grants,
ej verifierad Data API-isolering och Moduliths obundna läsning som öppna
produktionsgränser. Byt inte hosting eller fasta versioner automatiskt.
