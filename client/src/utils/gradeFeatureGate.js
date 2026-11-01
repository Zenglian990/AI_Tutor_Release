/**
 * gradeFeatureGate.js
 * 
 * 权威年级与学科功能权限判定网关 (Strict Curriculum & Developmental Stage Gating)
 * 严格遵循教育部《义务教育课程方案》与各学段儿童认知心智发展模型：
 * 1. 小学低段 (1-3年级)：严禁任何初高中数理化超标功能 (硬拦截物理、化学、代数CAS、动点几何、中高考作文阅卷标准)。
 * 2. 初一 (7年级)：未开设物理、化学，硬拦截物理和化学实验台。
 * 3. 初二 (8年级)：开设物理，但未开设化学，硬拦截化学实验台。
 * 4. 初三与高中 (9-12年级)：开设全科微实验与中高考备考沙盘。
 * 5. 学科严格绑定：当选择语文时，不展示数理化公式与微实验；当选择数学时，不展示英语口语对练。
 */

export function parseGradeLevel(grade) {
  if (!grade) return 7; // 默认初一
  const str = String(grade).toLowerCase().trim();

  // 1. 数字下划线格式：'1_up', '7_down', '10_up'
  const prefixMatch = str.match(/^(\d+)/);
  if (prefixMatch) {
    const num = parseInt(prefixMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  // 2. 中文常见名称映射 (优先检测初中与高中，避免“初一上册”误命中“一上”)
  if (str.includes('初三') || str.includes('九年级')) return 9;
  if (str.includes('初二') || str.includes('八年级')) return 8;
  if (str.includes('初一') || str.includes('七年级')) return 7;
  if (str.includes('高三') || str.includes('十二年级')) return 12;
  if (str.includes('高二') || str.includes('十一年级')) return 11;
  if (str.includes('高一') || str.includes('十年级')) return 10;

  if (str.includes('六年级') || str.includes('六上') || str.includes('六下')) return 6;
  if (str.includes('五年级') || str.includes('五上') || str.includes('五下')) return 5;
  if (str.includes('四年级') || str.includes('四上') || str.includes('四下')) return 4;
  if (str.includes('三年级') || str.includes('三上') || str.includes('三下')) return 3;
  if (str.includes('二年级') || str.includes('二上') || str.includes('二下')) return 2;
  if (str.includes('一年级') || str.includes('一上') || str.includes('一下')) return 1;

  return 7;
}

/**
 * 判断特定功能在当前年级与科目下是否合法可见
 * @param {string} feature - 功能标识符
 * @param {string|number} grade - 当前年级
 * @param {string} subject - 当前科目
 * @returns {boolean}
 */
export function isFeatureVisible(feature, grade, subject = '') {
  const gradeNum = parseGradeLevel(grade);
  const subj = (subject || '').trim();

  switch (feature) {
    // 小学实物教具：仅限 1-6 年级，且科目为数学或全部
    case 'manipulatives':
      return gradeNum <= 6 && (subj === '' || subj === '数学');

    // 趣味口算天天练：仅限 1-6 年级 (7年级初一可作为巩固基础选修)，科目为数学或全部
    case 'mentalMath':
      return gradeNum <= 7 && (subj === '' || subj === '数学');

    // 实时代数演算纸 (CAS 移项变号验证)：7-12 年级，且科目为数学、物理或全部
    case 'stepScratchpad':
      return gradeNum >= 7 && (subj === '' || subj === '数学' || subj === '物理');

    // 动点压轴几何沙盒：7-12 年级初高中数学压轴题
    case 'geometrySandbox':
      return gradeNum >= 7 && (subj === '' || subj === '数学');

    // 物理微实验台：初二(8年级)及以上方才开设物理！(硬拦截 1-7 年级)
    case 'physicsSimulator':
      return gradeNum >= 8 && (subj === '' || subj === '物理' || subj === '科学');

    // 化学虚拟微实验台：初三(9年级)及以上方才开设化学！(硬拦截 1-8 年级)
    case 'chemistryLab':
      return gradeNum >= 9 && (subj === '' || subj === '化学' || subj === '科学');

    // 作文精批 / 看图写话：必须是语文学科或全部 (硬拦截在数学、物理、化学、英语课中显示)
    case 'essay':
      return subj === '' || subj === '语文';

    // 英语听说情景对练：必须是英语学科或全部
    case 'englishRolePlay':
      return subj === '' || subj === '英语';

    // 数理化公式宝典：7-12 年级数理化学科；小学 1-6 年级严禁展示初中数理化公式手册
    case 'formulaHandbook':
      return gradeNum >= 7 && (subj === '' || ['数学', '物理', '化学'].includes(subj));

    // 跨年级考点星图与断层溯源：通用开放
    case 'prerequisiteTrace':
      return true;

    // 每日学情战报、视力番茄钟、A4纸质试卷、名师家访：全龄段开放
    case 'dailyCard':
    case 'eyeCare':
    case 'print':
    case 'parentMemo':
    case 'gamification':
    case 'scratchpad':
      return true;

    // 长周期战役沙盘 (中考/期末提分)：初中高年级与高中 (7-12年级)
    case 'campaignRoadmap':
      return gradeNum >= 7;

    // 快捷数学理化符号吸附条：仅限数学、物理、化学科目
    case 'mathSymbols':
      return subj === '' || ['数学', '物理', '化学'].includes(subj);

    default:
      return true;
  }
}

/**
 * 获取适配当前学段的作文模块文案配置
 * @param {string|number} grade 
 */
export function getEssayFeatureConfig(grade) {
  const gradeNum = parseGradeLevel(grade);
  if (gradeNum <= 3) {
    return {
      title: '看图写话趣味点拨',
      desc: '图画观察技巧启发，好词好句生动积累，启发孩子爱上表达',
      cta: '看图写话 →'
    };
  }
  if (gradeNum <= 6) {
    return {
      title: '小学记叙文名师升格',
      desc: '五感细节生动描写引导，作文结构逻辑梳理，名师逐句润色',
      cta: '作文升格 →'
    };
  }
  if (gradeNum <= 9) {
    return {
      title: '中考作文名师精批',
      desc: '中考 50 分评分标准五维诊断，特级名师前后润色升格点石成金',
      cta: '作文升格 →'
    };
  }
  return {
    title: '高考作文思辨精批',
    desc: '高考议论文深度立意分析，论点论据精当升格与特级名师下水文',
    cta: '作文升格 →'
  };
}

/**
 * 获取适配当前学段的测试卷文案配置
 * @param {string|number} grade 
 */
export function getExamFeatureConfig(grade) {
  const gradeNum = parseGradeLevel(grade);
  if (gradeNum <= 6) {
    return {
      title: '期末单元达标闯关卷',
      desc: '人教版核心单元考点闭环检测，易错陷阱题专项突击',
      cta: '开启单元测 →'
    };
  }
  if (gradeNum <= 9) {
    return {
      title: '中考真题阶段摸底卷',
      desc: '精选历年中考经典母题与变式演练，精准定位知识薄弱漏洞',
      cta: '摸底实测 →'
    };
  }
  return {
    title: '高考高频押题密卷',
    desc: '历年高考高频母题与核心题眼精准提炼，全真高考步骤采分点评分',
    cta: '开考押题卷 →'
  };
}
