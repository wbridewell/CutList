import type { DiscoveryRadius } from "@/types/playlist";

export function parseDiscoveryRadiusOverride(userMessage: string): DiscoveryRadius | null {
  if (/\b(get highly experimental|highly experimental|go way out|take big swings)\b/i.test(userMessage)) {
    return "highly_experimental";
  }
  if (/\b(push a little further|go broader|get weirder|more adventurous|be adventurous)\b/i.test(userMessage)) {
    return "adventurous";
  }
  if (/\b(play it safe|stay close to the current lane|don't go too far out|do not go too far out|keep it safe)\b/i.test(userMessage)) {
    return "safe";
  }
  if (/\b(stay balanced|keep it in the same world|moderate)\b/i.test(userMessage)) {
    return "moderate";
  }
  return null;
}
