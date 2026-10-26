# Featurespecar

Här sparas krav, avgränsningar och beslut som intervjuats fram enligt
[arbetssättet i AGENTS.md](../../AGENTS.md#grilla-fram-en-featurespec-före-implementation).

- En fil per feature: `docs/specs/<feature-slug>.md`, med ett kort, beskrivande
  namn i gemener och bindestreck. Återanvänd filen vid fortsatt arbete.
- Utgå från [_template.md](_template.md). Anpassa detaljnivån; markera irrelevanta
  avsnitt med en kort motivering i stället för att hitta på krav.
- Spara svar och beslut efter varje besvarad intervjuomgång. Ett avbrutet samtal
  ska kunna återupptas från filens beslut och öppna frågor.
- `Utkast` betyder pågående intervju eller återstående blockerande frågor.
  `Redo` betyder att användaren bekräftat sammanfattningen och att blockerande
  frågor är lösta. Statusen säger inget om vad som har implementerats.
- Krav får stabila ID:n (`K-001`), acceptanskriterier (`AK-001`) hänvisar till
  kraven. Även krav på vad systemet aldrig får göra ska kunna verifieras.
- Håll bekräftade beslut, förslag och öppna frågor åtskilda. En rekommendation
  blir ett beslut först när användaren accepterar den.
- Länka till berörda arkitektur- och domändokument. Om ett överenskommet beslut
  ändrar en gemensam princip ska även dess ordinarie dokument uppdateras.

Det behövs inget extra kommando för att spara specen. Exempel på beställning:

> Grilla mig om en funktion för väntelista till aktiviteter och spara specen.

Agenten läser då befintligt stöd, ställer frågor i omgångar och uppdaterar specen
under samtalet. Implementation är ett separat steg som kan beställas samtidigt
eller senare.

## Skills i repot

- [grill-me](../../.agents/skills/grill-me/SKILL.md) innehåller hela intervjuflödet
  och instruktionerna för löpande specsparande. Den är anpassad från Matt Pococks
  grill-me/grilling och behöver inga andra installerade skills.
- [implement-spec](../../.agents/skills/implement-spec/SKILL.md) läser en färdig
  spec, genomför kraven och redovisar implementation och verifiering mot dess
  acceptanskriterier.

Skills ligger under `.agents/skills/<namn>/SKILL.md` och hänvisas även från
`AGENTS.md`. De kan användas med naturliga beställningar eller genom att
uttryckligen ange `$grill-me` respektive `$implement-spec` i Codex. En klient
kan behöva en ny session för att upptäcka nyss tillagda skills; hänvisningarna
i `AGENTS.md` kan läsas direkt från filerna.

Exempel på implementation:

> Implementera `docs/specs/hantera-trupp.md` och skapa en PR mot `main`.

## Sparade specar

- [Telegram-boten](telegram-bot.md) – Redo.

- [AI-assistenten](ai-assistent.md) – Redo.

- [Lagmedlemmar – hantera trupp och medlemsansökningar](hantera-trupp.md) – Redo.

- [Kalender-vyn – historik, filter och dagens datum](kalender-vy.md) – Redo.
