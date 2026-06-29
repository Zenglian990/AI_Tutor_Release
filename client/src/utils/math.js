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
    return part
      .replace(/\\\[/g, '$$$$') // Replace \[ with $$
      .replace(/\\\]/g, '$$$$') // Replace \] with $$
      .replace(/\\\(/g, '$$')     // Replace \( with $
      .replace(/\\\)/g, '$$');    // Replace \) with $
  }).join('');
};
