# M22C: Schemalagd återhämtning efter JVM-död och effekt/kvittens

Status: testverifiering genomförd; slutlig radrensning avslutad och verifierad i M22E.
Se [rapporten](../m22-crash-results.md).
Beroenden: M22A och M22B mergade. Ny branch från då aktuell main, separat PR.

## Bakgrund och relevanta filer

Läs [AGENTS.md](../../../AGENTS.md), [ADR-009](../decisions.md),
[M22A](../m22-scheduler-results.md), [M22B](../m22-isolation-results.md) och
[backendens provbeskrivning](../../../backend/README.md).
M22A:s första HTTP-anrop fick timeout, men JVM:en fortsatte. Det bevisar inte
schemalagd återhämtning efter JVM-död. Befintligt manuellt kraschprov räcker
inte heller för hela Cron-kedjan. JDBC och avstängt Data API ska behållas.

Utgå från ProbeWorker/WorkerController, effects-modulens effekt-/kvittensgräns,
scripts/probe/local-lifecycle.py och scheduler-* samt befintliga WorkerTest.
Kontrollera aktuella filnamn och tester före implementation.

## Mål och acceptanskriterier

1. Identifiera två verifierbara felpunkter: före beständig effekt, samt efter
   committad effekt men före Moduliths leveranskvittens. Utred transaktions-
   gränserna först; en injicerad paus före commit är inte samma sak.
2. Begränsa felinjektion till isolerade syntetiska prov. Workertoken får inte
   godtyckligt döda instanser eller välja klientangivna körnings-ID:n.
3. Visa faktisk JVM-död med instans-ID/logg, kvarvarande beständig publicering
   och återhämtning i annan JVM genom riktig schemaläggare efter inaktivitet.
   Inga användar-/pollningsanrop till appen får orsaka återstarten.
4. Visa en databaseffekt, slutlig registerkvittens och oförändrade effekter
   efter senare återförsök. Prova överlappande workers och dokumentera vad som
   skyddas av unik constraint respektive eventuella transaktionslås.
5. Kör relevanta JUnit/Testcontainers-/processprov och repots kontroller för
   berörd kod. Lås samma versioner. Spara tider, instanser, felpunkter och
   sanerade bevis; städa jobb, tillfällig åtkomst, credentials och klienter.

## Ingår inte och säkerhetsvillkor

Ingen produktionsaktivering, riktig notifiering, verksamhetsmigrering,
planuppgradering eller garanti om exakt ett externt utskick. Inga credentials
från ordinarie Förena. Endast betrodda SQL-konton i testprojektet, minsta
credentialomfång, begränsad livslängd/anropsmängd och verifierad städning enligt
M22B. Om säker felinjektion eller observerbar JVM-död inte stöds, dokumentera
hindret utan att kalla ett timeoutprov för kraschprov.

## Resultat och överlämning

En byggbar/testbar PR med reproduktion, bevis, gränser och uppdaterad status.
M22:s register-/lastprov och kostnads-/hostingbeslut ligger kvar separat.
Tillfälligt schedulerprov godkänner inte samma credentialmodell i produktion.

## Avslut och nästa uppgift

Bas PR #101 / 175fc5e, separat branch test/scheduled-jvm-crash. Båda felpunkterna
verifierade med faktisk exit 137 lokalt och på Vercel, beständig effekt/kvittens
och återtag via riktig Supabase Cron efter minst 150 s utan användartrafik.
29 JUnit-tester, processprov och tre två-JVM-workeromgångar godkända lokalt,
liksom 1 065 frontendtester/typecheck/lint/build. Överlappande moln-HTTP-workers
valde samma publicering; bara en lyssnarstart observerades i den rundan.
Molnet bevisar därför inte konkurrens mellan två olika JVM:er för samma event.
Resultat och städning redovisas i rapporten. Ingen delegering gjordes.
Nästa avgränsning är [M22D](m22d-bounded-registry.md); last/kostnader och
hostingbeslut återstår i M22.


Städuppföljning: M22E genomförde nu det tidigare blockerade städ-SQL:t och
verifierade noll kvarvarande provposter 2026-10-18 21:09:10 UTC. Se
[städbevis](../evidence/m22e-cleanup.json); det historiska requestState-felet
är inte längre ett kvarstående rensningshinder för denna körning.
