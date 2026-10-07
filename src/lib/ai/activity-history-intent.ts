import { hasExplicitActivityCreationAction, isReminderCreationRequest, mentionsDraftActivity } from "./activity-creation-intent";

/** Route explicit history questions without treating upcoming planning as history. */
export function isActivityHistoryQuestion(question: string) {
  const text = question.toLocaleLowerCase("sv-SE");
  if (hasExplicitActivityCreationAction(text) && mentionsDraftActivity(text) && !isReminderCreationRequest(text)) return false;
  const activity = /\b(?:träning(?:ar|en|arna)?|tränat|tränade|match(?:er|en|erna)?|arbetspass|arbetat|närvaro|deltagit|deltog|historik(?:en)?)\b/u.test(text);
  const past = /\b(?:historik(?:en)?|registrerad|registrerade|rapporterad|senaste|sista|förra|tidigare|tränat|tränade|deltagit|deltog|arbetat)\b/u.test(text);
  return activity && past;
}

/** A forced read must never invent a period when the question has none. */
export function hasHistoryPeriod(question: string) {
  return /\d{4}-\d{2}-\d{2}|\b(?:senaste|sista|förra|under|sedan|mellan|januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\b/iu.test(question);
}

export function containsToolCode(answer: string) {
  return /\btool_code\b|\bdefault_api\.|\bprint\s*\(\s*(?:default_api\.)?readActivityHistory\s*\(/.test(answer);
}
