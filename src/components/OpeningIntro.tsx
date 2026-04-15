import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import './OpeningIntro.css';

const INTRO_VIDEO_SOURCES = Object.freeze([
  '/intro/videos/rose-court-intro.mp4',
  '/intro/videos/rose-court-intro-alt.mp4',
  '/intro/videos/rose-court-intro-third.mp4',
  '/intro/videos/rose-court-intro-fourth.mp4',
]);

const INTRO_AUDIO_SRC = '/intro/app-intro-background.mp3';
const INTRO_OPENING_STILL_SRC = '/intro/app-intro-opening-still.png';
const INTRO_CLOSING_STILL_SRC = '/intro/app-intro-still.png';
const INTRO_CURTAIN_SRC = '/intro/curtain.png';
const INTRO_OPENING_STILL_HOLD_MS = 1200;
const INTRO_CURTAIN_LIFT_MS = 3200;
const INTRO_VIDEO_INDEX_STORAGE_KEY = 'rootGameIntroVideoRotationIndex';

type IntroPhase = 'curtain' | 'opening-still' | 'video' | 'closing-still';

type OpeningIntroProps = {
  onComplete: () => void;
};

const pickNextIntroVideo = () => {
  const fallback = INTRO_VIDEO_SOURCES[0];

  try {
    if (typeof window === 'undefined') return fallback;

    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      return fallback;
    }

    const rawStoredIndex = storage.getItem(INTRO_VIDEO_INDEX_STORAGE_KEY);
    const parsedStoredIndex = Number.parseInt(rawStoredIndex || '0', 10);
    const normalizedIndex = Number.isFinite(parsedStoredIndex)
      ? Math.max(0, parsedStoredIndex % INTRO_VIDEO_SOURCES.length)
      : 0;

    storage.setItem(
      INTRO_VIDEO_INDEX_STORAGE_KEY,
      String((normalizedIndex + 1) % INTRO_VIDEO_SOURCES.length),
    );

    return INTRO_VIDEO_SOURCES[normalizedIndex] || fallback;
  } catch {
    return fallback;
  }
};

export default function OpeningIntro({ onComplete }: OpeningIntroProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const phaseTimeoutRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<IntroPhase>('curtain');
  const [curtainLifted, setCurtainLifted] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoSrc] = useState(pickNextIntroVideo);

  useEffect(() => {
    if (phase !== 'opening-still') return undefined;

    phaseTimeoutRef.current = window.setTimeout(() => {
      setPhase('video');
    }, INTRO_OPENING_STILL_HOLD_MS);

    return () => {
      if (phaseTimeoutRef.current) {
        window.clearTimeout(phaseTimeoutRef.current);
        phaseTimeoutRef.current = null;
      }
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'video') return;

    const video = videoRef.current;
    if (!video || typeof video.play !== 'function') return;

    try {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(() => setPhase('closing-still'));
      }
    } catch {
      setPhase('closing-still');
    }
  }, [phase]);

  useEffect(() => () => {
    if (phaseTimeoutRef.current) {
      window.clearTimeout(phaseTimeoutRef.current);
      phaseTimeoutRef.current = null;
    }

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  const completeIntro = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    onComplete();
  };

  const startIntro = () => {
    if (curtainLifted) return;

    setCurtainLifted(true);
    setVideoReady(true);

    const audio = audioRef.current;
    if (audio && typeof audio.play === 'function') {
      try {
        audio.currentTime = 0;
        const playResult = audio.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(() => {});
        }
      } catch {
        // Background audio is optional; keep the intro moving if playback is blocked.
      }
    }

    phaseTimeoutRef.current = window.setTimeout(() => {
      setPhase('opening-still');
    }, INTRO_CURTAIN_LIFT_MS);
  };

  const handleOverlayClick = () => {
    if (phase === 'closing-still') {
      completeIntro();
    }
  };

  const handleOverlayKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (phase !== 'closing-still') return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    completeIntro();
  };

  const stillSrc = phase === 'closing-still' ? INTRO_CLOSING_STILL_SRC : INTRO_OPENING_STILL_SRC;

  return (
    <section
      className={`openingIntro openingIntro--${phase}`}
      aria-label="Opening introduction"
      role={phase === 'closing-still' ? 'button' : undefined}
      tabIndex={phase === 'closing-still' ? 0 : -1}
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
    >
      <img className="openingIntro__still" src={stillSrc} alt="" aria-hidden="true" />
      <audio ref={audioRef} src={INTRO_AUDIO_SRC} preload="auto" aria-hidden="true" />

      {videoReady ? (
        <video
          ref={videoRef}
          className={`openingIntro__video ${phase === 'video' ? 'openingIntro__video--visible' : ''}`}
          src={videoSrc}
          playsInline
          preload="auto"
          muted
          onEnded={() => setPhase('closing-still')}
          onError={() => setPhase('closing-still')}
        />
      ) : null}

      {phase === 'curtain' ? (
        <button
          type="button"
          className={`openingIntro__curtainStage ${curtainLifted ? 'openingIntro__curtainStage--lifting' : ''}`}
          style={{ '--opening-intro-curtain-lift-duration': `${INTRO_CURTAIN_LIFT_MS}ms` } as CSSProperties}
          onClick={startIntro}
          aria-label="Raise the curtain"
        >
          <span className="openingIntro__projectorBeam" aria-hidden="true" />
          <img
            src={INTRO_CURTAIN_SRC}
            alt=""
            className={`openingIntro__curtain ${curtainLifted ? 'openingIntro__curtain--lifted' : ''}`}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </section>
  );
}
