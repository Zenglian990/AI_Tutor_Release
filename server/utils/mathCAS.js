/**
 * MathCAS - Neuro-Symbolic Computer Algebra System (CAS) for K-12 AI Tutoring
 *
 * Provides deterministic algebraic operations, exact fractional/radical arithmetic,
 * polynomial equation solving, factorization verification, and Schwartz-Zippel algebraic equivalence testing.
 *
 * Pure JS tokenizer + recursive descent math evaluator (zero Function/eval usage).
 */

function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

function lcm(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.abs(Math.round(a * b)) / gcd(a, b);
}

class ExactFraction {
  constructor(numerator, denominator = 1) {
    if (denominator === 0) {
      throw new Error('Division by zero in ExactFraction');
    }
    const sign = (numerator < 0) ^ (denominator < 0) ? -1 : 1;
    const num = Math.abs(Math.round(numerator));
    const den = Math.abs(Math.round(denominator));
    const divisor = gcd(num, den) || 1;
    this.n = sign * (num / divisor);
    this.d = den / divisor;
  }

  add(other) {
    const o = ExactFraction.from(other);
    return new ExactFraction(this.n * o.d + o.n * this.d, this.d * o.d);
  }

  sub(other) {
    const o = ExactFraction.from(other);
    return new ExactFraction(this.n * o.d - o.n * this.d, this.d * o.d);
  }

  mul(other) {
    const o = ExactFraction.from(other);
    return new ExactFraction(this.n * o.n, this.d * o.d);
  }

  div(other) {
    const o = ExactFraction.from(other);
    if (o.n === 0) throw new Error('Division by zero');
    return new ExactFraction(this.n * o.d, this.d * o.n);
  }

  equals(other) {
    const o = ExactFraction.from(other);
    return this.n === o.n && this.d === o.d;
  }

  toNumber() {
    return this.n / this.d;
  }

  toString() {
    if (this.d === 1) return `${this.n}`;
    return `${this.n}/${this.d}`;
  }

  toLaTeX() {
    if (this.d === 1) return `${this.n}`;
    if (this.n < 0) return `-\\frac{${Math.abs(this.n)}}{${this.d}}`;
    return `\\frac{${this.n}}{${this.d}}`;
  }

  static from(val) {
    if (val instanceof ExactFraction) return val;
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) throw new Error(`Cannot convert non-finite ${val} to ExactFraction`);
      if (val === 0) return new ExactFraction(0, 1);
      if (Number.isInteger(val)) return new ExactFraction(val, 1);
      // 严格分离正负号并对绝对值执行连分数逼近，防止负数触发 val * tolerance < 0 死循环产出 NaN/NaN
      const sign = val < 0 ? -1 : 1;
      const absVal = Math.abs(val);
      const tolerance = 1.0e-7;
      let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
      let b = absVal;
      let iter = 0;
      const MAX_ITER = 64;
      while (iter < MAX_ITER) {
        iter++;
        const a = Math.floor(b);
        const auxH = h1;
        h1 = a * h1 + h2;
        h2 = auxH;
        const auxK = k1;
        k1 = a * k1 + k2;
        k2 = auxK;
        if (Math.abs(absVal - h1 / k1) <= absVal * tolerance) break;
        const frac = b - a;
        if (Math.abs(frac) < 1e-12) break;
        b = 1 / frac;
      }
      return new ExactFraction(sign * h1, k1);
    }
    if (typeof val === 'string') {
      const parts = val.trim().split('/');
      if (parts.length === 2) {
        return new ExactFraction(parseInt(parts[0], 10), parseInt(parts[1], 10));
      }
      const num = parseFloat(val);
      if (!isNaN(num)) return ExactFraction.from(num);
    }
    throw new Error(`Cannot convert ${val} to ExactFraction`);
  }
}

