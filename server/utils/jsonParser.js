/**
 * Resilient JSON Extractor & Parser
 * Handles markdown code fences, unescaped LaTeX backslashes (\frac, \sqrt, \alpha, etc.),
 * trailing commas, and malformed strings produced by vision LLMs.
 */

function repairJsonString(str) {
  let s = str;
  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([\]}])/g, '$1');

  // Fix LaTeX backslashes in JSON strings:
  // Non-JSON escapes like \s (\sqrt), \p (\pm), \a (\alpha, \angle), \D (\Delta), etc.
  // Also LaTeX commands starting with b, f, t like \frac, \beta, \times, \tan, \bar
  s = s.replace(/\\(?:([^"\\/bfnrtu])|([bft][a-zA-Z]))/g, (match, p1, p2) => {
    if (p1) return '\\\\' + p1;
    if (p2) return '\\\\' + p2;
    return match;
  });

  return s;
}

function extractAndParseJson(text) {
  if (!text || typeof text !== 'string') return null;

  let clean = text.trim();

  // Strip markdown code fences (```json ... ``` or ``` ...)
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Find boundaries of outer JSON object
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }

  // Attempt 1: Direct parse
  try {
    return JSON.parse(clean);
  } catch (e1) {
    // Attempt 2: Repaired JSON (LaTeX backslashes & trailing commas)
    try {
      const repaired = repairJsonString(clean);
      return JSON.parse(repaired);
    } catch (e2) {
      // Attempt 3: If outer JSON has unescaped raw newlines inside string literals
      try {
        const fixedNewlines = clean
          .replace(/[\r\n]+/g, '\\n')
          .replace(/\\n\s*([\{\}\[\],:])/g, '$1')
          .replace(/([\{\}\[\],:])\s*\\n/g, '$1');
        const repaired = repairJsonString(fixedNewlines);
        return JSON.parse(repaired);
      } catch (e3) {
        // Attempt 4: Targeted extraction of results array if the wrapper is broken
        try {
          const resultsMatch = clean.match(/"results"\s*:\s*(\[\s*\{[\s\S]*\}\s*\])/);
          if (resultsMatch) {
            const repairedResults = repairJsonString(resultsMatch[1]);
            const resultsArr = JSON.parse(repairedResults);
            if (Array.isArray(resultsArr) && resultsArr.length > 0) {
              const total = resultsArr.length;
              const correct = resultsArr.filter(r => r.status === 'correct').length;
              const wrong = resultsArr.filter(r => r.status === 'wrong').length;
              return {
                totalCount: total,
                correctCount: correct,
                wrongCount: wrong,
                accuracyPct: Math.round((correct / Math.max(1, total)) * 100),
                summaryHeadline: '整卷逐题识别完成',
                teacherPraise: '解题态度端正，卷面书写认真！',
                teacherAdvice: '重点订正失分题目，巩固考点推导。',
                results: resultsArr
              };
            }
          }
        } catch (e4) {
          // Ignore
        }
        return null;
      }
    }
  }
}

module.exports = { extractAndParseJson, repairJsonString };
