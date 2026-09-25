// Report routes: saved custom reports (CRUD + run) and built-in standard reports.
import type { Express, Request } from 'express';
import { db } from '../db';
import {
  reports, auditions, auditionUsers, auditionUserCustomFields, customAttributes, users, divisions,
  auditionSlots, auditionRounds, judges,
} from '../db/schema';
import { eq, and, asc, desc, inArray, isNull } from 'drizzle-orm';
import { evaluateRound, computeCriterionAverages, computeRoundScore } from '../lib/roundScoring';
import {
  REPORT_FIELDS, STANDARD_REPORTS, criterionField, sortRows,
  type ReportResult, type ReportScope, type ReportOptions, type ReportColumn,
} from '../lib/reports';
import { TIMEZONE_HEADER, resolveTimeZone, formatDateInZone, formatDateTimeInZone } from '../lib/dates';

interface Deps {
  getUserIdFromRequest: (req: Request) => number | null;
  getAccessibleAuditionConditions: (userId: number) => Promise<any>;
  loadRoundScoringData: (roundId: number) => Promise<{ criteria: any[]; participants: any[] }>;
}

type RoundRow = typeof auditionRounds.$inferSelect;
type AuditionRow = typeof auditions.$inferSelect & { divisionTitle: string | null };

const round2 = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

const formatTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const formatDay = (d: string) => {
  const date = new Date(`${d}T00:00`);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const formatCustomValue = (type: string | undefined, value: string) => {
  if (type === 'multiselect') {
    try { const arr = JSON.parse(value); if (Array.isArray(arr)) return arr.join(', '); } catch {}
  }
  if (type === 'boolean') return value === 'true' ? 'Yes' : 'No';
  return value;
};

const sanitizeOptions = (input: any): ReportOptions => {
  const sort = input?.sort;
  if (sort && typeof sort.field === 'string' && sort.field) {
    return { sort: { field: sort.field, dir: sort.dir === 'desc' ? 'desc' : 'asc' } };
  }
  return {};
};

export function registerReportRoutes(app: Express, deps: Deps) {
  const { getUserIdFromRequest, getAccessibleAuditionConditions, loadRoundScoringData } = deps;

  // --- Shared data loading ---

  const loadAccessibleAuditions = async (userId: number, auditionId: number | null): Promise<AuditionRow[]> => {
    const rows = await db.select().from(auditions)
      .leftJoin(divisions, eq(divisions.id, auditions.divisionId))
      .where(await getAccessibleAuditionConditions(userId));
    const list = rows.map(r => ({ ...r.auditions, divisionTitle: r.divisions?.title ?? null }));
    return auditionId ? list.filter(a => a.id === auditionId) : list;
  };

  // Scores, ranks and results for one round. Closed rounds use the saved snapshot; open rounds a live preview.
  const loadRoundResults = async (round: RoundRow) => {
    const { criteria, participants } = await loadRoundScoringData(round.id);
    const live = evaluateRound(participants, criteria, round.advanceRule, round.advanceValue);
    const liveById = new Map(live.map(r => [r.id, r]));
    const closed = round.status === 'closed';
    const results = participants.map((p: any) => {
      const r = liveById.get(p.id)!;
      return {
        participant: p,
        averages: r.averages,
        judgeCount: r.judgeCount,
        unscored: r.unscored,
        score: closed ? p.finalScore : r.unscored ? null : r.total,
        rank: closed ? p.rank : r.unscored ? null : r.rank,
        advancing: closed ? p.status === 'advanced' : r.advancing,
      };
    });
    return { round, criteria, results };
  };
  type RoundResults = Awaited<ReturnType<typeof loadRoundResults>>;
  type ParticipantResult = RoundResults['results'][number];

  const resultLabel = (round: RoundRow, res: ParticipantResult) => {
    if (round.status === 'open') return 'In progress';
    if (res.advancing) return round.isFinal ? 'Selected' : 'Advanced';
    return 'Eliminated';
  };

  const judgeTotal = (ev: any, criteria: any[]) =>
    round2(computeRoundScore(computeCriterionAverages([ev], criteria).averages, criteria));

  const loadPeople = async (auditionIds: number[]) => {
    if (auditionIds.length === 0) return [];
    return db.select({
      auditionUserId: auditionUsers.id,
      auditionId: auditionUsers.auditionId,
      userId: users.id,
      signedUpAt: auditionUsers.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
    }).from(auditionUsers).innerJoin(users, eq(users.id, auditionUsers.userId))
      .where(inArray(auditionUsers.auditionId, auditionIds));
  };
  type Person = Awaited<ReturnType<typeof loadPeople>>[number];
  const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

  // Booked slot per participant, keyed "auditionId:userId"
  const loadSlotMap = async (auditionIds: number[]) => {
    const map = new Map<string, string>();
    if (auditionIds.length === 0) return map;
    const slots = await db.select().from(auditionSlots)
      .where(inArray(auditionSlots.auditionId, auditionIds))
      .orderBy(asc(auditionSlots.date), asc(auditionSlots.startTime));
    for (const s of slots) {
      if (!s.userId || !s.auditionId) continue;
      const key = `${s.auditionId}:${s.userId}`;
      if (!map.has(key)) map.set(key, `${s.date} ${formatTime(s.startTime)}–${formatTime(s.endTime)}`);
    }
    return map;
  };

  const loadCustomValues = async (auditionUserIds: number[]) => {
    if (auditionUserIds.length === 0) return { values: [], attrMap: new Map<number, typeof customAttributes.$inferSelect>() };
    const values = await db.select().from(auditionUserCustomFields)
      .where(inArray(auditionUserCustomFields.auditionUserId, auditionUserIds));
    const attrIds = [...new Set(values.map(v => v.customAttributeId))];
    const attrs = attrIds.length ? await db.select().from(customAttributes).where(inArray(customAttributes.id, attrIds)) : [];
    return { values, attrMap: new Map(attrs.map(a => [a.id, a])) };
  };

  const scopeLabel = (auds: AuditionRow[], scope: ReportScope, rounds: RoundRow[]) => {
    const audLabel = scope.auditionId ? auds[0]?.title ?? 'Audition' : 'All auditions';
    if (scope.round === 'latest') return `${audLabel} · Latest round reached`;
    const r = scope.auditionId ? rounds.find(x => x.roundNumber === scope.round) : null;
    return `${audLabel} · ${r?.title ?? `Round ${scope.round}`}`;
  };

  const parseScope = (body: any): ReportScope => ({
    auditionId: body?.auditionId ? Number(body.auditionId) : null,
    round: body?.round && body.round !== 'latest' && Number.isFinite(Number(body.round)) ? Number(body.round) : 'latest',
  });

  // --- Custom report dataset: one row per participant, round fields from the chosen round ---

  // tz: the viewer's timezone, used for timestamps shown in the report
  const buildParticipantRows = async (userId: number, scope: ReportScope, tz: string) => {
    const auds = await loadAccessibleAuditions(userId, scope.auditionId);
    const auditionIds = auds.map(a => a.id);
    const audMap = new Map(auds.map(a => [a.id, a]));
    const [people, slotMap, rounds] = await Promise.all([
      loadPeople(auditionIds),
      loadSlotMap(auditionIds),
      auditionIds.length ? db.select().from(auditionRounds).where(inArray(auditionRounds.auditionId, auditionIds)).orderBy(asc(auditionRounds.roundNumber)) : Promise.resolve([] as RoundRow[]),
    ]);
    const { values: cfValues, attrMap } = await loadCustomValues(people.map(p => p.auditionUserId));
    const roundResults: RoundResults[] = [];
    for (const r of rounds) roundResults.push(await loadRoundResults(r));

    const entriesByAu = new Map<number, { rr: RoundResults; res: ParticipantResult }[]>();
    for (const rr of roundResults) {
      for (const res of rr.results) {
        const list = entriesByAu.get(res.participant.auditionUserId) ?? [];
        list.push({ rr, res });
        entriesByAu.set(res.participant.auditionUserId, list);
      }
    }
    const finalRoundByAudition = new Map<number, RoundResults>();
    for (const rr of roundResults) if (rr.round.isFinal && rr.round.status === 'closed') finalRoundByAudition.set(rr.round.auditionId, rr);

    const rows: Record<string, any>[] = [];
    for (const person of people) {
      const entries = entriesByAu.get(person.auditionUserId) ?? [];
      const chosen = scope.round === 'latest'
        ? entries[entries.length - 1]
        : entries.find(e => e.rr.round.roundNumber === scope.round);
      if (scope.round !== 'latest' && !chosen) continue;
      const audition = audMap.get(person.auditionId);
      const finalRound = finalRoundByAudition.get(person.auditionId);
      let finalResult = '';
      if (finalRound) {
        finalResult = finalRound.results.some(r => r.participant.auditionUserId === person.auditionUserId && r.advancing) ? 'Selected' : 'Not selected';
      } else if (entries.length > 0) {
        finalResult = 'In progress';
      }

      const row: Record<string, any> = {
        firstName: person.firstName,
        lastName: person.lastName,
        fullName: fullName(person),
        email: person.email,
        phone: person.phone || '',
        signedUpAt: formatDateInZone(person.signedUpAt, tz),
        timeSlot: slotMap.get(`${person.auditionId}:${person.userId}`) || '',
        auditionTitle: audition?.title || '',
        auditionDate: audition?.date || '',
        auditionLocation: audition?.location || '',
        divisionTitle: audition?.divisionTitle || '',
        roundsReached: entries.length,
        finalResult,
      };
      if (chosen) {
        const { rr, res } = chosen;
        const evals = res.participant.evaluations as any[];
        Object.assign(row, {
          latestRound: rr.round.title,
          roundNumber: rr.round.roundNumber,
          rank: res.rank ?? '',
          score: round2(res.score) ?? '',
          roundStatus: resultLabel(rr.round, res),
          judgeCount: res.judgeCount,
          judges: evals.map(e => e.judgeName).join(', '),
          judgeScores: evals.map(e => `${e.judgeName}: ${judgeTotal(e, rr.criteria) ?? ''}`).join('; '),
          feedback: evals.filter(e => e.comment).map(e => `${e.judgeName}: ${e.comment}`).join(' | '),
          roundNotes: res.participant.notes || '',
          scheduledTime: res.participant.scheduledTime || '',
          override: res.participant.manualOverride === 'advance' ? 'Forced in' : res.participant.manualOverride === 'exclude' ? 'Excluded' : '',
        });
        for (const c of rr.criteria) row[criterionField(c.title)] = round2(res.averages[c.id]) ?? '';
      }
      for (const cf of cfValues.filter(v => v.auditionUserId === person.auditionUserId)) {
        row[`custom:${cf.customAttributeId}`] = cf.value;
      }
      rows.push(row);
    }
    return { rows, attrMap, auds, rounds };
  };

  const fieldType = (field: string, attrMap: Map<number, { type: string }>) => {
    if (field.startsWith('custom:')) return attrMap.get(parseInt(field.split(':')[1]))?.type ?? 'text';
    if (field.startsWith('criterion:')) return 'number';
    return REPORT_FIELDS.find(f => f.field === field)?.type ?? 'text';
  };

  const evaluateCondition = (row: Record<string, any>, condition: any, type: string): boolean => {
    const fieldValue = String(row[condition.field] ?? '');
    const compareValue = String(condition.value ?? '');
    const multi = () => {
      try { const arr = JSON.parse(fieldValue); if (Array.isArray(arr)) return arr.map(v => String(v).toLowerCase()); } catch {}
      return null;
    };
    switch (condition.operator) {
      case 'equals':
        if (type === 'number') return fieldValue !== '' && parseFloat(fieldValue) === parseFloat(compareValue);
        return fieldValue.toLowerCase() === compareValue.toLowerCase();
      case 'not_equals':
        if (type === 'number') return fieldValue === '' || parseFloat(fieldValue) !== parseFloat(compareValue);
        return fieldValue.toLowerCase() !== compareValue.toLowerCase();
      case 'contains': {
        const arr = type === 'multiselect' ? multi() : null;
        return arr ? arr.includes(compareValue.toLowerCase()) : fieldValue.toLowerCase().includes(compareValue.toLowerCase());
      }
      case 'not_contains': {
        const arr = type === 'multiselect' ? multi() : null;
        return arr ? !arr.includes(compareValue.toLowerCase()) : !fieldValue.toLowerCase().includes(compareValue.toLowerCase());
      }
      case 'starts_with': return fieldValue.toLowerCase().startsWith(compareValue.toLowerCase());
      case 'ends_with': return fieldValue.toLowerCase().endsWith(compareValue.toLowerCase());
      case 'greater_than': return fieldValue !== '' && parseFloat(fieldValue) > parseFloat(compareValue);
      case 'less_than': return fieldValue !== '' && parseFloat(fieldValue) < parseFloat(compareValue);
      case 'greater_equal': return fieldValue !== '' && parseFloat(fieldValue) >= parseFloat(compareValue);
      case 'less_equal': return fieldValue !== '' && parseFloat(fieldValue) <= parseFloat(compareValue);
      case 'before': return fieldValue !== '' && fieldValue < compareValue;
      case 'after': return fieldValue > compareValue;
      case 'is_empty': return fieldValue.trim() === '';
      case 'is_not_empty': return fieldValue.trim() !== '';
      default: return true;
    }
  };

  // --- Standard reports ---

  const loadAuditionRounds = async (auditionId: number) =>
    db.select().from(auditionRounds).where(eq(auditionRounds.auditionId, auditionId)).orderBy(asc(auditionRounds.roundNumber));

  const byRankThenName = (people: Map<number, Person>) => (a: ParticipantResult, b: ParticipantResult) => {
    const ra = a.rank ?? Number.MAX_SAFE_INTEGER, rb = b.rank ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    const pa = people.get(a.participant.auditionUserId), pb = people.get(b.participant.auditionUserId);
    return (pa?.lastName ?? '').localeCompare(pb?.lastName ?? '');
  };

  const standardReports: Record<string, (ctx: {
    audition: AuditionRow;
    rounds: RoundRow[];
    round: RoundRow | null;
    people: Map<number, Person>;
    tz: string;
  }) => Promise<Omit<ReportResult, 'title'>>> = {
    'round-results': async ({ round, people }) => {
      const rr = await loadRoundResults(round!);
      const multi = rr.criteria.length > 1;
      const columns: ReportColumn[] = [
        { field: 'rank', label: 'Rank', align: 'right' },
        { field: 'name', label: 'Participant' },
        ...(multi ? rr.criteria.map((c: any) => ({ field: criterionField(c.title), label: `${c.title} (×${c.weight})`, align: 'right' as const })) : []),
        { field: 'score', label: 'Score', align: 'right' },
        { field: 'judges', label: 'Judges', align: 'right' },
        { field: 'result', label: 'Result' },
      ];
      const rows = [...rr.results].sort(byRankThenName(people)).map(res => {
        const p = people.get(res.participant.auditionUserId);
        const row: Record<string, any> = {
          rank: res.rank ?? '',
          name: p ? fullName(p) : '',
          score: round2(res.score) ?? 'Not scored',
          judges: res.judgeCount,
          result: rr.round.status === 'open' ? (res.advancing ? 'Advancing (preview)' : '') : resultLabel(rr.round, res),
        };
        for (const c of rr.criteria) row[criterionField(c.title)] = round2(res.averages[c.id]) ?? '';
        return row;
      });
      return {
        columns, rows,
        note: rr.round.status === 'open' ? 'This round is still open. Ranks and results are a live preview based on the current cutoff.' : undefined,
      };
    },

    'judge-scoresheet': async ({ round, people }) => {
      const rr = await loadRoundResults(round!);
      const multi = rr.criteria.length > 1;
      const columns: ReportColumn[] = [
        { field: 'judge', label: 'Judge' },
        ...rr.criteria.map((c: any) => ({ field: criterionField(c.title), label: `${c.title} (/${c.maxScore})`, align: 'right' as const })),
        ...(multi ? [{ field: 'total', label: 'Weighted total', align: 'right' as const }] : []),
        { field: 'comment', label: 'Comment' },
      ];
      const rows: Record<string, any>[] = [];
      for (const res of [...rr.results].sort(byRankThenName(people))) {
        const p = people.get(res.participant.auditionUserId);
        const group = `${res.rank ? `#${res.rank} · ` : ''}${p ? fullName(p) : 'Participant'}${res.score !== null && res.score !== undefined ? ` — score ${round2(res.score)}` : ''}`;
        const evals = res.participant.evaluations as any[];
        if (evals.length === 0) {
          rows.push({ participant: group, judge: 'Not scored yet' });
          continue;
        }
        for (const e of [...evals].sort((a, b) => a.judgeName.localeCompare(b.judgeName))) {
          const row: Record<string, any> = { participant: group, judge: e.judgeName, comment: e.comment || '', total: judgeTotal(e, rr.criteria) ?? '' };
          for (const c of rr.criteria) row[criterionField(c.title)] = e.scores.find((s: any) => s.criterionId === c.id)?.score ?? '';
          rows.push(row);
        }
        if (evals.length > 1) {
          const avg: Record<string, any> = { participant: group, judge: 'Average', total: round2(computeRoundScore(res.averages, rr.criteria)) ?? '', comment: '', _emphasis: true };
          for (const c of rr.criteria) avg[criterionField(c.title)] = round2(res.averages[c.id]) ?? '';
          rows.push(avg);
        }
      }
      return { columns, rows, groupBy: 'participant' };
    },

    'advancing': async ({ round, rounds, people }) => {
      const rr = await loadRoundResults(round!);
      const next = rounds.find(r => r.roundNumber === round!.roundNumber + 1);
      const nextInfo = new Map<number, { scheduledTime: string | null; notes: string | null }>();
      if (next) {
        const { participants } = await loadRoundScoringData(next.id);
        for (const p of participants) nextInfo.set(p.auditionUserId, { scheduledTime: p.scheduledTime, notes: p.notes });
      }
      const rows = rr.results.filter(r => r.advancing).sort(byRankThenName(people)).map(res => {
        const p = people.get(res.participant.auditionUserId);
        const info = nextInfo.get(res.participant.auditionUserId);
        return {
          rank: res.rank ?? '',
          name: p ? fullName(p) : '',
          email: p?.email ?? '',
          phone: p?.phone ?? '',
          score: round2(res.score) ?? '',
          scheduledTime: info?.scheduledTime ?? '',
          notes: info?.notes ?? '',
        };
      });
      let note: string | undefined;
      if (round!.status === 'open') note = 'This round is still open. This list is a preview based on the current cutoff and overrides.';
      else if (round!.isFinal) note = 'This was the final round. These participants were selected.';
      return {
        columns: [
          { field: 'rank', label: 'Rank', align: 'right' },
          { field: 'name', label: 'Participant' },
          { field: 'email', label: 'Email' },
          { field: 'phone', label: 'Phone' },
          { field: 'score', label: 'Score', align: 'right' },
          { field: 'scheduledTime', label: next ? `${next.title} time` : 'Next round time' },
          { field: 'notes', label: 'Notes' },
        ],
        rows, note,
      };
    },

    'judging-progress': async ({ audition, round, tz }) => {
      const rr = await loadRoundResults(round!);
      const total = rr.results.length;
      const byJudge = new Map<number, { name: string; full: number; partial: number; last: Date | null }>();
      for (const res of rr.results) {
        for (const e of res.participant.evaluations as any[]) {
          const j = byJudge.get(e.judgeUserId) ?? { name: e.judgeName, full: 0, partial: 0, last: null };
          if (e.scores.length >= rr.criteria.length) j.full++; else if (e.scores.length > 0) j.partial++;
          const updated = e.updatedAt ? new Date(e.updatedAt) : null;
          if (updated && (!j.last || updated > j.last)) j.last = updated;
          byJudge.set(e.judgeUserId, j);
        }
      }
      const judgeUserIds = [...byJudge.keys()];
      const judgeEmails = judgeUserIds.length
        ? new Map((await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, judgeUserIds))).map(u => [u.id, u.email.toLowerCase()]))
        : new Map<number, string>();
      const listed = await db.select({ email: judges.email }).from(judges).where(
        audition.divisionId ? eq(judges.divisionId, audition.divisionId) : and(eq(judges.ownerUserId, audition.userId), isNull(judges.divisionId)),
      );
      const listedEmails = new Set(listed.map(l => l.email));
      const rows: Record<string, any>[] = [...byJudge.entries()].map(([id, j]) => ({
        judge: j.name,
        email: judgeEmails.get(id) ?? '',
        role: listedEmails.has(judgeEmails.get(id) ?? '') ? 'Listed judge' : 'Organizer',
        scored: `${j.full} of ${total}`,
        partial: j.partial,
        remaining: Math.max(0, total - j.full - j.partial),
        last: formatDateTimeInZone(j.last, tz),
      }));
      const scoredEmails = new Set(judgeEmails.values());
      for (const email of listedEmails) {
        if (scoredEmails.has(email)) continue;
        const u = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users)
          .where(eq(users.email, email)).then(r => r[0]);
        rows.push({ judge: u ? fullName(u) : '(no account yet)', email, role: 'Listed judge', scored: `0 of ${total}`, partial: 0, remaining: total, last: '' });
      }
      rows.sort((a, b) => String(a.judge).localeCompare(String(b.judge)));
      return {
        columns: [
          { field: 'judge', label: 'Judge' },
          { field: 'email', label: 'Email' },
          { field: 'role', label: 'Role' },
          { field: 'scored', label: 'Fully scored', align: 'right' },
          { field: 'partial', label: 'Partly scored', align: 'right' },
          { field: 'remaining', label: 'Not scored', align: 'right' },
          { field: 'last', label: 'Last activity' },
        ],
        rows,
      };
    },

    'final-selections': async ({ rounds, people }) => {
      const finalRound = [...rounds].reverse().find(r => r.isFinal && r.status === 'closed');
      const columns: ReportColumn[] = [
        { field: 'rank', label: 'Rank', align: 'right' },
        { field: 'name', label: 'Participant' },
        { field: 'email', label: 'Email' },
        { field: 'phone', label: 'Phone' },
        { field: 'score', label: 'Final score', align: 'right' },
        { field: 'notes', label: 'Notes' },
      ];
      if (!finalRound) return { columns, rows: [], note: 'No final round has been closed yet. Close a round with "Finish as final round" to record selections.' };
      const rr = await loadRoundResults(finalRound);
      const rows = rr.results.filter(r => r.advancing).sort(byRankThenName(people)).map(res => {
        const p = people.get(res.participant.auditionUserId);
        return { rank: res.rank ?? '', name: p ? fullName(p) : '', email: p?.email ?? '', phone: p?.phone ?? '', score: round2(res.score) ?? '', notes: res.participant.notes ?? '' };
      });
      return { columns, rows, note: `Selected in ${finalRound.title}.` };
    },

    'participant-history': async ({ rounds, people }) => {
      const all: RoundResults[] = [];
      for (const r of rounds) all.push(await loadRoundResults(r));
      const columns: ReportColumn[] = [
        { field: 'name', label: 'Participant' },
        { field: 'email', label: 'Email' },
        ...all.flatMap(rr => [
          { field: `r${rr.round.roundNumber}score`, label: `${rr.round.title} score`, align: 'right' as const },
          { field: `r${rr.round.roundNumber}result`, label: `${rr.round.title} result` },
        ]),
        { field: 'furthest', label: 'Furthest round' },
      ];
      const rows = [...people.values()]
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
        .map(p => {
          const row: Record<string, any> = { name: fullName(p), email: p.email, furthest: '' };
          for (const rr of all) {
            const res = rr.results.find(r => r.participant.auditionUserId === p.auditionUserId);
            row[`r${rr.round.roundNumber}score`] = res ? round2(res.score) ?? '' : '';
            row[`r${rr.round.roundNumber}result`] = res ? resultLabel(rr.round, res) : '';
            if (res) row.furthest = rr.round.title;
          }
          return row;
        });
      return { columns, rows, note: rounds.length === 0 ? "Scoring hasn't started for this audition yet." : undefined };
    },

    'schedule': async ({ audition, people }) => {
      const slots = await db.select().from(auditionSlots)
        .where(eq(auditionSlots.auditionId, audition.id))
        .orderBy(asc(auditionSlots.date), asc(auditionSlots.startTime));
      const byUser = new Map([...people.values()].map(p => [p.userId, p]));
      const statusLabel: Record<string, string> = { available: 'Open', booked: 'Booked', completed: 'Completed', 'no-show': 'No-show' };
      const rows = slots.filter(s => s.status !== 'closed').map(s => {
        const p = s.userId ? byUser.get(s.userId) : undefined;
        return {
          day: formatDay(s.date),
          time: `${formatTime(s.startTime)} – ${formatTime(s.endTime)}`,
          name: p ? fullName(p) : '',
          email: p?.email ?? '',
          phone: p?.phone ?? '',
          status: statusLabel[s.status ?? 'available'] ?? s.status,
          checkIn: '',
        };
      });
      return {
        columns: [
          { field: 'time', label: 'Time' },
          { field: 'name', label: 'Participant' },
          { field: 'email', label: 'Email' },
          { field: 'phone', label: 'Phone' },
          { field: 'status', label: 'Status' },
          { field: 'checkIn', label: 'Check-in' },
        ],
        rows, groupBy: 'day',
        note: slots.length === 0 ? 'No time slots have been created for this audition.' : undefined,
      };
    },

    'roster': async ({ audition, people, tz }) => {
      const list = [...people.values()].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
      const [slotMap, { values, attrMap }] = await Promise.all([
        loadSlotMap([audition.id]),
        loadCustomValues(list.map(p => p.auditionUserId)),
      ]);
      const attrs = [...attrMap.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const rows = list.map(p => {
        const row: Record<string, any> = {
          name: fullName(p),
          email: p.email,
          phone: p.phone ?? '',
          signedUpAt: formatDateInZone(p.signedUpAt, tz),
          timeSlot: slotMap.get(`${audition.id}:${p.userId}`) ?? '',
        };
        for (const v of values.filter(v => v.auditionUserId === p.auditionUserId)) {
          row[`custom:${v.customAttributeId}`] = formatCustomValue(attrMap.get(v.customAttributeId)?.type, v.value);
        }
        return row;
      });
      return {
        columns: [
          { field: 'name', label: 'Participant' },
          { field: 'email', label: 'Email' },
          { field: 'phone', label: 'Phone' },
          { field: 'signedUpAt', label: 'Signed up' },
          { field: 'timeSlot', label: 'Time slot' },
          ...attrs.map(a => ({ field: `custom:${a.id}`, label: a.label })),
        ],
        rows,
      };
    },
  };

  // --- Routes ---

  // Auditions (with their rounds) and criteria names the user can report on
  app.get('/api/reports/meta', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const auds = await loadAccessibleAuditions(userId, null);
      const ids = auds.map(a => a.id);
      const rounds = ids.length ? await db.select().from(auditionRounds).where(inArray(auditionRounds.auditionId, ids)).orderBy(asc(auditionRounds.roundNumber)) : [];
      const criteriaTitles = new Set<string>();
      for (const r of rounds) {
        const { criteria } = await loadRoundScoringData(r.id);
        for (const c of criteria) criteriaTitles.add(c.title);
      }
      res.json({
        auditions: auds
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(a => ({
            id: a.id, title: a.title, date: a.date, divisionTitle: a.divisionTitle,
            rounds: rounds.filter(r => r.auditionId === a.id).map(r => ({ roundNumber: r.roundNumber, title: r.title, status: r.status, isFinal: r.isFinal })),
          })),
        criteria: [...criteriaTitles].sort(),
      });
    } catch (err) {
      console.error('Failed to load report metadata:', err);
      res.status(500).json({ error: 'Failed to load report options' });
    }
  });

  app.get('/api/reports', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const userReports = await db.select().from(reports).where(eq(reports.userId, userId)).orderBy(desc(reports.createdAt));
      res.json(userReports);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch reports' });
    }
  });

  app.post('/api/reports', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { name, criteria, columns, options } = req.body;
      const newReport = await db.insert(reports).values({ userId, name, criteria, columns, options: sanitizeOptions(options) }).returning();
      res.json(newReport[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create report' });
    }
  });

  app.put('/api/reports/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const reportId = parseInt(req.params.id);
      const report = await db.select().from(reports).where(eq(reports.id, reportId)).then(rows => rows[0]);
      if (!report || report.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
      const { name, criteria, columns, options } = req.body;
      const updated = await db.update(reports)
        .set({ name, criteria, columns, options: sanitizeOptions(options), updatedAt: new Date() })
        .where(eq(reports.id, reportId)).returning();
      res.json(updated[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update report' });
    }
  });

  app.delete('/api/reports/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const reportId = parseInt(req.params.id);
      const report = await db.select().from(reports).where(eq(reports.id, reportId)).then(rows => rows[0]);
      if (!report || report.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
      await db.delete(reports).where(eq(reports.id, reportId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete report' });
    }
  });

  // Run a saved custom report. Body: { auditionId?, round?: 'latest' | number }
  app.post('/api/reports/:id/run', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const reportId = parseInt(req.params.id);
      const report = await db.select().from(reports).where(eq(reports.id, reportId)).then(rows => rows[0]);
      if (!report || report.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
      const scope = parseScope(req.body);

      const criteria: any[] = JSON.parse(report.criteria || '[]');
      const columns: ReportColumn[] = JSON.parse(report.columns || '[]');
      const { rows, attrMap, auds, rounds } = await buildParticipantRows(userId, scope, resolveTimeZone(req.get(TIMEZONE_HEADER)));
      if (scope.auditionId && auds.length === 0) return res.status(403).json({ error: 'Forbidden' });

      const filtered = criteria.length === 0 ? rows : rows.filter(row => {
        let result = evaluateCondition(row, criteria[0], fieldType(criteria[0].field, attrMap));
        for (let i = 1; i < criteria.length; i++) {
          const ok = evaluateCondition(row, criteria[i], fieldType(criteria[i].field, attrMap));
          result = criteria[i].logicOp === 'OR' ? result || ok : result && ok;
        }
        return result;
      });
      const sorted = sortRows(filtered, (report.options as ReportOptions)?.sort);
      const displayRows = sorted.map(row => {
        const display = { ...row };
        for (const key of Object.keys(display)) {
          if (key.startsWith('custom:') && typeof display[key] === 'string') {
            display[key] = formatCustomValue(attrMap.get(parseInt(key.split(':')[1]))?.type, display[key]);
          }
        }
        return display;
      });
      const result: ReportResult = {
        title: report.name,
        subtitle: scopeLabel(auds, scope, rounds.filter(r => r.auditionId === scope.auditionId)),
        columns: columns.map(c => ({
          ...c,
          align: ['number'].includes(fieldType(c.field, attrMap)) ? 'right' : 'left',
        })),
        rows: displayRows,
      };
      res.json(result);
    } catch (err) {
      console.error('Failed to run report:', err);
      res.status(500).json({ error: 'Failed to run report' });
    }
  });

  // Run a built-in report. Body: { auditionId, round?: number }
  app.post('/api/reports/standard/:key/run', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const def = STANDARD_REPORTS.find(r => r.key === req.params.key);
      const build = standardReports[req.params.key];
      if (!def || !build) return res.status(404).json({ error: 'Unknown report' });
      const auditionId = Number(req.body?.auditionId);
      if (!Number.isFinite(auditionId) || auditionId <= 0) return res.status(400).json({ error: 'Choose an audition' });
      const [audition] = await loadAccessibleAuditions(userId, auditionId);
      if (!audition) return res.status(403).json({ error: 'Forbidden' });
      const rounds = await loadAuditionRounds(auditionId);
      let round: RoundRow | null = null;
      if (def.needsRound) {
        const wanted = Number(req.body?.round);
        round = Number.isFinite(wanted) && wanted > 0 ? rounds.find(r => r.roundNumber === wanted) ?? null : rounds[rounds.length - 1] ?? null;
        if (!round) {
          return res.json({
            title: def.name, subtitle: audition.title, columns: [], rows: [],
            note: rounds.length === 0 ? "Scoring hasn't started for this audition yet." : 'That round does not exist.',
          } satisfies ReportResult);
        }
      }
      const people = new Map((await loadPeople([auditionId])).map(p => [p.auditionUserId, p]));
      const built = await build({ audition, rounds, round, people, tz: resolveTimeZone(req.get(TIMEZONE_HEADER)) });
      const result: ReportResult = {
        title: def.name,
        subtitle: [audition.title, audition.date, round?.title].filter(Boolean).join(' · '),
        ...built,
      };
      res.json(result);
    } catch (err) {
      console.error('Failed to run standard report:', err);
      res.status(500).json({ error: 'Failed to run report' });
    }
  });
}
