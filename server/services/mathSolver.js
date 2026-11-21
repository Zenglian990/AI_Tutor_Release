/**
 * Deterministic Math & Geometry Solver for K-12
 * 消除大模型在中小学基础几何、周长面积、经典应用题上的计算幻觉
 */

/**
 * 求解多个正方形拼成长方形的周长与面积
 * 例: "用3个边长2厘米的正方形拼成一个长方形"
 */
function solveSquaresToRectangle(count, sideLength) {
  const n = Number(count);
  const a = Number(sideLength);
  if (!n || !a || n <= 0 || a <= 0) return null;

  const length = n * a;
  const width = a;
  const perimeter = 2 * (length + width);
  const area = n * a * a;

  return {
    type: 'squares_to_rectangle',
    count: n,
    sideLength: a,
    length,
    width,
    perimeter,
    area,
    explanation: `${n}个边长${a}厘米的正方形排成一行拼成长方形：长为 ${n}×${a}=${length} 厘米，宽为 ${a} 厘米。周长 = (${length} + ${a}) × 2 = ${perimeter} 厘米。面积 = ${n} × (${a}×${a}) = ${area} 平方厘米。`
  };
}

/**
 * 求解从长方形角落剪去正方形后的周长变化
 * 几何公理：从长方形角落剪去一个正方形，新图形周长与原长方形周长完全相等！
 */
function solveCornerCutPerimeter(rectLength, rectWidth, cutSquareSide) {
  const l = Number(rectLength);
  const w = Number(rectWidth);
  const s = Number(cutSquareSide);
  if (!l || !w || !s) return null;

  const originalPerimeter = 2 * (l + w);
  const newPerimeter = originalPerimeter;

  return {
    type: 'corner_cut_perimeter',
    rectLength: l,
    rectWidth: w,
    cutSquareSide: s,
    originalPerimeter,
    newPerimeter,
    perimeterChange: 0,
    explanation: `从长${l}厘米、宽${w}厘米的长方形角落剪去一个边长为${s}厘米的正方形，虽然减少了两条长为${s}的边，但同时凹进去又增加了两条长为${s}的边，因此周长不变，依然是 (${l} + ${w}) × 2 = ${newPerimeter} 厘米。`
  };
}

/**
 * 求解鸡兔同笼问题
 */
function solveChickenAndRabbits(totalHeads, totalLegs) {
  const h = Number(totalHeads);
  const l = Number(totalLegs);
  if (!h || !l || l < 2 * h || l > 4 * h || l % 2 !== 0) return null;

  const rabbits = (l - 2 * h) / 2;
  const chickens = h - rabbits;

  return {
    type: 'chicken_and_rabbits',
    totalHeads: h,
    totalLegs: l,
    chickens,
    rabbits,
    explanation: `假设全是鸡，则共有 ${h}×2=${2 * h} 条腿。实际比假设多出 ${l}-${2 * h}=${l - 2 * h} 条腿。每只兔子比鸡多2条腿，所以兔子有 (${l}-${2 * h})÷2 = ${rabbits} 只，鸡有 ${h}-${rabbits} = ${chickens} 只。`
  };
}

/**
 * 求解植树问题
 */
function solveTreePlanting(totalDistance, interval, plantType = 'both_ends') {
  const d = Number(totalDistance);
  const i = Number(interval);
  if (!d || !i || i <= 0) return null;

  const sections = Math.floor(d / i);
  let trees = sections;
  let desc = '';

  if (plantType === 'both_ends') {
    trees = sections + 1;
    desc = `两端都栽：棵数 = 段数 + 1 = ${d}÷${i} + 1 = ${trees} 棵。`;
  } else if (plantType === 'closed_loop' || plantType === 'one_end') {
    trees = sections;
    desc = `只栽一端或封闭环形：棵数 = 段数 = ${d}÷${i} = ${trees} 棵。`;
  } else if (plantType === 'neither_end') {
    trees = Math.max(0, sections - 1);
    desc = `两端都不栽：棵数 = 段数 - 1 = ${d}÷${i} - 1 = ${trees} 棵。`;
  }

  return {
    type: 'tree_planting',
    totalDistance: d,
    interval: i,
    sections,
    trees,
    explanation: desc
  };
}

/**
 * 自动识别题目文本中蕴含的几何与基础应用题模式并提供确定性解
 */
function extractAndVerifyDeterministicMath(snippet) {
  if (typeof snippet !== 'string' || !snippet.trim()) return null;

  // 1. 检测正方形拼长方形模式
  const squaresMatch = snippet.match(/(\d+)\s*个\s*边长\s*(?:为|是)?\s*(\d+(?:\.\d+)?)\s*(?:厘米|cm)?\s*(?:的)?\s*正方形\s*拼成\s*(?:一个)?\s*长方形/i);
  if (squaresMatch) {
    const count = parseInt(squaresMatch[1], 10);
    const side = parseFloat(squaresMatch[2]);
    const solution = solveSquaresToRectangle(count, side);
    if (solution) {
      return {
        matched: true,
        category: '几何周长与面积',
        solution,
        expectedPerimeter: solution.perimeter,
        expectedArea: solution.area,
        verifiedText: solution.explanation
      };
    }
  }

  // 2. 检测角落剪去正方形周长
  const cornerCutMatch = snippet.match(/长\s*(\d+(?:\.\d+)?).*?宽\s*(\d+(?:\.\d+)?).*?剪去.*?边长\s*(\d+(?:\.\d+)?).*?正方形.*?周长/i);
  if (cornerCutMatch) {
    const l = parseFloat(cornerCutMatch[1]);
    const w = parseFloat(cornerCutMatch[2]);
    const s = parseFloat(cornerCutMatch[3]);
    const solution = solveCornerCutPerimeter(l, w, s);
    if (solution) {
      return {
        matched: true,
        category: '长方形剪切周长',
        solution,
        expectedPerimeter: solution.newPerimeter,
        verifiedText: solution.explanation
      };
    }
  }

  // 3. 鸡兔同笼检测
  const chickenMatch = snippet.match(/(\d+)\s*(?:只|个)?\s*头.*?(\d+)\s*(?:只|条)?\s*脚/i);
  if (chickenMatch && (snippet.includes('鸡') || snippet.includes('兔'))) {
    const heads = parseInt(chickenMatch[1], 10);
    const legs = parseInt(chickenMatch[2], 10);
    const solution = solveChickenAndRabbits(heads, legs);
    if (solution) {
      return {
        matched: true,
        category: '鸡兔同笼',
        solution,
        expectedChickens: solution.chickens,
        expectedRabbits: solution.rabbits,
        verifiedText: solution.explanation
      };
    }
  }

  return null;
}

module.exports = {
  solveSquaresToRectangle,
  solveCornerCutPerimeter,
  solveChickenAndRabbits,
  solveTreePlanting,
  extractAndVerifyDeterministicMath
};
