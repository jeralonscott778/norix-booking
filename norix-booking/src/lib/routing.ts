import type { RoutingRule } from "./types";

export type RoutingContext = { occasion: string; party: number; answers: Record<string, string | boolean> };

const asText = (v: string | boolean | undefined) => (v === true ? "Yes" : v === false ? "No" : String(v ?? ""));

/** First rule whose conditions all match. Rules with no conditions never match. */
export function matchRule(rules: RoutingRule[] | undefined, ctx: RoutingContext): RoutingRule | null {
  for (const r of rules ?? []) {
    const w = r.when ?? {};
    const hasCondition = !!(w.occasion || w.party_min || w.party_max || w.question_id);
    if (!hasCondition) continue;
    if (w.occasion && w.occasion !== ctx.occasion) continue;
    if (w.party_min && ctx.party < w.party_min) continue;
    if (w.party_max && ctx.party > w.party_max) continue;
    if (w.question_id) {
      const a = asText(ctx.answers[w.question_id]);
      if (w.answer ? a !== w.answer : !a) continue;
    }
    return r;
  }
  return null;
}
