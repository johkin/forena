---
name: implement-spec
description: Implementera en befintlig featurespec från docs/specs med spårbara krav, verifiering av acceptanskriterier och uppdaterad implementationsstatus. Använd när användaren beställer implementation av en spec.
---

# Implementera en featurespec

Sökvägar i instruktionerna utgår från reporoten om inget annat anges.

1. Läs `AGENTS.md`, angiven spec och relevanta arkitektur-, design- och
   säkerhetsdokument innan du ändrar kod. Om ingen spec anges, använd den som
   entydigt framgår av samtalet. Om flera är möjliga, fråga vilken som avses.
2. Kontrollera specens status och bekräftelse. Utgå från en spec med status
   `Redo`. Har användaren redan bekräftat slutlig sammanfattning i samtalet,
   uppdatera statusen utan att begära samma bekräftelse igen. Är verkliga
   produktbeslut fortfarande öppna, använd
   [grill-me](../grill-me/SKILL.md) för just de frågorna och fortsätt med
   oberoende arbete. Hitta själv fakta som kodbasen kan besvara.
3. Läs hela specen, inklusive avgränsningar och negativa krav. Koppla krav-ID:n
   till berörda flöden och befintligt stöd. Bevara exakta datumregler, gränsvärden,
   förval och behörighetsgränser. Implementera inte undantagna funktioner.
4. Genomför den beställda omfattningen i en sammanhållen ändring. Återanvänd
   projektets produktionskomponenter och ramverksstöd. Följ `AGENTS.md` för
   branchbas, dokumentation, UI och validering. Tekniska val får inte ändra
   överenskommet produktbeteende. Ta nya produktvägval med användaren och spara
   accepterade ändringar i samma spec med motiv.
5. Verifiera relevanta acceptanskriterier, inklusive nekad åtkomst, gränsfall
   och negativa krav. Använd lämpliga tester och manuella kontroller; följ
   projektets obligatoriska kontroller. Vid UI-ändringar ska relevanta flöden
   kontrolleras på mobil och desktop. Redovisa om något inte kan verifieras.
6. Uppdatera specens fält ”Implementation och verifiering” och lägg till en
   kort redovisning per krav/acceptanskriterium: implementerat och verifierat,
   implementerat men ej verifierat, eller återstående. Länka till relevant kod,
   test eller annan evidens. Behåll produktkravens status `Redo` separat från
   implementationsstatus. Påstå inte att hela featuren är klar om något återstår.
7. Granska hela diffen och redovisa resultat och begränsningar. Skapa PR om
   användaren beställt det; annars följ den beställda leveransformen. Följ
   projektets regler före push och för att invänta CI. Merga eller driftsätt
   bara när det ingår i användarens beställning.

Exempel:

> Implementera `docs/specs/hantera-trupp.md` och skapa en PR mot `main`.

En färdig spec är ett implementationsunderlag. Den innebär inte i sig att
användaren har beställt implementation, PR, merge eller driftsättning.
