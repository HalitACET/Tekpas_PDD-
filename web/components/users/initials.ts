/** "Zeynep Arslan" → "ZA", "Can Öztürk" → "CÖ" (Turkish capitals: i → İ). */
export function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((w) => w.charAt(0).toLocaleUpperCase("tr")).join("");
}
