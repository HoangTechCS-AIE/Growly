import "server-only";
import { clubConfig } from "../config";
import { examplesFor } from "./corpus";
import { autofix, lintPost, type LintResult } from "./lint";
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt, type Brief } from "./prompt";
import { chat, getProviderConfig, ProviderError, type ChatMessage } from "./provider";

export interface GenerateResult {
  content: string;
  lint: LintResult;
  model: string;
  attempts: number;
  /** Lint problems that survived the repair pass — shown, never silently dropped. */
  remaining: string[];
}

/** Models like to wrap prose in a fence even when told not to. */
function unfence(text: string): string {
  const fenced = text.match(/^```[a-z]*\n([\s\S]*?)\n?```$/i);
  return (fenced ? fenced[1] : text).trim();
}

function problemsOf(lint: LintResult): string[] {
  return lint.checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`);
}

export async function generatePost(brief: Brief): Promise<GenerateResult> {
  const config = getProviderConfig();
  const lintOptions = { footerMarker: clubConfig().footerMarker };
  const examples = examplesFor(brief.category);

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(brief) },
    { role: "user", content: buildUserPrompt(brief, examples) },
  ];

  let content = autofix(unfence(await chat(messages, config)));
  let lint = lintPost(content, lintOptions);
  let attempts = 1;

  // One repair pass. A second rarely helps and doubles the bill; whatever is
  // still failing goes to the editor as a visible warning instead.
  const hardFails = lint.checks.filter((c) => !c.ok && c.severity === "fail");
  if (hardFails.length > 0) {
    try {
      const repaired = await chat(
        [
          ...messages,
          { role: "assistant", content },
          { role: "user", content: buildRepairPrompt(content, problemsOf(lint)) },
        ],
        config,
      );
      const candidate = autofix(unfence(repaired));
      const candidateLint = lintPost(candidate, lintOptions);
      attempts = 2;
      if (candidateLint.score >= lint.score) {
        content = candidate;
        lint = candidateLint;
      }
    } catch (err) {
      // The first draft still stands — surface it rather than losing the work.
      if (!(err instanceof ProviderError)) throw err;
    }
  }

  return { content, lint, model: config.model, attempts, remaining: problemsOf(lint) };
}
