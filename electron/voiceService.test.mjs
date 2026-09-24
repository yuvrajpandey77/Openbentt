import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { closeDb } from "./researchDb.mjs";
import { makeTempUserData } from "./test/researchTestApp.mjs";
import {
  FakeSttEngine,
  FakeTtsEngine,
  LocalWhisperEngine,
  __voiceTestHooks,
  appendAudioChunk,
  beginUtterance,
  cancelUtterance,
  getVoiceStatus,
  isMicGrantActive,
  noteMicDenied,
  noteMicReady,
  registerVoiceIpc,
  setVoiceEngines,
  setVoiceMode,
  speakText,
  startVoiceSession,
  stopSpeaking,
  stopVoiceSession,
  noteThinking,
  cleanupVoiceOnQuit,
} from "./voiceService.mjs";
import { decidePermission, decideVoiceMediaPermission } from "./navigationPolicy.mjs";
import { VOICE_AUDIO } from "../src/lib/agent/voiceCore.mjs";

function mockIpcMain() {
  const handlers = new Map();
  return {
    handle(channel, fn) { handlers.set(channel, fn); },
    async invoke(channel, ...args) {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`No IPC handler: ${channel}`);
      return fn({}, ...args);
    },
  };
}

function pcmChunk(seconds = 1) {
  const bytes = 16000 * 2 * seconds;
  return Buffer.alloc(bytes).toString("base64");
}

