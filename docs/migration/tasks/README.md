# Självständiga migreringsuppgifter

Detta är uppgiftsbeskrivningar i repot, inte skapade GitHub Issues eller startade
Codex-sessioner. Läs [planen](../README.md) och [status](../status.md) först.
M00 är den ursprungliga inventerings- och planeringsleveransen.

Uppföljning 2026-10-21: [M07A](m07a-activity-overview.md) implementerar
**Mina aktiviteter** på `feat/my-activities` med personåtkomst enligt ADR-020.
Aktuellt driftprov, M06:s verksamhetsworker och full M03/M07-acceptans återstår;
M21/M22-koden togs bort i PR #148 och dess resultat är historiskt underlag.

| ID | Avgränsat resultat | Beroenden |
| --- | --- | --- |
| [M01](m01-toolchain.md) | Verifiera och lås grundprojektets verktygskedja | M00 |
| [M02](m02-database-foundation.md) | Inför Liquibase och PostgreSQL-testgrund | M01 |
| [M03](m03-authentication.md) | Verifiera Spring-konton, webbsessioner och separata MCP-grants | M01 |
| [M04](m04-authorization-map.md) | Återskapa effektiv databas- och behörighetskatalog | M00 |
| [M05](m05-participation-service.md) | Implementera personavgränsad läsning och svarstjänst i den rena verksamhetsdatabasen | M02, M03, M04 |
| [M06](m06-durable-events.md) | Bevisa beständig modulreaktion; extern transport först vid behov | M01, M02 |
| [M07](m07-first-flow.md) | Koppla första kompletta svarflödet till Kotlin | M05, M06 |
| [M07A](m07a-activity-overview.md) | Mina aktiviteter via egen och delegerad personåtkomst | Befintlig M03/M05-grund; driftprov före acceptans |
| [M07B](m07b-personal-activity-scope.md) | Aktiviteter via lagmedlemskap/egen lagåtkomst även utan kallelse, med separat svarsrätt | M07A; nästa startsidesteg |
| [M08](m08-cloud-foundation.md) | Vilande GCP-alternativ, endast efter konkret blockerare | M01, M02 |
| [M09](m09-activities.md) | Enstaka aktivitet samt första systemadmin, klubb/sektion/lag och administratörstilldelning | M07 |
| [M10](m10-notifications.md) | Flytta en kallelseleverans med kontrollerad e-post | M06, M22G, M09 |
| [M11](m11-duties.md) | Flytta bokning av en arbetspassplats | M07 |
| [M12](m12-data-transfer.md) | Vilande alternativ: Supabase till Cloud SQL-dataflytt | M02, M04, M08 |
| [M13](m13-cutover.md) | Genomför kontrollerad backendpilot på Supabase PostgreSQL | M07, M09, M10, M11, M14, M15A, M16 |
| [M14](m14-telegram.md) | Flytta Telegrams verifierade koppling och kallelsesvar | M07, M22G |
| [M15A](m15a-web-push.md) | Flytta Web Push-prenumeration och leverans | M07, M22G, M10 |
| [M16](m16-assistant-mcp.md) | Flytta en skrivskyddad assistent- och MCP-funktion | M03, M07, M22G |
| [M17](m17-rendering.md) | Avgör SSR och förgenerering före Vite | M00 |
| [M18A](m18a-frontend-directory.md) | Flytta befintlig frontend till egen katalog | M00 |
| [M18B](m18b-vite.md) | Implementera Vite och vald publik renderingsstrategi | M13, M17, M18A |
| [M18C](m18c-firebase-hosting.md) | Vilande Firebase-alternativ, endast efter konkret blockerare | M08, M18B |
| [M19](m19-retire-legacy.md) | Avveckla gamla resurser efter verifierad täckning | M13, verifierad frontenddrift |
| [M22A](m22a-scheduled-worker.md) | Begränsad worker och verkligt Supabase Cron-prov | M21, PR #99 |
| [M22B](m22b-scheduler-isolation.md) | Verifiera Data API och pg_net:s SQL-tillitsgräns | M22A, PR #100 |
| [M22C](m22c-scheduled-crash.md) | Schemalagd JVM-död och effekt/kvittens | M22A, M22B |
| [M22D](m22d-bounded-registry.md) | Begränsa verklig registryläsning och verifiera backlog | M22A, M22B, M22C |
| [M22E](m22e-load-cost.md) | Verifiera last/anslutningar och kostnad före hostingbeslut | M22A–D |
| [M22F](m22f-recovery-capacity.md) | Återta pilotens backlog inom avgränsad budget | M22E |
| [M22G](m22g-vercel-pilot-gates.md) | Verifiera Vercel-/schedulergrindar före pilot | M22E, M22F för slutprov |
| [M22](m22-vercel-delivery.md) | Verifiera schemalagd beständig leverans, region och Vercel-kostnad | M21 |
| [M21](m21-vercel-probe.md) | Prova Vercel-container, PostgreSQL och händelser efter HTTP-svar | M00 |
| [M20](m20-portable-postgres.md) | Verifiera portabel verksamhetsdatabas på Supabase PostgreSQL | M04, M07, M13 |


M08, M12 och M18C är vilande enligt ADR-009. GCP-kopplingar utvärderas först
vid dokumenterat konkret hinder i Vercel + Supabase. Aktiva uppgifters äldre
M08-/Pub/Sub-/Secret Manager-referenser är ersatta av vald Vercel/Supabase-
driftgrund och M22G; de kräver ingen GCP-utvärdering. M19 behöver verifierad
frontenddrift på vald hosting, inte M18C specifikt. M13 flyttar backendansvar på samma databas;
Cloud SQL är inte ett beroende för M18B eller annan aktiv uppgift.

M04 och M17 kan undersökas parallellt med M01; M03 och M02 efter M01.
M22G förbereder Vercel-/Supabase-driften före pilot. M06 är ett eget leveransprov.
M07 är första kompletta backendflödet. M13 aktiveras först när alla verkliga
pilotberoenden är identifierade och avslutade, även följduppgifter utöver tabellen.

M16 flyttar uttryckligen ett läsfall; resterande befintliga verktyg ska få egna
uppgifter. Samma regel gäller serier, närvaro, import, medlemskap, administration,
discipliner, minne och notifieringar som ännu saknar genomförd uppgift.
