type PromptLine = string | null | undefined | false;

export function compactPromptLines(lines: PromptLine[]): string[] {
  return lines.filter((line): line is string => typeof line === "string" && line.length > 0);
}

export function buildPromptEnvelope(sections: Array<PromptLine | PromptLine[]>): string {
  return sections
    .flatMap((section) => Array.isArray(section) ? compactPromptLines(section) : compactPromptLines([section]))
    .join("\n");
}
