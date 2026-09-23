import { describe, it, expect } from "vitest";
import {
  INPUT_SOURCES,
  SPEECH_LIMITS,
  TRANSCRIPT_LIMITS,
  VOICE_AUDIO,
  VOICE_STATES,
  isValidInputSource,
  isValidVoiceTransition,
  maxAudioBytesForSeconds,
  micLabel,
  summarizeForSpeech,
  validateAudioChunk,
  validateSpeechText,
  validateTranscript,
} from "./voiceCore.mjs";

describe("voiceCore state machine", () => {
  it("covers the specified states", () => {
    for (const s of ["OFF", "REQUESTING_PERMISSION", "READY", "LISTENING", "TRANSCRIBING", "THINKING", "SPEAKING", "INTERRUPTED", "ERROR", "STOPPING"]) {
      expect(VOICE_STATES).toContain(s);
    }
  });
  it("walks the happy path", () => {
    const path = ["OFF", "REQUESTING_PERMISSION", "READY", "LISTENING", "TRANSCRIBING", "THINKING", "SPEAKING", "READY"];
    for (let i = 1; i < path.length; i++) {
      expect(isValidVoiceTransition(path[i - 1], path[i])).toBe(true);
    }
  });
  it("supports interruption and recovery", () => {
    expect(isValidVoiceTransition("SPEAKING", "INTERRUPTED")).toBe(true);
    expect(isValidVoiceTransition("INTERRUPTED", "LISTENING")).toBe(true);
    expect(isValidVoiceTransition("ERROR", "READY")).toBe(true);
  });
  it("rejects illegal transitions", () => {
    expect(isValidVoiceTransition("OFF", "SPEAKING")).toBe(false);
    expect(isValidVoiceTransition("LISTENING", "SPEAKING")).toBe(false);
    expect(isValidVoiceTransition("OFF", "THINKING")).toBe(false);
    expect(isValidVoiceTransition("NOPE", "OFF")).toBe(false);
  });
  it("validates input sources", () => {
    expect(isValidInputSource("text")).toBe(true);
    expect(isValidInputSource("voice")).toBe(true);
    expect(isValidInputSource("shell")).toBe(false);
    expect(INPUT_SOURCES).toEqual(["text", "voice"]);
  });
});

describe("audio bounds", () => {
  it("caps utterance bytes at 60s of 16k mono PCM16", () => {
    expect(VOICE_AUDIO.maxUtteranceBytes).toBe(1920000);
    expect(maxAudioBytesForSeconds(60)).toBe(1920000);
    expect(maxAudioBytesForSeconds(600)).toBe(1920000);
  });
  it("accepts a small valid chunk", () => {
    const b64 = Buffer.alloc(1000).toString("base64");
    expect(validateAudioChunk(b64, 0).bytes).toBeGreaterThan(0);
  });
  it("rejects oversized chunks and over-long utterances", () => {
    const big = Buffer.alloc(VOICE_AUDIO.maxChunkBytes + 1).toString("base64");
    expect(() => validateAudioChunk(big, 0)).toThrow();
    const small = Buffer.alloc(100).toString("base64");
    expect(() => validateAudioChunk(small, VOICE_AUDIO.maxUtteranceBytes)).toThrow();
    expect(() => validateAudioChunk("", 0)).toThrow();
    expect(() => validateAudioChunk("!!!not-base64!!!", 0)).toThrow();
  });
});

describe("transcripts", () => {
  it("accepts normal text, strips control chars, bounds length", () => {
    expect(validateTranscript("  hello world  ")).toBe("hello world");
    expect(validateTranscript("x".repeat(9000)).length).toBeLessThanOrEqual(TRANSCRIPT_LIMITS.maxChars);
    expect(() => validateTranscript("   ")).toThrow();
    expect(() => validateTranscript(null)).toThrow();
  });
});

describe("summaries", () => {
  it("announces permission without granting anything", () => {
    const s = summarizeForSpeech({ events: [], permissionPending: true });
    expect(s).toMatch(/permission/i);
  });
  it("summarizes completion concisely", () => {
    const s = summarizeForSpeech({ events: [{ type: "agent.completed", payload: { message: "Fixed." } }], taskStatus: "COMPLETED" });
    expect(s).toMatch(/complete/i);
    expect(s.length).toBeLessThanOrEqual(SPEECH_LIMITS.maxChars);
  });
  it("never reads raw tool output verbatim", () => {
    const s = summarizeForSpeech({ events: [{ type: "agent.tool.output", payload: { message: "x".repeat(5000) } }] });
    expect(s.length).toBeLessThanOrEqual(SPEECH_LIMITS.maxChars);
    expect(s).not.toContain("x".repeat(100));
  });
  it("validates speech text", () => {
    expect(() => validateSpeechText("  ")).toThrow();
    expect(validateSpeechText("hi").length).toBeGreaterThan(0);
  });
  it("labels mic states", () => {
    expect(micLabel("off")).toMatch(/off/i);
    expect(micLabel("active")).toMatch(/active/i);
  });
});
