export function containsToolCode(answer: string) {
  return /\btool_code\b|\bdefault_api\.|\bprint\s*\(\s*(?:default_api\.)?readActivityHistory\s*\(/.test(answer);
}