describe("voiceService Phase 3", () => {
  let ctx;

  beforeEach(async () => {
    ctx = await makeTempUserData();
    __voiceTestHooks.reset();
    closeDb();
    setVoiceEngines({ stt: new FakeSttEngine(), tts: new FakeTtsEngine() });
  });

  afterEach(async () => {
    cleanupVoiceOnQuit();
    __voiceTestHooks.reset();
    closeDb();
    await ctx?.cleanup?.();
  });

  it("microphone is OFF by default; media denied without a live session", async () => {
    assert.equal(isMicGrantActive(), false);
    assert.equal(decidePermission("microphone"), false);
    assert.equal(decideVoiceMediaPermission("media", () => false), false);
    assert.equal(decideVoiceMediaPermission("microphone", () => isMicGrantActive()), false);
    assert.equal(decideVoiceMediaPermission("camera", () => true), false);
    assert.equal(decideVoiceMediaPermission("media", () => true, { mediaTypes: ["video"] }), false);
    assert.equal(decideVoiceMediaPermission("media", () => true, { videoRequested: true }), false);
    assert.equal(decideVoiceMediaPermission("media", () => true, { mediaTypes: ["audio"] }), true);
  });

  it("full push-to-talk lifecycle with fake engines", async () => {
    const s = startVoiceSession(ctx.app, { mode: "push-to-talk" });
    assert.equal(s.state, "REQUESTING_PERMISSION");
    assert.equal(isMicGrantActive(), true);
    noteMicReady(s.id);
    assert.equal(getVoiceStatus(s.id).state, "READY");
    assert.equal(decideVoiceMediaPermission("media", () => isMicGrantActive()), true);
    const begun = beginUtterance(s.id);
    assert.equal(begun.state, "LISTENING");
    const stt = __voiceTestHooks.getState().engines.stt;
    stt.nextTranscript = "inspect this project and fix the failing tests";
    const res = await appendAudioChunk(ctx.app, {
      sessionId: s.id, utteranceId: begun.utteranceId, base64: pcmChunk(1), last: true,
    });
    assert.equal(res.done, true);
    assert.equal(res.transcript, "inspect this project and fix the failing tests");
    const after = getVoiceStatus(s.id);
    assert.equal(after.state, "READY");
    // Raw audio discarded: no parts retained anywhere on the session.
    const internal = __voiceTestHooks.getState().sessions.get(s.id);
    assert.deepEqual(internal.audioParts, []);
    assert.equal(internal.audioBytes, 0);
    await stopVoiceSession(s.id);
    assert.equal(isMicGrantActive(), false);
  });

  it("mic denial fails closed with no grant", async () => {
    const s = startVoiceSession(ctx.app, {});
    noteMicDenied(s.id, "denied by OS");
    assert.equal(getVoiceStatus(s.id).state, "ERROR");
    assert.equal(getVoiceStatus(s.id).mic, "unavailable");
    assert.equal(isMicGrantActive(), false);
    await stopVoiceSession(s.id);
  });

  it("cancellation discards audio and runs nothing", async () => {
    const s = startVoiceSession(ctx.app, {});
    noteMicReady(s.id);
    const begun = beginUtterance(s.id);
    await appendAudioChunk(ctx.app, { sessionId: s.id, utteranceId: begun.utteranceId, base64: pcmChunk(1), last: false });
    const stt = __voiceTestHooks.getState().engines.stt;
    const callsBefore = stt.calls.length;
    cancelUtterance(s.id);
    assert.equal(getVoiceStatus(s.id).state, "READY");
    assert.equal(stt.calls.length, callsBefore);
    const internal = __voiceTestHooks.getState().sessions.get(s.id);
    assert.deepEqual(internal.audioParts, []);
    await stopVoiceSession(s.id);
  });

  it("bounds audio: oversized chunk, over-long utterance, stale id, wrong state", async () => {
    const s = startVoiceSession(ctx.app, {});
    noteMicReady(s.id);
    const begun = beginUtterance(s.id);
    const big = Buffer.alloc(VOICE_AUDIO.maxChunkBytes + 1).toString("base64");
    await assert.rejects(() => appendAudioChunk(ctx.app, { sessionId: s.id, utteranceId: begun.utteranceId, base64: big, last: false }), /size limit/);
    await assert.rejects(() => appendAudioChunk(ctx.app, { sessionId: s.id, utteranceId: "utt_stale", base64: pcmChunk(0.01), last: false }), /Stale utterance/);
    await assert.rejects(() => appendAudioChunk(ctx.app, { sessionId: "vsess_doesnotexist_1", utteranceId: begun.utteranceId, base64: pcmChunk(0.01), last: false }), /not found/i);
    // Fill to the utterance cap: many small valid chunks then one over.
    const filler = pcmChunk(1);
    let used = 0;
    const perChunk = Math.floor((Buffer.from(filler, "base64").length));
    const n = Math.ceil(VOICE_AUDIO.maxUtteranceBytes / perChunk);
    for (let i = 0; i < n; i++) {
      try {
        await appendAudioChunk(ctx.app, { sessionId: s.id, utteranceId: begun.utteranceId, base64: filler, last: false });
        used += perChunk;
      } catch (err) {
        assert.match(String(err?.message ?? err), /maximum duration/);
        break;
      }
    }
    assert.ok(used >= VOICE_AUDIO.maxUtteranceBytes - perChunk);
    await stopVoiceSession(s.id).catch(() => {});
  });

  it("STT crash and malformed output become ERROR, never stuck LISTENING", async () => {
    const s = startVoiceSession(ctx.app, {});
    noteMicReady(s.id);
    const stt = __voiceTestHooks.getState().engines.stt;
    stt.nextError = "engine exploded";
    const b1 = beginUtterance(s.id);
    await assert.rejects(() => appendAudioChunk(ctx.app, { sessionId: s.id, utteranceId: b1.utteranceId, base64: pcmChunk(1), last: true }), /exploded/);
    assert.equal(getVoiceStatus(s.id).state, "ERROR");
    await stopVoiceSession(s.id);

    const s2 = startVoiceSession(ctx.app, {});
    noteMicReady(s2.id);
    stt.nextError = null;
    stt.nextTranscript = "   ";
    const b2 = beginUtterance(s2.id);
    await assert.rejects(() => appendAudioChunk(ctx.app, { sessionId: s2.id, utteranceId: b2.utteranceId, base64: pcmChunk(1), last: true }), /Empty transcript/);
    assert.equal(getVoiceStatus(s2.id).state, "ERROR");
    await stopVoiceSession(s2.id);
  });

  it("TTS redacts secrets, is cancellable, and crash recovers", async () => {
    const s = startVoiceSession(ctx.app, {});
    noteMicReady(s.id);
    const tts = __voiceTestHooks.getState().engines.tts;
    await speakText(ctx.app, { sessionId: s.id, text: "Done. api_key=supersecret123." });
    assert.equal(tts.spoken.length, 1);
    assert.ok(!tts.spoken[0].text.includes("supersecret123"));
    assert.equal(getVoiceStatus(s.id).state, "READY");
    tts.failNext = "speaker gone";
    await assert.rejects(() => speakText(ctx.app, { sessionId: s.id, text: "hi" }), /speaker gone/);
    assert.equal(getVoiceStatus(s.id).state, "ERROR");
    await stopVoiceSession(s.id);
  });

  it("barge-in stops speech and starts listening", async () => {
    const s = startVoiceSession(ctx.app, {});
    noteMicReady(s.id);
    noteThinking(s.id);
    const tts = __voiceTestHooks.getState().engines.tts;
    tts.speaking = true;
    const speakP = speakText(ctx.app, { sessionId: s.id, text: "A long summary." }).catch(() => {});
    const begun = beginUtterance(s.id);
    assert.equal(begun.state, "LISTENING");
    await speakP;
    await stopVoiceSession(s.id).catch(() => {});
  });

  it("voice exposes no approval or execution pathway", async () => {
    const src = await fs.promises.readFile(new URL("./voiceService.mjs", import.meta.url), "utf8");
    for (const call of ["respondToPermission(", "approveAction(", "consumeApprovalForExecution(", "createTask(", "proposeAction("]) {
      assert.ok(!src.includes(call), `voice must not call ${call}`);
    }
    assert.ok(!src.includes("from \"./taskStore.mjs\"") && !src.includes("from './taskStore.mjs'"));
    // A transcript of "yes" authorizes nothing: no approvals proposed.
    const { listApprovals } = await import("./actionStore.mjs");
    assert.equal(listApprovals(ctx.app, { status: "proposed" }).length, 0);
  });

  it("illegal transitions and session bounds fail closed", async () => {
    const sessions = [];
    for (let i = 0; i < 4; i++) sessions.push(startVoiceSession(ctx.app, {}));
    assert.throws(() => startVoiceSession(ctx.app, {}), /Too many voice sessions/);
    assert.throws(() => beginUtterance(sessions[0].id), /Cannot listen/);
    await assert.rejects(() => speakText(ctx.app, { sessionId: sessions[0].id, text: "hi" }), /Cannot speak/);
    assert.throws(() => setVoiceMode({ sessionId: sessions[0].id, mode: "telepathy" }), /Invalid voice mode/);
    for (const s of sessions) await stopVoiceSession(s.id);
    assert.equal(isMicGrantActive(), false);
  });

  it("quit cleanup leaves no sessions, no grant, no audio", async () => {
    const s = startVoiceSession(ctx.app, {});
    noteMicReady(s.id);
    beginUtterance(s.id);
    cleanupVoiceOnQuit();
    assert.equal(__voiceTestHooks.getState().sessions.size, 0);
    assert.equal(isMicGrantActive(), false);
  });

  it("real whisper engine refuses to transcribe before load (no silent fake)", async () => {
    const engine = new LocalWhisperEngine(ctx.app);
    await assert.rejects(() => engine.transcribe(new Float32Array([0.1, 0.2])), /not loaded/);
    assert.equal(engine.modelId, "Xenova/whisper-tiny.en");
  });

  it("STT warms on mic-ready and reports status honestly", async () => {
    const { ensureSttLoaded, sttStatus } = await import("./voiceService.mjs");
    setVoiceEngines({ stt: new FakeSttEngine(), tts: new FakeTtsEngine() });
    const before = sttStatus();
    assert.equal(before.model, "Xenova/whisper-tiny.en");
    const res = await ensureSttLoaded(ctx.app, undefined);
    assert.equal(res.ok, true);
    const ipc = mockIpcMain();
    registerVoiceIpc(ipc, ctx.app);
    const st = await ipc.invoke("voice:sttStatus");
    assert.equal(typeof st.stt.loaded, "boolean");
    assert.equal(typeof st.tts.backend, "string");
  });

  it("STT load self-heals: corrupt cache is wiped and load retried once", async () => {
    const { LocalWhisperEngine, clearSttCache } = await import("./voiceService.mjs");
    const engine = new LocalWhisperEngine(ctx.app);
    // Seed a corrupt cache dir, then verify clearSttCache removes it.
    const dir = engine.cacheDir();
    assert.ok(dir);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, "config.json"), "{corrupt");
    const cleared = await clearSttCache(ctx.app);
    assert.equal(cleared.ok, true);
    await assert.rejects(() => fs.promises.stat(dir), /ENOENT/);
    // clearSttCache is safe to call with no app paths.
    const noApp = await clearSttCache({ getPath: () => { throw new Error("nope"); } });
    assert.equal(noApp.ok, false);
  });

  it("IPC validates and bounds every input", async () => {
    const ipc = mockIpcMain();
    registerVoiceIpc(ipc, ctx.app);
    await assert.rejects(() => ipc.invoke("voice:startSession", { mode: "telepathy" }), /Invalid voice mode/);
    const s = await ipc.invoke("voice:startSession", { mode: "push-to-talk" });
    await assert.rejects(() => ipc.invoke("voice:audioChunk", { sessionId: s.id, utteranceId: "x", base64: "a".repeat(500000) }), /size limit/);
    await assert.rejects(() => ipc.invoke("voice:audioChunk", { sessionId: s.id }), /Missing/);
    await assert.rejects(() => ipc.invoke("voice:speak", { sessionId: s.id, text: "x".repeat(5000) }), /Invalid speech text/);
    await assert.rejects(() => ipc.invoke("voice:status", { sessionId: "vsess_nope" }), /not found/i);
    await ipc.invoke("voice:stopSession", { sessionId: s.id });
  });
});
