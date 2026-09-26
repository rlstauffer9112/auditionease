import React from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

export interface Criterion {
  id: number;
  title: string;
  description: string | null;
  maxScore: number;
  weight: number;
  order: number;
}

// Editable form of a criterion. Numbers are kept as strings while typing.
export interface CriterionDraft {
  key: string;
  id?: number;
  title: string;
  description: string;
  maxScore: string;
  weight: string;
}

let draftKey = 0;
export const newDraftKey = () => `c${++draftKey}`;

export const blankCriterion = (): CriterionDraft => ({ key: newDraftKey(), title: '', description: '', maxScore: '10', weight: '1' });

export const criteriaToDrafts = (criteria: { id?: number; title: string; description: string | null; maxScore: number; weight: number }[], keepIds = true): CriterionDraft[] =>
  criteria.map(c => ({
    key: newDraftKey(),
    id: keepIds ? c.id : undefined,
    title: c.title,
    description: c.description || '',
    maxScore: String(c.maxScore),
    weight: String(c.weight),
  }));

export const draftsToPayload = (drafts: CriterionDraft[]) =>
  drafts.map(d => ({
    id: d.id,
    title: d.title.trim(),
    description: d.description.trim() || null,
    maxScore: d.maxScore === '' ? 10 : Number(d.maxScore),
    weight: d.weight === '' ? 1 : Number(d.weight),
  }));

// Returns an error message, or null when the drafts are valid
export const validateDrafts = (drafts: CriterionDraft[]): string | null => {
  if (drafts.length === 0) return 'Add at least one criterion.';
  for (const d of drafts) {
    if (!d.title.trim()) return 'Every criterion needs a title.';
    const max = d.maxScore === '' ? 10 : Number(d.maxScore);
    const weight = d.weight === '' ? 1 : Number(d.weight);
    if (!Number.isFinite(max) || max <= 0) return `Max score for "${d.title}" must be greater than 0.`;
    if (!Number.isFinite(weight) || weight < 0) return `Weight for "${d.title}" can't be negative.`;
  }
  return null;
};

interface Props {
  criteria: CriterionDraft[];
  onChange: (criteria: CriterionDraft[]) => void;
  compact?: boolean;
}

// Weights only matter once there's more than one criterion, so they stay hidden until then.
export function CriteriaFields({ criteria, onChange, compact }: Props) {
  const showWeights = criteria.length > 1;
  const update = (key: string, patch: Partial<CriterionDraft>) =>
    onChange(criteria.map(c => (c.key === key ? { ...c, ...patch } : c)));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...criteria];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const inputCls = `w-full border border-[#E5E7EB] rounded-lg px-3 ${compact ? 'py-1.5' : 'py-2'} text-sm bg-white focus:ring-2 focus:ring-[#4F46E5] outline-none`;

  return (
    <div className="space-y-3">
      <div className="hidden sm:flex gap-2 px-1 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
        <span className="flex-1">Criterion</span>
        <span className="w-20">Max score</span>
        {showWeights && <span className="w-20">Weight</span>}
        <span className="w-[76px]" />
      </div>
      {criteria.map((c, i) => (
        <div key={c.key} className="p-3 bg-white border border-[#E5E7EB] rounded-xl">
          <div className="flex flex-wrap sm:flex-nowrap gap-2 items-start">
            <div className="flex-1 basis-full sm:basis-0 min-w-0 sm:min-w-[160px] space-y-1.5">
              <input
                type="text"
                value={c.title}
                onChange={e => update(c.key, { title: e.target.value })}
                placeholder="e.g. Pitch, Tone, Stage presence"
                className={inputCls}
              />
              <input
                type="text"
                value={c.description}
                onChange={e => update(c.key, { description: e.target.value })}
                placeholder="Description (optional)"
                className={`${inputCls} text-xs text-[#6B7280]`}
              />
            </div>
            <div className="w-20">
              <label className="sm:hidden block text-[10px] font-bold text-[#6B7280] uppercase mb-1">Max</label>
              <input
                type="number"
                min="0"
                step="any"
                value={c.maxScore}
                onChange={e => update(c.key, { maxScore: e.target.value })}
                className={inputCls}
              />
            </div>
            {showWeights && (
              <div className="w-20">
                <label className="sm:hidden block text-[10px] font-bold text-[#6B7280] uppercase mb-1">Weight</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={c.weight}
                  onChange={e => update(c.key, { weight: e.target.value })}
                  className={inputCls}
                />
              </div>
            )}
            <div className="flex items-center gap-0.5 ml-auto self-end sm:ml-0 sm:self-auto sm:pt-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-2 sm:p-1 text-[#9CA3AF] hover:text-[#4F46E5] disabled:opacity-30" title="Move up">
                <ArrowUp size={14} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === criteria.length - 1} className="p-2 sm:p-1 text-[#9CA3AF] hover:text-[#4F46E5] disabled:opacity-30" title="Move down">
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => onChange(criteria.filter(x => x.key !== c.key))}
                disabled={criteria.length === 1}
                className="p-2 sm:p-1 text-[#9CA3AF] hover:text-[#EF4444] disabled:opacity-30"
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...criteria, blankCriterion()])}
        className="flex items-center gap-1.5 py-1.5 sm:py-0 text-sm font-bold text-[#4F46E5] hover:underline"
      >
        <Plus size={14} /> Add criterion
      </button>
      {showWeights && (
        <p className="text-xs text-[#9CA3AF]">
          Round score = each criterion's score × its weight, added together.
        </p>
      )}
    </div>
  );
}