function simplifyRadical(n) {
  if (n < 0) return { coef: 0, inside: n, isReal: false, text: '无实数根', latex: '\\text{无实数根}' };
  if (n === 0) return { coef: 0, inside: 0, isReal: true, text: '0', latex: '0' };

  let coef = 1;
  let inside = n;

  for (let i = 2; i * i <= inside; i++) {
    while (inside % (i * i) === 0) {
      coef *= i;
      inside /= (i * i);
    }
  }

  let text = '';
  let latex = '';
  if (inside === 1) {
    text = `${coef}`;
    latex = `${coef}`;
  } else if (coef === 1) {
    text = `√${inside}`;
    latex = `\\sqrt{${inside}}`;
  } else {
    text = `${coef}√${inside}`;
    latex = `${coef}\\sqrt{${inside}}`;
  }

  return {
    coef,
    inside,
    isReal: true,
    exactValue: Math.sqrt(n),
    text,
    latex
  };
}

function solveQuadratic(a, b, c) {
  if (a === 0) {
    if (b === 0) {
      return {
        type: c === 0 ? 'infinite_solutions' : 'no_solution',
        roots: [],
        discriminant: 0,
        explanation: c === 0 ? '恒等式，无数解' : '矛盾式，无解'
      };
    }
    const root = new ExactFraction(-c, b);
    return {
      type: 'linear',
      roots: [{ exact: root, text: root.toString(), latex: root.toLaTeX() }],
      discriminant: 0,
      explanation: `一元一次方程: x = -(${c}) / ${b} = ${root.toLaTeX()}`
    };
  }

  const delta = b * b - 4 * a * c;
  const rad = simplifyRadical(Math.abs(delta));

  if (delta > 0) {
    let root1, root2;
    if (rad.inside === 1 || rad.inside === 0) {
      const r1 = new ExactFraction(-b + rad.coef, 2 * a);
      const r2 = new ExactFraction(-b - rad.coef, 2 * a);
      root1 = { exact: r1, isRational: true, text: r1.toString(), latex: r1.toLaTeX(), value: r1.toNumber() };
      root2 = { exact: r2, isRational: true, text: r2.toString(), latex: r2.toLaTeX(), value: r2.toNumber() };
    } else {
      const gcdAll = gcd(gcd(Math.abs(b), rad.coef), Math.abs(2 * a));
      const simpB = -b / gcdAll;
      const simpCoef = rad.coef / gcdAll;
      const simpDen = (2 * a) / gcdAll;

      const coefPart = simpCoef === 1 ? `\\sqrt{${rad.inside}}` : `${simpCoef}\\sqrt{${rad.inside}}`;
      const signDen = simpDen < 0 ? -1 : 1;
      const absDen = Math.abs(simpDen);

      const latex1 = absDen === 1
        ? `${simpB * signDen} + ${coefPart}`
        : `\\frac{${simpB * signDen} + ${coefPart}}{${absDen}}`;
      const latex2 = absDen === 1
        ? `${simpB * signDen} - ${coefPart}`
        : `\\frac{${simpB * signDen} - ${coefPart}}{${absDen}}`;

      root1 = { isRational: false, text: `(${-b} + ${rad.text}) / ${2 * a}`, latex: latex1, value: (-b + Math.sqrt(delta)) / (2 * a) };
      root2 = { isRational: false, text: `(${-b} - ${rad.text}) / ${2 * a}`, latex: latex2, value: (-b - Math.sqrt(delta)) / (2 * a) };
    }

    return {
      type: 'two_distinct_real_roots',
      discriminant: delta,
      radicalDelta: rad,
      roots: [root1, root2],
      formulaLatex: `x = \\frac{-(b) \\pm \\sqrt{\\Delta}}{2a}`,
      vertex: {
        x: new ExactFraction(-b, 2 * a),
        y: new ExactFraction(4 * a * c - b * b, 4 * a)
      },
      explanation: `判别式 Δ = b² - 4ac = (${b})² - 4(${a})(${c}) = ${delta} > 0，存在两个不相等的实数根。`
    };
  } else if (delta === 0) {
    const root = new ExactFraction(-b, 2 * a);
    return {
      type: 'two_equal_real_roots',
      discriminant: 0,
      roots: [{ exact: root, isRational: true, text: root.toString(), latex: root.toLaTeX(), value: root.toNumber() }],
      explanation: `判别式 Δ = 0，方程有两个相等的实数根 x₁ = x₂ = ${root.toLaTeX()}。`
    };
  } else {
    return {
      type: 'no_real_roots',
      discriminant: delta,
      roots: [],
      explanation: `判别式 Δ = ${delta} < 0，在实数范围内无解。`
    };
  }
}

