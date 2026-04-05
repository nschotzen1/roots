type Props = {
  tone: 'x' | 'y' | 'z' | 'viral' | 'bust';
  title: string;
  detail: string;
  visible: boolean;
};

const TONE_CLASSES: Record<
  Props['tone'],
  {
    shell: string;
    badge: string;
    sparkle: string;
  }
> = {
  x: {
    shell:
      'border-amber-200/90 bg-[linear-gradient(135deg,rgba(255,250,235,0.98)_0%,rgba(254,215,170,0.95)_100%)] text-amber-950 shadow-[0_18px_45px_-22px_rgba(217,119,6,0.52)]',
    badge: 'bg-amber-500 text-white',
    sparkle: 'bg-amber-300/90',
  },
  y: {
    shell:
      'border-sky-200/90 bg-[linear-gradient(135deg,rgba(240,249,255,0.98)_0%,rgba(191,219,254,0.95)_100%)] text-sky-950 shadow-[0_18px_45px_-22px_rgba(14,165,233,0.48)]',
    badge: 'bg-sky-600 text-white',
    sparkle: 'bg-sky-300/90',
  },
  z: {
    shell:
      'border-fuchsia-200/90 bg-[linear-gradient(135deg,rgba(253,244,255,0.98)_0%,rgba(245,208,254,0.95)_100%)] text-fuchsia-950 shadow-[0_18px_45px_-22px_rgba(192,38,211,0.48)]',
    badge: 'bg-fuchsia-600 text-white',
    sparkle: 'bg-fuchsia-300/90',
  },
  viral: {
    shell:
      'border-emerald-200/90 bg-[linear-gradient(135deg,rgba(236,253,245,0.98)_0%,rgba(167,243,208,0.95)_100%)] text-emerald-950 shadow-[0_18px_45px_-22px_rgba(5,150,105,0.48)]',
    badge: 'bg-emerald-600 text-white',
    sparkle: 'bg-emerald-300/90',
  },
  bust: {
    shell:
      'border-rose-200/90 bg-[linear-gradient(135deg,rgba(255,241,242,0.98)_0%,rgba(254,205,211,0.95)_100%)] text-rose-950 shadow-[0_18px_45px_-22px_rgba(225,29,72,0.48)]',
    badge: 'bg-rose-600 text-white',
    sparkle: 'bg-rose-300/90',
  },
};

export default function StreakPulse({ tone, title, detail, visible }: Props) {
  if (!visible) return null;

  const classes = TONE_CLASSES[tone];

  return (
    <div className="pointer-events-none relative streak-pulse-pop" aria-live="polite">
      <div className={['relative overflow-hidden rounded-[1.4rem] border px-4 py-3 backdrop-blur', classes.shell].join(' ')}>
        <div className="absolute -right-2 top-2 h-4 w-4 rounded-full bg-white/70" />
        <div className={['absolute -left-1 top-4 h-3 w-3 rounded-full', classes.sparkle].join(' ')} />
        <div className={['absolute bottom-2 right-5 h-2.5 w-2.5 rounded-full', classes.sparkle].join(' ')} />

        <div className="relative flex items-center gap-2">
          <span className={['rounded-full px-2.5 py-1 text-[0.58rem] font-black uppercase tracking-[0.2em]', classes.badge].join(' ')}>
            {title}
          </span>
          <span className="text-sm font-black uppercase tracking-[0.12em]">
            {detail}
          </span>
        </div>
      </div>
    </div>
  );
}
