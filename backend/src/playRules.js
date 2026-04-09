import { getStreakTier } from './streakTiers.js';

const MOVE_SCORE_RULES = {
  REPLACE: {
    baseScore: 100,
    chainStepScore: 35,
    chainStepTimeMs: 250,
    moveBonusMs: 0,
  },
  SWAP: {
    baseScore: 170,
    chainStepScore: 80,
    chainStepTimeMs: 950,
    moveBonusMs: 900,
  },
};

export const createComboState = () => ({
  permutationChain: 0,
  samePositionChain: 0,
  lastMoveType: null,
  lastReplacePosition: null,
});

export const getBonusOutcome = (elapsedMs, bonusWindowMs) => {
  if (elapsedMs <= bonusWindowMs / 3) {
    return { bonusMultiplier: 2, speedTier: 'lightning' };
  }

  if (elapsedMs <= bonusWindowMs / 2) {
    return { bonusMultiplier: 1.5, speedTier: 'rapid' };
  }

  if (elapsedMs <= bonusWindowMs) {
    return { bonusMultiplier: 1, speedTier: 'clean' };
  }

  if (elapsedMs <= bonusWindowMs * 2) {
    return { bonusMultiplier: 2 / 3, speedTier: 'late' };
  }

  return { bonusMultiplier: 1 / 2, speedTier: 'clutch' };
};

export const getNextComboState = (comboState, moveEdge) => {
  if (moveEdge.type === 'SWAP') {
    return {
      permutationChain: comboState.lastMoveType === 'SWAP' ? comboState.permutationChain + 1 : 1,
      samePositionChain: 0,
      lastMoveType: 'SWAP',
      lastReplacePosition: null,
    };
  }

  return {
    permutationChain: 0,
    samePositionChain:
      comboState.lastMoveType === 'REPLACE' && comboState.lastReplacePosition === moveEdge.positionA
        ? comboState.samePositionChain + 1
        : 1,
    lastMoveType: 'REPLACE',
    lastReplacePosition: moveEdge.positionA,
  };
};

export const getComboSummary = (comboState, moveEdge) => {
  const scoreRule = MOVE_SCORE_RULES[moveEdge.type];
  const comboCount =
    moveEdge.type === 'SWAP' ? comboState.permutationChain : comboState.samePositionChain;
  const chainBonusScore = Math.max(0, comboCount - 1) * scoreRule.chainStepScore;
  const comboBonusMs = Math.max(0, comboCount - 1) * scoreRule.chainStepTimeMs;

  return {
    activeCombo: moveEdge.type === 'SWAP' ? 'permutation' : 'same_position',
    comboCount,
    chainBonusScore,
    comboBonusMs,
    baseScore: scoreRule.baseScore,
    moveBonusMs: scoreRule.moveBonusMs,
  };
};

export const resolveMoveOutcome = ({
  comboState,
  moveEdge,
  streakBeforeMove,
  elapsedMs,
  remainingBeforeMs,
  config,
}) => {
  const { bonusMultiplier, speedTier } = getBonusOutcome(elapsedMs, config.bonusWindowMs);
  const nextComboState = getNextComboState(comboState, moveEdge);
  const { activeCombo, comboCount, chainBonusScore, comboBonusMs, baseScore, moveBonusMs } =
    getComboSummary(nextComboState, moveEdge);
  const streakAfterMove = streakBeforeMove + 1;
  const streakTier = getStreakTier(streakAfterMove);
  const streakBonusScore = streakTier.scoreBonus;
  const streakBonusMs = streakTier.timeBonusMs;
  const bonusMs =
    Math.round(config.bonusBaseMs * bonusMultiplier) +
    moveBonusMs +
    streakBonusMs +
    comboBonusMs;
  const scoreGain = Math.max(
    10,
    Math.round((baseScore + chainBonusScore) * bonusMultiplier) + streakBonusScore,
  );

  return {
    nextComboState,
    bonusMultiplier,
    speedTier,
    scoreGain,
    bonusMs,
    nextRemainingMs: remainingBeforeMs + bonusMs,
    baseScore,
    chainBonusScore,
    streakBonusScore,
    streakBonusMs,
    comboBonusMs,
    activeCombo,
    comboCount,
    permutationChain: nextComboState.permutationChain,
    samePositionChain: nextComboState.samePositionChain,
    samePositionIndex: nextComboState.lastReplacePosition,
    streakAfterMove,
  };
};
