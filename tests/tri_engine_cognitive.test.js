const { test } = require('node:test');
const assert = require('node:assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const {
  KNOWLEDGE_GRAPH,
  getKnowledgeNodeWithVisuals,
  linkQueryToMultimodalConcepts,
  diagnosePrerequisiteKnowledge
} = require('../server/services/knowledgeGraph');

const {
  SOCRATIC_STAGES,
  determineSocraticStage,
  formatSocraticSystemPrompt
} = require('../server/services/socraticScaffolding');

const {
  recordCognitiveEvent,
  getCognitiveState,
  getCognitiveSummary,
  formatCognitivePromptSection
} = require('../server/services/cognitiveState');

const { coordinateTriEngine } = require('../server/services/triEngineCoordinator');

// Setup helper for in-memory SQLite database
async function createTestDb() {
  const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS cognitive_knowledge_state (
      profile_id TEXT NOT NULL,
      concept_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      mastery_score REAL DEFAULT 0.5,
      confidence REAL DEFAULT 0.5,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      last_assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (profile_id, concept_id)
    );

    CREATE TABLE IF NOT EXISTS cognitive_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      concept_id TEXT NOT NULL,
      session_id TEXT,
      event_type TEXT NOT NULL,
      scaffold_stage TEXT,
      is_success INTEGER DEFAULT 0,
      error_type TEXT,
      notes TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

test('Item 3: Multimodal Knowledge DAG & Visual Anchors', () => {
  // 1. Verify visual anchors exist on core geometric nodes
  const pythagoreanNode = KNOWLEDGE_GRAPH['math_pythagorean'];
  assert.ok(pythagoreanNode.visualAnchor, 'Pythagorean node must have visualAnchor');
  assert.match(pythagoreanNode.visualAnchor, /赵爽弦图/);

  const congruentNode = KNOWLEDGE_GRAPH['math_congruent_triangles'];
  assert.ok(congruentNode.visualAnchor, 'Congruent triangles node must have visualAnchor');
  assert.match(congruentNode.visualAnchor, /倍长中线/);

  // 2. Test getKnowledgeNodeWithVisuals
  const nodeWithVisuals = getKnowledgeNodeWithVisuals('math_pythagorean');
  assert.strictEqual(nodeWithVisuals.id, 'math_pythagorean');
  assert.ok(nodeWithVisuals.visuals.length >= 2, 'Should aggregate visual anchors from self and prerequisites');

  // 3. Test linkQueryToMultimodalConcepts
  const matches = linkQueryToMultimodalConcepts('全等三角形SSS判定怎么做', '数学');
  assert.ok(matches.length > 0, 'Should match multimodal concepts from query');
  assert.strictEqual(matches[0].id, 'math_congruent_triangles');
});

test('Item 2: Socratic Scaffolding State Machine & Direct Answer Gate', () => {
  // Turn 1 -> Discovery
  const stage1 = determineSocraticStage({ turnCount: 1, userMessage: '这道勾股定理题我毫无头绪' });
  assert.strictEqual(stage1, SOCRATIC_STAGES.DISCOVERY);

  // Turn 2 -> Scaffolding
  const stage2 = determineSocraticStage({ turnCount: 2, userMessage: '已知直角边是3和4，然后呢？' });
  assert.strictEqual(stage2, SOCRATIC_STAGES.SCAFFOLDING);

  // Turn 3 -> Consolidation
  const stage3 = determineSocraticStage({ turnCount: 3, userMessage: '算出来了斜边等于5！' });
  assert.strictEqual(stage3, SOCRATIC_STAGES.CONSOLIDATION);

  // Immediate answer attempt trigger -> Consolidation
  const stageAttempt = determineSocraticStage({ turnCount: 1, userMessage: '老师我算出来 x = 5 对不对？' });
  assert.strictEqual(stageAttempt, SOCRATIC_STAGES.CONSOLIDATION);

  // Verify formatted system prompt
  const diag = diagnosePrerequisiteKnowledge('因式分解配方法', '数学');
  const promptLevel1 = formatSocraticSystemPrompt(SOCRATIC_STAGES.DISCOVERY, diag);
  assert.match(promptLevel1, /严禁在单次回复中一股脑倾倒整道题目的最终计算结果/);
  assert.match(promptLevel1, /阶段一 · 审题破雾与已知量探针/);

  const promptLevel2 = formatSocraticSystemPrompt(SOCRATIC_STAGES.SCAFFOLDING, diag);
  assert.match(promptLevel2, /阶段二 · 前置卡点脚手架与破局灵感/);
});

test('Item 1: L1-L3 Three-Layer Cognitive Evolution Memory Engine', async () => {
  const db = await createTestDb();

  // 1. Record failure event for math_pythagorean
  const failEvt = await recordCognitiveEvent(db, {
    profileId: 'test_student',
    conceptId: 'math_pythagorean',
    eventType: 'attempt',
    scaffoldStage: SOCRATIC_STAGES.DISCOVERY,
    isSuccess: false,
    errorType: 'concept_gap',
    notes: '未分类讨论斜边'
  });

  assert.ok(failEvt.eventId > 0);
  assert.strictEqual(failEvt.newMastery, 0.3); // 0.5 - 0.20 = 0.3
  assert.strictEqual(failEvt.status, 'gapped');

  // 2. Verify summary reflects weakness
  const summary1 = await getCognitiveSummary(db, 'test_student', '数学');
  assert.ok(summary1.weakPoints.some(w => w.id === 'math_pythagorean'));

  // 3. Record success event after scaffolding
  const succEvt = await recordCognitiveEvent(db, {
    profileId: 'test_student',
    conceptId: 'math_pythagorean',
    eventType: 'mastery_pass',
    scaffoldStage: SOCRATIC_STAGES.CONSOLIDATION,
    isSuccess: true,
    notes: '学生成功完成分类讨论'
  });

  assert.strictEqual(succEvt.newMastery, 0.45); // 0.3 + 0.15 = 0.45
  assert.strictEqual(succEvt.status, 'unstable');

  // 4. Test formatCognitivePromptSection
  const promptSec = await formatCognitivePromptSection(db, 'test_student', '数学', 'math_pythagorean');
  assert.match(promptSec, /学生 L3 认知演进长期记忆图谱/);
  assert.match(promptSec, /勾股定理及其逆定理/);

  await db.close();
});

test('Tri-Engine Coordinator — End-to-End Synergy Loop', async () => {
  const db = await createTestDb();

  // Test question on quadratic equation
  const result = await coordinateTriEngine({
    db,
    query: '老师，解一元二次方程 x^2 - 4x + 3 = 0 我不会',
    profileId: 'zeng_student',
    subject: '数学',
    turnCount: 1
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.socraticStage, SOCRATIC_STAGES.DISCOVERY);
  assert.strictEqual(result.matchedConceptId, 'math_quadratic_equation');
  assert.ok(result.diagnosis.hasPrerequisites);

  // Check combined prompt structure
  const combined = result.prompts.compositeSystemPrompt;
  assert.match(combined, /苏格拉底阶梯阻断器/);
  assert.match(combined, /知识图谱跨学期根因穿透/);
  assert.match(combined, /学生 L3 认知演进长期记忆图谱/);

  // Simulate learning turn outcome
  const outcome = await result.recordOutcome({
    isSuccess: true,
    notes: '通过因式分解成功求解'
  });

  assert.ok(outcome.eventId > 0);
  assert.strictEqual(outcome.conceptId, 'math_quadratic_equation');
  assert.strictEqual(outcome.newMastery, 0.65); // 0.5 + 0.15

  await db.close();
});
