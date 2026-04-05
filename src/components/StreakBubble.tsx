import { STREAK_TIERS, type StreakTier } from '../game/streakTiers';

type Props = {
  streak: number;
  tier: StreakTier;
  nextTier: StreakTier | null;
  progressPct: number;
  energized: boolean;
  busted: boolean;
};

const TONE_CLASSES: Record<
  StreakTier['id'],
  {
    shell: string;
    orb: string;
    activeDot: string;
    nextDot: string;
    idleDot: string;
    meter: string;
  }
> = {
  reset: {
    shell: 'border-white/80 bg-white/78 text-slate-700 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.36)]',
    orb: 'bg-slate-400',
    activeDot: 'bg-slate-700 shadow-[0_0_0_3px_rgba(15,23,42,0.08)]',
    nextDot: 'border border-slate-400 bg-white',
    idleDot: 'bg-slate-200',
    meter: 'bg-[linear-gradient(90deg,#94a3b8_0%,#64748b_100%)]',
  },
  x: {
    shell: 'border-amber-200/90 bg-[#fff7e6]/84 text-amber-950 shadow-[0_14px_34px_-24px_rgba(217,119,6,0.42)]',
    orb: 'bg-amber-400',
    activeDot: 'bg-amber-500 shadow-[0_0_0_3px_rgba(251,191,36,0.18)]',
    nextDot: 'border border-amber-400 bg-white',
    idleDot: 'bg-amber-200/70',
    meter: 'bg-[linear-gradient(90deg,#f59e0b_0%,#f97316_100%)]',
  },
  y: {
    shell: 'border-sky-200/90 bg-sky-50/84 text-sky-950 shadow-[0_14px_34px_-24px_rgba(14,165,233,0.4)]',
    orb: 'bg-sky-400',
    activeDot: 'bg-sky-500 shadow-[0_0_0_3px_rgba(125,211,252,0.2)]',
    nextDot: 'border border-sky-400 bg-white',
    idleDot: 'bg-sky-200/70',
    meter: 'bg-[linear-gradient(90deg,#38bdf8_0%,#2563eb_100%)]',
  },
  z: {
    shell: 'border-fuchsia-200/90 bg-fuchsia-50/82 text-fuchsia-950 shadow-[0_14px_34px_-24px_rgba(192,38,211,0.38)]',
    orb: 'bg-fuchsia-400',
    activeDot: 'bg-fuchsia-500 shadow-[0_0_0_3px_rgba(232,121,249,0.18)]',
    nextDot: 'border border-fuchsia-400 bg-white',
    idleDot: 'bg-fuchsia-200/70',
    meter: 'bg-[linear-gradient(90deg,#e879f9_0%,#c026d3_100%)]',
  },
  viral: {
    shell: 'border-emerald-200/90 bg-emerald-50/82 text-emerald-950 shadow-[0_14px_34px_-24px_rgba(5,150,105,0.38)]',
    orb: 'bg-emerald-400',
    activeDot: 'bg-emerald-500 shadow-[0_0_0_3px_rgba(52,211,153,0.18)]',
    nextDot: 'border border-emerald-400 bg-white',
    idleDot: 'bg-emerald-200/70',
    meter: 'bg-[linear-gradient(90deg,#34d399_0%,#059669_100%)]',
  },
};

export default function StreakBubble({
  streak,
  tier,
  nextTier,
  progressPct,
  energized,
  busted,
}: Props) {
  const theme = TONE_CLASSES[busted ? 'reset' : streak > 0 ? tier.id : 'reset'];
  const safeProgressPct = Math.max(0, Math.min(100, Math.round(progressPct * 100)));

  return (
    <div
      className={[
        'pointer-events-none relative w-[min(44vw,11.5rem)]',
        energized || busted ? 'streak-chip-boost' : '',
      ].join(' ')}
      aria-live="polite"
    >
      <div className={['rounded-[1.25rem] border px-3 py-2 backdrop-blur', theme.shell].join(' ')}>
        <div className="flex items-center gap-2">
          <span className={['h-2.5 w-2.5 rounded-full', busted ? 'bg-rose-500' : theme.orb].join(' ')} />
          <span className="text-sm font-black leading-none tabular-nums">
            x{streak}
          </span>
          <span className="text-[0.58rem] font-black uppercase tracking-[0.16em] opacity-75">
            {busted ? 'Bust' : streak > 0 ? tier.shortLabel : 'Cold'}
          </span>
          <div className="mr-auto flex items-center gap-1">
            {STREAK_TIERS.filter((entry) => entry.id !== 'reset').map((entry) => (
              <span
                key={entry.id}
                className={[
                  'h-2.5 w-2.5 rounded-full transition-all duration-200',
                  streak > 0 && entry.id === tier.id
                    ? theme.activeDot
                    : nextTier?.id === entry.id
                      ? theme.nextDot
                      : theme.idleDot,
                ].join(' ')}
              />
            ))}
          </div>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/6">
          <div
            className={['h-full rounded-full transition-[width] duration-250', busted ? 'bg-[linear-gradient(90deg,#fb7185_0%,#e11d48_100%)]' : theme.meter].join(' ')}
            style={{ width: `${busted ? 100 : safeProgressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
