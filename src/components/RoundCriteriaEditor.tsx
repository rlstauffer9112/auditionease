import React, { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { CriteriaFields, CriterionDraft, criteriaToDrafts, draftsToPayload, validateDrafts } from './CriteriaFields';
import type { ScoringTemplate } from './ScoringTemplatesEditor';
import { AuthFetch, RoundDetail, jsonHeaders } from './roundTypes';

interface Props {
  detail: RoundDetail;
  authFetch: AuthFetch;
  templates: ScoringTemplate[];
  onClose: () => void;
  onSaved: () => void;
  onTemplateCreated: () => void;
}

export function RoundCriteriaEditor({ detail, authFetch, templates, onClose, onSaved, onTemplateCreated }: Props) {
  const { round, criteria, participants } = detail;
  const [drafts, setDrafts] = useState<CriterionDraft[]>(() => criteriaToDrafts(criteria));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateMsg, setTemplateMsg] = useState<string | null>(null);

  const scoredCriterionIds = new Set(
    participants.flatMap(p => p.evaluations.flatMap(e => e.scores.map(s => s.criterionId))),
  );

  const applyTemplate = (id: number) => {
    const t = templates.find(x => x.id === id);
    if (!t) return;
    setDrafts(criteriaToDrafts(t.criteria, false));
    setError(null);
  };

  const handleSave = async () => {
    const invalid = validateDrafts(drafts);
    if (invalid) { setError(invalid); return; }
    const keptIds = new Set(drafts.map(d => d.id).filter(Boolean));
    const losing = criteria.filter(c => !keptIds.has(c.id) && scoredCriterionIds.has(c.id));
    if (losing.length > 0 && !confirm(`Scores already entered for ${losing.map(c => `"${c.title}"`).join(', ')} will be deleted. Continue?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/rounds/${round.id}/criteria`, {
        method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ criteria: draftsToPayload(drafts) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not save criteria.');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim()) return;
    const res = await authFetch(`/api/rounds/${round.id}/save-as-template`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ name: templateName }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTemplateMsg(`Saved "${data.name}" as a template.`);
      setTemplateName('');
      onTemplateCreated();
    } else {
      setTemplateMsg(data.error || 'Could not save template.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-5 sm:p-8 w-full max-w-3xl max-h-[90dvh] overflow-y-auto overscroll-contain shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5 sm:mb-6">
          <div className="min-w-0">
            <h3 className="text-xl font-bold">Scoring criteria</h3>
            <p className="text-sm text-[#6B7280]">For {round.title} only. Changes don't affect other rounds or templates.</p>
          </div>
          {templates.length > 0 && round.status === 'open' && (
            <select
              value=""
              onChange={e => applyTemplate(Number(e.target.value))}
              className="w-full sm:w-auto border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Apply a template…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>

        <CriteriaFields criteria={drafts} onChange={setDrafts} />
        {error && <p className="text-sm text-[#EF4444] mt-3">{error}</p>}

        <div className="mt-6 pt-4 border-t border-[#F3F4F6] flex flex-wrap items-center gap-2">
          <input
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="Save current criteria as template…"
            className="flex-1 min-w-0 basis-full sm:basis-0 sm:min-w-[200px] border border-[#E5E7EB] rounded-xl px-3 py-2 text-sm"
          />
          <button
            onClick={saveAsTemplate}
            disabled={!templateName.trim()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-[#4F46E5] bg-[#EEF2FF] rounded-xl disabled:opacity-50"
          >
            <Save size={14} /> Save as template
          </button>
          {templateMsg && <p className="w-full text-xs text-[#6B7280]">{templateMsg} Templates save the criteria as they were last saved on this round.</p>}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold text-[#6B7280]">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#4F46E5] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#4338CA] disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save criteria
          </button>
        </div>
      </div>
    </div>
  );
}
