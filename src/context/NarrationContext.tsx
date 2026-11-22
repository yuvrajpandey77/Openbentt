import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@/context/ChatContext";
import { buildNarrationScript, type NarrationChunk } from "@/lib/narration/script";

const AUTO_KEY = "openbentt-narration-auto";
const MODE_KEY = "openbentt-narration-mode";
const POS_KEY = "openbentt-narration-pos";

export type NarrationStatus = "idle" | "preparing" | "speaking" | "paused";
export type NarrationMode = "pill" | "icon";

type Pos = { x: number; y: number };

type NarrationApi = {
  status: NarrationStatus;
  mode: NarrationMode;
  auto: boolean;
  pos: Pos | null;
  note: string;
  voiceLabel: string;
  messageId: string | null;
  chunkIndex: number;
  wordIndex: number;
  chunks: NarrationChunk[];
  currentLine: string;
  speakMessage: (messageId: string, markdown: string) => void;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  stop: () => void;
  setAuto: (on: boolean) => void;
  setMode: (mode: NarrationMode) => void;
  setPos: (pos: Pos | null) => void;
};

const NarrationContext = createContext<NarrationApi | null>(null);

type Engine = {
  speak: (text: string, onFraction: (n: number) => void, signal: { cancelled: boolean }) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

function systemEngine(): Engine {
  let current: SpeechSynthesisUtterance | null = null;
  let paused = false;
  const pick = () => {
    const voices = window.speechSynthesis?.getVoices?.() ?? [];
    const score = (name: string, lang: string) => {
      const n = `${name} ${lang}`.toLowerCase();
      let s = /en/.test(n) ? 2 : 0;
      if (/female|woman|aria|jenny|sara|samantha|victoria|zira|libby|sonia|natasha|lessac/.test(n)) s += 6;
      if (/\bmale\b|david|mark|daniel|alex/.test(n)) s -= 5;
      return s;
    };
    return [...voices].sort((a, b) => score(b.name, b.lang) - score(a.name, a.lang))[0] ?? null;
  };
  return {
    speak(text, onFraction, signal) {
      return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
          reject(new Error("This system has no speech voice."));
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = pick();
        if (voice) utterance.voice = voice;
        utterance.rate = 0.96;
        utterance.pitch = 1.04;
        const words = text.split(/\s+/).filter(Boolean).length || 1;
        utterance.onboundary = (event) => {
          if (event.name !== "word") return;
          const said = text.slice(0, event.charIndex).trim().split(/\s+/).filter(Boolean).length;
          onFraction(Math.min(0.98, said / words));
        };
        utterance.onend = () => {
          current = null;
          if (signal.cancelled || paused) resolve();
          else {
            onFraction(1);
            resolve();
          }
        };
        utterance.onerror = () => {
          current = null;
          if (signal.cancelled || paused) resolve();
          else reject(new Error("Speech stopped."));
        };
        current = utterance;
        paused = false;
        window.speechSynthesis.speak(utterance);
      });
    },
    pause() {
      paused = true;
      window.speechSynthesis?.cancel();
    },
    resume() {
      paused = false;
    },
    stop() {
      paused = true;
      window.speechSynthesis?.cancel();
      current = null;
    },
  };
}

function piperEngine(): Engine | null {
  const api = window.openbenttNarration;
  if (!api?.synthesize) return null;
  let audio: HTMLAudioElement | null = null;
  let release: (() => void) | null = null;
  return {
    speak(text, onFraction, signal) {
      return (async () => {
        release?.();
        release = null;
        const result = await api.synthesize(text);
        if (signal.cancelled) return;
        const bytes = Uint8Array.from(atob(result.wavBase64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
        const el = new Audio(url);
        audio = el;
        try {
          await new Promise<void>((resolve, reject) => {
            release = () => {
              el.pause();
              resolve();
            };
            const onTime = () => {
              if (el.duration && Number.isFinite(el.duration)) onFraction(Math.min(1, el.currentTime / el.duration));
            };
            el.addEventListener("timeupdate", onTime);
            el.addEventListener("ended", () => {
              onFraction(1);
              resolve();
            });
            el.addEventListener("error", () => reject(new Error("Could not play the voice.")));
            void el.play().catch(reject);
          });
        } finally {
          release = null;
          URL.revokeObjectURL(url);
        }
      })();
    },
    pause() {
      audio?.pause();
    },
    resume() {
      void audio?.play().catch(() => {});
    },
    stop() {
      release?.();
      audio?.pause();
      audio = null;
    },
  };
}

function readAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
  }
}

function readMode(): NarrationMode {
  try {
    return localStorage.getItem(MODE_KEY) === "pill" ? "pill" : "icon";
  } catch {
    return "pill";
  }
}

function readPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pos;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function NarrationProvider({ children }: { children: React.ReactNode }) {
  const { chats, currentChatId } = useChat();
  const [status, setStatus] = useState<NarrationStatus>("idle");
  const [mode, setModeState] = useState<NarrationMode>(readMode);
  const [auto, setAutoState] = useState(readAuto);
  const [pos, setPosState] = useState<Pos | null>(readPos);
  const [note, setNote] = useState("");
  const [voiceLabel, setVoiceLabel] = useState("Lessac");
  const [messageId, setMessageId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<NarrationChunk[]>([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const [currentLine, setCurrentLine] = useState("");
  const run = useRef(0);
  const paused = useRef(false);
  const engine = useRef<Engine | null>(null);
  const resumeFrom = useRef(0);
  const active = useRef<{ messageId: string; chunks: NarrationChunk[] } | null>(null);
  const seenStreaming = useRef(new Set<string>());

  const ensureEngine = useCallback(async () => {
    if (engine.current) return engine.current;
    const piper = piperEngine();
    if (piper) {
      setVoiceLabel("Lessac");
      engine.current = piper;
      return piper;
    }
    setVoiceLabel("System voice");
    engine.current = systemEngine();
    return engine.current;
  }, []);

  const stop = useCallback(() => {
    run.current += 1;
    paused.current = false;
    engine.current?.stop();
    setStatus("idle");
    setNote("");
    setWordIndex(0);
  }, []);

  const playFrom = useCallback(
    async (message: string, script: NarrationChunk[], start: number) => {
      const token = ++run.current;
      paused.current = false;
      active.current = { messageId: message, chunks: script };
      setMessageId(message);
      setChunks(script);
      const spoken = script.map((c, i) => ({ c, i })).filter((row) => row.c.speak);
      if (!spoken.length) {
        setStatus("idle");
        setNote("Nothing to read aloud.");
        return;
      }
      const player = await ensureEngine();
      if (token !== run.current) return;
      let cursor = spoken.findIndex((row) => row.i >= start);
      if (cursor < 0) cursor = 0;
      setStatus("preparing");
      while (cursor < spoken.length) {
        if (token !== run.current) return;
        if (paused.current) {
          resumeFrom.current = spoken[cursor]!.i;
          setStatus("paused");
          return;
        }
        const row = spoken[cursor]!;
        const line = row.c.speak!;
        const words = line.split(/\s+/).filter(Boolean);
        setChunkIndex(row.i);
        setCurrentLine(line);
        setWordIndex(0);
        setStatus("speaking");
        setNote("");
        const signal = { cancelled: false };
        try {
          await player.speak(
            line,
            (fraction) => {
              if (token !== run.current) return;
              setWordIndex(Math.min(words.length, Math.floor(fraction * words.length)));
            },
            signal,
          );
        } catch (err) {
          if (token !== run.current || paused.current) return;
          setStatus("idle");
          setNote(err instanceof Error ? err.message : "Voice failed.");
          return;
        }
        if (token !== run.current) return;
        if (paused.current) {
          resumeFrom.current = row.i;
          setStatus("paused");
          return;
        }
        cursor += 1;
      }
      if (token !== run.current) return;
      setStatus("idle");
      setWordIndex(999);
      setNote("");
    },
    [ensureEngine],
  );

  const speakMessage = useCallback(
    (id: string, markdown: string) => {
      if (/opencode run|USAGE/i.test(markdown) && markdown.length > 400) return;
      const script = buildNarrationScript(markdown);
      resumeFrom.current = 0;
      engine.current?.stop();
      void playFrom(id, script, 0);
    },
    [playFrom],
  );

  const pause = useCallback(() => {
    paused.current = true;
    engine.current?.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    paused.current = false;
    if (window.openbenttNarration && status === "paused") {
      engine.current?.resume();
      setStatus("speaking");
      return;
    }
    if (!active.current) return;
    void playFrom(active.current.messageId, active.current.chunks, resumeFrom.current);
  }, [playFrom, status]);

  const replay = useCallback(() => {
    if (!active.current) return;
    engine.current?.stop();
    paused.current = false;
    void playFrom(active.current.messageId, active.current.chunks, 0);
  }, [playFrom]);

  const setAuto = useCallback((on: boolean) => {
    setAutoState(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? "1" : "0");
    } catch { /* ignore */ }
    if (!on) {
      run.current += 1;
      paused.current = false;
      engine.current?.stop();
      setStatus("idle");
    }
  }, []);

  const setMode = useCallback((next: NarrationMode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch { /* ignore */ }
  }, []);

  const setPos = useCallback((next: Pos | null) => {
    setPosState(next);
    try {
      if (next) localStorage.setItem(POS_KEY, JSON.stringify(next));
      else localStorage.removeItem(POS_KEY);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const api = window.openbenttNarration;
    if (!api?.onProgress) return;
    return api.onProgress((payload) => {
      if (!payload?.label) return;
      setNote(payload.label);
      setStatus((prev) => (prev === "idle" ? "preparing" : prev));
    });
  }, []);

  useEffect(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    const last = [...(chat?.messages ?? [])].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    if (last.streaming) {
      seenStreaming.current.add(last.id);
      return;
    }
    if (!auto || !seenStreaming.current.has(last.id)) return;
    seenStreaming.current.delete(last.id);
    if (!last.content.trim()) return;
    speakMessage(last.id, last.content);
  }, [chats, currentChatId, auto, speakMessage]);

  const value = useMemo<NarrationApi>(
    () => ({
      status,
      mode,
      auto,
      pos,
      note,
      voiceLabel,
      messageId,
      chunkIndex,
      wordIndex,
      chunks,
      currentLine,
      speakMessage,
      pause,
      resume,
      replay,
      stop,
      setAuto,
      setMode,
      setPos,
    }),
    [
      status,
      mode,
      auto,
      pos,
      note,
      voiceLabel,
      messageId,
      chunkIndex,
      wordIndex,
      chunks,
      currentLine,
      speakMessage,
      pause,
      resume,
      replay,
      stop,
      setAuto,
      setMode,
      setPos,
    ],
  );

  return <NarrationContext.Provider value={value}>{children}</NarrationContext.Provider>;
}

export function useNarration() {
  return useContext(NarrationContext);
}
