const { test } = require('node:test');
const assert = require('node:assert');
const {
  KNOWLEDGE_GRAPH,
  getPrerequisites,
  matchKnowledgeNodes,
  diagnosePrerequisiteKnowledge,
  formatGraphRAGPromptSection
} = require('../server/services/knowledgeGraph');

test('Knowledge Graph — topology integrity & no self-cycles', () => {
  assert.ok(Object.keys(KNOWLEDGE_GRAPH).length >= 15, 'Should define comprehensive K-9 topics');

  for (const [nodeId, node] of Object.entries(KNOWLEDGE_GRAPH)) {
    assert.strictEqual(node.id, nodeId);
    assert.ok(node.name, 'Node must have name');
    assert.ok(node.subject, 'Node must have subject');
    assert.ok(Array.isArray(node.prerequisites), 'Prerequisites must be array');
    assert.ok(!node.prerequisites.includes(nodeId), 'Node cannot depend on itself');

    // Verify all prerequisites exist in graph
    for (const preId of node.prerequisites) {
      assert.ok(KNOWLEDGE_GRAPH[preId], `Prerequisite ${preId} must exist in KNOWLEDGE_GRAPH`);
    }
  }
});

test('Knowledge Graph — getPrerequisites recursive tracing', () => {
  // 因式分解 (8_up) -> 整式乘法 (7_down) -> 整式加减 (7_up)
  const prereqs = getPrerequisites('math_factorization', 2);
  assert.ok(prereqs.length >= 1, 'Should find prerequisites for factorization');
  assert.strictEqual(prereqs[0].id, 'math_polynomial_multiplication');

  // 勾股定理 (8_down) -> 二次根式 & 全等三角形
  const pythagoreanPrereqs = getPrerequisites('math_pythagorean', 2);
  const ids = pythagoreanPrereqs.map(p => p.id);
  assert.ok(ids.includes('math_square_root'), 'Pythagorean must depend on square root');
  assert.ok(ids.includes('math_congruent_triangles'), 'Pythagorean must depend on congruent triangles');
});

test('Knowledge Graph — matchKnowledgeNodes by query keywords', () => {
  const matched = matchKnowledgeNodes('老师，这道因式分解题十字相乘我不会做', '数学');
  assert.ok(matched.length >= 1);
  assert.strictEqual(matched[0].id, 'math_factorization');

  const physicsMatched = matchKnowledgeNodes('浮力与阿基米德原理的公式是什么', '物理');
  assert.ok(physicsMatched.length >= 1);
  assert.strictEqual(physicsMatched[0].id, 'phys_buoyancy');
});

test('Knowledge Graph — diagnosePrerequisiteKnowledge & formatGraphRAGPromptSection', () => {
  const diagnosis = diagnosePrerequisiteKnowledge('求二次函数抛物线顶点坐标和极值', '数学', []);
  assert.ok(diagnosis);
  assert.strictEqual(diagnosis.hasPrerequisites, true);
  assert.strictEqual(diagnosis.currentTopic.id, 'math_quadratic_function');
  assert.ok(diagnosis.rootCauseNode);

  const promptSection = formatGraphRAGPromptSection(diagnosis);
  assert.ok(promptSection.includes('【🔗 知识图谱跨学期根因穿透（GraphRAG）】'));
  assert.ok(promptSection.includes('二次函数'));
});
