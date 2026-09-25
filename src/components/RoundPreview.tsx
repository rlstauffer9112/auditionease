import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, ArrowRight, AlertTriangle, Loader2, Flag, RotateCcw, ArrowUpRight, ArrowDownRight, Trophy } from 'lucide-react';
import { evaluateRound, type AdvanceRule, type ScoringParticipant } from '../lib/roundScoring';
import type { ScoringTemplate } from './ScoringTemplatesEditor';
import { AuthFetch, RoundDetail, RoundParticipant, formatScore, jsonHeaders } from './roundTypes';

interface Props {
  detail: RoundDetail;
  authFetch: AuthFetch;
  templates: ScoringTemplate[];
  canReopen: boolean;
  onParticipantChange: (participant: RoundParticipant) => void;
  onRoundChanged: (focusRoundId?: number) => void;
}

const parseValue = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function RoundPreview({ detail, authFetch, templates, canReopen, onParticipantChange, onRoundChanged }: Props) {
  const { round, criteria, participants, currentUserId } = detail;
  const isOpen = round.status === 'open';
  const multiCriteria = criteria.length > 1;
  const multiJudge = participants.some(p => p.evaluations.some(e => e.judgeUserId !== currentUserId));

  const defaultValue = round.advanceValue ?? (round.advanceRule === 'top_n' ? Math.max(1, Math.ceil(participants.length / 2)) : null);
  const [rule, setRule] = useState<AdvanceRule>(round.advanceRule);
  const [valueStr, setValueStr] = useState(defaultValue === null ? '' : String(defaultValue));
  const [weights, setWeights] = useState<Record<number, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [nextTitle, setNextTitle] = useState(`Round ${round.roundNumber + 1}`);
  const [nextSource, setNextSource] = useState<string>('same');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRule(round.advanceRule);
    const v = round.advanceValue ?? (round.advanceRule === 'top_n' ? Math.max(1, Math.ceil(participants.length / 2)) : null);
    setValueStr(v === null ? '' : String(v));
    setNextTitle(`Round ${round.roundNumber + 1}`);
    setNextSource('same');
    setError(null);
  }, [round.id]);

  useEffect(() => {
    setWeights(Object.fromEntries(criteria.map(c => [c.id, String(c.weight)])));
  }, [criteria]);

  const weightNums = useMemo(() => {
    const out: Record<number, number> = {};
    for (const c of criteria) {
      const w = parseValue(weights[c.id] ?? '');
      out[c.id] = w !== null && w >= 0 ? w : c.weight;
    }
    return out;
  }, [weights, criteria]);
  const weightsChanged = criteria.some(c => weightNums[c.id] !== c.weight);

  const scoring: ScoringParticipant[] = participants.map(p => ({ id: p.id, manualOverride: p.manualOverride, evaluations: p.evaluations }));
  const value = parseValue(valueStr);
  const rows = evaluateRound(scoring, criteria, rule, value, weightNums);
  const baseline = weightsChanged ? evaluateRound(scoring, criteria, rule, value) : rows;
  const baselineAdvancing = new Set(baseline.filter(r => r.advancing).map(r => r.id));
  const byId = new Map(participants.map(p => [p.id, p]));
  const advancingCount = rows.filter(r => r.advancing).length;
  const incompleteCount = rows.filter(r => r.incomplete).length;
  const lastAutoIndex = rows.reduce((acc, r, i) => (r.autoAdvance ? i : acc), -1);

  const saveRule = async (nextRule: AdvanceRule, nextValue: number | null) => {
    await authFetch(`/api/rounds/${round.id}`, {
      method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ advanceRule: nextRule, advanceValue: nextValue }),
    });
  };

  const toggleAdvance = async (rowId: number, checked: boolean, autoAdvance: boolean) => {
    const override = checked === autoAdvance ? null : checked ? 'advance' : 'exclude';
    const p = byId.get(rowId);
    if (!p) return;
    onParticipantChange({ ...p, manualOverride: override });
    const res = await authFetch(`/api/round-participants/${rowId}`, {
      method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ manualOverride: override }),
    });
    if (!res.ok) onParticipantChange(p);
  };

  const saveWeights = async () => {
    setBusy(true);
    try {
      const res = await authFetch(`/api/rounds/${round.id}/criteria`, {
        method: 'PUT', headers: jsonHeaders,
        body: JSON.stringify({ criteria: criteria.map(c => ({ ...c, weight: weightNums[c.id] })) }),
      });
      if (res.ok) onRoundChanged(round.id);
    } finally {
      setBusy(false);
    }
  };

  const closeRound = async (final: boolean) => {
    const message = final
      ? `Finish ${round.title} as the final round? ${advancingCount} participant${advancingCount === 1 ? '' : 's'} will be marked as selected.`
      : `Close ${round.title} and move ${advancingCount} participant${advancingCount === 1 ? '' : 's'} to ${nextTitle || `Round ${round.roundNumber + 1}`}?`;
    if (!confirm(message)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/rounds/${round.id}/close`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
          advanceRule: rule,
          advanceValue: value,
          weights: weightNums,
          final,
          nextRound: final ? undefined : { title: nextTitle, templateId: nextSource === 'same' ? undefined : Number(nextSource) },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not close the round.'); return; }
      onRoundChanged(data.nextRound?.id ?? round.id);
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!confirm(`Reopen ${round.title}? Results will be cleared and any following round with no scores yet will be removed.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/rounds/${round.id}/reopen`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not reopen the round.'); return; }
      onRoundChanged(round.id);
    } finally {
      setBusy(false);
    }
  };

  // --- Closed round: show the saved results ---
  if (!isOpen) {
    const results = [...participants].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.lastName.localeCompare(b.lastName));
    const advanced = results.filter(p => p.status === 'advanced').length;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#E5E7EB]">
          <p className="text-sm text-[#374151]">
            {round.isFinal
              ? <><Trophy size={14} className="inline text-[#F59E0B] mr-1" /><span className="font-bold">{advanced}</span> selected in this final round.</>
              : <><span className="font-bold">{advanced}</span> of {participants.length} advanced.</>}
          </p>
          {canReopen && (
            <button onClick={reopen} disabled={busy} className="flex items-center gap-1.5 text-sm font-bold text-[#6B7280] hover:text-[#4F46E5] disabled:opacity-50">
              <RotateCcw size={14} /> Reopen round
            </button>
          )}
        </div>
        {error && <p className="text-sm text-[#EF4444]">{error}</p>}
        <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm divide-y divide-[#F3F4F6]">
          {results.map(p => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-3">
              <span className="w-8 text-sm font-bold text-[#9CA3AF]">{p.rank ?? '—'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{p.firstName} {p.lastName}</p>
                <p className="text-xs text-[#6B7280] truncate">{p.email}</p>
              </div>
              <span className="text-sm font-bold w-16 text-right">{formatScore(p.finalScore)}</span>
              {p.status === 'advanced' ? (
                <span className="text-xs font-bold text-[#10B981] bg-[#ECFDF5] px-2 py-1 rounded-md w-24 text-center">{round.isFinal ? 'SELECTED' : 'ADVANCED'}</span>
              ) : (
                <span className="text-xs font-bold text-[#9CA3AF] bg-[#F3F4F6] px-2 py-1 rounded-md w-24 text-center">NOT ADVANCED</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Open round: live preview ---
  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-3xl border border-[#E5E7EB] shadow-sm flex flex-wrap items-center gap-4">
        <span className="text-sm font-bold text-[#374151]">Advance</span>
        <div className="flex bg-[#F3F4F6] p-1 rounded-xl">
          {([['top_n', 'Top'], ['min_score', 'Score at least']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setRule(key); saveRule(key, value); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${rule === key ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="number"
          min="0"
          step={rule === 'top_n' ? 1 : 'any'}
          value={valueStr}
          onChange={e => setValueStr(e.target.value)}
          onBlur={() => saveRule(rule, value)}
          placeholder={rule === 'top_n' ? 'How many' : 'Min score'}
          className="w-28 border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none"
        />
        <span className="text-sm text-[#6B7280]">{rule === 'top_n' ? 'participants' : 'points'}</span>
        <span className="ml-auto text-sm text-[#6B7280]"><span className="font-bold text-[#111827]">{advancingCount}</span> of {rows.length} advancing</span>
      </div>

      {incompleteCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-4 py-2.5 rounded-xl">
          <AlertTriangle size={16} />
          {incompleteCount} participant{incompleteCount === 1 ? " hasn't" : "s haven't"} been fully scored. Missing scores count as 0.
        </div>
      )}

      {multiCriteria && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB]">
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full flex items-center justify-between px-5 py-3 text-sm font-bold text-[#374151]">
            <span>Advanced: adjust weights{weightsChanged && <span className="ml-2 text-xs text-[#D97706]">(unsaved changes)</span>}</span>
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showAdvanced && (
            <div className="px-5 pb-4 space-y-3">
              <p className="text-xs text-[#6B7280]">Try different weights and watch who moves above or below the cutoff. Nothing is saved until you click Save weights or close the round.</p>
              <div className="flex flex-wrap gap-3">
                {criteria.map(c => (
                  <label key={c.id} className="flex items-center gap-2 bg-[#F9FAFB] rounded-xl px-3 py-2 text-sm">
                    <span className="font-medium">{c.title}</span>
                    <span className="text-[#9CA3AF]">×</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={weights[c.id] ?? ''}
                      onChange={e => setWeights({ ...weights, [c.id]: e.target.value })}
                      className="w-20 border border-[#E5E7EB] rounded-lg px-2 py-1 text-sm bg-white"
                    />
                  </label>
                ))}
              </div>
              {weightsChanged && (
                <div className="flex gap-3">
                  <button onClick={saveWeights} disabled={busy} className="px-4 py-2 bg-[#4F46E5] text-white rounded-xl text-sm font-bold disabled:opacity-50">Save weights</button>
                  <button onClick={() => setWeights(Object.fromEntries(criteria.map(c => [c.id, String(c.weight)])))} className="px-4 py-2 text-sm font-bold text-[#6B7280]">Reset</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold text-[#6B7280] uppercase tracking-wider border-b border-[#F3F4F6]">
              <th className="px-5 py-3 w-12">#</th>
              <th className="px-2 py-3">Participant</th>
              {multiCriteria && showAdvanced && criteria.map(c => <th key={c.id} className="px-2 py-3 text-right">{c.title}</th>)}
              {multiJudge && <th className="px-2 py-3 text-right">Judges</th>}
              <th className="px-2 py-3 text-right">Score</th>
              <th className="px-5 py-3 text-center w-24">Advance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = byId.get(r.id)!;
              const movedIn = weightsChanged && r.advancing && !baselineAdvancing.has(r.id);
              const movedOut = weightsChanged && !r.advancing && baselineAdvancing.has(r.id);
              return (
                <React.Fragment key={r.id}>
                  <tr className={`border-b border-[#F3F4F6] ${r.advancing ? 'bg-[#F0FDF4]' : ''}`}>
                    <td className="px-5 py-2.5 font-bold text-[#9CA3AF]">{r.unscored ? '—' : r.rank}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{p.firstName} {p.lastName}</span>
                        {r.incomplete && !r.unscored && <span title="Not fully scored"><AlertTriangle size={12} className="text-[#D97706]" /></span>}
                        {r.unscored && <span className="text-xs text-[#9CA3AF]">not scored</span>}
                        {movedIn && <span className="flex items-center text-[10px] font-bold text-[#10B981]"><ArrowUpRight size={12} />IN</span>}
                        {movedOut && <span className="flex items-center text-[10px] font-bold text-[#EF4444]"><ArrowDownRight size={12} />OUT</span>}
                      </div>
                    </td>
                    {multiCriteria && showAdvanced && criteria.map(c => (
                      <td key={c.id} className="px-2 py-2.5 text-right text-[#6B7280]">{formatScore(r.averages[c.id] === null ? null : Math.round((r.averages[c.id] as number) * 100) / 100)}</td>
                    ))}
                    {multiJudge && <td className="px-2 py-2.5 text-right text-[#6B7280]">{r.judgeCount}</td>}
                    <td className="px-2 py-2.5 text-right font-bold">{r.unscored ? '—' : formatScore(Math.round(r.total * 100) / 100)}</td>
                    <td className="px-5 py-2.5 text-center">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={r.advancing}
                          onChange={e => toggleAdvance(r.id, e.target.checked, r.autoAdvance)}
                          className="w-4 h-4 accent-[#4F46E5]"
                        />
                        {r.manualOverride && <span className="text-[10px] font-bold text-[#4F46E5]" title="Set manually">M</span>}
                      </label>
                    </td>
                  </tr>
                  {i === lastAutoIndex && i < rows.length - 1 && (
                    <tr>
                      <td colSpan={99} className="px-5 py-0">
                        <div className="flex items-center gap-2 py-1">
                          <div className="flex-1 border-t-2 border-dashed border-[#4F46E5]" />
                          <span className="text-[10px] font-bold text-[#4F46E5] uppercase tracking-wider">Cutoff</span>
                          <div className="flex-1 border-t-2 border-dashed border-[#4F46E5]" />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={99} className="px-5 py-10 text-center text-[#6B7280]">No participants in this round.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-[#EF4444]">{error}</p>}

      <div className="bg-white p-5 rounded-3xl border border-[#E5E7EB] shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => closeRound(false)}
            disabled={busy || advancingCount === 0}
            className="flex items-center gap-2 bg-[#4F46E5] text-white px-5 py-3 rounded-xl font-bold hover:bg-[#4338CA] disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Advance {advancingCount} to {nextTitle || `Round ${round.roundNumber + 1}`}
          </button>
          <button onClick={() => setShowOptions(!showOptions)} className="text-sm font-bold text-[#6B7280] hover:text-[#4F46E5]">
            {showOptions ? 'Hide options' : 'Options'}
          </button>
        </div>
        {showOptions && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#F3F4F6]">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Next round name</label>
              <input value={nextTitle} onChange={e => setNextTitle(e.target.value)} className="w-full border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Next round scoring</label>
              <select value={nextSource} onChange={e => setNextSource(e.target.value)} className="w-full border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm bg-white">
                <option value="same">Same criteria as this round</option>
                {templates.map(t => <option key={t.id} value={t.id}>Template: {t.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button
                onClick={() => closeRound(true)}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 border border-[#E5E7EB] rounded-xl text-sm font-bold text-[#374151] hover:bg-[#F9FAFB] disabled:opacity-50"
              >
                <Flag size={14} /> Finish as final round ({advancingCount} selected)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
