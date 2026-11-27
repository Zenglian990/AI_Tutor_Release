const test = require('node:test');
const assert = require('node:assert/strict');

const { extractAndParseJson, extractLlmText } = require('../server/utils/jsonParser');
const {
  ExactFraction,
  factorizeQuadratic,
  areAlgebraicallyEquivalent,
  evaluateExpressionAt
} = require('../server/utils/mathCAS');
const { getTodayString, getDaysDifference } = require('../server/services/streakService');
const { KNOWLEDGE_GRAPH } = require('../server/services/knowledgeGraph');
const testPaperRouter = require('../server/routes/testPaper');
const { heuristicEssayEvaluation } = require('../server/routes/essay');

test('Round7 P0-3: extractAndParseJson 完整支持顶层 JSON 数组与 Markdown 代码块', () => {
  const fencedArray = '```json\n[{"question":"1+1=?","options":["1","2","3","4"],"correctIdx":1}]\n```';
  const parsed = extractAndParseJson(fencedArray);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].correctIdx, 1);

  const prefixedArray = '好的，以下是题目：\n[{"q":"A"},{"q":"B"}]\n希望有帮助';
  const parsed2 = extractAndParseJson(prefixedArray);
  assert.equal(Array.isArray(parsed2), true);
  assert.equal(parsed2.length, 2);

  const obj = extractAndParseJson('prefix {"ok":true,"items":[1,2]} suffix');
  assert.equal(obj.ok, true);
  assert.deepEqual(obj.items, [1, 2]);
});

test('Round7 P0-5: extractLlmText 自动跳过 Gemini 3 thought 思考块', () => {
  const text = extractLlmText({
    candidates: [{
      content: {
        parts: [
          { thought: true, text: 'internal reasoning...' },
          { text: '{"score": 12}' }
        ]
      }
    }]
  });
  assert.equal(text, '{"score": 12}');
});

test('Round7 P0-1: ExactFraction.from 负数绝不返回 NaN 且完全平方因式分解无 /1 丑输出', () => {
  assert.equal(ExactFraction.from(-0.5).toString(), '-1/2');
  assert.equal(ExactFraction.from(-0.3).toString(), '-3/10');
  assert.equal(ExactFraction.from(0).toString(), '0');
  assert.equal(ExactFraction.from(-1.25).toString(), '-5/4');

  const fq = factorizeQuadratic(1, 4, 4);
  assert.equal(fq.factorableInQ, true);
  assert.equal(fq.factoredLatex, '(x + 2)^2');

  assert.equal(areAlgebraicallyEquivalent('f(x) = x^3 - 3x', 'x*(x^2 - 3)'), true);
  assert.ok(Math.abs(evaluateExpressionAt('sin(pi/2) + sqrt(9)', {}) - 4) < 1e-6);
});

test('Round7 P0-7: streakService 严格采用北京时间日期并稳定计算自然日差', () => {
  const today = getTodayString();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(getDaysDifference('2026-11-27', '2026-11-27'), 0);
  assert.equal(getDaysDifference('2026-11-26', '2026-11-27'), 1);
  assert.equal(getDaysDifference('2026-11-25', '2026-11-27'), 2);
});

test('Round7 P1-10: 高三启发式作文评分五维总分与总分算术对齐且无记叙文套话', () => {
  const res = heuristicEssayEvaluation(
    '科技与人文',
    '在人工智能飞速演进的今天，我们既要拥抱工具理性带来的效率跃升，更要坚守人文温度与独立思辨的底线。技术应当服务于人的全面发展，而非替代人类的价值判断与共情能力。当代青年当以清醒视角审视时代变局。',
    '12_up'
  );
  assert.equal(res.max_score, 60);
  const dimSum = Object.values(res.dimensions).reduce((s, d) => s + d.score, 0);
  const expectedTotal = Math.min(60, Math.max(1, Math.round((dimSum / 50) * 60)));
  assert.equal(res.total_score, expectedTotal);
  assert.equal(res.dimensions.rhetoric.comment.includes('动作白描'), false);
});

