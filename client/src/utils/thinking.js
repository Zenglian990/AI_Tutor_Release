/**
 * thinking.js
 * Extract and split reasoning/thinking processes from model outputs
 */

export function splitThinkingContent(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { thinking: null, body: rawText || '' };
  }

  // 1. Standard <think> ... </think>
  const thinkMatch = rawText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const body = rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
    return { thinking, body };
  }

  // 2. Legacy blockquote format: > 🧠 **[思考过程]**
  const bqMatch = rawText.match(/(?:^|\n)>\s*🧠\s*\**\[思考过程\]\**\s*([\s\S]*?)(?=(?:\n[^\n>]|\n\n[^\n>]|$))/i);
  if (bqMatch) {
    const rawThinking = bqMatch[1]
      .split('\n')
      .map(line => line.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
    const body = rawText.replace(bqMatch[0], '').trim();
    return { thinking: rawThinking, body };
  }

  return { thinking: null, body: rawText };
}
