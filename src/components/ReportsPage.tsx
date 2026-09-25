import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Plus, Pencil, Trash2, Play, FileBarChart, Filter, ClipboardList, XCircle, ArrowUp, ArrowDown,
  Download, Lock, Printer, Search, Loader2, Trophy, Gavel, ListOrdered, CalendarClock, Users, History, Award, Activity,
} from 'lucide-react';
import {
  REPORT_FIELDS, STANDARD_REPORTS, criterionField,
  type ReportFieldDef, type ReportResult, type ReportSort, type StandardReportDef,
} from '../lib/reports';

type AuthFetch = (url: string, opts?: RequestInit) => Promise<Response>;

interface ReportCriterion {
  field: string;
  operator: string;
  value: string;
  logicOp?: 'AND' | 'OR';
}

interface SavedReport {
  id: number;
  name: string;
  criteria: ReportCriterion[];
  columns: { field: string; label: string }[];
  options: { sort?: ReportSort | null };
  createdAt: string;
}

interface ReportMeta {
  auditions: { id: number; title: string; date: string; divisionTitle: string | null; rounds: { roundNumber: number; title: string; status: string; isFinal: boolean }[] }[];
  criteria: string[];
}

interface Props {
  authFetch: AuthFetch;
  customAttributes: { id: number; label: string; type: string; options: string | null }[];
  canExport: boolean;
  onUpgrade: () => void;
}

type RunTarget = { kind: 'custom'; report: SavedReport } | { kind: 'standard'; def: StandardReportDef };

const STANDARD_ICONS: Record<string, React.ElementType> = {
  'round-results': Trophy,
  'judge-scoresheet': Gavel,
  'advancing': ListOrdered,
  'judging-progress': Activity,
  'final-selections': Award,
  'participant-history': History,
  'schedule': CalendarClock,
  'roster': Users,
};

function parseOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try { const arr = JSON.parse(trimmed); if (Array.isArray(arr)) return arr.map(String); } catch { /* fall through */ }
  }
  return trimmed.split(',').map(o => o.trim()).filter(Boolean);
}

const getOperatorsForType = (type: string) => {
  const common = [
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ];
  switch (type) {
    case 'number':
      return [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        { value: 'greater_than', label: 'greater than' },
        { value: 'less_than', label: 'less than' },
        { value: 'greater_equal', label: 'at least' },
        { value: 'less_equal', label: 'at most' },
        ...common,
      ];
    case 'date':
      return [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        { value: 'before', label: 'is before' },
        { value: 'after', label: 'is after' },
        ...common,
      ];
    case 'boolean':
      return [{ value: 'equals', label: 'equals' }];
    case 'select':
      return [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        ...common,
      ];
    case 'multiselect':
      return [
        { value: 'contains', label: 'includes' },
        { value: 'not_contains', label: 'does not include' },
        ...common,
      ];
    default:
      return [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        { value: 'contains', label: 'contains' },
        { value: 'not_contains', label: 'does not contain' },
        { value: 'starts_with', label: 'starts with' },
        { value: 'ends_with', label: 'ends with' },
        ...common,
      ];
  }
};

const FIELD_GROUPS: ReportFieldDef['group'][] = ['Participant', 'Audition', 'Round', 'Scores by criterion', 'Custom attributes'];

