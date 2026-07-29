"use client";

/**
 * Speech in and out, on the device.
 *
 * The browser's own recognition and synthesis are the default because nothing
 * is sent to a MedBuddy speech service: no app key and no app account. Browser
 * implementations may still use their own provider or require a network. A
 * cloned caregiver voice is opt-in precisely because it sends text elsewhere.
 *
 * Both degrade to nothing rather than to a broken control: a browser without
 * these APIs simply does not show the button.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function recognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function subscribeToStaticCapability(): () => void {
  return () => undefined;
}

function recognitionIsSupported(): boolean {
  return recognitionConstructor() !== null;
}

function speechSynthesisIsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Hold to speak.
 *
 * Holding rather than toggling on purpose: it is the gesture already used to
 * send a LINE voice message, so the older adult this was designed around
 * already performs it without help.
 */
export function DictateButton({
  onText,
  label = "按住說話",
}: {
  onText: (text: string) => void;
  label?: string;
}) {
  const supported = useSyncExternalStore(
    subscribeToStaticCapability,
    recognitionIsSupported,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  const start = useCallback(() => {
    const Ctor = recognitionConstructor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "zh-TW";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (event) => {
      const said = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript)
        .join("")
        .trim();
      if (said) onText(said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }, [onText]);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);

  // No support, no button. A control that does nothing is worse than none.
  if (!supported) return null;

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      aria-pressed={listening}
      className={`rounded-lg border px-4 py-2 transition ${
        listening
          ? "border-red-600 bg-red-600 text-white"
          : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      {listening ? "聽取中…放開結束" : `🎙 ${label}`}
    </button>
  );
}

/**
 * Read something aloud.
 *
 * Slower than default and in Traditional Chinese. The rate is not decoration:
 * this is being read to someone with presbyopia who may also be listening
 * rather than reading, and the default rate is tuned for people who are not.
 */
export function SpeakButton({ text, label = "唸給我聽" }: { text: string; label?: string }) {
  const supported = useSyncExternalStore(
    subscribeToStaticCapability,
    speechSynthesisIsSupported,
    () => false,
  );
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!supported) return null;

  function speak() {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-TW";
    utterance.rate = 0.85;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  return (
    <button
      type="button"
      onClick={speaking ? stop : speak}
      className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700"
    >
      {speaking ? "⏹ 停止" : `🔊 ${label}`}
    </button>
  );
}
