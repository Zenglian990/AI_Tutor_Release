/**
 * Geometry Auxiliary Line Scaffolding Constants (ESM for Client)
 */

export const AUXILIARY_LINE_MODELS = {
  double_midpoint: {
    id: 'double_midpoint',
    name: '倍长中线模型',
    icon: '✂️',
    trigger_summary: '遇三角形中线或线段中点',
    trigger_keywords: ['中点', '中线', '平分BC', '中位线', 'CD是中线', 'AD是中线'],
    construction_step: '延长中线 AD 至点 E，使得 DE = AD，连接 CE',
    causal_rationale: '【核心动因】已知条件中分散的线段（如 AB 与 AC）距离太远无法直接比较。通过“倍长中线”，构造中心对称全等三角形 (△ABD ≌ △ECD)，将边 AB 完美“平移搬家”到 EC，使已知边角全部汇集到 △ACE 中，利用三角形三边关系或勾股定理一击破局！',
    socratic_steps: [
      '第1问：观察图中的中点 D，线段 AB 和 AC 分在左右两侧，能直接相加减或算角度吗？',
      '第2问：如果把 AD 延长一倍到点 E，连接 CE，△ABD 和 △ECD 是否有一组对顶角和相等的对应边？它们全等吗？',
      '第3问：全等之后，线段 AB 转化为了哪条新线段？在 △ACE 中，AC、CE 和 AE(2AD) 之间有什么大小关系？'
    ],
    default_figure: {
      points: {
        A: { x: 200, y: 40, label: 'A' },
        B: { x: 70, y: 190, label: 'B' },
        C: { x: 330, y: 190, label: 'C' },
        D: { x: 200, y: 190, label: 'D(中点)' },
        E: { x: 200, y: 340, label: 'E(倍长点)' }
      },
      base_lines: [
        { from: 'A', to: 'B', color: '#1e293b', width: 2.5 },
        { from: 'B', to: 'C', color: '#1e293b', width: 2.5 },
        { from: 'A', to: 'C', color: '#1e293b', width: 2.5 },
        { from: 'A', to: 'D', color: '#2563eb', width: 2.2 }
      ],
      auxiliary_lines: [
        { from: 'D', to: 'E', color: '#ef4444', width: 2.5, dashed: true, label: 'DE = AD' },
        { from: 'C', to: 'E', color: '#ef4444', width: 2.5, dashed: true, label: '连接 CE' }
      ]
    }
  },

  angle_bisector_perpendicular: {
    id: 'angle_bisector_perpendicular',
    name: '角平分线垂线/对称模型',
    icon: '📐',
    trigger_summary: '遇角平分线且涉及边长或距离',
    trigger_keywords: ['角平分线', '平分∠', '平分角', '垂线', '角平分线上的点', '距离相等'],
    construction_step: '过角平分线上一点 P，分别向角两边作垂线 PE ⊥ OA，PF ⊥ OB',
    causal_rationale: '【核心动因】利用“角平分线上的点到角两边的距离相等 (PE = PF)”定理，构造轴对称全等直角三角形 (Rt△OEP ≌ Rt△OFP)，实现垂直线段的等长代换，同时产生轴对称翻折效果。',
    socratic_steps: [
      '第1问：点 P 位于角平分线上，它到角两边 OA 和 OB 的距离在几何上有什么定理？',
      '第2问：向两边作垂线 PE 和 PF 后，Rt△OEP 与 Rt△OFP 具备哪些相等的条件（公共边、直角、平分角）？',
      '第3问：全等之后不仅 PE = PF，线段 OE 与 OF 是否也相等？这能帮你化简目标式吗？'
    ],
    default_figure: {
      points: {
        O: { x: 60, y: 190, label: 'O' },
        A: { x: 340, y: 60, label: 'A' },
        B: { x: 340, y: 220, label: 'B' },
        P: { x: 220, y: 140, label: 'P(平分线上)' },
        E: { x: 175, y: 100, label: 'E(垂足)' },
        F: { x: 220, y: 205, label: 'F(垂足)' }
      },
      base_lines: [
        { from: 'O', to: 'A', color: '#1e293b', width: 2.5 },
        { from: 'O', to: 'B', color: '#1e293b', width: 2.5 },
        { from: 'O', to: 'P', color: '#2563eb', width: 2.2 }
      ],
      auxiliary_lines: [
        { from: 'P', to: 'E', color: '#ef4444', width: 2.5, dashed: true, label: 'PE ⊥ OA' },
        { from: 'P', to: 'F', color: '#ef4444', width: 2.5, dashed: true, label: 'PF ⊥ OB' }
      ]
    }
  },

  intercept_and_add: {
    id: 'intercept_and_add',
    name: '截长补短模型',
    icon: '📏',
    trigger_summary: '需证明或计算线段和差关系 a + b = c',
    trigger_keywords: ['和差', 'AB+AC=', 'AE+CF=', '截长', '补短', '线段之和', '线段相加'],
    construction_step: '在较长线段 AD 上截取一段 AM = AB，只需证明剩余段 MD = AC',
    causal_rationale: '【核心动因】几何中无法直接把两根不在同一条直线上的短线段与一条长线段合并比对。截长补短法通过在长边上“剪下一截”或在短边上“续接一截”，将“分散和差”转化为“单一线段相等”的全等判定！',
    socratic_steps: [
      '第1问：题目要证明 AB + AC = AD，已知 AB 和 AC 处于不同位置，能否在 AD 上截取 AM = AB？',
      '第2问：如果截取了 AM = AB，接下来本题的目标是否转化成了证明剩余部分 MD 等于 AC？',
      '第3问：连接辅助点后，能否利用题干中的角或边条件，证明包含 MD 和 AC 的两个三角形全等？'
    ],
    default_figure: {
      points: {
        A: { x: 80, y: 100, label: 'A' },
        B: { x: 210, y: 40, label: 'B' },
        C: { x: 210, y: 220, label: 'C' },
        D: { x: 370, y: 160, label: 'D' },
        M: { x: 230, y: 130, label: 'M(截取AM=AB)' }
      },
      base_lines: [
        { from: 'A', to: 'B', color: '#1e293b', width: 2.5 },
        { from: 'A', to: 'D', color: '#1e293b', width: 2.5 },
        { from: 'B', to: 'D', color: '#1e293b', width: 2.5 }
      ],
      auxiliary_lines: [
        { from: 'A', to: 'M', color: '#f59e0b', width: 3, dashed: true, label: '截取 AM=AB' },
        { from: 'C', to: 'M', color: '#ef4444', width: 2.5, dashed: true, label: '连接 CM' }
      ]
    }
  },

  zhao_shuang_chord: {
    id: 'zhao_shuang_chord',
    name: '弦图与一线三等角模型',
    icon: '🧩',
    trigger_summary: '遇 90° 直角旋转、正方形或坐标系斜放直角',
    trigger_keywords: ['直角', '正方形', '90度', '90°', '一线三等角', '弦图', '旋转90', '垂直且相等'],
    construction_step: '过直角顶点两侧的点分别向基准线作垂线，构造 K 型一线三等角全等',
    causal_rationale: '【核心动因】利用同角的余角相等（∠1 + ∠2 = 90° 且 ∠2 + ∠3 = 90° ⇒ ∠1 = ∠3），构造直角三角形斜边相等与两锐角相等，瞬间将斜向的线段转化为水平与竖直的标准直角边，是中考坐标系几何压轴第一杀手锏！',
    socratic_steps: [
      '第1问：直角顶点处有两个相邻角与 90° 互余，同角的余角具有什么性质？',
      '第2问：向底线作两条高构造出的两个直角三角形，斜边是否正是题干中已知相等的两边？',
      '第3问：这两个直角三角形由 AAS 判定全等后，两个三角形的高和底边分别对应相等，如何转化为坐标？'
    ],
    default_figure: {
      points: {
        L1: { x: 30, y: 220, label: '' },
        L2: { x: 390, y: 220, label: '基准直线 l' },
        C: { x: 210, y: 220, label: 'C(直角顶点)' },
        A: { x: 120, y: 80, label: 'A' },
        B: { x: 320, y: 120, label: 'B' },
        D: { x: 120, y: 220, label: 'D(垂足)' },
        E: { x: 320, y: 220, label: 'E(垂足)' }
      },
      base_lines: [
        { from: 'L1', to: 'L2', color: '#94a3b8', width: 1.5 },
        { from: 'A', to: 'C', color: '#1e293b', width: 2.5 },
        { from: 'C', to: 'B', color: '#1e293b', width: 2.5 }
      ],
      auxiliary_lines: [
        { from: 'A', to: 'D', color: '#ef4444', width: 2.5, dashed: true, label: 'AD ⊥ l' },
        { from: 'B', to: 'E', color: '#ef4444', width: 2.5, dashed: true, label: 'BE ⊥ l' }
      ]
    }
  }
};
