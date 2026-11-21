const config = require('../config');

/**
 * 判断当前是否处于生产模式。
 * 优先检查动态 process.env.NODE_ENV，以便测试中切换环境验证脱敏逻辑。
 * @returns {boolean}
 */
function isSafeProductionMode() {
  return (process.env.NODE_ENV || config.NODE_ENV) === 'production';
}

/**
 * 将整数参数夹紧到 [min, max] 范围内；非数字时返回 defaultVal。
 */
function clampInt(val, defaultVal, min, max) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const parsed = Number.parseInt(String(val), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return defaultVal;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * 严格校验正整数查询参数（如分页 limit >= 1）。
 * 若未提供返回 { ok: true, value: defaultVal }；
 * 若提供但格式非正整数（如 -1、0、abc、1.5）返回 { ok: false, error }；
 * 若合法则夹紧上限至 max。
 */
function parsePositiveIntStrict(val, defaultVal, max) {
  if (val === undefined || val === null || String(val).trim() === '') {
    return { ok: true, value: defaultVal };
  }
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) {
    return { ok: false, error: '分页参数必须为正整数' };
  }
  const parsed = Number.parseInt(str, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return { ok: false, error: '分页参数必须大于等于 1' };
  }
  return { ok: true, value: Math.min(max, parsed) };
}

/**
 * 严格校验非负整数查询参数（如分页 offset >= 0）。
 */
function parseNonNegativeIntStrict(val, defaultVal = 0, max = 1_000_000) {
  if (val === undefined || val === null || String(val).trim() === '') {
    return { ok: true, value: defaultVal };
  }
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) {
    return { ok: false, error: '偏移量参数必须为非负整数' };
  }
  const parsed = Number.parseInt(str, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return { ok: false, error: '偏移量参数不能为负数' };
  }
  return { ok: true, value: Math.min(max, parsed) };
}

module.exports = {
  isSafeProductionMode,
  clampInt,
  parsePositiveIntStrict,
  parseNonNegativeIntStrict
};
