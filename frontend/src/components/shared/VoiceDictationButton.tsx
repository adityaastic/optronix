'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function VoiceDictationButton({
  onTranscript,
  className,
}: {
  onTranscript: (text: string) => void;
  className?: string;
}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (Ctor) {
      setSupported(true);
    }
    return () => {
      recRef.current?.stop();
    };
  }, []);

  if (!supported) return null;

  const toggleDictation = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (ev) => {
      const parts: string[] = [];
      for (let i = 0; i < ev.results.length; i++) {
        const res = ev.results[i]?.[0];
        if (res?.transcript) parts.push(res.transcript.trim());
      }
      const combined = parts.join(' ').trim();
      if (combined) {
        callbackRef.current(combined);
      }
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  return (
    <button
      type="button"
      onClick={toggleDictation}
      title={
        listening
          ? 'Stop voice dictation'
          : 'Dictate notes by voice (Hindi / English)'
      }
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-caption font-medium transition-colors cursor-pointer border',
        listening
          ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
          : 'bg-surface-container-low text-on-surface-variant border-hairline hover:text-secondary',
        className,
      )}
    >
      {listening ? (
        <>
          <MicOff className="w-3 h-3" />
          <span>Listening...</span>
        </>
      ) : (
        <>
          <Mic className="w-3 h-3 text-secondary" />
          <span>Voice input</span>
        </>
      )}
    </button>
  );
}
