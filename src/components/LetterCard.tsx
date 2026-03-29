type Props = {
  letter: string;
  imgSrc?: string;
  selected?: boolean;
  swapTarget?: boolean;
  disabled?: boolean;
  index: number;
  slotLabel?: string;
  footerLabel?: string;
  variant?: 'default' | 'embedded';
  className?: string;
  onClick?: () => void;
};

export default function LetterCard({
  letter,
  imgSrc = '/letter-placeholder.png',
  selected = false,
  swapTarget = false,
  disabled = false,
  index,
  slotLabel = `Slot ${index + 1}`,
  footerLabel = selected ? 'type now' : swapTarget ? 'tap to swap' : 'tap to edit',
  variant = 'default',
  className = '',
  onClick,
}: Props) {
  const isEmbedded = variant === 'embedded';
  const showEmbeddedTag = isEmbedded && (selected || swapTarget);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        isEmbedded
          ? 'mosaic-slot-shell group relative h-full w-full overflow-hidden rounded-[0.95rem] border-0 bg-transparent shadow-none transition duration-200 ease-out touch-manipulation'
          : 'group relative aspect-[0.94] w-[clamp(10.5rem,32vw,16rem)] overflow-hidden rounded-[2.8rem] border-[6px] bg-[linear-gradient(180deg,#fffdf7_0%,#f5ead0_100%)] shadow-[0_30px_80px_-34px_rgba(15,23,42,0.65)] transition duration-200 ease-out touch-manipulation',
        disabled ? 'cursor-not-allowed opacity-65' : 'cursor-pointer',
        selected
          ? isEmbedded
            ? 'mosaic-slot-selected'
            : 'pulse-glow border-amber-300 ring-4 ring-amber-200 -translate-y-1 scale-[1.02]'
          : swapTarget
            ? isEmbedded
              ? 'mosaic-slot-target'
              : 'border-sky-300 ring-4 ring-sky-100 hover:border-sky-400'
            : isEmbedded
              ? ''
              : 'border-[#e9d9a6] hover:border-[#e4ca7d]',
        className,
      ].join(' ')}
      aria-label={`Letter slot ${index + 1}: ${letter || 'empty'} (${slotLabel})`}
    >
      <div
        className={
          isEmbedded
            ? 'mosaic-slot-surface absolute inset-0'
            : 'absolute inset-[6%] rounded-[1.9rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,239,216,0.98)_100%)]'
        }
      />
      <div
        className={[
          'absolute inset-0 transition-opacity duration-200',
          selected
            ? 'bg-[radial-gradient(circle_at_50%_16%,rgba(251,191,36,0.28),transparent_45%)] opacity-100'
            : swapTarget
              ? 'bg-[radial-gradient(circle_at_50%_16%,rgba(56,189,248,0.18),transparent_45%)] opacity-100'
              : 'opacity-0',
        ].join(' ')}
      />
      <img
        src={imgSrc}
        alt={letter || 'letter'}
        className={
          isEmbedded
            ? 'absolute inset-[3%] h-[94%] w-[94%] object-cover opacity-80 mix-blend-multiply saturate-[0.82]'
            : 'absolute inset-[11%] h-[78%] w-[78%] object-cover opacity-92 mix-blend-multiply'
        }
        onError={(event) => {
          (event.currentTarget as HTMLImageElement).src = '/letter-placeholder.png';
        }}
      />
      <div className={isEmbedded ? 'absolute inset-x-[8%] top-[4%] h-[16%] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.46),rgba(255,255,255,0))]' : 'absolute inset-x-[10%] top-[6%] h-[15%] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0))]'} />
      <div className={isEmbedded ? 'absolute inset-x-[8%] bottom-[4%] h-[16%] rounded-full bg-[linear-gradient(0deg,rgba(15,23,42,0.18),rgba(15,23,42,0))]' : 'absolute inset-x-[10%] bottom-[7%] h-[16%] rounded-full bg-[linear-gradient(0deg,rgba(15,23,42,0.12),rgba(15,23,42,0))]'} />
      <div className={isEmbedded ? 'absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_24%,rgba(15,23,42,0.05)_84%,rgba(15,23,42,0.2)_100%)]' : 'absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.42)_0%,rgba(255,255,255,0)_24%,rgba(15,23,42,0.04)_76%,rgba(15,23,42,0.16)_100%)]'} />
      {!isEmbedded ? (
        <div className="absolute inset-x-0 top-0 flex items-start justify-end px-3 pt-3">
          <div
            className={[
              'rounded-full px-3 py-1 text-[0.62rem] font-black uppercase tracking-[0.18em] text-white',
              selected ? 'bg-amber-500/90' : swapTarget ? 'bg-sky-600/88' : 'bg-slate-950/76',
            ].join(' ')}
          >
            {slotLabel}
          </div>
        </div>
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={isEmbedded ? 'select-none text-[clamp(3.5rem,10vw,6.6rem)] font-black tracking-[0.01em] text-[#22160b] drop-shadow-[0_3px_10px_rgba(255,248,225,0.4)]' : 'select-none text-[clamp(3rem,9vw,5.8rem)] font-black tracking-[0.08em] text-slate-900 drop-shadow-[0_2px_6px_rgba(255,255,255,0.72)]'}>
          {letter || '·'}
        </span>
      </div>
      <div className={isEmbedded ? 'absolute inset-x-0 bottom-0 flex items-center justify-center pb-2.5' : 'absolute inset-x-0 bottom-0 flex items-center justify-center pb-4'}>
        <div
          className={[
            isEmbedded
              ? 'rounded-full px-2.5 py-1 text-[0.54rem] font-black uppercase tracking-[0.14em] backdrop-blur transition-opacity duration-150'
              : 'rounded-full px-3 py-1 text-[0.62rem] font-black uppercase tracking-[0.18em] backdrop-blur',
            selected
              ? 'bg-amber-50/92 text-amber-700'
              : swapTarget
                ? 'bg-sky-50/92 text-sky-700'
                : 'bg-white/76 text-slate-600',
            showEmbeddedTag ? 'opacity-100' : isEmbedded ? 'opacity-0' : '',
          ].join(' ')}
        >
          {footerLabel}
        </div>
      </div>
    </button>
  );
}
