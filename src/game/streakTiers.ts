export type StreakTierId = 'reset' | 'x' | 'y' | 'z' | 'viral';

export type StreakTier = {
  id: StreakTierId;
  label: string;
  shortLabel: string;
  minStreak: number;
  maxStreak: number | null;
  scoreBonus: number;
  timeBonusMs: number;
};

export const STREAK_TIERS: StreakTier[] = [
  {
    id: 'reset',
    label: 'No bonus',
    shortLabel: 'Reset',
    minStreak: 0,
    maxStreak: 0,
    scoreBonus: 0,
    timeBonusMs: 0,
  },
  {
    id: 'x',
    label: 'X bonus',
    shortLabel: 'X',
    minStreak: 1,
    maxStreak: 3,
    scoreBonus: 30,
    timeBonusMs: 400,
  },
  {
    id: 'y',
    label: 'Y bonus',
    shortLabel: 'Y',
    minStreak: 4,
    maxStreak: 8,
    scoreBonus: 110,
    timeBonusMs: 1_000,
  },
  {
    id: 'z',
    label: 'Z bonus',
    shortLabel: 'Z',
    minStreak: 9,
    maxStreak: 12,
    scoreBonus: 260,
    timeBonusMs: 2_000,
  },
  {
    id: 'viral',
    label: 'Viral bonus',
    shortLabel: 'Viral',
    minStreak: 13,
    maxStreak: null,
    scoreBonus: 420,
    timeBonusMs: 3_200,
  },
];

export const formatStreakTierRange = (tier: StreakTier) =>
  tier.maxStreak === null ? `${tier.minStreak}+` : `${tier.minStreak}-${tier.maxStreak}`;

export const getStreakTier = (streak: number) => {
  const safeStreak = Math.max(0, Math.floor(streak));

  for (let index = STREAK_TIERS.length - 1; index >= 0; index -= 1) {
    const tier = STREAK_TIERS[index];
    if (safeStreak >= tier.minStreak) {
      return tier;
    }
  }

  return STREAK_TIERS[0];
};

export const getNextStreakTier = (streak: number) => {
  const safeStreak = Math.max(0, Math.floor(streak));
  return STREAK_TIERS.find((tier) => tier.minStreak > safeStreak) ?? null;
};

export const getStreakTierProgress = (streak: number) => {
  const safeStreak = Math.max(0, Math.floor(streak));
  const currentTier = getStreakTier(safeStreak);
  const nextTier = getNextStreakTier(safeStreak);

  if (!nextTier) return 1;
  if (currentTier.id === 'reset') return 0;

  const stepsToNextTier = Math.max(1, nextTier.minStreak - currentTier.minStreak);
  return Math.min(1, Math.max(0, (safeStreak - currentTier.minStreak + 1) / stepsToNextTier));
};

export const isStreakTierUpgrade = (streak: number) => {
  const safeStreak = Math.max(0, Math.floor(streak));
  if (safeStreak <= 0) return false;
  return getStreakTier(safeStreak).minStreak === safeStreak;
};
