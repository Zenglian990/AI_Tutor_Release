const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const {
  KNOWLEDGE_GRAPH,
  getPrerequisites,
  matchKnowledgeNodes,
  getGradeRank,
  formatGradeLabel,
  findTopicByKeyword,
  findTopicsByKeyword,
  tracePrerequisiteChain,
  getKnowledgeGraphStats,
  dependencyInfoMap,
  normalizeSubject
} = require('../server/services/knowledgeGraph');
const { createApp } = require('../server/app');

test('Knowledge Graph Engine — Massive Scale & Taxonomy Ingestion', () => {
  const stats = getKnowledgeGraphStats();
  assert.ok(stats.totalTopics >= 2804, `Should have ingested at least 2804 topics, got ${stats.totalTopics}`);
  assert.ok(stats.totalDependencies >= 4200, `Should have loaded at least 4200 dependencies, got ${stats.totalDependencies}`);
  assert.ok(Object.keys(dependencyInfoMap).length >= 4200, `dependencyInfoMap must have at least 4200 edges`);

  // Verify all topics in graph have required fields
  const sampleTopic = KNOWLEDGE_GRAPH['cnm_p001'];
  assert.ok(sampleTopic, 'cnm_p001 must exist');
  assert.strictEqual(sampleTopic.name, '1到5各数的认识');
  assert.strictEqual(sampleTopic.grade, 1);
  assert.ok(sampleTopic.diagnostic_question, 'Should have diagnostic question');
  assert.strictEqual(sampleTopic.diagnostic_question.answer, '4');
});

test('Knowledge Graph Engine — K-12 Multi-Grade & Multi-Subject Coverage', () => {
  const allNodes = Object.values(KNOWLEDGE_GRAPH);

  // 1. Verify coverage for every single grade from Grade 1 to Grade 12
  for (let g = 1; g <= 12; g++) {
    const nodesInGrade = allNodes.filter(n => {
      if (typeof n.grade === 'number') return n.grade === g;
      const rank = getGradeRank(n.grade);
      if (g <= 6) return rank === g * 10;
      if (g === 7) return rank >= 70 && rank <= 72;
      if (g === 8) return rank >= 80 && rank <= 82;
      if (g === 9) return rank >= 90 && rank <= 92;
      if (g === 10) return rank === 100;
      if (g === 11) return rank === 110;
      if (g === 12) return rank === 120;
      return false;
    });
    assert.ok(nodesInGrade.length > 0, `Grade ${g} must contain curriculum topics, found ${nodesInGrade.length}`);
  }

  // 2. Verify all 6 subjects are present
  const subjects = new Set(allNodes.map(n => n.subject).filter(Boolean));
  assert.ok(subjects.has('数学'), 'Must have 数学 topics');
  assert.ok(subjects.has('物理'), 'Must have 物理 topics');
  assert.ok(subjects.has('英语'), 'Must have 英语 topics');
  assert.ok(subjects.has('语文'), 'Must have 语文 topics');
  assert.ok(subjects.has('科学'), 'Must have 科学 topics');
  assert.ok(subjects.has('道德与法治'), 'Must have 道德与法治 topics');
});

test('Knowledge Graph Engine — Fuzzy Keyword & Attribute Search', () => {
  // Exact ID
  const topicById = findTopicByKeyword('cnm_229');
  assert.ok(topicById);
  assert.strictEqual(topicById.id, 'cnm_229');
  assert.strictEqual(topicById.name, '二次函数的概念');

  // Exact Name
  const topicByName = findTopicByKeyword('二次函数的概念');
  assert.ok(topicByName);
  assert.strictEqual(topicByName.id, 'cnm_229');

  // Fuzzy Name Match
  const topicFuzzy = findTopicByKeyword('二次函数');
  assert.ok(topicFuzzy);
  assert.ok(topicFuzzy.name.includes('二次函数'));

  // Multi-subject lookup
  const englishTopic = findTopicByKeyword('英语字母表', null, 'english');
  assert.ok(englishTopic);
  assert.strictEqual(englishTopic.subject, '英语');

  const physicsTopic = findTopicByKeyword('浮力', null, '物理');
  assert.ok(physicsTopic);
  assert.strictEqual(physicsTopic.subject, '物理');

  const chineseTopic = findTopicByKeyword('识字：天地人', null, '语文');
  assert.ok(chineseTopic);
  assert.strictEqual(chineseTopic.subject, '语文');

  // Multi results search
  const candidates = findTopicsByKeyword('函数', { limit: 5 });
  assert.ok(candidates.length >= 1 && candidates.length <= 5);
  for (const c of candidates) {
    assert.ok(c.name.includes('函数') || c.domain?.includes('函数') || c.chapter?.includes('函数'));
  }
});

