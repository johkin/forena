# M22F: dimensionera beständig återtagning för en förening

Status: genomförd lokalt på `test/recovery-capacity`; se
[resultat och överlämning](../m22-recovery-results.md).
Ingen separat session/agent eller GitHub Issue skapad.
Beroende: M22E mergad i PR #104; branch från main `a3ff203` och egen PR.

## Bakgrund och avgränsat mål

Läs AGENTS.md, ADR-009 i [besluten](../decisions.md),
[M22E](../m22-load-cost-results.md), [kostnader](../m22-costs.md),
[M22D](../m22-registry-results.md) och [status](../status.md).
Relevanta filer: `backend/src/main/kotlin/se/forena/probe/delivery/ProbeWorker.kt`,
`delivery/internal` och `effects/EffectControl.kt` under samma paketrot,
backend/src/main/resources/application.properties, Liquibase changelog,
WorkerTest, RegistryScopeTest och scripts/probe/local-capacity.py.
Boot 4.1.0, Kotlin 2.4.20, JDK 26 och Modulith 2.1.0 är låsta.

M22E visar en effekt per körnings-ID men extra försök/anrop med två JVM:er.
Nuvarande batch två per minut ger minst 50 minuter för 100 kvarvarande
publiceringar efter stale-väntan. Det föreslagna pilotmålet är 100 återtag
inom fem minuter efter stale-gränsen. Vanlig synkron verksamhet och normal
asyncleverans är inte samma sak som denna återtagningskapacitet.

## Acceptans och verifiering

1. Låt en requestbunden worker arbeta med små, SQL-begränsade batcher inom
   tydlig tids-/anslutningsbudget så att målet kan nås utan användartrafik.
   Verifiera verklig scan/materialisering, rättvis behandling av färska,
   försenade, överbudgeterade/felande poster och andra lyssnare. Ingen het
   återförsöksloop eller tyst svält av resten av kön.
2. Modulith äger claims/statusövergångar. Ingen parallell outbox, egna runtime-
   uppdateringar av bibliotekets statusfält eller versionersättning. Om SPI-
   begränsningar hindrar detta, redovisa exakt hinder och alternativ i byggbart
   skick. Begränsad läsning ska bevaras vid alla upprepade delbatcher.
3. Testa lokal schedulerkadens, inte bara kontinuerligt HTTP-dräneringstest:
   burst om 100 leveranser, missad tick, DB-timeout, poolmättnad och två JVM:er.
   Bevara verkliga kraschprov före effekt/efter commit och idempotens. Redovisa
   faktisk köålder, starter, kvittenser, anslutningar, CPU/minne och SQL.
4. Föreslå ett pool-/instanstak med reserv för utrullning, Auth/drift och
   REQUIRES_NEW-anrop. Utvärdera transaktionspooler separat; byt inte JDBC-
   läge utan kompatibilitetstest. Egna index ska ha Liquibase-migration,
   databevarande upgrade-/repeat-prov och relevant lokal DB-verifiering.
5. Kör JUnit/Testcontainers, struktur/modultester, process-/kapacitetsprov och
   relevanta repokontroller. Uppdatera rapport, kostnadsantaganden, ADR/status
   och överlämning i samma PR. Ingen produktionsaktivering.

## Ingår inte och nästa beroende

Ingen ny hosting, planuppgradering, verksamhets-/frontendflytt eller generell
kö. Lokal implementering räcker här. Molnprovet och konkreta driftgrindar är
[M22G](m22g-vercel-pilot-gates.md), som kan förberedas med pris-/konfiggranskning
parallellt men ska använda mergad M22F-kod för det slutliga kapacitetsprovet.

## Leverans M22F

Flera SQL-begränsade sidor, mjuk budget, högst 64 starter/256 kandidater och
beständig CAS-markör för turordning över anrop. Modulith äger leveransstatus.
Liquibase probe-003-worker-cursor ska köras separat före ny runtime i M22G.
44 backendtester inklusive fresh/upgrade/repeat, felande/stillastående lyssnare,
markörkonkurrens och grants. Rapporten anger processprov, minutkadens, SQL,
resurser och övriga verifieringsresultat; ingen molnaktivering i denna del.

Vercel + Supabase är vald arbetsinriktning. GCP-kopplingar utvärderas först vid
ett dokumenterat konkret hinder. Nästa beroende uppgift är M22G:s isolerade
molnprov och driftgrindar på mergad M22F-kod.
