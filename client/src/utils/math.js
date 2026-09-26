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

    // 3. Normalize educational card headers into standardized Markdown h3 cards
    processed = processed
      .replace(/^#{0,4}\s*(?:🎯\s*)?(?:\*\*|【)?(?:经典母题模型挑战|母题挑战|挑战题|母题模型挑战)(?:\*\*|】)?\s*[:：]?\s*$/gmi, '\n\n### 🎯【经典母题模型挑战】\n\n')
      .replace(/^#{0,4}\s*(?:✏️\s*)?(?:\*\*|【)?(?:第一步[：:]\s*动笔设问支架|动笔设问支架|动笔支架|设问支架|第一步动笔支架)(?:\*\*|】)?\s*[:：]?\s*$/gmi, '\n\n### ✏️【第一步：动笔设问支架】\n\n')
      .replace(/^#{0,4}\s*(?:🎯\s*)?(?:\*\*|【)?(?:题眼穿透|核心题眼)(?:\*\*|】)?\s*[:：]?\s*$/gmi, '\n\n### 🎯【题眼穿透】\n\n')
      .replace(/^#{0,4}\s*(?:💡\s*)?(?:\*\*|【)?(?:步骤拆解与锦囊|步骤拆解|解题锦囊)(?:\*\*|】)?\s*[:：]?\s*$/gmi, '\n\n### 💡【步骤拆解与锦囊】\n\n')
      .replace(/^#{0,4}\s*(?:🔥\s*)?(?:\*\*|【)?(?:母题举一反三|举一反三微练过关|举一反三|微练习题|微练习|同类微练)(?:\*\*|】)?\s*[:：]?\s*$/gmi, '\n\n### 🔥【举一反三微练过关】\n\n');

    // 4. Ensure list items have clean spacing so CommonMark parsers don't print raw asterisks
    const rawLines = processed.split('\n');
    const fixedLines = [];
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();
      const isBullet = /^(?:[*+-]|\d+\.)\s+/.test(trimmed);
      if (isBullet && i > 0) {
        const prevTrimmed = rawLines[i - 1].trim();
        const prevIsBullet = /^(?:[*+-]|\d+\.)\s+/.test(prevTrimmed);
        if (prevTrimmed !== '' && !prevIsBullet && !prevTrimmed.startsWith('#')) {
          fixedLines.push(''); // insert blank line before new list block
        }
      }
      fixedLines.push(line);
    }
    processed = fixedLines.join('\n');

    // 5. Detect standalone lines that look like raw LaTeX formulas but lack $ or $$
    // e.g. "a-2 = 0 \quad \text{且} \quad b+3 = 0" or "\triangle ABC \cong \triangle A'B'C'"
    const lines = processed.split('\n');
    const enrichedLines = lines.map(line => {
      const trimmed = line.trim();
      // If line contains Chinese characters, it is prose with mixed formulas, NOT a standalone pure LaTeX equation!
      if (/[\u4e00-\u9fa5]/.test(trimmed)) {
        return line;
      }
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
        trimmed.includes('\\approx') ||
        trimmed.includes('\\cong') ||
        trimmed.includes('\\triangle') ||
        trimmed.includes('\\Delta') ||
        trimmed.includes('\\angle') ||
        trimmed.includes('\\perp') ||
        trimmed.includes('\\parallel') ||
        trimmed.includes('\\circ') ||
        trimmed.includes('\\because') ||
        trimmed.includes('\\therefore') ||
        trimmed.includes('\\alpha') ||
        trimmed.includes('\\beta') ||
        trimmed.includes('\\theta')
      )) {
        // Wrap raw math line in display block
        return `\n$$\n${trimmed}\n$$\n`;
      }
      return line;
    });
    processed = enrichedLines.join('\n');

    // 6. Balance unclosed $$ during streaming
    const countDouble = (processed.match(/\$\$/g) || []).length;
    if (countDouble % 2 !== 0) {
      processed += '\n$$';
    }

    return processed;
  }).join('');
};
