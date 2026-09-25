// Report definitions shared by the server (which builds rows) and the UI (builder, run dialog, results).

export type ReportFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean' | 'multiselect';

export interface ReportFieldDef {
  field: string;
  label: string;
  type: ReportFieldType;
  group: 'Participant' | 'Audition' | 'Round' | 'Scores by criterion' | 'Custom attributes';
  options?: string; // JSON array for select fields
}

// Built-in fields available to custom reports. Keys of older fields (latestRound, score, feedback,
// roundStatus) are kept so existing saved reports keep working.
export const REPORT_FIELDS: ReportFieldDef[] = [
  { field: 'firstName', label: 'First Name', type: 'text', group: 'Participant' },
  { field: 'lastName', label: 'Last Name', type: 'text', group: 'Participant' },
  { field: 'fullName', label: 'Full Name', type: 'text', group: 'Participant' },
  { field: 'email', label: 'Email', type: 'text', group: 'Participant' },
  { field: 'phone', label: 'Phone', type: 'text', group: 'Participant' },
  { field: 'signedUpAt', label: 'Signed Up', type: 'date', group: 'Participant' },
  { field: 'timeSlot', label: 'Time Slot', type: 'text', group: 'Participant' },
  { field: 'auditionTitle', label: 'Audition', type: 'text', group: 'Audition' },
  { field: 'auditionDate', label: 'Audition Date', type: 'date', group: 'Audition' },
  { field: 'auditionLocation', label: 'Location', type: 'text', group: 'Audition' },
  { field: 'divisionTitle', label: 'Division', type: 'text', group: 'Audition' },
  { field: 'latestRound', label: 'Round', type: 'text', group: 'Round' },
  { field: 'roundNumber', label: 'Round #', type: 'number', group: 'Round' },
  { field: 'rank', label: 'Rank', type: 'number', group: 'Round' },
  { field: 'score', label: 'Round Score', type: 'number', group: 'Round' },
  { field: 'roundStatus', label: 'Round Result', type: 'select', group: 'Round', options: JSON.stringify(['In progress', 'Advanced', 'Eliminated', 'Selected']) },
  { field: 'judgeCount', label: 'Judges Scored', type: 'number', group: 'Round' },
  { field: 'judges', label: 'Judges', type: 'text', group: 'Round' },
  { field: 'judgeScores', label: 'Scores by Judge', type: 'text', group: 'Round' },
  { field: 'feedback', label: 'Judge Comments', type: 'text', group: 'Round' },
  { field: 'roundNotes', label: 'Round Notes', type: 'text', group: 'Round' },
  { field: 'scheduledTime', label: 'Round Scheduled Time', type: 'text', group: 'Round' },
  { field: 'override', label: 'Manual Override', type: 'select', group: 'Round', options: JSON.stringify(['Forced in', 'Excluded']) },
  { field: 'roundsReached', label: 'Rounds Reached', type: 'number', group: 'Round' },
  { field: 'finalResult', label: 'Final Result', type: 'select', group: 'Round', options: JSON.stringify(['Selected', 'Not selected', 'In progress']) },
];

export const criterionField = (title: string) => `criterion:${title}`;

// Scope chosen when running a report
export interface ReportScope {
  auditionId: number | null; // null = all auditions
  round: 'latest' | number;  // round number, or the latest round each participant reached
}

export interface ReportSort {
  field: string;
  dir: 'asc' | 'desc';
}

export interface ReportOptions {
  sort?: ReportSort | null;
}

export interface ReportColumn {
  field: string;
  label: string;
  align?: 'left' | 'right';
}

export interface ReportResult {
  title: string;
  subtitle?: string;
  note?: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  // Rows with the same value in this field are shown under a group heading (and not as a column)
  groupBy?: string;
}

export interface StandardReportDef {
  key: string;
  name: string;
  description: string;
  needsRound: boolean;
}

export const STANDARD_REPORTS: StandardReportDef[] = [
  { key: 'round-results', name: 'Round Results', description: 'Ranked results for a round with scores by criterion, judge counts and who advanced.', needsRound: true },
  { key: 'judge-scoresheet', name: 'Judge Scoresheet', description: "Every judge's scores and comments for each participant in a round, with averages.", needsRound: true },
  { key: 'advancing', name: 'Advancing Participants', description: 'Call-back list of who advanced from a round, with contact details and next-round schedule.', needsRound: true },
  { key: 'judging-progress', name: 'Judging Progress', description: 'How many participants each judge has scored in a round.', needsRound: true },
  { key: 'final-selections', name: 'Final Selections', description: 'Participants selected in the final round, with contact details.', needsRound: false },
  { key: 'participant-history', name: 'Participant History', description: "Each participant's score and result in every round.", needsRound: false },
  { key: 'schedule', name: 'Schedule / Sign-in Sheet', description: 'Time slots by day with participant names and a check-in column.', needsRound: false },
  { key: 'roster', name: 'Participant Roster', description: 'Everyone who signed up, with contact details, time slot and their answers.', needsRound: false },
];

export const formatNumber = (n: number | null | undefined, places = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const f = Math.pow(10, places);
  return String(Math.round(n * f) / f);
};

// Sort rows by a field, numerically when both values are numbers, blanks last
export function sortRows(rows: Record<string, any>[], sort?: ReportSort | null) {
  if (!sort?.field) return rows;
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[sort.field], bv = b[sort.field];
    const aBlank = av === '' || av === null || av === undefined;
    const bBlank = bv === '' || bv === null || bv === undefined;
    if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
    const an = Number(av), bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * dir;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
  });
}
