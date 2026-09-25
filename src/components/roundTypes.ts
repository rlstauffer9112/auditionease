import type { Criterion } from './CriteriaFields';
import type { AdvanceRule, ManualOverride } from '../lib/roundScoring';

export type AuthFetch = (url: string, opts?: RequestInit) => Promise<Response>;

export interface Round {
  id: number;
  auditionId: number;
  roundNumber: number;
  title: string;
  status: 'open' | 'closed';
  advanceRule: AdvanceRule;
  advanceValue: number | null;
  isFinal: boolean;
  createdAt: string;
  closedAt: string | null;
  criteria: Criterion[];
  participantCount: number;
  advancedCount: number;
}

export interface RoundEvaluation {
  id: number;
  judgeUserId: number;
  judgeName: string;
  comment: string | null;
  updatedAt: string;
  scores: { criterionId: number; score: number }[];
}

export interface RoundParticipant {
  id: number;
  roundId: number;
  auditionUserId: number;
  userId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: 'pending' | 'advanced' | 'eliminated';
  manualOverride: ManualOverride;
  notes: string | null;
  scheduledTime: string | null;
  finalScore: number | null;
  rank: number | null;
  evaluations: RoundEvaluation[];
}

export interface RoundDetail {
  round: Round;
  criteria: Criterion[];
  currentUserId: number;
  // Judges only see and edit their own scores
  role: 'manager' | 'judge';
  // True when the audition uses blind judging and this user is a listed judge
  blindJudging?: boolean;
  participants: RoundParticipant[];
}

export const formatScore = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
};

export const jsonHeaders = { 'Content-Type': 'application/json' };
