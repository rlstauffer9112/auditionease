// Shared round-scoring math. Used by the server when closing a round and by the
// UI for the live preview, so the two always agree.

export type AdvanceRule = 'top_n' | 'min_score';
export type ManualOverride = 'advance' | 'exclude' | null;

export interface ScoringCriterion {
  id: number;
  maxScore: number;
  weight: number;
}

export interface ScoringEvaluation {
  judgeUserId: number;
  scores: { criterionId: number; score: number }[];
}

export interface ScoringParticipant {
  id: number;
  manualOverride: ManualOverride;
  evaluations: ScoringEvaluation[];
}

export interface RankedParticipant {
  id: number;
  // Average score per criterion across judges (null when nobody has scored it yet)
  averages: Record<number, number | null>;
  judgeCount: number;
  // At least one criterion has no score from any judge
  incomplete: boolean;
  // No judge has scored this participant at all
  unscored: boolean;
  total: number;
  rank: number;
  manualOverride: ManualOverride;
  autoAdvance: boolean;
  advancing: boolean;
}

export function roundTo(value: number, places = 2): number {
  const f = Math.pow(10, places);
  return Math.round(value * f) / f;
}

export function computeCriterionAverages(evaluations: ScoringEvaluation[], criteria: ScoringCriterion[]) {
  const averages: Record<number, number | null> = {};
  const judges = new Set<number>();
  for (const c of criteria) {
    const values: number[] = [];
    for (const ev of evaluations) {
      const s = ev.scores.find(x => x.criterionId === c.id);
      if (s && s.score !== null && s.score !== undefined && !Number.isNaN(Number(s.score))) {
        values.push(Number(s.score));
        judges.add(ev.judgeUserId);
      }
    }
    averages[c.id] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  const incomplete = criteria.some(c => averages[c.id] === null);
  return { averages, judgeCount: judges.size, incomplete, unscored: judges.size === 0 };
}

// Round score = sum(average criterion score x weight). Unscored criteria count as 0.
export function computeRoundScore(averages: Record<number, number | null>, criteria: ScoringCriterion[], weights?: Record<number, number>) {
  let total = 0;
  for (const c of criteria) {
    const avg = averages[c.id];
    if (avg === null || avg === undefined) continue;
    const w = weights && weights[c.id] !== undefined ? weights[c.id] : c.weight;
    total += avg * Number(w);
  }
  return roundTo(total, 4);
}

export function rankParticipants(
  participants: ScoringParticipant[],
  criteria: ScoringCriterion[],
  weights?: Record<number, number>,
): RankedParticipant[] {
  const rows = participants.map(p => {
    const { averages, judgeCount, incomplete, unscored } = computeCriterionAverages(p.evaluations, criteria);
    return {
      id: p.id,
      averages,
      judgeCount,
      incomplete,
      unscored,
      total: computeRoundScore(averages, criteria, weights),
      rank: 0,
      manualOverride: p.manualOverride ?? null,
      autoAdvance: false,
      advancing: false,
    };
  });
  // Scored participants first (by total desc), unscored last
  rows.sort((a, b) => {
    if (a.unscored !== b.unscored) return a.unscored ? 1 : -1;
    return b.total - a.total;
  });
  // Competition ranking: ties share a rank
  let prev: { total: number; unscored: boolean } | null = null;
  rows.forEach((r, i) => {
    if (prev && prev.total === r.total && prev.unscored === r.unscored) {
      r.rank = rows[i - 1].rank;
    } else {
      r.rank = i + 1;
    }
    prev = r;
  });
  return rows;
}

// Mark which participants advance. Top N includes anyone tied at the cutoff rank.
// Unscored participants never advance automatically. Manual overrides win.
export function determineAdvancing(ranked: RankedParticipant[], rule: AdvanceRule, value: number | null | undefined): RankedParticipant[] {
  const hasValue = value !== null && value !== undefined && !Number.isNaN(Number(value));
  return ranked.map(r => {
    let auto = false;
    if (hasValue && !r.unscored) {
      auto = rule === 'top_n' ? r.rank <= Number(value) : r.total >= Number(value);
    }
    const advancing = r.manualOverride === 'advance' ? true : r.manualOverride === 'exclude' ? false : auto;
    return { ...r, autoAdvance: auto, advancing };
  });
}

export function evaluateRound(
  participants: ScoringParticipant[],
  criteria: ScoringCriterion[],
  rule: AdvanceRule,
  value: number | null | undefined,
  weights?: Record<number, number>,
) {
  return determineAdvancing(rankParticipants(participants, criteria, weights), rule, value);
}
