# M22E: last, anslutningar och kostnad före hostingbeslut

Status: planerad; ingen separat session/agent eller GitHub Issue startad.
Beroenden: M22A–D mergade. Ny branch från aktuell main, egen PR.

## Bakgrund och relevanta filer

Läs [AGENTS.md](../../../AGENTS.md), ADR-008/009 i [besluten](../decisions.md),
[M22D:s rapport](../m22-registry-results.md), [M22C:s rapport](../m22-crash-results.md),
[kostnadsunderlaget](../costs-and-regions.md) och [status](../status.md).
Backendens ProbeWorker, delivery/internal, application.properties, pom.xml,
Dockerfile och scripts/probe/local-lifecycle.py är reproduktionsbas.
Låsta versioner kvarstår. Inget produktionsval är gjort.

M22D begränsar worker-materialisering till batchstorleken men gör inte SQL-
scan/sort konstant, inför ingen hård requestdeadline och ändrar inte manuellt
återtag/shutdown-diagnostik. Modulith äger fortsatt claims och statusövergångar.
Supabase Data API är avsiktligt avstängt. pg_net:s PUBLIC-grants innebär att
alla direkta SQL-loginroller kan läsa köheaders; Vault löser inte den gränsen.

## Avgränsat mål och acceptans

1. Beskriv representativa lastantaganden för dev/test/prod: antal föreningar,
   samtidiga svar, burst vid kallelse, interna leveranser och godtagbar köålder.
   Skilj antaganden från observerade mätvärden; fråga endast om oklarheter som
   faktiskt påverkar valet. Skapa inga betalplaner automatiskt.
2. Mät lokalt större köer, queryplaner/scan/sort, anslutningar och poolmättnad
   med flera workers. Pröva långsamt DB-anrop, fel, långa lyssnare och köålder.
   Redovisa throughput, p95/variation, JVM-minne, SQL-tid och fel. Jämför vald
   batch/stale/budget mot max fyra anslutningar per JVM och möjlig instansskala.
   Om index behövs, använd egen Liquibaseändring och uppgraderingstest; inga
   handskrivna statusuppdateringar eller dubbla leveransmekanismer i runtime.
3. Uppdatera daterade priser och faktiska plan-/betabegränsningar från officiella
   källor för Vercel + Supabase respektive Cloud Run + Supabase. Separera fasta
   avgifter, DB-compute, CPU/minne, workeraktiv tid, requests, trafik, lagring,
   loggar och möjliga kostnader för extern scheduler. Använd Frankfurt/närliggande
   regioner och redovisa valuta, moms och trafikantaganden. Ingen Cloud SQL-flytt.
4. Molnprov får endast ske i isolerade forena-kotlin med syntetiska data, tydligt
   antal anrop/sluttid och efter verifierad M22C-rensning med
   scripts/probe/m22c-cleanup.sql. Läs aldrig råa pg_net-headers/felkroppar för
   loggning. Stäng av och rensa efteråt. Om requestState-felet kvarstår, fortsätt
   lokalt/priskontroll och dokumentera blockerad molnverifiering korrekt.
5. Rekommendera hosting och scheduler med motivering, alternativ och kvarvarande
   beslut. Skilj Kotlin-containerns stöd/garantier från observerat testbeteende.
   Hantera credentialgränsen, shutdown-diagnostik och manuella probe-endpoints
   innan pilot. Själva produktionsaktiveringen ingår inte.
6. Leverera reproducerbara prover, sanerad evidens, kostnadstabell för alla tre
   miljöer och uppdaterad status/ADR-009. Kör relevanta lokala kontroller före
   push, följ exakt CI-commit och lämna repot byggbart.

## Ingår inte och överlämning

Ingen ny betalplan, produktionsinfrastruktur, databasflytt, frontendflytt eller
verksamhetsmigrering. Ingen publik last mot ordinarie Förena.
Om arbetet växer, dela lokalt kapacitetsprov och moln-/kostnadsbeslut i egna
uppgifter med uppmätta gränser och källor. Efter hostingbeslut återstår bland
annat M02/M03/M04 och svarstjänsten inför [M07](m07-first-flow.md).
