import mermaid from 'mermaid';

let initialized = false;

export const stringHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

export const initMermaid = () => {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    useMaxWidth: false,
    securityLevel: 'strict', // Fixed S1: changed from 'loose' to 'strict'
    htmlLabels: false,
    flowchart: {
      htmlLabels: false,
      padding: 18,
      useWidth: true
    },
    mindmap: {
      htmlLabels: false
    }
  });
  initialized = true;
};

export const sanitizeMermaid = (code) => {
  if (typeof code !== 'string') return code;

  // 1. Clean math delimiters in the entire code block first
  let cleanedCode = code
    .replace(/\\\[/g, '') // remove \[
    .replace(/\\\]/g, '') // remove \]
    .replace(/\\\(/g, '') // remove \(
    .replace(/\\\)/g, '') // remove \)
    .replace(/\$/g, '')   // remove $
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pi/g, 'π')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\pm/g, '±')
    .replace(/\\ne/g, '≠')
    .replace(/\\angle/g, '∠');

  // Helper to clean remaining quotes/backslashes inside labels
  const cleanLabel = (label, fallback) => {
    const cleaned = label
      .replace(/\\/g, '') // strip remaining backslashes
      .replace(/"/g, '')  // strip double quotes entirely to prevent inner nesting conflict
      .trim();
    // If the label becomes empty after cleaning, use the node ID as fallback
    // In Mermaid, an empty label like A("") or A[""] crashes the parser.
    return cleaned === '' ? fallback : cleaned;
  };

  // Match node definitions:
  // 1. Match ID((...)) and safely downgrade to ID("...") to prevent lexical/parse errors in Mermaid
  let sanitized = cleanedCode.replace(/([a-zA-Z0-9_\-\u4e00-\u9fa5]+)\s*\(\(([^)\r\n]*)\)\)/g, (match, id, label) => {
    return `${id}("${cleanLabel(label, id)}")`;
  });

  // 2. Match ID(...)
  sanitized = sanitized.replace(/([a-zA-Z0-9_\-\u4e00-\u9fa5]+)\s*\(([^)\r\n]*)\)/g, (match, id, label) => {
    if (label.startsWith('"') && label.endsWith('"')) return match;
    if (label.startsWith('(') && label.endsWith(')')) return match;
    return `${id}("${cleanLabel(label, id)}")`;
  });

  // 3. Match ID[...]
  sanitized = sanitized.replace(/([a-zA-Z0-9_\-\u4e00-\u9fa5]+)\s*\[([^\]\r\n]*)\]/g, (match, id, label) => {
    return `${id}["${cleanLabel(label, id)}"]`;
  });

  // Mindmap fix: wrap text containing special characters in quotes
  if (sanitized.includes('mindmap')) {
    sanitized = sanitized.split('\n').map(line => {
      const match = line.match(/^(\s*)(.*)$/);
      if (!match) return line;
      const space = match[1];
      let text = match[2];
      
      if (!text || text === 'mindmap' || text.startsWith('"') || text.startsWith('root(')) return line;
      
      // Check if it's a valid shape definition like id("...") or id["..."]
      if (text.match(/^[a-zA-Z0-9_\u4e00-\u9fa5-]+(?:\["[^"]*"\]|\("[^"]*"\))$/)) {
        return line;
      }
      
      if (text.includes('(') || text.includes('"') || text.includes('+') || text.includes('=')) {
        text = text.replace(/"/g, "'");
        const rnd = stringHash(text);
        return `${space}node_${rnd}["${text}"]`;
      }
      return line;
    }).join('\n');
  }

  return sanitized;
};

export { mermaid };
