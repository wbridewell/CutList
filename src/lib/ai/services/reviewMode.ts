import { parseCompressionRequest } from "@/lib/playlist/analysis/compression";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import { parseInstructionIntentDetailed } from "@/lib/ai/services/instructionIntent";
import type { PlaylistState, ReviewMode } from "@/types/playlist";

function hasFocusedTransitionRepairSignals(userMessage: string): boolean {
  return /\brepair\b.{0,80}\btransition\b.{0,80}\bfrom\b.{0,120}\binto\b/i.test(userMessage) ||
    /\btransition\b.{0,80}\bfrom\b.{0,120}\binto\b.{0,120}\bbridge tracks?\b/i.test(userMessage);
}

function hasBridgeOptionSignals(userMessage: string): boolean {
  return /\bbridge tracks?\b/i.test(userMessage) ||
    /\badd[_ -]?bridge\b/i.test(userMessage) ||
    /\brecommend\b.{0,40}\b(?:one|two|three|\d+)\b.{0,20}\bbridge tracks?\b/i.test(userMessage);
}

function hasWeakLinksSignals(userMessage: string): boolean {
  return /\b(?:name|identify|list|tell me)\b.{0,30}\b(?:one|two|three|\d+)\b.{0,20}\btracks?\b.{0,40}\b(?:weaken|hurt|dilute|break|fracture|undermine|don't fit|doesn't fit|soften)\b/i.test(userMessage) ||
    /\bwhich\s+tracks?\b.{0,40}\b(?:weaken|hurt|dilute|break|fracture|undermine|don't fit|doesn't fit|soften)\b/i.test(userMessage);
}

function hasDiagnoseOnlySignals(userMessage: string): boolean {
  return /\b(?:single biggest|biggest|main|primary)\b.{0,40}\b(?:structural\s+problem|problem|issue|weakness)\b/i.test(userMessage) ||
    /\bfocused diagnosis\b/i.test(userMessage) ||
    /\bdiagnos(?:e|is)\s+only\b/i.test(userMessage) ||
    /\bnot a full rewrite\b/i.test(userMessage);
}

function hasEndingRepairSignals(userMessage: string): boolean {
  return /\b(?:ending|closer|final track|last track)\b.{0,40}\b(?:repair|fix|improve|strengthen|cooldown|resolution)\b/i.test(userMessage);
}

function hasSequencingOnlySignals(userMessage: string): boolean {
  return /\b(?:sequencing only|sequence only|reorder only|resequence only)\b/i.test(userMessage) ||
    (/\b(re-?order|resequence|sequence|flow|arc|transitions?)\b/i.test(userMessage) &&
      /\b(?:do not|don't|dont|without)\b.{0,40}\b(?:modify|change|edit|reorder|remove|add|replace|cut)\b/i.test(userMessage)) ||
    /\b(?:review|analy[sz]e|critique)\b.{0,50}\b(?:sequencing|transitions?|flow|arc)\b/i.test(userMessage);
}

export function determineReviewModeDeterministically(userMessage: string): ReviewMode {
  if (hasFocusedTransitionRepairSignals(userMessage)) {
    return "focused_transition_repair";
  }
  if (hasBridgeOptionSignals(userMessage)) {
    return "bridge_options_only";
  }
  if (parseCompressionRequest(userMessage)) {
    return "compression_review";
  }
  if (hasWeakLinksSignals(userMessage)) {
    return "weak_links_only";
  }
  if (hasDiagnoseOnlySignals(userMessage)) {
    return "diagnose_only";
  }
  if (hasEndingRepairSignals(userMessage)) {
    return "ending_repair";
  }
  if (hasSequencingOnlySignals(userMessage)) {
    return "sequencing_only";
  }
  return "full_critique";
}

export function selectReviewMode(
  userMessage: string,
  llmReviewMode: ReviewMode | null | undefined
): {
  reviewMode: ReviewMode;
  source: "deterministic" | "llm" | "fallback";
} {
  const deterministic = determineReviewModeDeterministically(userMessage);
  if (deterministic !== "full_critique") {
    return { reviewMode: deterministic, source: "deterministic" };
  }
  if (llmReviewMode) {
    return { reviewMode: llmReviewMode, source: "llm" };
  }
  return { reviewMode: "full_critique", source: "fallback" };
}

export async function resolveReviewMode(
  playlist: PlaylistState,
  userMessage: string,
  options: CuratorRunOptions = {}
): Promise<{
  reviewMode: ReviewMode;
  source: "deterministic" | "llm" | "fallback";
}> {
  const intentResult = await parseInstructionIntentDetailed(playlist, userMessage, options);
  return selectReviewMode(userMessage, intentResult.intent?.routingIntent.reviewMode);
}
