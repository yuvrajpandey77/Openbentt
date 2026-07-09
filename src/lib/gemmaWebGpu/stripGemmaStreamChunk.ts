/**
 * Tokens stripped from streamed / final on-device text for chat UI.
 * Covers Gemma turn tags and Qwen/ChatML specials (e.g. `<|im_end|>`).
 */
const SPECIAL_TOKENS = [
  "<eos>",
  "<bos>",
  "<pad>",
  "<unk>",
  "<end_of_turn>",
  "<start_of_turn>",
  "<|turn>",
  "<turn|>",
  "<|tool>",
  "<tool|>",
  "<|tool_call>",
  "<tool_call|>",
  "<|tool_response>",
  "<tool_response|>",
  "<|channel>",
  "<channel|>",
  "<|think|>",
  "<|image|>",
  '<|"|>',
  "<|im_start|>",
  "<|im_end|>",
  "<|endoftext|>",
  "<|end_of_text|>",
  "<|eot_id|>",
  "<|start_header_id|>",
  "<|end_header_id|>",
];

/** Any leftover ChatML / control markers like `<|...|>`. */
const ANGLE_SPECIAL_RE = /<\|[^|>]*\|>/g;

export function stripSpecialTokens(text: string): string {
  let result = text;
  for (const token of SPECIAL_TOKENS) {
    if (result.includes(token)) {
      result = result.split(token).join("");
    }
  }
  result = result.replace(ANGLE_SPECIAL_RE, "");
  return result;
}

/** True when a streamed piece is only a stop/control token (generation should end). */
export function isStopSpecialTokenChunk(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    t === "<|im_end|>" ||
    t === "<|endoftext|>" ||
    t === "<|eot_id|>" ||
    t === "<end_of_turn>" ||
    t === "<eos>"
  );
}