test('Round7 P0-4 & P1-11: 高三数学兜底卷含新高考多选题，且生/史/地/政均具真学科题库', async () => {
  const mathPaper = await testPaperRouter.assembleReliableExamPaper('12_up', '数学', 'real_exam', '新高考全国一卷示范');
  assert.equal(mathPaper.totalScore, 150);
  const multiChoices = mathPaper.questions.filter(q => q.type === 'multi_choice');
  assert.ok(multiChoices.length >= 3, '高中数学兜底卷应包含至少 3 道新高考多选题');

  for (const subj of ['生物', '历史', '地理', '政治']) {
    const p = await testPaperRouter.assembleReliableExamPaper('12_up', subj, 'real_exam');
    assert.ok(p.questions.length >= 5, `${subj} 兜底卷题量不足`);
    assert.equal(p.questions[0].question.includes('核心知识体系的掌握方法'), false, `${subj} 不应退回通用水题`);
  }
});

test('Round7 P1-12: 高中知识图谱补齐语文/政治/化学/生物/历史/地理全学科主干节点', () => {
  const nodes = Object.values(KNOWLEDGE_GRAPH);
  const countHighBySubj = (subj) => nodes.filter(n => {
    const g = parseInt(String(n.grade || '').replace(/\D/g, ''), 10) || 0;
    return g >= 10 && n.subject === subj;
  }).length;

  assert.ok(countHighBySubj('语文') >= 3, '高中语文图谱节点不足');
  assert.ok(countHighBySubj('政治') >= 3, '高中政治图谱节点不足');
  assert.ok(countHighBySubj('化学') >= 4, '高中化学图谱节点不足');
  assert.ok(countHighBySubj('生物') >= 3, '高中生物图谱节点不足');
  assert.ok(countHighBySubj('历史') >= 3, '高中历史图谱节点不足');
  assert.ok(countHighBySubj('地理') >= 3, '高中地理图谱节点不足');
});

test('Round7 Hotfix: 单 Gemini Key 偶发超时不得全局冷却毒化并盲跳未配置的 DeepSeek', () => {
  const fs = require('fs');
  const path = require('path');
  const embCode = fs.readFileSync(path.join(__dirname, '../server/services/embedding.js'), 'utf8');
  const chapCode = fs.readFileSync(path.join(__dirname, '../server/routes/chapters.js'), 'utf8');

  assert.match(embCode, /hasAnyServerDomesticKey/, 'embedding.js 应统一检测服务端是否配置国内密钥');
  assert.match(embCode, /!isIsolatedClient && hasAnyServerDomesticKey/, '冷却分支与兜底分支在未配国内密钥时不得盲跳 fetchDeepSeek');
  assert.match(embCode, /validKeys\.length > 1[\s\S]{0,80}keyCooldown\.set/, '仅多 Key 池模式才应设置全局 keyCooldown');
  assert.match(chapCode, /fetchWithKeyRotation\([\s\S]+?2,\s*25000\)/, 'chapters/quiz 超时应放宽至 25000ms');
});

test('Round7 Hotfix-2: 周报无未定义 settings 引用、模考杜绝 NaN 分、设置底栏版本 v1.7.7 且 RAG 安全截断 LaTeX', () => {
  const fs = require('fs');
  const path = require('path');
  const appCode = fs.readFileSync(path.join(__dirname, '../client/src/App.jsx'), 'utf8');
  const settingsCode = fs.readFileSync(path.join(__dirname, '../client/src/components/SettingsModal.jsx'), 'utf8');
  const ktCode = fs.readFileSync(path.join(__dirname, '../client/src/components/KnowledgeTest.jsx'), 'utf8');
  const chatCode = fs.readFileSync(path.join(__dirname, '../server/routes/chat.js'), 'utf8');

  assert.equal(appCode.includes('settings?.parentName') && !appCode.includes('store?.settings?.parentName'), false, 'App.jsx 不得引用未定义的 settings');
  assert.equal(settingsCode.includes('v1.7.6'), false, 'SettingsModal.jsx 不得残留旧版本号 v1.7.6');
  assert.equal(settingsCode.includes('v1.7.7'), true, 'SettingsModal.jsx 应展示 v1.7.7');
  assert.match(ktCode, /parseQuestionScore/, 'KnowledgeTest.jsx 应使用安全数值解析防 NaN 分');
  assert.match(chatCode, /safeTruncateLatexSnippet/, 'chat.js 应使用安全 LaTeX 截断杜绝奇数 $ 泄露');
});
