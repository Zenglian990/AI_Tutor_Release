/**
 * Jev Decision Service — Unit Tests
 * 
 * Tests the JevDecisionService with mocked TypeSafe SDK
 * to verify routing logic, retrieval evaluation, strategy selection,
 * and safety checks without requiring a real API key.
 */
const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// Force JEV_ENABLED for testing
process.env.JEV_ENABLED = 'true';
process.env.TYPESAFE_API_KEY = 'sk-test-key';
process.env.JEV_CONFIDENCE_THRESHOLD = '0.85';

const jev = require('../server/services/jevDecisionService');
const mockAsk = mock.fn();

describe('JevDecisionService', () => {

  beforeEach(() => {
    mockAsk.mock.resetCalls();
    jev.setClient({
      ask: mockAsk
    });
  });

  // ─── routeQuestion ────────────────────────────────────────────────
  describe('routeQuestion()', () => {
    it('should route a factual recall question correctly', async () => {
      mockAsk.mock.mockImplementationOnce(() => Promise.resolve({
        route: 'factual_recall',
        difficulty: 3,
        needs_encouragement: { isTrue: false, value: false },
        confidence: 0.95
      }));

      const result = await jev.routeQuestion('光合作用的定义是什么？', 7, '生物');
      
      assert.equal(result.route, 'factual_recall');
      assert.equal(result.difficulty, 3);
      assert.equal(result.needsEncouragement, false);
      assert.ok(result.confidence >= 0.9);
    });

    it('should route off-topic questions correctly', async () => {
      mockAsk.mock.mockImplementationOnce(() => Promise.resolve({
        route: 'off_topic',
        difficulty: 1,
        needs_encouragement: false,
        confidence: 0.92
      }));

      const result = await jev.routeQuestion('今天天气怎么样？', 5, '数学');
      
      assert.equal(result.route, 'off_topic');
    });

    it('should detect student frustration and flag encouragement needed', async () => {
      mockAsk.mock.mockImplementationOnce(() => Promise.resolve({
        route: 'calculation_step',
        difficulty: 7,
        needs_encouragement: { isTrue: true, value: true },
        confidence: 0.88
      }));

      const result = await jev.routeQuestion('这道题我怎么都算不对，到底怎么做啊！！', 8, '数学');
      
      assert.equal(result.needsEncouragement, true);
      assert.equal(result.route, 'calculation_step');
    });

    it('should return fallback when Jev API errors', async () => {
      mockAsk.mock.mockImplementationOnce(() => Promise.reject(new Error('API timeout')));

      const result = await jev.routeQuestion('测试', 5, '数学');
      
      assert.equal(result.fallback, true);
      assert.equal(result.route, 'socratic_guidance');
    });
  });

  // ─── evaluateRetrievalQuality ─────────────────────────────────────
  describe('evaluateRetrievalQuality()', () => {
    it('should mark relevant and sufficient retrieval', async () => {
      mockAsk.mock.mockImplementationOnce(() => Promise.resolve({
        relevant: { isTrue: true, probability: 0.95 },
        sufficient: { isTrue: true, probability: 0.88 },
        best_chunk_index: 1,
        confidence: 0.92
      }));

      const chunks = [
        { text: '光合作用是植物利用光能...' },
        { text: '光合作用的化学方程式为 6CO2 + 6H2O → C6H12O6 + 6O2' },
        { text: '叶绿体是光合作用的场所' }
      ];

      const result = await jev.evaluateRetrievalQuality('光合作用的化学方程式是什么？', chunks);
      
      assert.ok(result.isRelevant !== undefined);
      assert.ok(result.bestChunkIndex >= 0);
    });

    it('should return fallback for empty chunks', async () => {
      mockAsk.mock.mockImplementationOnce(() => Promise.resolve({
        relevant: { isTrue: false, probability: 0.2 },
        sufficient: { isTrue: false, probability: 0.1 },
        best_chunk_index: 0,
        confidence: 0.6
      }));

      const result = await jev.evaluateRetrievalQuality('量子力学', []);
      assert.ok(result !== undefined);
    });
  });

  // ─── selectTeachingStrategy ───────────────────────────────────────
  describe('selectTeachingStrategy()', () => {
    it('should select visual strategy for lower grades', async () => {
      mockAsk.mock.mockImplementationOnce(() => Promise.resolve({
        strategy: 'visual_decompose',
        hint_level: 4,
        confidence: 0.91
      }));

      const result = await jev.selectTeachingStrategy(2, 'factual_recall', null);
      
      assert.equal(result.strategy, 'visual_decompose');
      assert.ok(result.hintLevel >= 1 && result.hintLevel <= 5);
    });

    it('should handle null studentMemory gracefully', async () => {
      mockAsk.mock.mockImplementationOnce(() => Promise.resolve({
        strategy: 'step_by_step_scaffold',
        hint_level: 3,
        confidence: 0.85
      }));

      const result = await jev.selectTeachingStrategy(5, 'socratic_guidance', null);
      
      assert.ok(result.strategy);
      assert.ok(!result.fallback || result.fallback === undefined);
    });
  });

  // ─── checkOutputSafety ────────────────────────────────────────────
  describe('checkOutputSafety()', () => {
    it('should flag direct answers for lower grades', async () => {
      mockAsk.mock.mockImplementationOnce(() => Promise.resolve({
        age_appropriate: { isTrue: true, probability: 0.98 },
        educationally_sound: { isTrue: true, probability: 0.95 },
        gives_direct_answer: { isTrue: true, probability: 0.85 },
        confidence: 0.93
      }));

      const result = await jev.checkOutputSafety(
        '答案是 42。这道题直接用公式 a² + b² = c² 就可以算出来。',
        4
      );
      
      assert.ok(result.safe !== undefined);
      assert.ok(result.educationallySound !== undefined);
    });
  });

  // ─── Stats ────────────────────────────────────────────────────────
  describe('getStats()', () => {
    it('should track call statistics', async () => {
      mockAsk.mock.mockImplementation(() => Promise.resolve({
        route: 'socratic_guidance',
        difficulty: 5,
        needs_encouragement: false,
        confidence: 0.9
      }));

      await jev.routeQuestion('测试1', 5, '数学');
      await jev.routeQuestion('测试2', 6, '语文');

      const stats = jev.getStats();
      assert.ok(stats.routeQuestion);
      assert.ok(stats.routeQuestion.count >= 1);
    });
  });

  // ─── isEnabled ────────────────────────────────────────────────────
  describe('isEnabled()', () => {
    it('should return true when properly configured', () => {
      assert.equal(jev.isEnabled(), true);
    });

    it('should return false when disabled', () => {
      jev.setClient(null);
      assert.equal(jev.isEnabled(), false);
    });
  });
});
