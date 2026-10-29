const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  ExactFraction,
  simplifyRadical,
  solveQuadratic,
  factorizeQuadratic,
  areAlgebraicallyEquivalent,
  verifyAndEnrichMathExplanation
} = require('../server/utils/mathCAS');

describe('MathCAS Neuro-Symbolic Engine (CAS & TIR)', () => {

  it('ExactFraction: correctly simplifies, adds, multiplies, and formats LaTeX', () => {
    const f1 = new ExactFraction(2, 4);
    assert.strictEqual(f1.n, 1);
    assert.strictEqual(f1.d, 2);
    assert.strictEqual(f1.toString(), '1/2');
    assert.strictEqual(f1.toLaTeX(), '\\frac{1}{2}');

    const f2 = new ExactFraction(1, 3);
    const sum = f1.add(f2);
    assert.strictEqual(sum.toString(), '5/6');

    const diff = f1.sub(f2);
    assert.strictEqual(diff.toString(), '1/6');

    const prod = f1.mul(f2);
    assert.strictEqual(prod.toString(), '1/6');

    const div = f1.div(f2);
    assert.strictEqual(div.toString(), '3/2');
  });

  it('simplifyRadical: simplifies square roots exactly without floating point drift', () => {
    const r18 = simplifyRadical(18);
    assert.strictEqual(r18.coef, 3);
    assert.strictEqual(r18.inside, 2);
    assert.strictEqual(r18.text, '3√2');
    assert.strictEqual(r18.latex, '3\\sqrt{2}');

    const r72 = simplifyRadical(72);
    assert.strictEqual(r72.coef, 6);
    assert.strictEqual(r72.inside, 2);
    assert.strictEqual(r72.text, '6√2');

    const r16 = simplifyRadical(16);
    assert.strictEqual(r16.coef, 4);
    assert.strictEqual(r16.inside, 1);
    assert.strictEqual(r16.text, '4');
  });

  it('solveQuadratic: solves rational and radical quadratic equations', () => {
    // x^2 - 5x + 6 = 0 -> x = 3, x = 2
    const sol1 = solveQuadratic(1, -5, 6);
    assert.strictEqual(sol1.type, 'two_distinct_real_roots');
    assert.strictEqual(sol1.discriminant, 1);
    assert.strictEqual(sol1.roots[0].exact.toString(), '3');
    assert.strictEqual(sol1.roots[1].exact.toString(), '2');

    // x^2 - 2 = 0 -> x = ±√2
    const sol2 = solveQuadratic(1, 0, -2);
    assert.strictEqual(sol2.type, 'two_distinct_real_roots');
    assert.strictEqual(sol2.discriminant, 8);
    assert.strictEqual(sol2.roots[0].isRational, false);

    // x^2 + 1 = 0 -> no real roots
    const sol3 = solveQuadratic(1, 0, 1);
    assert.strictEqual(sol3.type, 'no_real_roots');
    assert.strictEqual(sol3.discriminant, -4);
  });

  it('factorizeQuadratic: factorizes factorable polynomials in Q', () => {
    const f1 = factorizeQuadratic(1, -5, 6);
    assert.strictEqual(f1.factorableInQ, true);
    assert.ok(f1.factoredLatex.includes('(x - 3)(x - 2)') || f1.factoredLatex.includes('(x - 2)(x - 3)'));

    const f2 = factorizeQuadratic(1, -4, 4);
    assert.strictEqual(f2.factorableInQ, true);
    assert.strictEqual(f2.factoredLatex, '(x - 2)^2');
  });

  it('areAlgebraicallyEquivalent: verifies step equivalence via Schwartz-Zippel Lemma', () => {
    // (x + 1)^2 == x^2 + 2x + 1
    assert.strictEqual(areAlgebraicallyEquivalent('(x + 1)^2', 'x^2 + 2x + 1'), true);

    // (x - 2)(x + 2) == x^2 - 4
    assert.strictEqual(areAlgebraicallyEquivalent('(x - 2)*(x + 2)', 'x^2 - 4'), true);

    // False equivalence
    assert.strictEqual(areAlgebraicallyEquivalent('x + 1', 'x + 2'), false);
  });

  it('verifyAndEnrichMathExplanation: automatically injects CAS verification badges', () => {
    const rawText = '我们可以列出一元二次方程：x^2 - 5x + 6 = 0，从而求出未知数。';
    const enriched = verifyAndEnrichMathExplanation(rawText);
    assert.ok(enriched.includes('神经符号 CAS 引擎已核实 100% 精确'));
    assert.ok(enriched.includes('判别式 $\\Delta = 1$'));
    assert.ok(enriched.includes('x_{1} = 3'));
    assert.ok(enriched.includes('x_{2} = 2'));
  });

});