export function ReportsPage({ authFetch, customAttributes, canExport, onUpgrade }: Props) {
  const [view, setView] = useState<'list' | 'builder' | 'results'>('list');
  const [reportsList, setReportsList] = useState<SavedReport[]>([]);
  const [meta, setMeta] = useState<ReportMeta>({ auditions: [], criteria: [] });

  // Builder
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [criteria, setCriteria] = useState<ReportCriterion[]>([]);
  const [columns, setColumns] = useState<{ field: string; label: string }[]>([]);
  const [sort, setSort] = useState<ReportSort | null>(null);

  // Run
  const [runTarget, setRunTarget] = useState<RunTarget | null>(null);
  const [runAuditionId, setRunAuditionId] = useState<string>('');
  const [runRound, setRunRound] = useState<string>('latest');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ target: RunTarget; auditionId: string; round: string } | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const fetchReports = async () => {
    const res = await authFetch('/api/reports');
    if (!res.ok) return;
    const data = await res.json();
    setReportsList(data.map((r: any) => ({
      ...r,
      criteria: JSON.parse(r.criteria || '[]'),
      columns: JSON.parse(r.columns || '[]'),
      options: r.options || {},
    })));
  };

  const fetchMeta = async () => {
    const res = await authFetch('/api/reports/meta');
    if (res.ok) setMeta(await res.json());
  };

  useEffect(() => { fetchReports(); fetchMeta(); }, []);

  const availableFields: ReportFieldDef[] = [
    ...REPORT_FIELDS,
    ...meta.criteria.map(title => ({ field: criterionField(title), label: `${title} (avg)`, type: 'number' as const, group: 'Scores by criterion' as const })),
    ...customAttributes.map(attr => ({
      field: `custom:${attr.id}`,
      label: attr.label,
      type: attr.type as ReportFieldDef['type'],
      group: 'Custom attributes' as const,
      options: attr.options || undefined,
    })),
  ];
  const fieldDef = (field: string) => availableFields.find(f => f.field === field);

  // --- Builder ---
  const openBuilder = (report?: SavedReport) => {
    setEditingId(report?.id ?? null);
    setName(report?.name ?? '');
    setCriteria(report?.criteria ?? []);
    setColumns(report?.columns ?? [
      { field: 'firstName', label: 'First Name' },
      { field: 'lastName', label: 'Last Name' },
      { field: 'email', label: 'Email' },
    ]);
    setSort(report?.options?.sort ?? null);
    setView('builder');
  };

  const saveReport = async () => {
    if (!name.trim() || columns.length === 0) return;
    const body = JSON.stringify({
      name: name.trim(),
      criteria: JSON.stringify(criteria),
      columns: JSON.stringify(columns),
      options: { sort },
    });
    await authFetch(editingId ? `/api/reports/${editingId}` : '/api/reports', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    await fetchReports();
    setView('list');
  };

  const deleteReport = async (id: number) => {
    if (!confirm('Delete this report?')) return;
    await authFetch(`/api/reports/${id}`, { method: 'DELETE' });
    fetchReports();
  };

  const updateCriterion = (idx: number, patch: Partial<ReportCriterion>) =>
    setCriteria(criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  const renderCriterionValue = (criterion: ReportCriterion, idx: number) => {
    if (['is_empty', 'is_not_empty'].includes(criterion.operator)) return null;
    const def = fieldDef(criterion.field);
    const type = def?.type || 'text';
    const update = (value: string) => updateCriterion(idx, { value });
    if (type === 'boolean') {
      return (
        <select value={criterion.value || 'true'} onChange={e => update(e.target.value)} className="w-32 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white">
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    if ((type === 'select' || type === 'multiselect') && def?.options) {
      return (
        <select value={criterion.value} onChange={e => update(e.target.value)} className="flex-1 min-w-[120px] border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Select...</option>
          {parseOptions(def.options).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (type === 'number') {
      return <input type="number" step="any" value={criterion.value} onChange={e => update(e.target.value)} className="w-32 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm" placeholder="Value" />;
    }
    if (type === 'date') {
      return <input type="date" value={criterion.value} onChange={e => update(e.target.value)} className="w-40 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm" />;
    }
    return <input type="text" value={criterion.value} onChange={e => update(e.target.value)} className="flex-1 min-w-[120px] border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm" placeholder="Value" />;
  };

  const fieldOptions = (fields: ReportFieldDef[]) => FIELD_GROUPS.map(group => {
    const inGroup = fields.filter(f => f.group === group);
    if (inGroup.length === 0) return null;
    return (
      <optgroup key={group} label={group}>
        {inGroup.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
      </optgroup>
    );
  });

  // --- Running ---
  const auditionRounds = (auditionId: string) => meta.auditions.find(a => String(a.id) === auditionId)?.rounds ?? [];

  const openRun = (target: RunTarget) => {
    const needsAudition = target.kind === 'standard';
    const prev = lastRun;
    const defaultAudition = prev?.auditionId && meta.auditions.some(a => String(a.id) === prev.auditionId)
      ? prev.auditionId
      : needsAudition ? String(meta.auditions[0]?.id ?? '') : '';
    setRunTarget(target);
    setRunAuditionId(defaultAudition);
    const rounds = auditionRounds(defaultAudition);
    if (target.kind === 'standard' && target.def.needsRound) {
      setRunRound(String(rounds[rounds.length - 1]?.roundNumber ?? ''));
    } else {
      setRunRound(target.kind === 'custom' ? prev?.round ?? 'latest' : 'latest');
    }
    setRunError(null);
  };

  const onRunAuditionChange = (value: string) => {
    setRunAuditionId(value);
    const rounds = auditionRounds(value);
    if (runTarget?.kind === 'standard' && runTarget.def.needsRound) setRunRound(String(rounds[rounds.length - 1]?.roundNumber ?? ''));
    else setRunRound('latest');
  };

  const execute = async (target: RunTarget, auditionId: string, round: string) => {
    setRunning(true);
    setRunError(null);
    try {
      const url = target.kind === 'custom' ? `/api/reports/${target.report.id}/run` : `/api/reports/standard/${target.def.key}/run`;
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditionId: auditionId ? Number(auditionId) : null, round: round === 'latest' || round === '' ? 'latest' : Number(round) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setRunError(data.error || 'Could not run the report.'); return false; }
      setResult(data);
      setGeneratedAt(new Date());
      setLastRun({ target, auditionId, round });
      setView('results');
      return true;
    } finally {
      setRunning(false);
    }
  };

  const runSelected = async () => {
    if (!runTarget) return;
    if (runTarget.kind === 'standard' && !runAuditionId) { setRunError('Choose an audition.'); return; }
    if (await execute(runTarget, runAuditionId, runRound)) setRunTarget(null);
  };

  // --- Results ---
  const visibleColumns = result ? result.columns.filter(c => c.field !== result.groupBy) : [];

  const exportCsv = () => {
    if (!result) return;
    const cols = result.groupBy ? [{ field: result.groupBy, label: result.groupBy === 'day' ? 'Day' : 'Participant' }, ...visibleColumns] : visibleColumns;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map(c => esc(c.label)).join(','), ...result.rows.map(row => cols.map(c => esc(row[c.field])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    a.href = url;
    a.download = `${result.title.replace(/[^a-zA-Z0-9 ]/g, '').trim()}_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderRows = () => {
    if (!result) return null;
    const out: React.ReactNode[] = [];
    let currentGroup: unknown = undefined;
    result.rows.forEach((row, idx) => {
      if (result.groupBy && row[result.groupBy] !== currentGroup) {
        currentGroup = row[result.groupBy];
        out.push(
          <tr key={`g${idx}`} className="bg-[#EEF2FF] print:bg-[#F3F4F6] break-after-avoid">
            <td colSpan={visibleColumns.length} className="px-6 py-2.5 text-sm font-bold text-[#111827]">{String(currentGroup ?? '')}</td>
          </tr>,
        );
      }
      out.push(
        <tr key={idx} className={`break-inside-avoid ${row._emphasis ? 'bg-[#F9FAFB] font-bold' : ''}`}>
          {visibleColumns.map(col => (
            <td key={col.field} className={`px-6 py-3 text-sm align-top print:px-2 print:py-1.5 ${col.align === 'right' ? 'text-right tabular-nums' : ''}`}>
              {String(row[col.field] ?? '')}
            </td>
          ))}
        </tr>,
      );
    });
    return out;
  };

  const runDialogRounds = auditionRounds(runAuditionId);
  const maxRoundAcrossAll = Math.max(0, ...meta.auditions.flatMap(a => a.rounds.map(r => r.roundNumber)));

  return (
    <motion.div
      key="reports"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-5xl mx-auto print:max-w-none"
    >
      {view === 'list' && (
        <>
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight mb-2">Reports</h2>
              <p className="text-[#6B7280]">Run a standard report or build your own. Choose the audition and round when you run it.</p>
            </div>
            <button
              onClick={() => openBuilder()}
              className="bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#4338CA] transition-colors shadow-lg shadow-indigo-100"
            >
              <Plus size={20} />
              New Report
            </button>
          </div>

          <h3 className="text-lg font-bold mb-3">Standard reports</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
            {STANDARD_REPORTS.map(def => {
              const Icon = STANDARD_ICONS[def.key] ?? FileBarChart;
              return (
                <button
                  key={def.key}
                  onClick={() => openRun({ kind: 'standard', def })}
                  disabled={meta.auditions.length === 0}
                  className="flex items-start gap-3 text-left bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-sm hover:border-[#4F46E5] hover:shadow-md transition-all disabled:opacity-50 group"
                >
                  <div className="p-2 bg-[#EEF2FF] text-[#4F46E5] rounded-xl flex-shrink-0"><Icon size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-[#111827] group-hover:text-[#4F46E5]">{def.name}</p>
                    <p className="text-xs text-[#6B7280] mt-0.5">{def.description}</p>
                  </div>
                  <Play size={14} className="text-[#9CA3AF] group-hover:text-[#4F46E5] mt-1 flex-shrink-0" />
                </button>
              );
            })}
          </div>

          <h3 className="text-lg font-bold mb-3">Your reports</h3>
          {reportsList.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-[#E5E7EB] text-center">
              <FileBarChart size={40} className="mx-auto mb-3 text-[#D1D5DB]" />
              <p className="text-sm text-[#6B7280]">Build a report to pick exactly which fields, filters and sort order you need — including round scores, judges and comments.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm divide-y divide-[#F3F4F6]">
              {reportsList.map(report => (
                <div key={report.id} className="flex items-center gap-4 px-4 py-3 hover:bg-[#F9FAFB] transition-colors">
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openBuilder(report)} className="p-1.5 text-[#6B7280] hover:text-[#4F46E5] hover:bg-[#EEF2FF] rounded-lg" title="Edit report"><Pencil size={15} /></button>
                    <button onClick={() => deleteReport(report.id)} className="p-1.5 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg" title="Delete report"><Trash2 size={15} /></button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-[#111827] truncate">{report.name}</p>
                    <p className="text-xs text-[#9CA3AF]">
                      {report.criteria.length} filter{report.criteria.length !== 1 ? 's' : ''} · {report.columns.length} column{report.columns.length !== 1 ? 's' : ''}
                      {report.options?.sort ? ` · sorted by ${fieldDef(report.options.sort.field)?.label ?? report.options.sort.field}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => openRun({ kind: 'custom', report })}
                    className="flex-shrink-0 bg-[#4F46E5] text-white px-4 py-1.5 rounded-lg font-bold text-xs hover:bg-[#4338CA] flex items-center gap-1.5"
                  >
                    <Play size={14} /> Run
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'builder' && (
        <>
          <button onClick={() => setView('list')} className="text-[#4F46E5] font-bold flex items-center gap-2 hover:underline mb-6">← Back to Reports</button>
          <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-8 space-y-8">
            <h3 className="text-2xl font-bold">{editingId ? 'Edit Report' : 'Create Report'}</h3>
            <div>
              <label className="block text-sm font-bold text-[#374151] mb-1.5">Report Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full max-w-md border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none"
                placeholder="e.g. Round results with comments"
              />
              <p className="text-xs text-[#9CA3AF] mt-1.5">You'll choose the audition and round each time you run it.</p>
            </div>

            <div>
              <h4 className="text-lg font-bold mb-4 flex items-center gap-2"><Filter size={20} className="text-[#4F46E5]" /> Filter Criteria</h4>
              <p className="text-sm text-[#6B7280] mb-4">Add conditions to filter which participants appear. Leave empty to include everyone.</p>
              <div className="space-y-3">
                {criteria.map((criterion, idx) => (
                  <div key={idx} className="flex items-center gap-2 flex-wrap bg-[#F9FAFB] p-3 rounded-xl">
                    {idx === 0 ? (
                      <span className="w-16 text-xs font-bold text-[#6B7280] uppercase text-center">Where</span>
                    ) : (
                      <select
                        value={criterion.logicOp || 'AND'}
                        onChange={e => updateCriterion(idx, { logicOp: e.target.value as 'AND' | 'OR' })}
                        className="w-16 border border-[#E5E7EB] rounded-lg px-1 py-2 text-xs font-bold bg-white text-center"
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                    )}
                    <select
                      value={criterion.field}
                      onChange={e => {
                        const ops = getOperatorsForType(fieldDef(e.target.value)?.type || 'text');
                        updateCriterion(idx, { field: e.target.value, operator: ops[0]?.value || 'equals', value: '' });
                      }}
                      className="flex-1 min-w-[160px] border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="" disabled>Select field...</option>
                      {fieldOptions(availableFields)}
                    </select>
                    <select
                      value={criterion.operator}
                      onChange={e => updateCriterion(idx, { operator: e.target.value, ...(['is_empty', 'is_not_empty'].includes(e.target.value) ? { value: '' } : {}) })}
                      className="w-44 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      {getOperatorsForType(fieldDef(criterion.field)?.type || 'text').map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                    {renderCriterionValue(criterion, idx)}
                    <button onClick={() => setCriteria(criteria.filter((_, i) => i !== idx))} className="p-2 text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg flex-shrink-0"><XCircle size={18} /></button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const first = availableFields[0];
                    setCriteria([...criteria, {
                      field: first.field,
                      operator: getOperatorsForType(first.type)[0]?.value || 'equals',
                      value: '',
                      ...(criteria.length > 0 ? { logicOp: 'AND' as const } : {}),
                    }]);
                  }}
                  className="flex items-center gap-2 text-sm font-bold text-[#4F46E5] hover:underline pt-2"
                >
                  <Plus size={16} /> Add Condition
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-bold mb-4 flex items-center gap-2"><ClipboardList size={20} className="text-[#4F46E5]" /> Display Columns</h4>
              <p className="text-sm text-[#6B7280] mb-4">Round fields come from the round you choose when running the report (or each participant's latest round).</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Selected Columns</h5>
                  <div className="border border-[#E5E7EB] rounded-xl min-h-[240px] max-h-[360px] overflow-y-auto">
                    {columns.length === 0 ? (
                      <div className="p-6 text-center text-[#9CA3AF] text-sm">No columns selected — add fields from the right</div>
                    ) : (
                      <div className="divide-y divide-[#F3F4F6]">
                        {columns.map((col, idx) => (
                          <div key={col.field} className="flex items-center gap-1 px-3 py-2.5 hover:bg-[#F9FAFB]">
                            <span className="text-xs text-[#9CA3AF] w-5 text-center font-mono">{idx + 1}</span>
                            <span className="text-sm font-medium flex-1 truncate">{col.label}</span>
                            <button
                              onClick={() => { const u = [...columns]; [u[idx - 1], u[idx]] = [u[idx], u[idx - 1]]; setColumns(u); }}
                              disabled={idx === 0}
                              className="p-1 rounded hover:bg-[#EEF2FF] text-[#6B7280] hover:text-[#4F46E5] disabled:opacity-25"
                              title="Move up"
                            ><ArrowUp size={14} /></button>
                            <button
                              onClick={() => { const u = [...columns]; [u[idx], u[idx + 1]] = [u[idx + 1], u[idx]]; setColumns(u); }}
                              disabled={idx === columns.length - 1}
                              className="p-1 rounded hover:bg-[#EEF2FF] text-[#6B7280] hover:text-[#4F46E5] disabled:opacity-25"
                              title="Move down"
                            ><ArrowDown size={14} /></button>
                            <button onClick={() => setColumns(columns.filter(c => c.field !== col.field))} className="p-1 rounded hover:bg-[#FEF2F2] text-[#D1D5DB] hover:text-[#EF4444]" title="Remove"><XCircle size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h5 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Available Fields</h5>
                  <div className="border border-[#E5E7EB] rounded-xl min-h-[240px] max-h-[360px] overflow-y-auto">
                    {(() => {
                      const unselected = availableFields.filter(f => !columns.some(c => c.field === f.field));
                      if (unselected.length === 0) return <div className="p-6 text-center text-[#9CA3AF] text-sm">All fields added</div>;
                      return (
                        <div className="divide-y divide-[#F3F4F6]">
                          {FIELD_GROUPS.map(group => {
                            const inGroup = unselected.filter(f => f.group === group);
                            if (inGroup.length === 0) return null;
                            return (
                              <React.Fragment key={group}>
                                <div className="px-3 py-1.5 bg-[#F9FAFB] text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">{group}</div>
                                {inGroup.map(f => (
                                  <button
                                    key={f.field}
                                    onClick={() => setColumns([...columns, { field: f.field, label: f.label }])}
                                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#EEF2FF] text-left"
                                  >
                                    <Plus size={14} className="text-[#4F46E5] flex-shrink-0" />
                                    <span className="text-sm font-medium">{f.label}</span>
                                  </button>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-bold mb-3 flex items-center gap-2"><ListOrdered size={20} className="text-[#4F46E5]" /> Sort</h4>
              <div className="flex flex-wrap gap-2">
                <select
                  value={sort?.field ?? ''}
                  onChange={e => setSort(e.target.value ? { field: e.target.value, dir: sort?.dir ?? 'asc' } : null)}
                  className="min-w-[220px] border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">No sorting</option>
                  {fieldOptions(availableFields)}
                </select>
                {sort && (
                  <select
                    value={sort.dir}
                    onChange={e => setSort({ ...sort, dir: e.target.value as 'asc' | 'desc' })}
                    className="border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="asc">Ascending (A→Z, low→high)</option>
                    <option value="desc">Descending (Z→A, high→low)</option>
                  </select>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-[#E5E7EB]">
              <button onClick={() => setView('list')} className="px-6 py-3 border border-[#E5E7EB] rounded-xl font-bold hover:bg-[#F9FAFB]">Cancel</button>
              <button
                onClick={saveReport}
                disabled={!name.trim() || columns.length === 0}
                className="bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingId ? 'Update Report' : 'Save Report'}
              </button>
            </div>
          </div>
        </>
      )}

      {view === 'results' && result && (
        <>
          <button onClick={() => setView('list')} className="text-[#4F46E5] font-bold flex items-center gap-2 hover:underline mb-6 print:hidden">← Back to Reports</button>

          <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight mb-1 print:text-2xl">{result.title}</h2>
              {result.subtitle && <p className="text-[#374151] font-medium">{result.subtitle}</p>}
              <p className="text-sm text-[#6B7280]">
                {result.rows.filter(r => !r._emphasis).length} row{result.rows.length !== 1 ? 's' : ''}
                {generatedAt && <> · Generated {generatedAt.toLocaleString()}</>}
              </p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="bg-white text-[#4F46E5] border border-[#4F46E5] px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-[#EEF2FF]"
              >
                <Printer size={16} /> Print
              </button>
              {canExport ? (
                <button onClick={exportCsv} className="bg-white text-[#4F46E5] border border-[#4F46E5] px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-[#EEF2FF]">
                  <Download size={16} /> Export CSV
                </button>
              ) : (
                <button
                  onClick={onUpgrade}
                  className="relative bg-white text-[#9CA3AF] border border-[#E5E7EB] px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:border-[#4F46E5] hover:text-[#4F46E5] group"
                >
                  <Lock size={16} /> Export CSV
                  <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#1F2937] text-white text-xs font-medium px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Upgrade to Business to export
                  </span>
                </button>
              )}
              {lastRun && (
                <button
                  onClick={() => openRun(lastRun.target)}
                  className="bg-white text-[#374151] border border-[#E5E7EB] px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#F9FAFB]"
                >
                  Change audition / round
                </button>
              )}
              {lastRun && (
                <button
                  onClick={() => execute(lastRun.target, lastRun.auditionId, lastRun.round)}
                  disabled={running}
                  className="bg-[#4F46E5] text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-[#4338CA] disabled:opacity-50"
                >
                  {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Re-run
                </button>
              )}
            </div>
          </div>

          {result.note && (
            <div className="mb-4 text-sm text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-4 py-2.5 rounded-xl print:border-[#D1D5DB] print:bg-white print:text-[#374151]">{result.note}</div>
          )}

          <div className="bg-white rounded-3xl border border-[#E5E7EB] overflow-hidden shadow-sm print:rounded-none print:shadow-none print:border-0">
            {result.rows.length === 0 ? (
              <div className="p-12 text-center text-[#6B7280]">
                <Search size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
                <h3 className="text-lg font-bold text-[#374151] mb-2">No Results</h3>
                <p className="text-sm">Nothing matches this report for the audition and round you chose.</p>
              </div>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                      {visibleColumns.map(col => (
                        <th key={col.field} className={`px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider whitespace-nowrap print:px-2 print:py-2 ${col.align === 'right' ? 'text-right' : ''}`}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">{renderRows()}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {runTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 print:hidden" onClick={() => setRunTarget(null)}>
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-1">Run {runTarget.kind === 'custom' ? runTarget.report.name : runTarget.def.name}</h3>
            <p className="text-sm text-[#6B7280] mb-6">{runTarget.kind === 'standard' ? runTarget.def.description : 'Choose which audition and round to report on.'}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Audition</label>
                <select
                  value={runAuditionId}
                  onChange={e => onRunAuditionChange(e.target.value)}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 bg-white"
                >
                  {runTarget.kind === 'custom' && <option value="">All auditions</option>}
                  {meta.auditions.map(a => <option key={a.id} value={a.id}>{a.title} — {a.date}{a.divisionTitle ? ` (${a.divisionTitle})` : ''}</option>)}
                </select>
              </div>
              {(runTarget.kind === 'custom' || runTarget.def.needsRound) && (
                <div>
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">Round</label>
                  {runTarget.kind === 'standard' && runDialogRounds.length === 0 ? (
                    <p className="text-sm text-[#6B7280]">This audition doesn't have any rounds yet.</p>
                  ) : (
                    <select value={runRound} onChange={e => setRunRound(e.target.value)} className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 bg-white">
                      {runTarget.kind === 'custom' && <option value="latest">Latest round each participant reached</option>}
                      {runAuditionId
                        ? runDialogRounds.map(r => <option key={r.roundNumber} value={r.roundNumber}>{r.title}{r.status === 'open' ? ' (open)' : r.isFinal ? ' (final)' : ''}</option>)
                        : Array.from({ length: maxRoundAcrossAll }, (_, i) => <option key={i + 1} value={i + 1}>Round {i + 1}</option>)}
                    </select>
                  )}
                  {runTarget.kind === 'custom' && runRound !== 'latest' && (
                    <p className="text-xs text-[#9CA3AF] mt-1.5">Only participants in this round are included.</p>
                  )}
                </div>
              )}
              {runError && <p className="text-sm text-[#EF4444]">{runError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setRunTarget(null)} className="flex-1 px-6 py-3 border border-[#E5E7EB] rounded-xl font-bold hover:bg-[#F9FAFB]">Cancel</button>
                <button
                  onClick={runSelected}
                  disabled={running}
                  className="flex-1 bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