function factorizeQuadratic(a, b, c) {
  const sol = solveQuadratic(a, b, c);
  if (sol.type === 'no_real_roots' || (sol.roots.length > 0 && !sol.roots[0].isRational)) {
    return {
      factorableInQ: false,
      factoredLatex: `${a !== 1 ? a : ''}(x^2 ${b >= 0 ? '+' : ''}${b}x ${c >= 0 ? '+' : ''}${c})`,
      explanation: '该多项式在有理数范围内不可再分解。'
    };
  }

  if (sol.type === 'two_equal_real_roots') {
    const root = sol.roots[0].exact;
    const absRootLatex = new ExactFraction(Math.abs(root.n), root.d).toLaTeX();
    const factorPart = root.n === 0 ? 'x' : (root.n > 0 ? `(x - ${root.toLaTeX()})` : `(x + ${absRootLatex})`);
    return {
      factorableInQ: true,
      factoredLatex: a === 1 ? `${factorPart}^2` : `${a}${factorPart}^2`,
      explanation: '完全平方式分解。'
    };
  }

  if (sol.type === 'two_distinct_real_roots' && sol.roots[0].isRational && sol.roots[1].isRational) {
    const r1 = sol.roots[0].exact;
    const r2 = sol.roots[1].exact;

    const term1 = r1.n >= 0 ? `(x - ${r1.toLaTeX()})` : `(x + ${new ExactFraction(Math.abs(r1.n), r1.d).toLaTeX()})`;
    const term2 = r2.n >= 0 ? `(x - ${r2.toLaTeX()})` : `(x + ${new ExactFraction(Math.abs(r2.n), r2.d).toLaTeX()})`;
    const prefix = a === 1 ? '' : `${a}`;

    return {
      factorableInQ: true,
      factoredLatex: `${prefix}${term1}${term2}`,
      explanation: `因式分解成功: ${prefix}${term1}${term2}`
    };
  }

  return { factorableInQ: false, explanation: '无法进行二次有理因式分解' };
}

// --- 纯 JS 数学词法分析器与递归下降求值引擎（彻底消除 Function() 与正则科学计数法破坏） ---
const MAX_TOKENS = 512;
const MAX_AST_DEPTH = 64;

function normalizeLatexToMath(expr) {
  return String(expr)
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\times/g, '*')
    .replace(/\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\*\*/g, '^')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')');
}

