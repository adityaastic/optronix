'use client';

import React, { useEffect, useRef, useState } from 'react';

interface BrandSplashIntroProps {
  onTransitionStart?: () => void;
}

export function BrandSplashIntro({ onTransitionStart }: BrandSplashIntroProps) {
  const [phase, setPhase] = useState<'active' | 'exiting' | 'hidden'>('active');
  const notifiedRef = useRef(false);

  const notifyOnce = () => {
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      onTransitionStart?.();
    }
  };

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setPhase('hidden');
      notifyOnce();
      return;
    }

    const exitTimer = window.setTimeout(() => {
      setPhase('exiting');
      notifyOnce();
    }, 1050);

    const hideTimer = window.setTimeout(() => {
      setPhase('hidden');
    }, 1480);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'hidden') {
    return null;
  }

  const handleSkip = () => {
    if (phase === 'exiting') return;
    setPhase('exiting');
    notifyOnce();
    window.setTimeout(() => {
      setPhase('hidden');
    }, 260);
  };

  return (
    <div
      role="presentation"
      aria-hidden="true"
      onClick={handleSkip}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface-container-lowest select-none transition-all duration-400 ease-out ${
        phase === 'exiting'
          ? 'opacity-0 scale-[1.02] pointer-events-none'
          : 'opacity-100 scale-100'
      }`}
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 45%, rgba(37, 99, 235, 0.055), transparent 58%)',
      }}
    >
      <div className="flex flex-col items-center gap-5 px-6">
        <img
          src="/optronix-logo.png"
          alt="Optronix"
          className="h-9 sm:h-11 w-auto object-contain optronix-splash-logo"
        />

        <div className="w-32 h-[2px] rounded-full bg-surface-container overflow-hidden">
          <div className="h-full w-full rounded-full bg-secondary optronix-splash-bar" />
        </div>

        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-on-surface-variant optronix-splash-caption">
          Sales &amp; Field Visit Operations
        </span>
      </div>
    </div>
  );
}

interface TypewriterTextProps {
  text: string;
  active?: boolean;
  startDelayMs?: number;
  speedMs?: number;
  className?: string;
}

export function TypewriterText({
  text,
  active = true,
  startDelayMs = 0,
  speedMs = 22,
  className = '',
}: TypewriterTextProps) {
  const [displayedCount, setDisplayedCount] = useState(0);
  const [showCaret, setShowCaret] = useState(false);

  useEffect(() => {
    if (!active) {
      setDisplayedCount(0);
      setShowCaret(false);
      return;
    }

    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplayedCount(text.length);
      setShowCaret(false);
      return;
    }

    setDisplayedCount(0);
    setShowCaret(true);

    let intervalId: number | undefined;
    let settleTimerId: number | undefined;

    const startTimer = window.setTimeout(() => {
      let current = 0;
      intervalId = window.setInterval(() => {
        current += 1;
        setDisplayedCount(current);
        if (current >= text.length) {
          if (intervalId !== undefined) window.clearInterval(intervalId);
          settleTimerId = window.setTimeout(() => {
            setShowCaret(false);
          }, 1200);
        }
      }, speedMs);
    }, startDelayMs);

    return () => {
      window.clearTimeout(startTimer);
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (settleTimerId !== undefined) window.clearTimeout(settleTimerId);
    };
  }, [text, active, startDelayMs, speedMs]);

  const visibleSlice = text.slice(0, displayedCount);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">
        {visibleSlice}
        {showCaret ? (
          <span className="inline-block w-[1.5px] h-[0.95em] bg-secondary align-middle ml-0.5 optronix-typewriter-caret" />
        ) : null}
      </span>
    </span>
  );
}
