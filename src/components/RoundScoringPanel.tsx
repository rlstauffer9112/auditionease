import React, { useState, useEffect, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, Mail, Trash2, UserPlus, Loader2, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { computeCriterionAverages, computeRoundScore } from '../lib/roundScoring';
import type { Criterion } from './CriteriaFields';
import { AuthFetch, RoundDetail, RoundParticipant, formatScore, jsonHeaders } from './roundTypes';

interface Candidate {
  auditionUserId: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface Props {
  detail: RoundDetail;
  authFetch: AuthFetch;
  readOnly: boolean;
  candidates: Candidate[];
  onParticipantChange: (participant: RoundParticipant) => void;
  onReload: () => void;
}

// A text field that keeps its own draft and saves on blur when the value changed.
function BlurField({
  value, onSave, placeholder, className, type = 'text', multiline, disabled, validate,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  multiline?: boolean;
  disabled?: boolean;
  validate?: (v: string) => boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const invalid = validate ? !validate(draft) : false;
  const commit = () => {
    if (draft !== value && !invalid) onSave(draft);
  };
  const cls = `${className || ''} ${invalid ? 'border-[#EF4444] ring-1 ring-[#EF4444]' : 'border-[#E5E7EB]'} border rounded-lg px-2.5 py-1.5 text-sm bg-white focus:ring-2 focus:ring-[#4F46E5] outline-none disabled:bg-[#F9FAFB] disabled:text-[#6B7280]`;
  if (multiline) {
    return <textarea value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} placeholder={placeholder} className={cls} rows={2} disabled={disabled} />;
  }
  return (
    <input
      type={type}
      step={type === 'number' ? 'any' : undefined}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder={placeholder}
      className={cls}
      disabled={disabled}
    />
  );
}

export function RoundScoringPanel({ detail, authFetch, readOnly, candidates, onParticipantChange, onReload }: Props) {
  const { criteria, participants, currentUserId, round } = detail;
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [showAdd, setShowAdd] = useState(false);

  const single = criteria.length === 1;
  const isJudge = detail.role === 'judge';
  // Judges have nothing extra to expand in a single-criterion round
  const canExpand = !(isJudge && single);
  const multiJudge = participants.some(p => p.evaluations.some(e => e.judgeUserId !== currentUserId));

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...participants]
      .filter(p => !q || `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase().includes(q))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }, [participants, search]);

  const myEval = (p: RoundParticipant) => p.evaluations.find(e => e.judgeUserId === currentUserId);
  const myScore = (p: RoundParticipant, c: Criterion) => myEval(p)?.scores.find(s => s.criterionId === c.id)?.score ?? null;
  const isFullyScoredByMe = (p: RoundParticipant) => criteria.every(c => myScore(p, c) !== null);
  const scoredCount = participants.filter(isFullyScoredByMe).length;

  const setSaving = (id: number, on: boolean) =>
    setSavingIds(prev => { const next = new Set(prev); on ? next.add(id) : next.delete(id); return next; });

  const saveEvaluation = async (p: RoundParticipant, body: { comment?: string; scores?: { criterionId: number; score: number | null }[] }) => {
    setSaving(p.id, true);
    setErrors(prev => { const { [p.id]: _, ...rest } = prev; return rest; });
    try {
      const res = await authFetch(`/api/round-participants/${p.id}/evaluation`, {
        method: 'PUT', headers: jsonHeaders, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(prev => ({ ...prev, [p.id]: data.error || 'Could not save' }));
        return;
      }
      onParticipantChange({ ...p, evaluations: data.evaluations });
    } finally {
      setSaving(p.id, false);
    }
  };

  const saveParticipant = async (p: RoundParticipant, updates: { notes?: string; scheduledTime?: string }) => {
    const res = await authFetch(`/api/round-participants/${p.id}`, {
      method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      onParticipantChange({ ...p, notes: data.notes, scheduledTime: data.scheduledTime });
    }
  };

  const handleNotify = async (p: RoundParticipant) => {
    const res = await authFetch(`/api/round-participants/${p.id}/notify`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    alert(data.message || data.error || 'Notification sent');
  };

  const handleRemove = async (p: RoundParticipant) => {
    if (!confirm(`Remove ${p.firstName} ${p.lastName} from ${round.title}? Their scores in this round will be deleted.`)) return;
    const res = await authFetch(`/api/round-participants/${p.id}`, { method: 'DELETE' });
    if (res.ok) onReload();
  };

  const handleAdd = async (ids: number[]) => {
    const res = await authFetch(`/api/rounds/${round.id}/add-participant`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ auditionUserIds: ids }),
    });
    if (res.ok) {
      setShowAdd(false);
      onReload();
    }
  };

  const scoreValidator = (c: Criterion) => (v: string) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= c.maxScore);
  const saveScore = (p: RoundParticipant, c: Criterion, v: string) =>
    saveEvaluation(p, { scores: [{ criterionId: c.id, score: v === '' ? null : Number(v) }] });

  const scoreInput = (p: RoundParticipant, c: Criterion, className = 'w-20') => (
    <div className="flex items-center gap-1">
      <BlurField
        type="number"
        value={myScore(p, c) === null ? '' : String(myScore(p, c))}
        onSave={v => saveScore(p, c, v)}
        validate={scoreValidator(c)}
        className={className}
        disabled={readOnly}
        placeholder="—"
      />
      <span className="text-xs text-[#9CA3AF] whitespace-nowrap">/ {formatScore(c.maxScore)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search participants"
            className="w-full pl-9 pr-3 py-2 border border-[#E5E7EB] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#4F46E5] outline-none"
          />
        </div>
        <span className="text-sm text-[#6B7280]">
          <span className="font-bold text-[#111827]">{scoredCount}</span> / {participants.length} scored{multiJudge ? ' by you' : ''}
        </span>
        {!readOnly && !isJudge && (
          <div className="relative ml-auto">
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-[#4F46E5] bg-[#EEF2FF] rounded-xl hover:bg-[#E0E7FF]"
            >
              <UserPlus size={14} /> Add participant
            </button>
            {showAdd && (
              <div className="absolute right-0 mt-2 w-80 max-h-80 overflow-auto bg-white border border-[#E5E7EB] rounded-2xl shadow-xl z-20 p-2">
                {candidates.length === 0 ? (
                  <p className="text-sm text-[#6B7280] p-3">Everyone in this audition is already in this round.</p>
                ) : (
                  <>
                    {candidates.length > 1 && (
                      <button onClick={() => handleAdd(candidates.map(c => c.auditionUserId))} className="w-full text-left px-3 py-2 text-xs font-bold text-[#4F46E5] hover:bg-[#EEF2FF] rounded-lg">
                        Add all {candidates.length}
                      </button>
                    )}
                    {candidates.map(c => (
                      <button key={c.auditionUserId} onClick={() => handleAdd([c.auditionUserId])} className="w-full text-left px-3 py-2 hover:bg-[#F9FAFB] rounded-lg">
                        <p className="text-sm font-medium">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-[#6B7280]">{c.email}</p>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {participants.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-[#E5E7EB] text-center">
          <Users size={40} className="mx-auto mb-3 text-[#D1D5DB]" />
          <p className="text-sm text-[#6B7280]">No participants in this round yet. People who sign up with the invite link are added automatically.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm divide-y divide-[#F3F4F6]">
          {sorted.map(p => {
            const mine = myEval(p);
            const expanded = expandedId === p.id;
            const myAverages = computeCriterionAverages(mine ? [mine] : [], criteria).averages;
            const myTotal = computeRoundScore(myAverages, criteria);
            const all = computeCriterionAverages(p.evaluations, criteria);
            const avgTotal = computeRoundScore(all.averages, criteria);
            const done = isFullyScoredByMe(p);
            const others = p.evaluations.filter(e => e.judgeUserId !== currentUserId);
            return (
              <div key={p.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-[180px]">
                    {done
                      ? <CheckCircle2 size={18} className="text-[#10B981] shrink-0" />
                      : <div className="w-[18px] h-[18px] rounded-full border-2 border-[#E5E7EB] shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{p.firstName} {p.lastName}</p>
                      <p className="text-xs text-[#6B7280] truncate">
                        {p.email}
                        {p.scheduledTime && <span className="ml-2 text-[#4F46E5]">· {p.scheduledTime}</span>}
                      </p>
                    </div>
                  </div>

                  {single ? (
                    <>
                      {scoreInput(p, criteria[0])}
                      <BlurField
                        value={mine?.comment || ''}
                        onSave={v => saveEvaluation(p, { comment: v })}
                        placeholder="Comment"
                        className="flex-1 min-w-[160px] max-w-xs"
                        disabled={readOnly}
                      />
                    </>
                  ) : (
                    <button onClick={() => setExpandedId(expanded ? null : p.id)} className="text-sm text-[#374151] hover:text-[#4F46E5]">
                      {mine ? <>Your score <span className="font-bold">{formatScore(myTotal)}</span></> : <span className="text-[#9CA3AF]">Not scored</span>}
                      <span className="text-xs text-[#9CA3AF] ml-2">
                        {criteria.filter(c => myScore(p, c) !== null).length}/{criteria.length}
                      </span>
                    </button>
                  )}

                  {multiJudge && (
                    <div className="text-right text-xs text-[#6B7280] w-24" title="Average of all judges">
                      <p className="font-bold text-sm text-[#111827]">{all.unscored ? '—' : formatScore(avgTotal)}</p>
                      <p>{all.judgeCount} judge{all.judgeCount === 1 ? '' : 's'}</p>
                    </div>
                  )}

                  <div className="w-5 flex justify-center">
                    {savingIds.has(p.id) && <Loader2 size={14} className="animate-spin text-[#4F46E5]" />}
                    {!savingIds.has(p.id) && errors[p.id] && (
                      <span title={errors[p.id]}><AlertCircle size={14} className="text-[#EF4444]" /></span>
                    )}
                  </div>

                  {canExpand && (
                    <button
                      onClick={() => setExpandedId(expanded ? null : p.id)}
                      className="p-1.5 text-[#9CA3AF] hover:text-[#4F46E5] hover:bg-[#EEF2FF] rounded-lg"
                      title="More"
                    >
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                </div>
                {errors[p.id] && <p className="text-xs text-[#EF4444] mt-1 ml-8">{errors[p.id]}</p>}

                {expanded && (
                  <div className="mt-3 ml-8 space-y-4 pb-2">
                    {!single && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {criteria.map(c => (
                            <div key={c.id} className="flex items-center justify-between gap-3 bg-[#F9FAFB] rounded-xl px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{c.title}</p>
                                {c.description && <p className="text-xs text-[#9CA3AF] truncate">{c.description}</p>}
                              </div>
                              {scoreInput(p, c)}
                            </div>
                          ))}
                        </div>
                        <BlurField
                          multiline
                          value={mine?.comment || ''}
                          onSave={v => saveEvaluation(p, { comment: v })}
                          placeholder="Comment"
                          className="w-full"
                          disabled={readOnly}
                        />
                      </div>
                    )}

                    {others.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Other judges</p>
                        <div className="space-y-1.5">
                          {others.map(e => (
                            <div key={e.id} className="text-sm flex flex-wrap gap-x-4 gap-y-1">
                              <span className="font-medium w-36 truncate">{e.judgeName}</span>
                              {criteria.map(c => {
                                const s = e.scores.find(x => x.criterionId === c.id);
                                return <span key={c.id} className="text-[#6B7280]">{single ? '' : `${c.title}: `}<span className="text-[#111827] font-medium">{formatScore(s?.score ?? null)}</span></span>;
                              })}
                              {e.comment && <span className="text-[#6B7280] italic">"{e.comment}"</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!isJudge && <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Notes</label>
                        <BlurField multiline value={p.notes || ''} onSave={v => saveParticipant(p, { notes: v })} placeholder="Notes shared with the participant when notified" className="w-full" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Scheduled time</label>
                        <BlurField value={p.scheduledTime || ''} onSave={v => saveParticipant(p, { scheduledTime: v })} placeholder="e.g. Sat Oct 4, 2:30 PM" className="w-full" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleNotify(p)} className="flex items-center gap-1 px-3 py-1.5 bg-[#EEF2FF] text-[#4F46E5] rounded-lg text-xs font-bold hover:bg-[#E0E7FF]">
                        <Mail size={12} /> Notify
                      </button>
                      {!readOnly && (
                        <button onClick={() => handleRemove(p)} className="flex items-center gap-1 px-3 py-1.5 text-[#9CA3AF] rounded-lg text-xs font-bold hover:bg-[#FEF2F2] hover:text-[#EF4444]">
                          <Trash2 size={12} /> Remove from round
                        </button>
                      )}
                    </div>
                    </>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
