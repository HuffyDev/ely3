import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config";
import { canSpend, estimateTokens, recordUsage } from "../budget";
import { makeFinding } from "./evidence";
import type { Finding, CoverageItem, Category, Severity } from "./types";

/**
 * AI review with the Claude API. CRITICAL RULE: every finding the AI returns is REVIEW
 * (AI suspicion only). It can never be presented as confirmed or even likely — only a
 * static source/slither hit or a fork proof can raise the level. The AI is used to surface
 * leads a human should look at, never to assert a vulnerability.
 *
 * Budget: a hard daily cap and per-scan token limits are enforced before any call.
 */

const CATEGORIES: Category[] = [
  "access-control", "upgradeability", "hidden-mint", "blacklist", "sell-restriction",
  "fees", "reentrancy", "oracle-manipulation", "unsafe-external-call", "uniswap-v4-hook", "signatures", "other",
];
const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

const AiFinding = z.object({
  title: z.string().max(120),
  plain_explanation: z.string().max(600),
  severity: z.enum(SEVERITIES as [Severity, ...Severity[]]),
  category: z.enum(CATEGORIES as [Category, ...Category[]]),
  likely_exploitable: z.boolean(),
  where: z.string().max(160).optional(),
  why: z.string().max(1000),
  what_a_fork_test_would_check: z.string().max(400),
});
const AiResult = z.object({
  findings: z.array(AiFinding).max(20),
  covered: z.array(z.string()).max(30),
});

const SYSTEM = `You are a cautious smart-contract security reviewer for a defensive tool called WHITEHAT.
You review Solidity source or bytecode-derived descriptions for a non-developer audience.

Strict rules:
- You produce LEADS for a human to verify, never confirmed vulnerabilities. Hedge accordingly.
- Never output exploit code, attack transactions, or step-by-step exploitation. Describe risks in plain language only.
- Prefer fewer, higher-quality leads. Do not invent issues to seem thorough. If the code looks clean, return an empty findings array.
- Focus on: access control, upgradeability, hidden mint, blacklist/freezing, sell restrictions, adjustable fees/tax,
  reentrancy, oracle manipulation, unsafe external calls, Uniswap v4 hook behaviour, and signature handling.
- "plain_explanation" is for a non-developer and must say what it means for an ordinary holder/user.
- "what_a_fork_test_would_check" describes, in one sentence, an observation a local fork test could make — not how to attack.
Return only the structured object requested.`;

export type AiReviewOutput = {
  used: boolean;
  model?: string;
  costUsd?: number;
  findings: Finding[];
  coverage: CoverageItem;
  note?: string;
};

export async function runAiReview(input: {
  reportId: string;
  address: string;
  sourceText?: string;
  bytecodeSummary?: string;
}): Promise<AiReviewOutput> {
  const cov: CoverageItem = { check: "AI review (Claude)", status: "skipped" };
  if (!config.aiConfigured) {
    return { used: false, findings: [], coverage: { ...cov, note: "No ANTHROPIC_API_KEY set; AI review skipped." } };
  }

  const body = input.sourceText
    ? `Verified Solidity source for ${input.address}:\n\n${input.sourceText}`
    : `No verified source. Bytecode-derived summary for ${input.address}:\n\n${input.bytecodeSummary ?? "(none)"}`;
  const inputTokens = estimateTokens(SYSTEM + body) + 400;
  const maxOut = config.aiMaxOutputTokensPerScan;
  const spend = canSpend(config.aiModel, inputTokens, maxOut);
  if (!spend.ok) {
    return { used: false, findings: [], coverage: { ...cov, note: `AI review skipped: ${spend.reason}` } };
  }

  const client = new Anthropic();
  let parsed: z.infer<typeof AiResult> | null = null;
  let usage = { input: inputTokens, output: 0 };
  try {
    const res = await client.messages.create({
      model: config.aiModel,
      max_tokens: maxOut,
      system: SYSTEM,
      output_config: { effort: config.aiEffort },
      messages: [
        {
          role: "user",
          content: `${body}\n\nReview the contract and return a JSON object exactly matching this shape:
{"findings":[{"title","plain_explanation","severity":"critical|high|medium|low|info","category":"one of ${CATEGORIES.join("|")}","likely_exploitable":boolean,"where":"optional location","why":"reasoning","what_a_fork_test_would_check":"one observation a fork test could make"}],"covered":["short labels of what you checked"]}
Respond with only the JSON object.`,
        },
      ],
    });
    usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    parsed = AiResult.parse(JSON.parse(extractJson(text)));
  } catch (e) {
    const cost = recordUsage(config.aiModel, usage.input, usage.output, input.reportId);
    return { used: true, model: config.aiModel, costUsd: cost, findings: [], coverage: { ...cov, status: "partial", note: `AI review errored: ${(e as Error).message.slice(0, 140)}` } };
  }

  const cost = recordUsage(config.aiModel, usage.input, usage.output, input.reportId);
  const findings: Finding[] = parsed.findings.map((f, i) =>
    makeFinding({
      key: `ai:${i}:${f.title.toLowerCase().replace(/\W+/g, "-").slice(0, 40)}`,
      title: f.title,
      plain: f.plain_explanation,
      // The AI's own severity is kept for triage, but exposure is always informational at REVIEW level.
      severity: f.severity,
      category: f.category,
      exposure: "informational",
      sources: ["ai"],
      technical: `AI reasoning (unverified): ${f.why}${f.where ? `\nSuggested location: ${f.where}` : ""}\nA fork test could check: ${f.what_a_fork_test_would_check}`,
      location: f.where,
      recommendation: "This is an AI lead only. It is shown as REVIEW and must be verified by a person or a fork test before being treated as real.",
      evidence: "REVIEW",
    }),
  );
  return {
    used: true,
    model: config.aiModel,
    costUsd: cost,
    findings,
    coverage: { check: "AI review (Claude)", status: "ran", note: `${findings.length} leads, all REVIEW level. Covered: ${parsed.covered.slice(0, 8).join(", ") || "n/a"}.` },
  };
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
