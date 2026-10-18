# M22D: begränsad registryläsning i workern

Bas: PR #102, main `ad9ac0b`. Inga versions-, hosting- eller verksamhetsändringar.
Lokalt prov mot PostgreSQL 17.6; ingen ny molnkörning eller ny molnresurs.

## Verifierat API och vald integration

Källkod från Maven Central, exakt Spring Modulith 2.1.0:

- [events-core sources](https://repo.maven.apache.org/maven2/org/springframework/modulith/spring-modulith-events-core/2.1.0/spring-modulith-events-core-2.1.0-sources.jar):
  `PersistentApplicationEventMulticaster`, `DefaultEventPublicationRegistry`,
  `EventPublicationRepository` och `TargetEventPublication`.
- [events-jdbc sources](https://repo.maven.apache.org/maven2/org/springframework/modulith/spring-modulith-events-jdbc/2.1.0/spring-modulith-events-jdbc-2.1.0-sources.jar):
  `JdbcEventPublicationRepositoryV2` och dess konfiguration.

Predicate-vägen hämtar hela `findIncompletePublications()` före filtrering.
JDBC-materialiseringen skapar objekt för hela resultatet, men själva eventet
**deserialiseras lazily**, när getEvent anropas. Tidigare formuleringar om att
alla events alltid deserialiseras före predicate är alltså för starka.
Options-overloaden använder `processFailedPublications` och läser endast FAILED;
övergivna PROCESSING skulle lämnas kvar. Bibliotekets staleness-metod läser
alla poster per status, och event/listener-lookup saknar SQL-LIMIT. Dessa är
inte en säker begränsad ersättning i den låsta versionen.

Workern använder därför ett litet, versionsbundet read-scope kring det publika
repository-SPI:t. PendingPublications väljer högst batchstorleken som tidigare.
BoundedResubmission läser därefter endast vald primärnyckel, kontrollerar typ,
lyssnare och oavslutad status, deserialiserar högst ett event och återställer
publiceringens ID och metadata i en TargetEventPublication-projektion.
En primär SPI-dekorator returnerar denna lista endast för det synkrona
predicate-anropets findIncompletePublications. ThreadLocal tas alltid bort i
finally, tillåter inte nästling och ärvs inte av lyssnartrådar.

Alla skrivningar/claims går vidare till Moduliths ursprungliga transaktions-
adviserade JDBC-repository. Kotlin `by` vidarebefordrar inte Java-defaultmetoder;
dessa måste uttryckligen skickas vidare. De befintliga testerna fångade detta
under utvecklingen. Regression verifierar även att nekad claim förblir nekad.
Ingen egen SQL uppdaterar registry-status, ingen lyssnare anropas direkt och
ingen parallell outbox införs. events-core deklareras som explicit compile-
beroende med samma låsta BOM-version. Lösningen är avsiktligt kopplad till v2-
schemat och dessa API-signaturer; uppgradering kräver nya kompatibilitetsprov.

## Lokala resultat

[Sanerad evidens](evidence/m22d-bounded-registry.json) innehåller SQL-mått,
processresultat och SHA256 för testade källor och undersökta källkods-JAR:ar.
36 JUnit-/Testcontainers-tester godkända, 0 fel/överhoppade, inklusive struktur-
och modultest. Frontend: 131 filer/1 065 tester, typecheck, lint och build godkända.
Sex Pythonregressioner och offlinekontroll av M22B-bevis godkända (ingen ny HTTP-körning).

| Extra registry-poster | Kandidatrader | Fullständiga rader / SQL-anrop | Deserialiseringar | Worker-tid | Allokerat på anropstråd |
| --- | --- | --- | --- | --- | --- |
| 100 | 2 / 1 anrop | 2 / 2 anrop | 2 | 228 ms | 129 504 bytes |
| 10 000 | 2 / 1 anrop | 2 / 2 anrop | 2 | 277 ms | 128 608 bytes |

Backloggen innehåller FAILED/PROCESSING och både verklig/annan lyssnare.
Båda riktiga kandidaterna slutfördes och alla backlograder lämnades orörda.
Kvittenspollningen gav ytterligare sex SQL-anrop/resultatrader i vardera fallet.
Heap-delta var 0 i dessa ögonblicksbilder, vilket inte betyder noll minnesbehov.
PostgreSQLs statistik visar ingen körning av vendor-repositoryts obegränsade
findIncomplete-läsning under workeranropet.

Separat riktigt processprov med 10 000 **färska** registry-poster under hela
krasch-/konkurrensdelen: exit 137 före effekt gav 0 effekter/1 oavslutad post;
exit 137 efter effektcommit gav 1 effekt/1 oavslutad. Ny JVM och upprepad worker
lämnade båda på exakt 1 effekt/0 oavslutade. Tre rundor med två olika JVM-workers
gav 200/200, en effekt och noll oavslutade varje gång. Lyssnarstarter kan vara
fler än en; andra rundan startade bara i en av JVM:erna. Alla 10 000 färska
backlogposter hade oförändrad kvittens/resubmission/försöksräkning efteråt.
De togs bort före teardown och den disponibla DB-containern raderades.
Den äldre post-response-/krasch-/manuellt återtagsbaslinjen passerade också,
innan backloggen skapades. Runtime.halt(137) är avsiktlig abrupt processdöd,
inte en separat extern OOM-/SIGKILL-injektion.

Slutsats: worker-materialiseringen växer inte med backloggen i dessa prov,
och tidigare krasch-/idempotensegenskaper bevaras. Detta bevisar inte obegränsad
kapacitet, exakt en extern leverans eller ett färdigt produktionsval.

## Vad gränsen betyder

Per workerinvokation: högst batchstorleken kandidatprojektioner, högst en
primärnyckelrad/deserialisering per kandidat. Batch är normalt två, max tio.
Hela databasens scan/sort blir **inte** konstant: kandidatvalet kan fortfarande
undersöka många rader. Resultatrader/materialiserade JVM-objekt ska inte
förväxlas med lästa heap-/indexsidor i PostgreSQL.

Registry-läsningarna i PendingPublications använder en egen JdbcTemplate med
query-timeout två sekunder, konfigurerbar 1–10 via
`probe.worker.read-timeout-seconds`. Timeout lämnar arbetet beständigt och kan
ge HTTP 500; nästa schemalagda försök återtar senare. Låst tabell provas mot
riktig PostgreSQL, inklusive att poolen kan användas efter avbrutet anrop.

Workerbudgeten är fortfarande mjuk. Poolens anslutningsväntan är upp till tio
sekunder; nätverksfel/cancel, Moduliths skrivningar, effects-API och
transaktionscommit omfattas inte av den egna read-timeouten. Ingen hård total
HTTP-deadline eller avbrytning av redan startad lyssnare utlovas.
Avbruten tråd/förbrukad deadline hindrar nytt bounded dispatch; redan påbörjad
leverans lämnas kvar vid workerbudgetens slut som tidigare.

Avgränsningen gäller **workerendpointen**. Manuellt `/{id}/recover`, andra
biblioteksadministrationsanrop och Moduliths shutdown-diagnostik behåller sin
ursprungliga obegränsade läsning. Automatisk republish-on-restart är fortsatt
avstängd. Den manuella teknikprovsendpointen är inte en produktionsworker.
En generell produktionsintegration och shutdown-beteende behöver bedömas
före pilot, utan att tyst trunkera bibliotekets administrations-API.

## Reproduktion och uppföljning

Använd det låsta JDK:t enligt backend/README.md:

```sh
cd backend
./mvnw --batch-mode --no-transfer-progress verify
cd ..
python3 scripts/probe/local-lifecycle.py --concurrent-recovery --scheduled-crash --registry-backlog 10000
```

Backlogprovet använder endast den disponibla Testcontainers-databasen.
pg_stat_statements laddas där för SQL-mätning, inte i Supabase eller runtime.
WorkerTest ger M22D_METRICS med SQL-anrop/resultatrader, deserialiseringar,
tid, allokerade bytes på anropstråden och processens heap-delta.
Heap-delta är en grov ögonblicksbild inklusive andra trådar/GC, inte peak-RSS;
allokeringsmåttet omfattar inte lyssnartrådarna. Inga minnes-/latensgarantier
härleds ur två lokala mätpunkter.

M22C:s återstående radrensning är fortfarande separat och blockerar nästa
molnprov, inte dessa lokala tester. Nästa uppgift är last-/anslutnings- och
kostnadsunderlag i M22E före hosting-/schedulerbeslut. Därefter följer
M02/M03/M04 och M07:s kompletta kallelsesvar. Se ADR-009 och status.
