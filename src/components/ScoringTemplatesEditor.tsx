import React, { useState, useEffect } from 'react';
import { Pencil, Trash2, Copy, Loader2, ChevronDown, ChevronUp, Scale } from 'lucide-react';
import {
  CriteriaFields,
  CriterionDraft,
  Criterion,
  blankCriterion,
  criteriaToDrafts,
  draftsToPayload,
  validateDrafts,
} from './CriteriaFields';

export interface ScoringTemplate {
  id: number;
  userId: number | null;
  divisionId: number | null;
  name: string;
  description: string | null;
  criteria: Criterion[];
}

interface Props {
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  // Division scope; omit for the user's personal templates
  divisionId?: number | null;
  // Other divisions a template can be copied into
  copyTargets?: { id: number; title: string }[];
  // Render as a collapsible panel (used on the Organization page)
  collapsible?: boolean;
}

export function ScoringTemplatesEditor({ authFetch, divisionId = null, copyTargets, collapsible }: Props) {
  const [expanded, setExpanded] = useState(!collapsible);
  const [templates, setTemplates] = useState<ScoringTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [drafts, setDrafts] = useState<CriterionDraft[]>([blankCriterion()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/scoring-templates');
      if (res.ok) {
        const all: ScoringTemplate[] = await res.json();
        setTemplates(all.filter(t => (divisionId ? t.divisionId === divisionId : t.divisionId === null)));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded) fetchTemplates();
  }, [expanded, divisionId]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setDrafts([blankCriterion()]);
    setError(null);
  };

  const startEdit = (t: ScoringTemplate) => {
    setEditingId(t.id);
    setName(t.name);
    setDescription(t.description || '');
    setDrafts(criteriaToDrafts(t.criteria, false));
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Give the template a name.'); return; }
    const invalid = validateDrafts(drafts);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError(null);
    try {
      const body = { name, description, criteria: draftsToPayload(drafts).map(({ id, ...c }) => c), divisionId: divisionId || undefined };
      const res = await authFetch(editingId ? `/api/scoring-templates/${editingId}` : '/api/scoring-templates', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not save the template.');
        return;
      }
      resetForm();
      fetchTemplates();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: ScoringTemplate) => {
    if (!confirm(`Delete the "${t.name}" template? Rounds that already used it keep their own copy of the criteria.`)) return;
    const res = await authFetch(`/api/scoring-templates/${t.id}`, { method: 'DELETE' });
    if (res.ok) {
      if (editingId === t.id) resetForm();
      fetchTemplates();
    }
  };

  const handleDuplicate = async (t: ScoringTemplate, targetDivisionId?: number) => {
    const res = await authFetch(`/api/scoring-templates/${t.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(targetDivisionId ? { divisionId: targetDivisionId, name: t.name } : {}),
    });
    if (res.ok) {
      if (targetDivisionId) {
        const target = copyTargets?.find(d => d.id === targetDivisionId);
        alert(`Copied "${t.name}" to ${target?.title || 'the division'}.`);
      } else {
        fetchTemplates();
      }
    }
  };

  const otherTargets = (copyTargets || []).filter(d => d.id !== divisionId);

  const content = (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <form onSubmit={handleSave} className="lg:col-span-3 bg-white p-5 sm:p-6 rounded-3xl border border-[#E5E7EB] shadow-sm space-y-4 h-fit">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{editingId ? 'Edit Template' : 'New Scoring Template'}</h3>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-[#6B7280] hover:text-[#111827]">Cancel</button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Template name (e.g. Vocal audition)"
            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none"
          />
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none"
          />
        </div>
        <CriteriaFields criteria={drafts} onChange={setDrafts} compact />
        {error && <p className="text-sm text-[#EF4444]">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto justify-center bg-[#4F46E5] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#4338CA] disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {editingId ? 'Save Changes' : 'Create Template'}
        </button>
      </form>

      <div className="lg:col-span-2 space-y-3">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#4F46E5]" size={20} /></div>
        ) : templates.length === 0 ? (
          <div className="bg-white p-6 rounded-3xl border border-dashed border-[#E5E7EB] text-center text-sm text-[#6B7280]">
            No templates yet. Templates are optional — every round starts with a simple 1–10 "Overall" score.
          </div>
        ) : templates.map(t => (
          <div key={t.id} className={`bg-white p-4 rounded-2xl border ${editingId === t.id ? 'border-[#4F46E5]' : 'border-[#E5E7EB]'} shadow-sm`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{t.name}</p>
                {t.description && <p className="text-xs text-[#6B7280] truncate">{t.description}</p>}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => startEdit(t)} className="p-2 sm:p-1.5 text-[#6B7280] hover:text-[#4F46E5] hover:bg-[#EEF2FF] rounded-lg" title="Edit"><Pencil size={13} /></button>
                <button onClick={() => handleDuplicate(t)} className="p-2 sm:p-1.5 text-[#6B7280] hover:text-[#4F46E5] hover:bg-[#EEF2FF] rounded-lg" title="Duplicate"><Copy size={13} /></button>
                <button onClick={() => handleDelete(t)} className="p-2 sm:p-1.5 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg" title="Delete"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {t.criteria.map(c => (
                <span key={c.id} className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#F3F4F6] text-xs font-medium text-[#374151]" title={c.description || undefined}>
                  {c.title} <span className="text-[#9CA3AF] ml-1">/{c.maxScore}{t.criteria.length > 1 ? ` ×${c.weight}` : ''}</span>
                </span>
              ))}
            </div>
            {otherTargets.length > 0 && (
              <select
                value=""
                onChange={e => { const id = Number(e.target.value); if (id) handleDuplicate(t, id); }}
                className="mt-3 w-full text-xs border border-[#E5E7EB] rounded-lg px-2 py-2 sm:py-1.5 bg-white text-[#6B7280]"
              >
                <option value="">Copy to another division…</option>
                {otherTargets.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  if (!collapsible) return content;

  return (
    <div className="mt-4 sm:ml-11">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[#4F46E5] text-xs font-medium hover:underline flex items-center gap-1 py-1.5 sm:py-0"
      >
        <Scale size={12} />
        Scoring Templates
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && <div className="mt-3 border border-[#E5E7EB] rounded-2xl p-3 sm:p-5 bg-[#FAFAFA]">{content}</div>}
    </div>
  );
}