test('Knowledge Graph Engine — Recursive Upstream Prerequisite Chain Tracing', () => {
  // Trace Grade 9 二次函数的概念 (cnm_229)
  const chain = tracePrerequisiteChain('cnm_229', 5);
  assert.ok(chain.length >= 4, `Chain should trace back across grades, got ${chain.length} nodes`);

  // Target node
  const target = chain[0];
  assert.strictEqual(target.id, 'cnm_229');
  assert.strictEqual(target.isTarget, true);
  assert.strictEqual(target.isRoot, false);
  assert.strictEqual(target.step, 0);

  // Root node
  const root = chain[chain.length - 1];
  assert.strictEqual(root.isRoot, true);
  assert.strictEqual(root.isTarget, false);

  // Verify cross-grade lineage: from Grade 9 back to Grade 8, Grade 6, Grade 4 / 3
  const grades = chain.map(c => Number(c.grade) || (getGradeRank(c.grade) / 10));
  assert.ok(grades[0] >= 9, 'Target node must be Grade 9');
  assert.ok(grades[grades.length - 1] <= 4, `Root node must trace back to foundational grade (<=4), got Grade ${grades[grades.length - 1]}`);

  // Verify each node structure
  for (const item of chain) {
    assert.ok(item.id, 'Item must have id');
    assert.ok(item.name, 'Item must have name');
    assert.ok(item.gradeLabel, 'Item must have gradeLabel');
    assert.ok(Array.isArray(item.mastery_criteria), 'mastery_criteria must be array');
    if (item.step > 0) {
      assert.ok(item.reason, 'Prerequisite node must have dependency reason');
    }
  }

  // Verify diagnostic question present in chain
  const hasDiagnostic = chain.some(c => c.diagnostic_question && c.diagnostic_question.question);
  assert.ok(hasDiagnostic, 'Chain should contain at least one node with interactive diagnostic question');
});

test('Knowledge Graph Engine — Edge Cases & Resilience', () => {
  // Empty input returns empty chain
  assert.deepStrictEqual(tracePrerequisiteChain(''), []);
  assert.deepStrictEqual(tracePrerequisiteChain(null), []);

  // Non-existent ID returns empty chain
  assert.deepStrictEqual(tracePrerequisiteChain('non_existent_topic_id_404'), []);

  // Depth limiting: depth = 1 yields at most 2 nodes (target + 1 prereq)
  const shallowChain = tracePrerequisiteChain('cnm_229', 1);
  assert.ok(shallowChain.length <= 2, `Depth 1 should yield <= 2 nodes, got ${shallowChain.length}`);

  // Grade Rank helper handles numeric and string formats
  assert.strictEqual(getGradeRank(1), 10);
  assert.strictEqual(getGradeRank('1'), 10);
  assert.strictEqual(getGradeRank(7), 70);
  assert.strictEqual(getGradeRank('7_up'), 71);
  assert.strictEqual(getGradeRank('7_down'), 72);
  assert.strictEqual(getGradeRank(10), 100);
  assert.strictEqual(getGradeRank('高一'), 100);
  assert.strictEqual(getGradeRank(12), 120);

  // Grade label formatting
  assert.strictEqual(formatGradeLabel(1, '上'), '小学1年级上学期');
  assert.strictEqual(formatGradeLabel(9, '下'), '初中3年级(9年级)下学期');
  assert.strictEqual(formatGradeLabel(10, '上'), '高中1年级(10年级)上学期');
});

test('Knowledge Graph API — Endpoints End-to-End Verification', async () => {
  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /api/knowledge-graph/trace with topic_id
    const resId = await fetch(`${baseUrl}/api/knowledge-graph/trace?topic_id=cnm_229`);
    assert.strictEqual(resId.status, 200);
    const dataId = await resId.json();
    assert.strictEqual(dataId.success, true);
    assert.ok(dataId.target_topic);
    assert.strictEqual(dataId.target_topic.id, 'cnm_229');
    assert.ok(Array.isArray(dataId.chain));
    assert.ok(dataId.chain.length >= 3);

    // 2. GET /api/knowledge-graph/trace with keyword
    const resKw = await fetch(`${baseUrl}/api/knowledge-graph/trace?keyword=${encodeURIComponent('二次函数')}`);
    assert.strictEqual(resKw.status, 200);
    const dataKw = await resKw.json();
    assert.strictEqual(dataKw.success, true);
    assert.ok(dataKw.target_topic.name.includes('二次函数'));
    assert.ok(dataKw.chain.length >= 2);

    // 3. GET /api/knowledge-graph/search
    const resSearch = await fetch(`${baseUrl}/api/knowledge-graph/search?keyword=${encodeURIComponent('方程')}&limit=3`);
    assert.strictEqual(resSearch.status, 200);
    const dataSearch = await resSearch.json();
    assert.strictEqual(dataSearch.success, true);
    assert.ok(dataSearch.topics.length >= 1 && dataSearch.topics.length <= 3);

    // 4. GET /api/knowledge-graph/stats
    const resStats = await fetch(`${baseUrl}/api/knowledge-graph/stats`);
    assert.strictEqual(resStats.status, 200);
    const dataStats = await resStats.json();
    assert.strictEqual(dataStats.success, true);
    assert.ok(dataStats.totalTopics >= 2800);

    // 5. GET /api/knowledge-graph/trace missing parameters -> 400
    const resMissing = await fetch(`${baseUrl}/api/knowledge-graph/trace`);
    assert.strictEqual(resMissing.status, 400);

    // 6. GET /api/knowledge-graph/trace unknown topic -> 404
    const resUnknown = await fetch(`${baseUrl}/api/knowledge-graph/trace?topic_id=unknown_xyz_9999`);
    assert.strictEqual(resUnknown.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