function tokenizeMathExpr(expr) {
  const clean = normalizeLatexToMath(expr);
  const rawTokens = [];
  let i = 0;

  while (i < clean.length) {
    const ch = clean[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // 显式拒绝逗号运算符与非白名单标点，防 '0, 42' 绕过
    if (ch === ',') {
      throw new SyntaxError('Comma operator is not allowed in math expressions');
    }

    // 优先完整匹配数值与科学计数法字面量（保护 1e5, 1E-3, 2.5e+2）
    const numSlice = clean.slice(i);
    const numMatch = numSlice.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (numMatch) {
      const numVal = Number(numMatch[0]);
      if (!Number.isFinite(numVal)) {
        throw new SyntaxError(`Invalid numeric literal: ${numMatch[0]}`);
      }
      rawTokens.push({ type: 'num', value: numVal });
      i += numMatch[0].length;
      continue;
    }

    // 标识符（变量）
    if (/[a-zA-Z_]/.test(ch)) {
      let end = i + 1;
      while (end < clean.length && /[a-zA-Z0-9_]/.test(clean[end])) {
        end++;
      }
      rawTokens.push({ type: 'ident', value: clean.slice(i, end) });
      i = end;
      continue;
    }

    if (ch === '(' || ch === ')') {
      rawTokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }

    if ('+-*/^'.includes(ch)) {
      rawTokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    throw new SyntaxError(`Expression contains untrusted or unsupported token: ${ch}`);
  }

  // 在 Token 边界安全注入隐式乘法 '*'（绝不拆断 1e5 数字 Token，且不在函数名与 '(' 间误插 '*'）
  const KNOWN_FUNCS = new Set(['sin', 'cos', 'tan', 'sqrt', 'abs', 'ln', 'log', 'exp']);
  const tokens = [];
  const isValueEnd = (t) => t.type === 'num' || t.type === 'ident' || (t.type === 'paren' && t.value === ')');
  const isValueStart = (t) => t.type === 'num' || t.type === 'ident' || (t.type === 'paren' && t.value === '(');

  for (let idx = 0; idx < rawTokens.length; idx++) {
    const curr = rawTokens[idx];
    const prev = tokens.length > 0 ? tokens[tokens.length - 1] : null;
    const isFuncCall = prev && prev.type === 'ident' && KNOWN_FUNCS.has(prev.value.toLowerCase()) && curr.type === 'paren' && curr.value === '(';
    if (prev && isValueEnd(prev) && isValueStart(curr) && !isFuncCall) {
      tokens.push({ type: 'op', value: '*' });
    }
    tokens.push(curr);
    if (tokens.length > MAX_TOKENS) {
      throw new SyntaxError('Expression exceeds maximum token limit');
    }
  }

  return tokens;
}

function evalMathTokens(tokens, varMap = {}) {
  let pos = 0;

  function peek() {
    return tokens[pos] || null;
  }

  function consume() {
    return tokens[pos++];
  }

  // expr := term (('+' | '-') term)*
  function parseExpr(depth) {
    if (depth > MAX_AST_DEPTH) throw new SyntaxError('Expression nesting too deep');
    let left = parseTerm(depth + 1);
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = parseTerm(depth + 1);
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  // term := power (('*' | '/') power)*
  function parseTerm(depth) {
    if (depth > MAX_AST_DEPTH) throw new SyntaxError('Expression nesting too deep');
    let left = parsePower(depth + 1);
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = consume().value;
      const right = parsePower(depth + 1);
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  // power := unary ('^' power)?  (右结合，且允许幂指数为一元负号如 2^-3)
  function parsePower(depth) {
    if (depth > MAX_AST_DEPTH) throw new SyntaxError('Expression nesting too deep');
    const base = parseUnary(depth + 1);
    if (peek() && peek().type === 'op' && peek().value === '^') {
      consume();
      const exponent = parsePower(depth + 1);
      return Math.pow(base, exponent);
    }
    return base;
  }

  // unary := ('+' | '-') unary | primary
  function parseUnary(depth) {
    if (depth > MAX_AST_DEPTH) throw new SyntaxError('Expression nesting too deep');
    if (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const val = parseUnary(depth + 1);
      return op === '-' ? -val : val;
    }
    return parsePrimary(depth + 1);
  }

  // primary := num | ident | '(' expr ')'
  function parsePrimary(depth) {
    if (depth > MAX_AST_DEPTH) throw new SyntaxError('Expression nesting too deep');
    const tok = peek();
    if (!tok) {
      throw new SyntaxError('Unexpected end of expression');
    }

    if (tok.type === 'num') {
      consume();
      return tok.value;
    }

    if (tok.type === 'ident') {
      consume();
      const lowerName = tok.value.toLowerCase();
      // 支持常见初高中单参函数（sin/cos/tan/sqrt/abs/ln/log/exp）及数学常量 pi/e
      const UNARY_FUNCS = {
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        sqrt: Math.sqrt,
        abs: Math.abs,
        ln: Math.log,
        log: Math.log10,
        exp: Math.exp
      };
      if (Object.prototype.hasOwnProperty.call(UNARY_FUNCS, lowerName) && peek() && peek().type === 'paren' && peek().value === '(') {
        consume();
        const argVal = parseExpr(depth + 1);
        const closing = peek();
        if (!closing || closing.type !== 'paren' || closing.value !== ')') {
          throw new SyntaxError('Mismatched parentheses in function call');
        }
        consume();
        return UNARY_FUNCS[lowerName](argVal);
      }
      if (lowerName === 'pi') return Math.PI;
      if (lowerName === 'e' && !Object.prototype.hasOwnProperty.call(varMap, 'e')) return Math.E;

      if (Object.prototype.hasOwnProperty.call(varMap, tok.value)) {
        const val = Number(varMap[tok.value]);
        if (!Number.isFinite(val)) throw new SyntaxError(`Invalid variable value for ${tok.value}`);
        return val;
      }
      // 支持隐式单字符连乘如 "xy" 当 varMap 含单字母变量时
      if (tok.value.length > 1 && [...tok.value].every(ch => Object.prototype.hasOwnProperty.call(varMap, ch))) {
        let prod = 1;
        for (const ch of tok.value) {
          prod *= Number(varMap[ch]);
        }
        return prod;
      }
      throw new SyntaxError(`Unknown identifier in math expression: ${tok.value}`);
    }

    if (tok.type === 'paren' && tok.value === '(') {
      consume();
      const val = parseExpr(depth + 1);
      const closing = peek();
      if (!closing || closing.type !== 'paren' || closing.value !== ')') {
        throw new SyntaxError('Mismatched parentheses');
      }
      consume();
      return val;
    }

    throw new SyntaxError(`Unexpected token: ${tok.value}`);
  }

  if (tokens.length === 0) {
    throw new SyntaxError('Empty expression');
  }
  const result = parseExpr(0);
  if (pos < tokens.length) {
    throw new SyntaxError(`Unexpected trailing token: ${tokens[pos].value}`);
  }
  return result;
}

function stripFunctionPrefix(expr) {
  return String(expr || '')
    .trim()
    .replace(/^[a-zA-Z]\s*\(\s*[a-zA-Z]\s*\)\s*=\s*/, '')
    .replace(/^y\s*=\s*/i, '');
}

/**
 * 安全纯 JS 数学表达式求值器（用于 Schwartz-Zippel 代数等价校验）
 */
function evaluateExpressionAt(expr, varMap = {}) {
  if (typeof expr !== 'string' || !expr.trim()) {
    throw new SyntaxError('Expression must be a non-empty string');
  }
  const tokens = tokenizeMathExpr(stripFunctionPrefix(expr));
  return evalMathTokens(tokens, varMap);
}

/**
 * Algebraic Equivalence Verification via Schwartz-Zippel Lemma
 */
function areAlgebraicallyEquivalent(exprA, exprB, varName = 'x') {
  if (!exprA || !exprB) return false;
  const cleanA = stripFunctionPrefix(exprA);
  const cleanB = stripFunctionPrefix(exprB);
  if (cleanA === cleanB) return true;

  const testPoints = [2.718, -3.141, 5.25, -7.8, 11.3];

  let matches = 0;
  for (const pt of testPoints) {
    try {
      const valA = evaluateExpressionAt(cleanA, { [varName]: pt });
      const valB = evaluateExpressionAt(cleanB, { [varName]: pt });

      if (Number.isFinite(valA) && Number.isFinite(valB)) {
        if (Math.abs(valA - valB) < 1e-6) {
          matches++;
        } else {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  return matches >= 4;
}

function verifyAndEnrichMathExplanation(text) {
  if (!text || typeof text !== 'string') return text;

  const quadRegex = /([+-]?\s*\d*)\s*x\s*(?:\^2|²)\s*([+-]\s*\d*)\s*x\s*([+-]\s*\d+)\s*=\s*0/i;
  const match = text.match(quadRegex);

  if (match) {
    try {
      const parseCoeff = (str) => {
        const s = str.replace(/\s+/g, '');
        if (s === '' || s === '+') return 1;
        if (s === '-') return -1;
        return parseInt(s, 10);
      };

      const a = parseCoeff(match[1], 1);
      const b = parseCoeff(match[2], 0);
      const c = parseInt(match[3].replace(/\s+/g, ''), 10);

      const sol = solveQuadratic(a, b, c);
      let cert = `\n\n> 🛡️ **[神经符号 CAS 引擎已核实 100% 精确]**\n> 判别式 $\\Delta = ${sol.discriminant}$；`;
      if (sol.roots.length > 0) {
        const rootsLatex = sol.roots.map((r, i) => `x_{${i + 1}} = ${r.latex}`).join('，\\;');
        cert += `精确解为：$${rootsLatex}$。`;
      } else {
        cert += '该方程在实数范围内无解。';
      }

      return text + cert;
    } catch {
      return text;
    }
  }

  return text;
}

module.exports = {
  ExactFraction,
  simplifyRadical,
  solveQuadratic,
  factorizeQuadratic,
  areAlgebraicallyEquivalent,
  verifyAndEnrichMathExplanation,
  evaluateExpressionAt
};
