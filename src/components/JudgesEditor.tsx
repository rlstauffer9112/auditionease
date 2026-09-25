import React, { useState, useEffect } from 'react';
import { Gavel, Loader2, Trash2, ChevronDown, ChevronUp, Plus } from 'lucide-react';

interface Judge {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  hasAccount: boolean;
}

interface Props {
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  // Division scope; omit for the account owner's personal auditions
  divisionId?: number | null;
  // Render as a collapsible panel (Organization page, dashboard division cards)
  collapsible?: boolean;
  // Shown instead of the editor when the account can't have judges (e.g. plan)
  lockedMessage?: React.ReactNode;
}

export function JudgesEditor({ authFetch, divisionId = null, collapsible, lockedMessage }: Props) {
  const [expanded, setExpanded] = useState(!collapsible);
  const [list, setList] = useState<Judge[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJudges = async () => {
    setLoading(true);
    try {
      const res = await authFetch(divisionId ? `/api/judges?divisionId=${divisionId}` : '/api/judges');
      if (res.ok) setList(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded && !lockedMessage) fetchJudges();
  }, [expanded, divisionId, lockedMessage]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await authFetch('/api/judges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, divisionId: divisionId || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not add judge.');
        return;
      }
      setEmail('');
      fetchJudges();
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (judge: Judge) => {
    if (!confirm(`Remove ${judge.email} as a judge? Scores they've already entered are kept.`)) return;
    const res = await authFetch(`/api/judges/${judge.id}`, { method: 'DELETE' });
    if (res.ok) setList(prev => prev.filter(j => j.id !== judge.id));
  };

  const content = lockedMessage ? (
    <div className="bg-white p-6 rounded-3xl border border-[#E5E7EB] text-sm text-[#6B7280]">{lockedMessage}</div>
  ) : (
    <div className="bg-white p-6 rounded-3xl border border-[#E5E7EB] shadow-sm space-y-4">
      <div>
        <h3 className="text-lg font-bold">Judges</h3>
        <p className="text-sm text-[#6B7280]">
          People signed in with these emails can score participants in {divisionId ? "this division's" : 'your'} auditions.
          {divisionId ? ' Division managers, org admins and the owner' : ' You'} can always judge without being listed.
        </p>
      </div>
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="judge@example.com"
          className="flex-1 min-w-[220px] border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none"
        />
        <button
          type="submit"
          disabled={adding || !email.trim()}
          className="flex items-center gap-1.5 bg-[#4F46E5] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#4338CA] disabled:opacity-50"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add judge
        </button>
      </form>
      {error && <p className="text-sm text-[#EF4444]">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="animate-spin text-[#4F46E5]" size={18} /></div>
      ) : list.length === 0 ? (
        <p className="text-sm text-[#9CA3AF]">No judges added yet.</p>
      ) : (
        <div className="divide-y divide-[#F3F4F6] border border-[#E5E7EB] rounded-2xl">
          {list.map(j => (
            <div key={j.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{j.email}</p>
                <p className="text-xs text-[#9CA3AF]">
                  {j.hasAccount ? `${j.firstName} ${j.lastName}` : "No account yet — they can sign up with this email to start judging"}
                </p>
              </div>
              <button onClick={() => handleRemove(j)} className="p-1.5 text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg" title="Remove">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!collapsible) return content;

  return (
    <div className="mt-4 ml-11">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[#4F46E5] text-xs font-medium hover:underline flex items-center gap-1"
      >
        <Gavel size={12} />
        Judges
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && <div className="mt-3">{content}</div>}
    </div>
  );
}
