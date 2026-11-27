let initialized = false;
let mermaidInstancePromise = null;

export const stringHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

export const loadMermaid = async () => {
  if (!mermaidInstancePromise) {
    mermaidInstancePromise = import('mermaid').then((mod) => {
      const m = mod.default || mod;
      if (!initialized) {
        m.initialize({
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
      }
      return m;
    });
  }
  return mermaidInstancePromise;
};

export const initMermaid = () => {
  // 延迟至实际渲染思维导图时按需加载 mermaid，大幅压缩首屏 JS 体积
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

  // Helper to clean remaining quotes/backslashes/nested brackets inside labels
  const cleanLabel = (label, fallback) => {
    const cleaned = String(label || '')
      .replace(/\\/g, '')
      .replace(/"/g, "'")
      .replace(/\[/g, '［')
      .replace(/\]/g, '］')
      .replace(/\{/g, '｛')
      .replace(/\}/g, '｝')
      .trim();
    return cleaned === '' ? fallback : cleaned;
  };

  // 按行安全包裹 flowchart / graph 节点标签（支持含闭区间 [-2, 2] 与 f(x) 的复杂数学表达式，彻底消灭 Parse error）
  const wrapNodeBracketsOnLine = (line) => {
    // 跳过连接词、样式声明、注释、direction、subgraph
    if (/^\s*(?:%%|style\b|classDef\b|class\b|click\b|linkStyle\b|subgraph\b|end\b|direction\b|graph\b|flowchart\b)/i.test(line)) {
      return line;
    }
    let out = '';
    let i = 0;
    while (i < line.length) {
      // 检测节点 ID 后紧跟 [ / { / (( / (
      const rest = line.slice(i);
      const nodeMatch = rest.match(/^([A-Za-z0-9_\u4e00-\u9fa5]+)\s*(\(\(|\[|\{|\()/);
      if (nodeMatch) {
        const id = nodeMatch[1];
        const openTok = nodeMatch[2];
        const openEnd = i + nodeMatch[0].length;
        // 避免把箭头后的独立普通词误判（如 f(x) 已在外层标签内部会在外层消耗掉）
        const closeChar = openTok === '[' ? ']' : (openTok === '{' ? '}' : ')');
        if (openTok === '((') {
          const closeIdx = line.indexOf('))', openEnd);
          if (closeIdx !== -1) {
            const inner = line.slice(openEnd, closeIdx);
            out += `${id}("${cleanLabel(inner, id)}")`;
            i = closeIdx + 2;
            continue;
          }
        } else {
          // 寻找平衡的最外层闭合括号（允许内部出现闭区间 [-2, 2] 或函数 f(x)）
          let depth = 1;
          let j = openEnd;
          while (j < line.length && depth > 0) {
            const ch = line[j];
            if (ch === openTok) depth++;
            else if (ch === closeChar) depth--;
            j++;
          }
          if (depth === 0) {
            const inner = line.slice(openEnd, j - 1);
            const stripped = inner.trim();
            const unwrapped = (stripped.startsWith('"') && stripped.endsWith('"') && stripped.length >= 2)
              ? stripped.slice(1, -1)
              : stripped;
            if (openTok === '[') out += `${id}["${cleanLabel(unwrapped, id)}"]`;
            else if (openTok === '{') out += `${id}{"${cleanLabel(unwrapped, id)}"}`;
            else out += `${id}("${cleanLabel(unwrapped, id)}")`;
            i = j;
            continue;
          }
        }
      }
      out += line[i];
      i++;
    }
    // 清洗连线标签里的嵌套双引号 |"... "|
    out = out.replace(/\|([^|\r\n]+)\|/g, (m, lbl) => `|${lbl.replace(/"/g, "'").trim()}|`);
    return out;
  };

  let sanitized = cleanedCode.includes('mindmap')
    ? cleanedCode
    : cleanedCode.split('\n').map(wrapNodeBracketsOnLine).join('\n');

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

export const mermaid = null;
