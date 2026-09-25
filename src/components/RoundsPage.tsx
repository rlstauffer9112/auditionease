import React, { useState, useEffect } from 'react';
import { Trophy, Loader2, PlayCircle, Pencil, ClipboardCheck, ListOrdered, CheckCircle2 } from 'lucide-react';
import { RoundScoringPanel } from './RoundScoringPanel';
import { RoundPreview } from './RoundPreview';
import { RoundCriteriaEditor } from './RoundCriteriaEditor';
import type { ScoringTemplate } from './ScoringTemplatesEditor';
import { AuthFetch, Round, RoundDetail, RoundParticipant, formatScore, jsonHeaders } from './roundTypes';

interface Props {
  authFetch: AuthFetch;
  // Auditions the user manages or judges; judge-only auditions get role 'judge'
  auditions: { id: number; title: string; date: string; role?: 'manager' | 'judge' }[];
  // Preselect an audition (e.g. from the dashboard's "Auditions to Judge")
  initialAuditionId?: number | null;
}

interface AuditionPerson {
  auditionUserId: number;
  firstName: string;
  lastName: string;
  email: string;
}

export function RoundsPage({ authFetch, auditions, initialAuditionId }: Props) {
  const [auditionId, setAuditionId] = useState<number | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundId, setRoundId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RoundDetail | null>(null);
  const [tab, setTab] = useState<'score' | 'advance'>('score');
  const [templates, setTemplates] = useState<ScoringTemplate[]>([]);
  const [people, setPeople] = useState<AuditionPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);
  const [startTemplate, setStartTemplate] = useState('');
  const [starting, setStarting] = useState(false);

  const sortedAuditions = [...auditions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const loadTemplates = async () => {
    const res = await authFetch('/api/scoring-templates');
    if (res.ok) setTemplates(await res.json());
  };

  const loadDetail = async (id: number) => {
    const res = await authFetch(`/api/rounds/${id}/participants`);
    if (res.ok) setDetail(await res.json());
  };

  const roleFor = (audId: number | null) => auditions.find(a => a.id === audId)?.role ?? 'manager';

  const loadRounds = async (audId: number, focusRoundId?: number) => {
    setLoading(true);
    try {
      const isJudge = roleFor(audId) === 'judge';
      const [roundsRes, peopleRes] = await Promise.all([
        authFetch(`/api/auditions/${audId}/rounds`),
        isJudge ? Promise.resolve(null) : authFetch(`/api/auditions/${audId}/users`),
      ]);
      const list: Round[] = roundsRes.ok ? await roundsRes.json() : [];
      setRounds(list);
      setPeople(peopleRes?.ok ? await peopleRes.json() : []);
      // Judges land on the open round
      if (isJudge && !focusRoundId) focusRoundId = list.find(r => r.status === 'open')?.id;
      const focus = list.find(r => r.id === focusRoundId) || list[list.length - 1];
      setRoundId(focus?.id ?? null);
      if (focus) await loadDetail(focus.id);
      else setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTemplates(); }, []);

  useEffect(() => {
    if (auditionId === null && sortedAuditions.length > 0) setAuditionId(sortedAuditions[0].id);
  }, [auditions]);

  useEffect(() => {
    if (initialAuditionId) { setAuditionId(initialAuditionId); setTab('score'); }
  }, [initialAuditionId]);

  useEffect(() => {
    if (auditionId) loadRounds(auditionId);
  }, [auditionId]);

  const selectRound = async (id: number) => {
    setRoundId(id);
    setDetail(null);
    await loadDetail(id);
  };

  const startRound = async () => {
    if (!auditionId) return;
    setStarting(true);
    try {
      const res = await authFetch(`/api/auditions/${auditionId}/rounds`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ templateId: startTemplate ? Number(startTemplate) : undefined }),
      });
      if (res.ok) {
        setTab('score');
        await loadRounds(auditionId);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Could not start the round.');
      }
    } finally {
      setStarting(false);
    }
  };

  const updateParticipant = (p: RoundParticipant) =>
    setDetail(d => (d ? { ...d, participants: d.participants.map(x => (x.id === p.id ? p : x)) } : d));

  const handleRoundChanged = async (focusRoundId?: number) => {
    if (!auditionId) return;
    if (focusRoundId && focusRoundId !== roundId) setTab('score');
    await loadRounds(auditionId, focusRoundId);
  };

  const isJudge = roleFor(auditionId) === 'judge';
  const round = rounds.find(r => r.id === roundId) || null;
  const lastRound = rounds[rounds.length - 1];
  const finished = lastRound?.status === 'closed' && lastRound.isFinal;
  const canReopen = (r: Round) => {
    if (r.status !== 'closed') return false;
    const later = rounds.filter(x => x.roundNumber > r.roundNumber);
    return later.length === 0 || (later.length === 1 && later[0].status === 'open');
  };
  const candidates = detail
    ? people.filter(p => !detail.participants.some(rp => rp.auditionUserId === p.auditionUserId))
    : [];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-extrabold tracking-tight mb-2">Rounds</h2>
        <p className="text-[#6B7280]">Score participants and move the best into the next round.</p>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Audition</label>
        <select
          value={auditionId ?? ''}
          onChange={e => { const id = parseInt(e.target.value); if (id) { setAuditionId(id); setTab('score'); } }}
          className="w-full max-w-md border border-[#E5E7EB] rounded-xl px-4 py-3 bg-white font-medium focus:ring-2 focus:ring-[#4F46E5] outline-none"
        >
          <option value="" disabled>Choose an audition...</option>
          {sortedAuditions.map(a => <option key={a.id} value={a.id}>{a.title} — {a.date}{a.role === 'judge' ? ' (judging)' : ''}</option>)}
        </select>
      </div>

      {!auditionId ? (
        <div className="bg-white p-16 rounded-3xl border border-[#E5E7EB] text-center">
          <Trophy size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
          <h3 className="text-lg font-bold text-[#374151] mb-2">No auditions yet</h3>
          <p className="text-sm text-[#6B7280]">Create an audition first, then come back here to score participants.</p>
        </div>
      ) : loading && rounds.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#4F46E5]" size={28} /></div>
      ) : rounds.length === 0 && isJudge ? (
        <div className="bg-white p-12 rounded-3xl border border-[#E5E7EB] text-center">
          <PlayCircle size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
          <h3 className="text-lg font-bold text-[#374151] mb-2">Scoring hasn't started yet</h3>
          <p className="text-sm text-[#6B7280]">You'll be able to score participants here once the organizer starts Round 1.</p>
        </div>
      ) : rounds.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-[#E5E7EB] text-center">
          <PlayCircle size={48} className="mx-auto mb-4 text-[#4F46E5]" />
          <h3 className="text-lg font-bold text-[#111827] mb-2">Ready to start scoring?</h3>
          <p className="text-sm text-[#6B7280] mb-6">
            Round 1 will include all {people.length} participant{people.length === 1 ? '' : 's'} in this audition. People who sign up later are added automatically.
          </p>
          <div className="flex flex-wrap justify-center items-center gap-3">
            <select
              value={startTemplate}
              onChange={e => setStartTemplate(e.target.value)}
              className="border border-[#E5E7EB] rounded-xl px-4 py-3 bg-white text-sm"
            >
              <option value="">Simple (Overall 1–10)</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              onClick={startRound}
              disabled={starting}
              className="flex items-center gap-2 bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] disabled:opacity-50"
            >
              {starting && <Loader2 size={16} className="animate-spin" />}
              Start scoring
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Round stepper */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {rounds.map((r, i) => (
              <React.Fragment key={r.id}>
                {i > 0 && <div className="w-4 h-px bg-[#D1D5DB]" />}
                <button
                  onClick={() => selectRound(r.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                    r.id === roundId ? 'bg-[#4F46E5] text-white border-[#4F46E5] shadow-lg shadow-indigo-100' : 'bg-white text-[#374151] border-[#E5E7EB] hover:border-[#4F46E5]'
                  }`}
                >
                  {r.status === 'closed' && <CheckCircle2 size={14} className={r.id === roundId ? 'text-white' : 'text-[#10B981]'} />}
                  {r.title}
                  <span className={`text-xs font-medium ${r.id === roundId ? 'text-indigo-200' : 'text-[#9CA3AF]'}`}>
                    {r.status === 'closed' ? `${r.advancedCount}/${r.participantCount}` : r.participantCount}
                  </span>
                </button>
              </React.Fragment>
            ))}
          </div>

          {finished && (
            <div className="flex items-center gap-2 mb-6 bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] px-4 py-3 rounded-2xl text-sm">
              <Trophy size={16} /> Audition complete — {lastRound.advancedCount} selected in {lastRound.title}.
            </div>
          )}

          {round && (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                {round.criteria.map(c => (
                  <span key={c.id} className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white border border-[#E5E7EB] text-xs font-medium text-[#374151]" title={c.description || undefined}>
                    {c.title}
                    <span className="text-[#9CA3AF] ml-1">/{formatScore(c.maxScore)}{round.criteria.length > 1 ? ` ×${formatScore(c.weight)}` : ''}</span>
                  </span>
                ))}
                {round.status === 'open' && !isJudge && (
                  <button onClick={() => setShowCriteria(true)} disabled={!detail} className="flex items-center gap-1 text-xs font-bold text-[#4F46E5] hover:underline ml-1">
                    <Pencil size={12} /> Edit criteria
                  </button>
                )}
              </div>
              {isJudge ? (
                <span className="text-xs font-bold text-[#4F46E5] bg-[#EEF2FF] px-3 py-1.5 rounded-lg">
                  {round.status === 'open' ? 'You are judging this round' : 'Round closed'}
                  {detail?.blindJudging && ' · Blind judging'}
                </span>
              ) : (
              <div className="flex bg-[#F3F4F6] p-1 rounded-xl">
                <button
                  onClick={() => setTab('score')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'score' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280]'}`}
                >
                  <ClipboardCheck size={14} /> Score
                </button>
                <button
                  onClick={() => setTab('advance')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'advance' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280]'}`}
                >
                  <ListOrdered size={14} /> {round.status === 'open' ? 'Advance' : 'Results'}
                </button>
              </div>
              )}
            </div>
          )}

          {!detail || detail.round.id !== roundId ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#4F46E5]" size={28} /></div>
          ) : tab === 'score' || isJudge ? (
            <RoundScoringPanel
              detail={detail}
              authFetch={authFetch}
              readOnly={detail.round.status !== 'open'}
              candidates={candidates}
              onParticipantChange={updateParticipant}
              onReload={() => handleRoundChanged(detail.round.id)}
            />
          ) : (
            <RoundPreview
              detail={detail}
              authFetch={authFetch}
              templates={templates}
              canReopen={round ? canReopen(round) : false}
              onParticipantChange={updateParticipant}
              onRoundChanged={handleRoundChanged}
            />
          )}
        </>
      )}

      {showCriteria && detail && (
        <RoundCriteriaEditor
          detail={detail}
          authFetch={authFetch}
          templates={templates}
          onClose={() => setShowCriteria(false)}
          onSaved={() => { setShowCriteria(false); handleRoundChanged(detail.round.id); }}
          onTemplateCreated={loadTemplates}
        />
      )}
    </div>
  );
}
