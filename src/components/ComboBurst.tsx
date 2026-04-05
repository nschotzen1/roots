type Props = {
  comboLabel: string | null;
  comboCount: number;
  chainBonusScore: number;
  comboBonusMs: number;
  leftPct: number;
  topPct: number;
  placement: 'left' | 'right' | 'top';
  visible: boolean;
};

const getTransform = (placement: Props['placement']) => {
  if (placement === 'left') return 'translate(-100%, -50%)';
  if (placement === 'right') return 'translate(0, -50%)';
  return 'translate(-50%, -100%)';
};

const getAlignmentClass = (placement: Props['placement']) =>
  placement === 'top'
    ? 'items-center text-center'
    : placement === 'left'
      ? 'items-end text-right'
      : 'items-start text-left';

export default function ComboBurst({
  comboLabel,
  comboCount,
  chainBonusScore,
  comboBonusMs,
  leftPct,
  topPct,
  placement,
  visible,
}: Props) {
  if (!comboLabel || comboCount < 2) return null;

  return (
    <div
      className={[
        'absolute z-10 flex min-w-[9rem] flex-col gap-1 rounded-[1.35rem] border border-amber-200/80 bg-white/94 px-3 py-2 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.42)] backdrop-blur transition-all duration-200',
        getAlignmentClass(placement),
        visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
      ].join(' ')}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: getTransform(placement),
      }}
      aria-live="polite"
    >
      <div className="text-[0.6rem] font-black uppercase tracking-[0.24em] text-amber-700/70">
        Combo burst
      </div>
      <div className="text-sm font-black text-slate-900">
        {comboLabel} x{comboCount}
      </div>
      {chainBonusScore > 0 ? (
        <div className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-emerald-700">
          +{chainBonusScore} chain score
        </div>
      ) : null}
      {comboBonusMs > 0 ? (
        <div className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-sky-700">
          +{(comboBonusMs / 1000).toFixed(comboBonusMs % 1000 === 0 ? 0 : 1)}s combo time
        </div>
      ) : null}
    </div>
  );
}
