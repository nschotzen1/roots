export const STREAK_TIERS = [
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

export const getStreakTier = (streak) => {
  const safeStreak = Math.max(0, Math.floor(Number(streak) || 0));

  for (let index = STREAK_TIERS.length - 1; index >= 0; index -= 1) {
    const tier = STREAK_TIERS[index];
    if (safeStreak >= tier.minStreak) {
      return tier;
    }
  }

  return STREAK_TIERS[0];
};
