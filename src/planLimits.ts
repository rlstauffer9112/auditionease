export const PLAN_LIMITS = {
  personal: {
    maxAuditions: 3,
    maxParticipantsPerAudition: 10,
  },
  business: {
    maxAuditions: 200,
    maxParticipantsPerAudition: 200,
  },
  enterprise: {
    maxAuditions: Infinity,
    maxParticipantsPerAudition: Infinity,
  },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string | null | undefined) {
  if (plan === 'business' || plan === 'enterprise') return PLAN_LIMITS[plan];
  return PLAN_LIMITS.personal;
}

export function formatLimit(value: number): string {
  return value === Infinity ? 'Unlimited' : `${value}`;
}
