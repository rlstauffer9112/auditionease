// Per-audition settings, stored as jsonb on auditions.settings. Shared by server and UI.
// To add a setting: add it to the interface, give it a default, and validate it in normalizeAuditionSettings.

export interface AuditionSettings {
  // Judges can't see other judges' scores or comments. Organizers always see everything.
  blindJudging: boolean;
}

export const DEFAULT_AUDITION_SETTINGS: AuditionSettings = {
  blindJudging: true,
};

// Fill in defaults and drop unknown or badly typed values. Accepts anything (e.g. a request body or DB value).
export function normalizeAuditionSettings(input: unknown): AuditionSettings {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    blindJudging: typeof raw.blindJudging === 'boolean' ? raw.blindJudging : DEFAULT_AUDITION_SETTINGS.blindJudging,
  };
}

// Apply a partial update on top of existing settings. Invalid values in the patch are ignored
// (the current value is kept) rather than resetting the setting to its default.
export function mergeAuditionSettings(current: unknown, patch: unknown): AuditionSettings {
  const base = normalizeAuditionSettings(current);
  const changes = patch && typeof patch === 'object' ? (patch as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base) as (keyof AuditionSettings)[]) {
    if (key in changes && typeof changes[key] === typeof base[key]) merged[key] = changes[key];
  }
  return normalizeAuditionSettings(merged);
}
