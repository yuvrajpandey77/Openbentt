/**
 * Test-only fake STT/TTS engines — not for production or packaged builds.
 */
import { createRequire } from "node:module";
import { setVoiceEnginesInternal } from "./voiceService.mjs";

const require = createRequire(import.meta.url);

function isPackagedElectron() {
  if (!process.versions.electron) return false;
  try {
    const { app } = require("electron");
    return app?.isPackaged === true;
  } catch {
    return false;
  }
}

function nowIso() {
  return new Date().toISOString();
}

export class FakeSttEngine {
  constructor() {
    this._testFake = true;
    this.nextTranscript = "hello world";
    this.nextError = null;
    this.calls = [];
    this.loaded = false;
  }
  async load() {
    this.loaded = true;
    return { ok: true, fake: true };
  }
  async unload() {
    this.loaded = false;
    return { ok: true };
  }
  async transcribe(_pcm, _sampleRate) {
    this.calls.push({ at: nowIso() });
    if (this.nextError) throw new Error(this.nextError);
    return this.nextTranscript;
  }
}

export class FakeTtsEngine {
  constructor() {
    this._testFake = true;
    this.spoken = [];
    this.failNext = null;
    this.speaking = false;
  }
  async speak(text) {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw new Error(err);
    }
    this.speaking = true;
    this.spoken.push({ text, at: nowIso() });
    return { ok: true, fake: true };
  }
  async stop() {
    this.speaking = false;
    return { ok: true };
  }
}

export function setVoiceEngines({ stt, tts } = {}) {
  if (isPackagedElectron()) {
    throw new Error("setVoiceEngines is not available in packaged builds");
  }
  setVoiceEnginesInternal({ stt, tts });
}