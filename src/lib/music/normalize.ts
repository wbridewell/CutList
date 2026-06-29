const DISCOURAGED_VERSION_WORDS = /\b(karaoke|tribute|cover|sped up|slowed|reverb|commentary)\b/;
const VERSION_DETAIL_WORDS = /\b(live|demo|acoustic|instrumental|remaster(?:ed)?|remix|mono|stereo|deluxe|anniversary|version|edit|mix)\b/g;
const FEATURING_WORDS = /\b(feat|featuring|ft)\b\.?/g;
const LEADING_ARTICLE = /^the\s+/;

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeArtist(value: string): string {
  return normalizeText(value)
    .replace(FEATURING_WORDS, " ")
    .replace(/\bwith\b/g, " ")
    .replace(LEADING_ARTICLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVersionlessText(value: string): string {
  return normalizeText(value)
    .replace(VERSION_DETAIL_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLooseTitle(value: string): string {
  return normalizeVersionlessText(value)
    .replace(LEADING_ARTICLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedTrackKey(artist: string, title: string): string {
  return `${normalizeText(artist)}::${normalizeText(title)}`;
}

export function hasDiscouragedVersionTerms(value: string): boolean {
  return DISCOURAGED_VERSION_WORDS.test(normalizeText(value));
}

export function tokenOverlapScore(a: string, b: string): number {
  const aTokens = new Set(normalizeText(a).split(" ").filter(Boolean));
  const bTokens = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(aTokens.size, bTokens.size);
}
