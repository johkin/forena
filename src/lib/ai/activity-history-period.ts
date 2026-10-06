export type HistoryPeriod = { from: string; through: string };

function shift(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Date-only arithmetic: calendar days in the organization's zone, including today.
export function recentHistoryPeriod(today: string, days: number): HistoryPeriod {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error("Välj en period på 1–366 dagar.");
  return { from: shift(today, 1 - days), through: today };
}

export function historyPeriodFromQuestion(question: string, today: string): HistoryPeriod | undefined {
  const match = question.toLocaleLowerCase("sv-SE").match(/(?:senaste|sista)\s+(?:(\d+|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|elva|tolv)\s+)?(dag(?:ar(?:na)?|en)?|veck(?:or(?:na)?|an|a))\b/);
  if (!match) return undefined;
  const words: Record<string, number> = { en: 1, ett: 1, två: 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7, åtta: 8, nio: 9, tio: 10, elva: 11, tolv: 12 };
  const count = match[1] ? words[match[1]] ?? Number(match[1]) : 1;
  const days = count * (match[2].startsWith("veck") ? 7 : 1);
  return days >= 1 && days <= 366 ? recentHistoryPeriod(today, days) : undefined;
}
