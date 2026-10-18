# M01: Verifiera och lås grundprojektets verktygskedja

Status: planerad. Beroenden: M00. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Grundprojektet måste bevisa de fastställda versionerna innan verksamhetskod införs. Versionsresultaten är observationer från ett separat prov, inte ett färdigt backendbygge.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

backend/pom.xml, backend/mvnw, backend/.mvn/, backend/Dockerfile, .github/workflows/ci.yml, docs/migration/versions.md. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Skapa en minimal startbar Kotlin/Boot-backend med hälsa utan verksamhetsdata. Lås Boot 4.1.0, Kotlin 2.4.20, JDK 26 distribution/patch, Maven och plugins; verifiera checksummor och välj samma JDK lokalt/CI/container. Inkludera Modulith med verkligt strukturprov och en liten isolerad testmodul. Behåll befintliga app-/databasjobb och låt verify även kräva backend.

## Acceptanskriterier

Maven Wrapper verify lyckas på JDK26 och nekar JDK21/25; kompilatets JVM-target är 26. Container byggs och kör samma JDK26 samt svarar på hälsa. Ett riktigt @ApplicationModuleTest körs och moduldiagram genereras som byggartefakt. Modulith upptäcker en avsiktlig cykel och otillåten intern åtkomst i isolerade negativa prov. Exakta dependency- och pluginversioner dokumenterade.

## Verifiering

Maven verify, dependency:tree och effective-pom; containerbygg/start; CI från samma commit. Inga överhoppade modultester får kallas godkända.

## Lämnas till senare

Ingen frontendflytt, auth, domänschema, GCP-deploy eller bred modulställning. Stoppa och dokumentera om kombinationen inte stöds; byt inte versioner.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
