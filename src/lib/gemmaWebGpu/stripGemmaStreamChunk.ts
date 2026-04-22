/** Tokens stripped from streamed / final Gemma 4 text for chat UI (aligned with Gemma Gem). */
const SPECIAL_TOKENS = new Set([
  "<eos>",
  "<bos>",
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
]);

export function stripSpecialTokens(text: string): string {
  let result = text;
  for (const token of SPECIAL_TOKENS) {
    if (result.includes(token)) {
      result = result.split(token).join("");
    }
  }
  return result;
}
