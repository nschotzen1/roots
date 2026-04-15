import {
  getStreakTier,
  isStreakTierUpgrade,
} from '../game/streakTiers';

type BonusToastProps = {
  bonusMs: number;
  multiplier: number;
  elapsedMs: number;
  scoreGain: number;
  moveType: 'REPLACE' | 'SWAP' | null;
  comboLabel: string | null;
  comboCount: number;
  chainBonusScore: number;
  streakBonusScore: number;
  streakBonusMs: number;
  comboBonusMs: number;
  streakAfterMove: number;
  visible: boolean;
};

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;

export default function BonusToast({
  bonusMs,
  multiplier,
  elapsedMs,
  scoreGain,
  moveType,
  comboLabel,
  comboCount,
  chainBonusScore,
  streakBonusScore,
  streakBonusMs,
  comboBonusMs,
  streakAfterMove,
  visible,
}: BonusToastProps) {
  const streakTier = getStreakTier(streakAfterMove);
  const streakLabel = streakAfterMove > 0 ? `${streakTier.shortLabel} x${streakAfterMove}` : null;
  const tierUpgrade = isStreakTierUpgrade(streakAfterMove);
  const moveToneClass =
    moveType === 'SWAP'
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <div
      className={[
        'pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-40 w-[min(92vw,24rem)] -translate-x-1/2 transition-all duration-300 sm:bottom-auto sm:top-18 sm:w-auto md:top-20',
        visible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-5 opacity-0 scale-95',
      ].join(' ')}
      aria-live="polite"
    >
      <div className="relative overflow-hidden rounded-[1rem] border border-amber-200/70 bg-[#fff6e2]/96 px-4 py-3 text-slate-950 shadow-[0_26px_80px_-30px_rgba(15,23,42,0.82)] backdrop-blur sm:rounded-[2rem] sm:px-6 sm:py-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.34),transparent_42%),radial-gradient(circle_at_78%_20%,rgba(236,72,153,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.56),transparent_55%)]" />
        <div className="relative">
          <div className="mb-2 flex flex-wrap items-center gap-2 sm:mb-3">
            <span className={['rounded-full border px-3 py-1 text-[0.66rem] font-black uppercase tracking-[0.2em]', moveToneClass].join(' ')}>
              {moveType === 'SWAP' ? 'Swap bonus' : 'Letter change'}
            </span>
            {streakLabel ? (
              <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[0.66rem] font-black uppercase tracking-[0.2em] text-fuchsia-700">
                {streakLabel}
              </span>
            ) : null}
            {tierUpgrade ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[0.66rem] font-black uppercase tracking-[0.2em] text-rose-700">
                Tier up
              </span>
            ) : null}
            {comboLabel && comboCount >= 2 ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[0.66rem] font-black uppercase tracking-[0.2em] text-emerald-700">
                {comboLabel} x{comboCount}
              </span>
            ) : null}
          </div>
          <div className="flex items-end gap-3 sm:gap-5">
            <div className="text-3xl font-black leading-none text-amber-600 drop-shadow-[0_4px_10px_rgba(245,158,11,0.24)] sm:text-4xl md:text-5xl">
              +{formatSeconds(bonusMs)}
            </div>
            <div className="text-right">
              <div className="text-[0.68rem] uppercase tracking-[0.26em] text-slate-500">Time added</div>
              <div className="text-lg font-black md:text-xl">
                {formatSeconds(elapsedMs)} move
              </div>
              <div className="mt-1 text-sm font-bold text-slate-600">
                x{multiplier.toFixed(2)} · +{scoreGain} score
              </div>
            </div>
          </div>
          {(streakBonusMs > 0 || comboBonusMs > 0 || streakBonusScore > 0 || chainBonusScore > 0) ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {streakBonusMs > 0 ? (
                <span className="rounded-full bg-fuchsia-100 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-fuchsia-700">
                  +{formatSeconds(streakBonusMs)} streak
                </span>
              ) : null}
              {comboBonusMs > 0 ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-emerald-700">
                  +{formatSeconds(comboBonusMs)} combo
                </span>
              ) : null}
              {streakBonusScore > 0 ? (
                <span className="rounded-full bg-rose-100 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-rose-700">
                  +{streakBonusScore} streak
                </span>
              ) : null}
              {chainBonusScore > 0 ? (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-sky-700">
                  +{chainBonusScore} combo score
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
