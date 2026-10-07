/** Explicit creation takes precedence over date words such as "sista november". */
export function isReminderCreationRequest(text: string) {
  return /^påminn\b/iu.test(text.trim()) || /\b(?:skapa|gör|göra|fixa|förbered|förbereda|lägg(?:a)? till|lägg(?:a)? in|skriv|skriva|planera|schemalägg(?:a)?|vill ha)\s+(?:en\s+)?påminnelse(?:r)?\b/iu.test(text);
}

export function hasExplicitActivityCreationAction(text: string) {
  return /\b(?:skapa|gör|göra|fixa|förbered|förbereda|lägg(?:a)? till|lägg(?:a)? in|skriv|skriva|planera|schemalägg(?:a)?)\b/iu.test(text);
}

export function mentionsDraftActivity(text: string) {
  return /\b(?:aktivitet(?:er)?|träning(?:ar)?|match(?:er)?|turnering(?:ar)?|läger|intresseanmälan|kallelse(?:r)?|aktivitetsserie)\b/iu.test(text) || /cup(?:en)?\b/iu.test(text);
}
