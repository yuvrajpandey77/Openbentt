/**
 * Phase 6 — Model integration (uses the existing abstraction only).
 * Default model function routes through streamRoutedTask (all providers,
 * including local GGUF/Gemma, offline asserts). The runtime never touches
 * provider config, keys, or transports — it receives an ApiKeyConfig from
 * the trusted caller and an injected model function for tests.
 */
import { streamRoutedTask } from "@/lib/modelRouting";
import type { ApiKeyConfig } from "@/types/chat";
import type { AgentDefinition, AgentModelFn } from "@/lib/agent/agentTypes";

/** Build the default model function for an agent definition + caller config. */
export function createRoutedModelFn(def: AgentDefinition, cfg: ApiKeyConfig): AgentModelFn {
  return async (messages, opts) => {
    const result = await streamRoutedTask(def.modelTask, cfg, messages, opts.signal, {
      onDelta: opts.streamFinal && opts.onDelta ? opts.onDelta : () => undefined,
    });
    return { text: result.text, route: `${result.route.aiProvider}:${result.route.modelId}` };
  };
}

/**
 * Reasoning turns call with streamFinal:false (silent collection); the final
 * turn's text is emitted to the UI by the chat layer in bounded chunks.
 * This keeps one model path for all turns — no second streaming architecture.
 */
export function collectingModelFn(inner: AgentModelFn): AgentModelFn {
  return async (messages, opts) => inner(messages, { ...opts, streamFinal: false, onDelta: undefined });
}
