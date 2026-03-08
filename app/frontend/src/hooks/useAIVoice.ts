"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BACKEND_URL, AI_PLAYERS } from "@/lib/constants";
import type { LogEntry } from "@/components/TournamentLog";

const TTS_URL = `${BACKEND_URL}/api/tts`;

function buildSpokenText(log: LogEntry): string | null {
  if (!log.reasoning || log.reasoning.length <= 2) return null;
  if (log.reasoning.startsWith("fallback")) return null;

  const action = log.action?.toLowerCase() ?? "";
  if (action === "win" || action === "eliminated") return null;

  const name = AI_PLAYERS[log.playerIdx]?.shortName ?? "Player";
  let prefix: string;
  switch (action) {
    case "fold":
      prefix = `${name} folds.`;
      break;
    case "check":
      prefix = `${name} checks.`;
      break;
    case "call":
      prefix = log.amount ? `${name} calls ${log.amount}.` : `${name} calls.`;
      break;
    case "raise":
      prefix = log.amount ? `${name} raises to ${log.amount}.` : `${name} raises.`;
      break;
    case "all_in":
      prefix = `${name} goes all in!`;
      break;
    default:
      prefix = `${name} acts.`;
  }

  const reasoning = log.reasoning.length > 300
    ? log.reasoning.slice(0, 297) + "..."
    : log.reasoning;

  return `${prefix} ${reasoning}`;
}

function unlockAudio() {
  const silent = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=");
  silent.volume = 0;
  silent.play().catch(() => {});
}

export function useAIVoice(logs: LogEntry[]) {
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("ai-voice-muted");
    return saved === "true";
  });

  const queueRef = useRef<{ text: string; voiceIdx: number }[]>([]);
  const playingRef = useRef(false);
  const lastLogTimestamp = useRef(0);
  const mutedRef = useRef(muted);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlocked = useRef(false);

  useEffect(() => {
    const handler = () => {
      if (!audioUnlocked.current) {
        unlockAudio();
        audioUnlocked.current = true;
      }
    };
    document.addEventListener("click", handler, { once: true });
    return () => document.removeEventListener("click", handler);
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
    localStorage.setItem("ai-voice-muted", String(muted));

    if (muted) {
      queueRef.current = [];
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = "";
        currentAudioRef.current = null;
      }
      playingRef.current = false;
    }
  }, [muted]);

  const playNext = useCallback(async () => {
    if (playingRef.current || mutedRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    playingRef.current = true;
    try {
      const res = await fetch(TTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next.text, voiceIdx: next.voiceIdx }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = 1.25;
      currentAudioRef.current = audio;

      await new Promise<void>((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onpause = () => { URL.revokeObjectURL(url); resolve(); };
        audio.play().catch(() => resolve());
      });
    } catch {
      // TTS unavailable — silently continue
    } finally {
      currentAudioRef.current = null;
      playingRef.current = false;
      if (!mutedRef.current) playNext();
    }
  }, []);

  useEffect(() => {
    if (logs.length === 0) return;

    const latest = logs[logs.length - 1];
    if (latest.timestamp <= lastLogTimestamp.current) return;
    lastLogTimestamp.current = latest.timestamp;

    const text = buildSpokenText(latest);
    if (!text) return;

    if (queueRef.current.length > 3) {
      queueRef.current = queueRef.current.slice(-1);
    }

    queueRef.current.push({ text, voiceIdx: latest.playerIdx });
    if (!mutedRef.current) playNext();
  }, [logs, playNext]);

  const toggleMute = useCallback(() => {
    if (!audioUnlocked.current) {
      unlockAudio();
      audioUnlocked.current = true;
    }
    setMuted((m) => !m);
  }, []);

  return { muted, toggleMute };
}
