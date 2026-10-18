# Självständiga migreringsuppgifter

Detta är uppgiftsbeskrivningar i repot, inte skapade GitHub Issues eller startade
Codex-sessioner. Läs [planen](../README.md) och [status](../status.md) först.
M00 är denna inventerings- och planeringsleverans.

| ID | Avgränsat resultat | Beroenden |
| --- | --- | --- |
| [M01](m01-toolchain.md) | Verifiera och lås grundprojektets verktygskedja | M00 |
| [M02](m02-database-foundation.md) | Inför Liquibase och PostgreSQL-testgrund | M01 |
| [M03](m03-authentication.md) | Verifiera Supabase-identitet och skilj kanalgrants | M01 |
| [M04](m04-authorization-map.md) | Återskapa effektiv databas- och behörighetskatalog | M00 |
| [M05](m05-participation-service.md) | Implementera familjeläsning och svarstjänst i övergångsdatabasen | M02, M03, M04 |
| [M06](m06-durable-events.md) | Bevisa beständig modulreaktion och Pub/Sub-gräns | M01, M02 |
| [M07](m07-first-flow.md) | Koppla första kompletta svarflödet till Kotlin | M05, M06 |
| [M08](m08-cloud-foundation.md) | Provisionera isolerad testdrift och releasegrund | M01, M02 |
| [M09](m09-activities.md) | Flytta skapa och ändra en enskild aktivitet | M07 |
| [M10](m10-notifications.md) | Flytta en kallelseleverans med kontrollerad e-post | M06, M08, M09 |
| [M11](m11-duties.md) | Flytta bokning av en arbetspassplats | M07 |
| [M12](m12-data-transfer.md) | Vilande alternativ: Supabase till Cloud SQL-dataflytt | M02, M04, M08 |
| [M13](m13-cutover.md) | Genomför kontrollerad backendpilot på Supabase PostgreSQL | M07, M09, M10, M11, M14, M15A, M15B, M16 |
| [M14](m14-telegram.md) | Flytta Telegrams verifierade koppling och kallelsesvar | M07, M08 |
| [M15A](m15a-web-push.md) | Flytta Web Push-prenumeration och leverans | M07, M08, M10 |
| [M15B](m15b-whatsapp.md) | Flytta WhatsApps koppling, leverans och kallelsesvar | M07, M08, M10 |
| [M16](m16-assistant-mcp.md) | Flytta en skrivskyddad assistent- och MCP-funktion | M03, M07, M08 |
| [M17](m17-rendering.md) | Avgör SSR och förgenerering före Vite | M00 |
| [M18A](m18a-frontend-directory.md) | Flytta befintlig frontend till egen katalog | M00 |
| [M18B](m18b-vite.md) | Implementera Vite och vald publik renderingsstrategi | M13, M17, M18A |
| [M18C](m18c-firebase-hosting.md) | Driftsätt frontend på Firebase med kopplad backendversion | M08, M18B |
| [M19](m19-retire-legacy.md) | Avveckla gamla resurser efter verifierad täckning | M13, M18C |
| [M22](m22-vercel-delivery.md) | Verifiera schemalagd beständig leverans, region och Vercel-kostnad | M21 |
| [M21](m21-vercel-probe.md) | Prova Vercel-container, PostgreSQL och händelser efter HTTP-svar | M00 |
| [M20](m20-portable-postgres.md) | Verifiera portabel verksamhetsdatabas på Supabase PostgreSQL | M04, M07, M13 |

M12 är vilande enligt ADR-008. M13 flyttar backendansvar på samma databas;
Cloud SQL är inte ett beroende för M18B eller annan aktiv uppgift.

M04 och M17 kan undersökas parallellt med M01; M03 och M02 efter M01.
M08 kan förberedas parallellt med första flödet. M06 är ett eget leveransprov.
M07 är första kompletta backendflödet. M13 aktiveras först när alla verkliga
pilotberoenden är identifierade och avslutade, även följduppgifter utöver tabellen.

M16 flyttar uttryckligen ett läsfall; resterande befintliga verktyg ska få egna
uppgifter. Samma regel gäller serier, närvaro, import, medlemskap, administration,
discipliner, minne och notifieringar som ännu saknar genomförd uppgift.
