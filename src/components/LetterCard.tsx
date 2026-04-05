import { useEffect, useState, type PointerEventHandler } from 'react';

type Props = {
  letter: string;
  imgSrc?: string | null;
  selected?: boolean;
  swapTarget?: boolean;
  dimmed?: boolean;
  dragging?: boolean;
  disabled?: boolean;
  index: number;
  slotLabel?: string;
  footerLabel?: string;
  variant?: 'default' | 'embedded';
  className?: string;
  onClick?: () => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerMove?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
};

export default function LetterCard({
  letter,
  imgSrc = null,
  selected = false,
  swapTarget = false,
  dimmed = false,
  dragging = false,
  disabled = false,
  index,
  slotLabel = `Slot ${index + 1}`,
  footerLabel = selected ? 'type or drag' : swapTarget ? 'release to swap' : 'tap or drag',
  variant = 'default',
  className = '',
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: Props) {
  const [imageStatus, setImageStatus] = useState<'idle' | 'loaded' | 'error'>(() =>
    imgSrc ? 'idle' : 'error',
  );

  useEffect(() => {
    setImageStatus(imgSrc ? 'idle' : 'error');
  }, [imgSrc]);

  const isEmbedded = variant === 'embedded';
  const showEmbeddedTag = isEmbedded && (selected || swapTarget || dimmed || dragging);
  const showImage = Boolean(imgSrc) && imageStatus === 'loaded';
  const showText = !showImage;

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      disabled={disabled}
      data-slot-index={index}
      className={[
        isEmbedded
          ? 'mosaic-slot-shell group relative h-full w-full select-none overflow-hidden rounded-[0.95rem] border-0 bg-transparent shadow-none transition duration-200 ease-out'
          : 'group relative aspect-[0.94] w-[clamp(10.5rem,32vw,16rem)] select-none overflow-hidden rounded-[2.8rem] border-[6px] bg-[linear-gradient(180deg,#fffdf7_0%,#f5ead0_100%)] shadow-[0_30px_80px_-34px_rgba(15,23,42,0.65)] transition duration-200 ease-out',
        disabled
          ? 'cursor-not-allowed opacity-65'
          : dragging
            ? 'cursor-grabbing touch-none'
            : selected
              ? 'cursor-grab touch-none'
              : 'cursor-grab touch-none',
        selected
          ? isEmbedded
            ? 'mosaic-slot-selected z-[4] -translate-y-1.5 scale-[1.07]'
            : 'pulse-glow border-sky-300 ring-4 ring-sky-200 -translate-y-1 scale-[1.03]'
          : swapTarget
            ? isEmbedded
              ? 'mosaic-slot-drop-target z-[3] -translate-y-0.5 scale-[1.02]'
              : 'border-emerald-300 ring-4 ring-emerald-100 hover:border-emerald-400'
            : isEmbedded
              ? ''
              : 'border-[#e9d9a6] hover:border-[#e4ca7d]',
        dimmed ? 'mosaic-slot-dimmed' : '',
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
            ? dragging
              ? 'bg-[radial-gradient(circle_at_50%_14%,rgba(16,185,129,0.42),transparent_42%),radial-gradient(circle_at_50%_84%,rgba(220,252,231,0.42),transparent_36%),linear-gradient(180deg,rgba(6,95,70,0.08),rgba(255,255,255,0))] opacity-100'
              : 'bg-[radial-gradient(circle_at_50%_14%,rgba(56,189,248,0.58),transparent_42%),radial-gradient(circle_at_50%_84%,rgba(224,242,254,0.42),transparent_36%),linear-gradient(180deg,rgba(8,47,73,0.08),rgba(255,255,255,0))] opacity-100'
            : swapTarget
              ? 'bg-[radial-gradient(circle_at_50%_16%,rgba(16,185,129,0.24),transparent_45%)] opacity-100'
              : dimmed
                ? 'bg-[linear-gradient(180deg,rgba(15,23,42,0.24),rgba(15,23,42,0.12))] opacity-100'
                : 'opacity-0',
        ].join(' ')}
      />
      {isEmbedded && selected ? (
        <div className="pointer-events-none absolute inset-x-0 top-[4.5%] flex justify-center">
          <div
            className={[
              'rounded-[1rem] px-4 py-2 text-center',
              dragging
                ? 'border border-emerald-300/95 bg-emerald-50/98 shadow-[0_14px_30px_rgba(16,185,129,0.26)]'
                : 'border border-sky-300/95 bg-sky-50/98 shadow-[0_14px_30px_rgba(14,165,233,0.28)]',
            ].join(' ')}
          >
            <div
              className={[
                'text-[0.54rem] font-black uppercase tracking-[0.24em]',
                dragging ? 'text-emerald-800' : 'text-sky-800',
              ].join(' ')}
            >
              {dragging ? 'Dragging' : 'Selected'}
            </div>
            <div className="mt-1 text-[0.58rem] font-black uppercase tracking-[0.18em] text-slate-900">
              {dragging ? 'Release on reel' : 'Type or drag to swap'}
            </div>
          </div>
        </div>
      ) : null}
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={letter || 'letter'}
          draggable={false}
          className={[
            isEmbedded
              ? 'absolute inset-[3%] h-[94%] w-[94%] object-cover mix-blend-multiply saturate-[0.82]'
              : 'absolute inset-[11%] h-[78%] w-[78%] object-cover mix-blend-multiply',
            showImage ? (isEmbedded ? 'opacity-80' : 'opacity-92') : 'opacity-0',
          ].join(' ')}
          onLoad={() => setImageStatus('loaded')}
          onError={() => setImageStatus('error')}
        />
      ) : null}
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
        <span
          className={[
            isEmbedded
              ? [
                  'select-none font-black tracking-[0.01em] text-[#22160b] transition-all duration-200',
                  selected
                    ? 'text-[clamp(4.35rem,11.4vw,7.6rem)] text-slate-950 drop-shadow-[0_0_22px_rgba(224,242,254,0.98)]'
                    : 'text-[clamp(3.35rem,9.8vw,6.4rem)] drop-shadow-[0_3px_10px_rgba(255,248,225,0.32)]',
                ].join(' ')
              : 'select-none text-[clamp(3rem,9vw,5.8rem)] font-black tracking-[0.08em] text-slate-900 drop-shadow-[0_2px_6px_rgba(255,255,255,0.72)]',
            showText ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
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
              ? 'border border-sky-200 bg-sky-50/98 text-sky-900 shadow-[0_8px_18px_rgba(14,165,233,0.18)]'
              : swapTarget
                ? 'bg-emerald-50/96 text-emerald-700'
                : dimmed
                  ? 'bg-slate-950/62 text-white/92'
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
