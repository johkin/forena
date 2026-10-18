# M08: Provisionera isolerad testdrift och releasegrund

Status: planerad. Beroenden: M01, M02. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Region- och kostnadsmodellen finns i costs-and-regions.md. Ingen GCP-konfiguration eller credential är verifierad i M00. Detta ska vara en avgränsad testmiljö, inte all produktion.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

infra/, .github/workflows/, backend/Dockerfile, docs/migration/costs-and-regions.md. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Inför Terraform för ett testprojekt med Cloud Run, Storage, Secret Manager, Artifact Registry, Logging/Monitoring och vid behov Scheduler/PubSub. Remote state med minsta åtkomst och låsning; hemligheter via referenser, undvik klartext i plan/state/logg. GitHub WIF/OIDC med repo/ref/environment-villkor och tjänstekonton. Välj region efter verifierat Hosting-rewrite-stöd och närhet till Supabase-databasen. Verifiera Cloud Run → Supabase med TLS, JDBC/poolerläge, anslutningsbudget, IP/IPv6, återanslutning och mätbar latens/egress. Supabase-testprojektet ska ha isolerade data och hemligheter.

## Acceptanskriterier

Terraform plan är granskningsbar och testresurser kan byggas/drivas. Samma versionsmärkta backenddigest främjas utan rebuild; migrering körs separat releasejobb. Inga produktionsdata/utskick i test. Budgetlarm och hälsa finns. M06:s återupptagning efter scale-to-zero verifieras på Cloud Run.

## Verifiering

terraform fmt/validate/plan, IAM-negativtest, JDK/version i körande container, smoke från avsedd origin och kontrollerat nollinstans-/SIGTERM-prov. Radera testresurser enligt dokumenterad livslängd.

## Lämnas till senare

Ingen Cloud SQL-provisionering eller produktionscutover, ingen delad databas för previews och inga långlivade GCP-nycklar. Om omfattningen växer bryt ut IAM/nät och runtime till två efterföljande PR:er.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
