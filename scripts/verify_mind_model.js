const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const { initDB } = require('../server/db/init');

let app;
let server;
let port;
let baseUrl;

before(async () => {
  process.env.NODE_ENV = 'development';
  await initDB();
  app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
  console.log(`Test server for mind model validation started on ${baseUrl}`);
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log('Test server shut down.');
  }
});

// Helper function to wait for SSE streams and accumulate text
async function getChatResponseText(payload) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (res.status !== 200) {
    const err = await res.text();
    throw new Error(`Chat API failed with status ${res.status}: ${err}`);
  }
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let done = false;
  let accumulatedText = '';
  let partialLine = '';
  
  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      const chunk = decoder.decode(value, { stream: !done });
      const lines = (partialLine + chunk).split('\n');
      partialLine = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.text) {
              accumulatedText += parsed.text;
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }
  }
  return accumulatedText;
}

test('Verify Lower Grade (1-3) Mind Model — concise, emoji-heavy, playful metaphors', async () => {
  const response = await getChatResponseText({
    query: '小明有3个苹果，吃掉了1个，还剩几个？我不太明白为什么是减法。',
    grade: '1_up',
    subject: '数学',
    socratic: 'direct'
  });
  
  console.log('\n--- Lower Grade (1-3) Response ---');
  console.log(response);
  console.log('-----------------------------------');
  
  // Count emojis in response
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojiCount = (response.match(emojiRegex) || []).length;
  console.log(`Emoji count: ${emojiCount}`);
  assert.ok(emojiCount >= 2, 'Lower grade response should contain at least 2 emojis');
  
  // Word count constraint (concise)
  assert.ok(response.length <= 400, `Lower grade response should be concise, length is ${response.length}`);
  
  // Negative constraint checks
  const academicTitles = ['解题核心思路', '步骤拆解', '易错陷阱', '核心考点'];
  for (const title of academicTitles) {
    assert.ok(!response.includes(title), `Lower grade response should not contain academic title: ${title}`);
  }
});

test('Verify Middle Grade (4-6) Mind Model — Socratic inquiry, encourage summarizing', async () => {
  const response = await getChatResponseText({
    query: '加法结合律是什么意思？能不能直接告诉我公式？',
    grade: '5_down',
    subject: '数学',
    socratic: 'strict'
  });
  
  console.log('\n--- Middle Grade (4-6) Socratic Response ---');
  console.log(response);
  console.log('--------------------------------------------');
  
  // Inquiry check (strict Socratic mode should ask questions and not directly answer)
  const hasQuestion = response.includes('？') || response.includes('吗') || response.includes('呢');
  assert.ok(hasQuestion, 'Middle grade Socratic response should contain questions/inquiries');
  
  // Check if it encourages the student to summarize, explore or find the pattern
  const encouragesSummary = /总结|规律|发现|奥秘|自己|想想|探索|好吗/.test(response);
  assert.ok(encouragesSummary, 'Middle grade response should encourage summary, discovery, or reflection');
});

test('Verify High Grade (7-9) Mind Model — structured sections, LaTeX math, Mermaid chart', async () => {
  const response = await getChatResponseText({
    query: '二次函数的顶点坐标公式是什么？是如何证明的？',
    grade: '9_up',
    subject: '数学',
    socratic: 'direct'
  });
  
  console.log('\n--- High Grade (7-9) Response ---');
  console.log(response);
  console.log('----------------------------------');
  
  // Assert presence of the 4 required headers/sections
  assert.ok(/解题核心思路|核心思路/.test(response), 'High grade response should include 【解题核心思路】');
  assert.ok(/步骤拆解|证明步骤/.test(response), 'High grade response should include 【步骤拆解】');
  assert.ok(/核心考点|考点/.test(response), 'High grade response should include 【核心考点】');
  assert.ok(/易错陷阱|易错/.test(response), 'High grade response should include 【易错陷阱】');
  
  // Assert LaTeX equations (using \(...\) or \[...\])
  const hasLatex = response.includes('\\(') || response.includes('\\[');
  assert.ok(hasLatex, 'High grade response should contain LaTeX formulas using \\( or \\[');
  
  // Assert no raw $ or $$ for math formatting
  const hasRawDollar = response.includes('$$') || (response.includes('$') && !response.includes('\\$') && !/\\\(\$.*?\$\\\)/.test(response));
  assert.ok(!hasRawDollar, 'High grade response should NOT contain raw unescaped $ or $$ for LaTeX');
  
  // Assert Mermaid block for complex structures
  assert.ok(response.includes('```mermaid') || response.includes('mermaid'), 'High grade response should contain a mermaid block');
});
