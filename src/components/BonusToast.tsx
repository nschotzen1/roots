type BonusToastProps = {
  bonusMs: number;
  multiplier: number;
  elapsedMs: number;
  scoreGain: number;
  comboLabel: string | null;
  comboCount: number;
  chainBonusScore: number;
  visible: boolean;
};

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;

export default function BonusToast({
  bonusMs,
  multiplier,
  elapsedMs,
  scoreGain,
  comboLabel,
  comboCount,
  chainBonusScore,
  visible,
}: BonusToastProps) {
  const showCombo = Boolean(comboLabel) && comboCount >= 2;

  return (
    <div
      className={[
        'pointer-events-none fixed left-1/2 top-18 z-40 -translate-x-1/2 transition-all duration-300 md:top-20',
        visible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-5 opacity-0 scale-95',
      ].join(' ')}
      aria-live="polite"
    >
      <div className="relative overflow-hidden rounded-[2rem] border border-amber-200/70 bg-[#fff6e2]/96 px-6 py-4 text-slate-950 shadow-[0_26px_80px_-30px_rgba(15,23,42,0.82)] backdrop-blur">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.28),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.5),transparent_55%)]" />
        <div className="relative flex items-end gap-5">
          <div className="text-4xl font-black leading-none text-amber-600 drop-shadow-[0_4px_10px_rgba(245,158,11,0.24)] md:text-5xl">
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
            {showCombo ? (
              <div className="mt-1 text-[0.72rem] font-black uppercase tracking-[0.18em] text-amber-700">
                {comboLabel} x{comboCount}
                {chainBonusScore > 0 ? ` · +${chainBonusScore} combo` : ''}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
