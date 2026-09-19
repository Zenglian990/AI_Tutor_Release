/**
 * Preprocess LaTeX delimiters in Markdown text to standard dollar-sign format.
 * Splits text by code blocks to avoid corrupting code snippet syntax.
 */
export const preprocessLatex = (text) => {
  if (typeof text !== 'string') return text;
  
  // Split by code blocks: ```lang ... ```
  const parts = text.split(/(```[\s\S]*?```)/g);
  
  return parts.map((part) => {
    if (part.startsWith('```')) {
      return part; // Skip replacements inside code blocks
    }
    
    let processed = part
      .replace(/\\\[/g, () => '\n$$\n') // Replace \[ with \n$$\n
      .replace(/\\\]/g, () => '\n$$\n') // Replace \] with \n$$\n
      .replace(/\\\(/g, () => '$')      // Replace \( with $
      .replace(/\\\)/g, () => '$');     // Replace \) with $

    // 1. Separate $$ from preceding text on same line (e.g. "得到: $$" -> "得到:\n\n$$")
    processed = processed.replace(/([^\n$])\s*\$\$/g, '$1\n\n$$');
    // 2. Separate $$ from following text on same line (e.g. "$$ 结果" -> "$$\n\n结果")
    processed = processed.replace(/\$\$\s*([^\n$])/g, '$$\n\n$1');

    // 3. Detect standalone lines that look like raw LaTeX formulas but lack $ or $$
    // e.g. "a-2 = 0 \quad \text{且} \quad b+3 = 0"
    const lines = processed.split('\n');
    const enrichedLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed.includes('$') && (
        trimmed.includes('\\quad') ||
        trimmed.includes('\\text{') ||
        trimmed.includes('\\frac{') ||
        trimmed.includes('\\sqrt{') ||
        trimmed.includes('\\pm') ||
        trimmed.includes('\\cdot') ||
        trimmed.includes('\\times') ||
        trimmed.includes('\\div') ||
        trimmed.includes('\\neq') ||
        trimmed.includes('\\le') ||
        trimmed.includes('\\ge') ||
        trimmed.includes('\\sim') ||
        trimmed.includes('\\approx')
      )) {
        // Wrap raw math line in display block
        return `\n$$\n${trimmed}\n$$\n`;
      }
      return line;
    });
    processed = enrichedLines.join('\n');

    // 4. Balance unclosed $$ during streaming
    const countDouble = (processed.match(/\$\$/g) || []).length;
    if (countDouble % 2 !== 0) {
      processed += '\n$$';
    }

    return processed;
  }).join('');
};
