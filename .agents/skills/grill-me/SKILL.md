---
name: grill-me
description: Intervjua fram en featurespec med krav och avgränsningar och spara den löpande under docs/specs. Använd vid grill-me, grilla, intervjua mig eller oklara nya features.
---

Sökvägar i instruktionerna utgår från reporoten om inget annat anges.

# Grilla fram en featurespec

När användaren säger `grill-me`, ”grilla”, ”intervjua mig” eller vill ta fram
en featurespec: intervjua tills ni delar en konkret förståelse av funktionen.
Använd även flödet inför nya features där viktiga produktbeslut är oklara.
Tydligt avgränsade rättningar och redan specificerade uppgifter behöver inte
en ny intervju. En begäran om en spec är inte en beställning av implementation.

1. Läs relevanta delar av kodbasen, projektdokumentationen och befintliga specar.
   Ta själv reda på fakta som går att hitta där. Fråga användaren om mål,
   prioriteringar och vägval, inte om sådant repot redan kan besvara.
2. Arbeta som ett beslutsträd: börja med problem, målgrupp och önskat resultat.
   Följ sedan upp de beslut som svaren öppnar för. Ställ bara frågor vars
   förutsättningar redan är avgjorda; beroende följdfrågor hör till nästa omgång.
3. Ställ korta, numrerade frågor i hanterbara omgångar. Ge en rekommendation
   och förklara relevanta alternativ och konsekvenser när underlag finns.
   Formulera rekommendationen så att ett ”ja” tydligt accepterar den.
   Vänta på svar innan du drar slutsatser som beror på dem; tystnad är inget svar.
4. Utmana vaga krav, motsägelser och antaganden respektfullt. Gå igenom huvudflöde,
   alternativa flöden, fel och gränsfall, roller och behörigheter, data och
   integrationer samt relevanta kvalitetskrav. Fastställ uttryckligen vad som
   ingår och inte ingår. Anpassa djupet efter funktionen.
5. Skapa tidigt `docs/specs/<feature-slug>.md` från
   [mallen](../../../docs/specs/_template.md), med status `Utkast`. Spara bekräftade svar
   och beslut efter varje besvarad omgång, före nästa frågeomgång. Skilj krav
   från rekommendationer, obekräftade antaganden och öppna frågor. Bevara exakta
   gränsvärden, förval och negativa krav; försvaga dem inte i sammanfattningen.
6. Intervjun är klar när funktionens relevanta beslutsgrenar är genomgångna,
   kraven har verifierbara acceptanskriterier och inga blockerande frågor
   återstår. Sammanfatta specen, särskilt krav och avgränsningar, och låt
   användaren bekräfta eller korrigera den. Markera först därefter `Redo`.
   Vid avbrott: behåll utkastet med återstående frågor och fortsätt där nästa gång.
7. Avsluta med sökvägen till den sparade specen. Implementera när användaren
   har beställt implementation; begär inte samma beställning på nytt om den
   redan finns. Vid implementation ska specens krav och acceptanskriterier
   styra arbetet. Uppdatera specen när överenskomna beslut ändras och skilj
   specificerat beteende från vad som faktiskt är implementerat och verifierat.

Återanvänd och uppdatera samma spec för samma feature. Skapa inte konkurrerande
versioner och skriv inte över andra funktioners specar. Håll `AGENTS.md` till
arbetssättet; featurekrav och avgränsningar hör hemma i `docs/specs/`.

Flödet är anpassat från Matt Pococks
[grill-me](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)
och [grilling](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md),
med löpande lagring av featurespecen som projektspecifikt tillägg. Instruktionerna
ovan är fristående och kräver ingen ytterligare skill eller extern tjänst.
