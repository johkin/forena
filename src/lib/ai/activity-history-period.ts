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
  if (!match) return calendarHistoryPeriod(question, today);
  const words: Record<string, number> = { en: 1, ett: 1, två: 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7, åtta: 8, nio: 9, tio: 10, elva: 11, tolv: 12 };
  const count = match[1] ? words[match[1]] ?? Number(match[1]) : 1;
  const days = count * (match[2].startsWith("veck") ? 7 : 1);
  return days >= 1 && days <= 366 ? recentHistoryPeriod(today, days) : undefined;
}

const monthNames = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

function calendarHistoryPeriod(question: string, today: string): HistoryPeriod | undefined {
  const text = question.toLocaleLowerCase("sv-SE");
  const yearNow = Number(today.slice(0, 4));
  const monthNow = Number(today.slice(5, 7)) - 1;
  let year = yearNow;
  let month: number;
  if (/\bförra månaden\b/.test(text)) {
    month = monthNow - 1;
    if (month < 0) { month = 11; year--; }
  } else {
    const mentions = [...text.matchAll(new RegExp(`\\b(${monthNames.join("|")})\\b`, "g"))];
    // Leave ranges and individual dates to the explicit-date tool flow.
    if (mentions.length !== 1 || /\b(?:mellan|sedan|från|till)\b/.test(text) || /\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\b/.test(text)) return undefined;
    month = monthNames.indexOf(mentions[0][1]);
    const years = text.match(/\b(?:19|20)\d{2}\b/g);
    if (years && years.length !== 1) return undefined;
    if (years) year = Number(years[0]);
    else if (/\b(?:förra året|i fjol)\b/.test(text)) year--;
    else if (!/\bi år\b/.test(text) && month > monthNow) year--;
  }
  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, month + 1, 0, 12)).toISOString().slice(0, 10);
  return { from, through: from <= today && end > today ? today : end };
}
