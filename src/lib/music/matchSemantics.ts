import { normalizeLooseTitle, normalizeText, normalizeVersionlessText, tokenOverlapScore } from "@/lib/music/normalize";

export type TitleEquivalence = {
  exact: boolean;
  loose: boolean;
  versionless: boolean;
};

export function compareTitles(a: string, b: string): TitleEquivalence {
  return {
    exact: normalizeText(a) === normalizeText(b),
    loose: normalizeLooseTitle(a) === normalizeLooseTitle(b),
    versionless: normalizeVersionlessText(a) === normalizeVersionlessText(b)
  };
}

export function titlesEquivalent(a: string, b: string): boolean {
  const comparison = compareTitles(a, b);
  return comparison.exact || comparison.loose || comparison.versionless;
}

export function albumsEquivalent(a: string, b: string): boolean {
  return normalizeLooseTitle(a) === normalizeLooseTitle(b) ||
    tokenOverlapScore(a, b) >= 0.8;
}
