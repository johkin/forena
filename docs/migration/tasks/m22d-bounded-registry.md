# M22D: Begränsad läsning av Modulith-registret

Status: implementerad och lokalt verifierad i separat PR från main `ad9ac0b`.
Ingen delegering eller ny molnkörning. Se [resultat](../m22-registry-results.md). Beroenden: M22A, M22B och M22C mergade.

## Bakgrund och relevanta filer

Läs [AGENTS.md](../../../AGENTS.md), [ADR-009](../decisions.md),
[M22A:s begränsningar](../m22-scheduler-results.md),
[M22C:s resultat](../m22-crash-results.md) och [backend/README.md](../../../backend/README.md).
ProbeWorker väljer högst två kandidater via delivery/internal/PendingPublications,
men Modulith 2.1.0:s predicate-API materialiserar alla ofullständiga poster före filtrering
(eventdeserialisering är lazy; se rapportens precisering).
Options-overloadens faktiska beteende i den låsta versionen återtog FAILED,
vilket inte ersätter behovet att återta övergivna PROCESSING efter JVM-död.
En SQL-LIMIT före predicate-anropet ger därför ingen minnesgräns.

## Mål och acceptans

1. Verifiera publicerade API-/SPI-möjligheter i exakt Modulith 2.1.0 innan
   implementation. Föreslå minsta anpassning som begränsar registrets verkliga
   SQL-läsning/deserialisering och fortfarande låter Modulith äga statusövergångar.
2. Testa många fler publiceringar än batchstorleken mot PostgreSQL. Mät antal
   lästa/deserialiserade poster, startade lyssnare, minne/tid och SQL-anrop.
   Inkludera FAILED, övergivna PROCESSING, färska försök och andra lyssnare.
3. Behåll eller förbättra M22C:s garantier vid abrupt krasch, effekt/kvittens,
   två JVM:er och upprepade workers. Gör inga egna SQL-uppdateringar av Moduliths
   interna statusfält och inför inte en andra generell outbox.
4. Verifiera tids-/anslutningsbudget och avbrytande under backlog. Dokumentera
   kvarvarande mjuka gränser; ett långsamt JDBC-anrop kan inte stoppas bara av
   System.nanoTime-kontroller mellan anrop.
5. Kör JUnit/Testcontainers, struktur-/modultest, processprov och berörda
   repokontroller. Uppdatera rapport, status och reproduktion i samma byggbara PR.

## Ingår inte och överlämning

Ingen versionsändring, verksamhetsmigrering, produktionsaktivering eller ändrad
hosting. Om en säker begränsad integration inte stöds, redovisa hindret och en
konkret beslutsfråga; kalla inte en startbegränsning för begränsad registerläsning.
Ingen molnlast eller planuppgradering behövs för första lokala verifieringen.
M22:s efterföljande last-/kostnads- och hostingbeslut ska använda dessa mätvärden.

## Leverans och nästa steg

Workern har en avgränsad SPI-read-scope, primärnyckelläsning och egen read-timeout.
Modulith äger alla skrivningar. Begränsningen gäller inte bibliotekets
shutdown-diagnostik eller det manuella teknikprovsåtertaget; SQL-scan/sort och
den totala HTTP-budgeten är fortfarande mjuka gränser. Se rapportens mätvärden
och reproduktion. Nästa uppgift är [M22E](m22e-load-cost.md).
