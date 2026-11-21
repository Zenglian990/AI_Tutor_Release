/**
 * urlValidator.js
 * SSRF (Server-Side Request Forgery) Protection Utility
 *
 * 使用 ipaddr.js 128-bit 二进制解析与 undici pinned dispatcher，
 * 拦截所有私有、回环、链路本地、IPv4-compatible (::/96)、NAT64 (64:ff9b::/96)、
 * 隧道过渡地址，并阻断 DNS Rebinding 与 HTTP 重定向绕过。
 */

const { URL } = require('url');
const net = require('net');
const dns = require('dns');
const ipaddr = require('ipaddr.js');
const undici = require('undici');

const OFFICIAL_AI_HOSTS = new Set([
  'api.deepseek.com',
  'api.siliconflow.cn',
  'dashscope.aliyuncs.com',
  'open.bigmodel.cn',
  'api.openai.com',
  'generativelanguage.googleapis.com'
]);

const BENCHMARKING_CIDR = ipaddr.IPv4.parseCIDR('198.18.0.0/15');
const IPV6_BENCHMARKING_CIDR = ipaddr.IPv6.parseCIDR('2001:2::/48');
const NAT64_LOCAL_CIDR = ipaddr.IPv6.parseCIDR('64:ff9b:1::/48');
const NAT64_WELLKNOWN_CIDR = ipaddr.IPv6.parseCIDR('64:ff9b::/96');
const TEREDO_CIDR = ipaddr.IPv6.parseCIDR('2001::/32');
const SIX_TO_FOUR_CIDR = ipaddr.IPv6.parseCIDR('2002::/16');
const RFC6145_TRANSLATED_CIDR = ipaddr.IPv6.parseCIDR('::ffff:0:0:0/96');

/**
 * 判断 URL 是否属于受信任的官方 AI API 域名（严格 HTTPS + 无凭据 + 默认端口）
 * @param {string} urlString
 * @returns {boolean}
 */
function isOfficialAiUrl(urlString) {
  if (typeof urlString !== 'string' || !urlString.trim()) return false;
  try {
    const parsed = new URL(urlString.trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;
    return OFFICIAL_AI_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * 判断 IP 地址是否属于私有、回环、链路本地或保留过渡网段
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateOrReservedIp(ip) {
  if (typeof ip !== 'string' || !ip.trim()) return true;
  const cleanIp = ip.trim().replace(/^\[|\]$/g, '');

  // 拒绝带 % zone ID 的链路地址
  if (cleanIp.includes('%')) return true;

  let addr;
  try {
    addr = ipaddr.parse(cleanIp);
  } catch {
    return true;
  }

  const isProd = process.env.NODE_ENV === 'production';

  if (addr.kind() === 'ipv4') {
    const range = addr.range();
    if (range === 'unicast') return false;
    // 非生产环境下允许本地 Clash TUN 虚拟网段 198.18.0.0/15（除非显式禁用）
    if (!isProd && process.env.BLOCK_BENCHMARKING_IP !== 'true' && addr.match(BENCHMARKING_CIDR)) {
      return false;
    }
    return true;
  }

  if (addr.kind() === 'ipv6') {
    // 1. 严格拦截 IPv4-compatible IPv6 (::/96)，包含 ::, ::1, ::127.0.0.1, ::0:1
    if (addr.parts.slice(0, 6).every(p => p === 0)) {
      return true;
    }

    // 2. 拦截 NAT64 (64:ff9b::/96, 64:ff9b:1::/48)、Teredo、6to4 与 RFC6145 翻译段
    if (
      addr.match(NAT64_WELLKNOWN_CIDR) ||
      addr.match(NAT64_LOCAL_CIDR) ||
      addr.match(TEREDO_CIDR) ||
      addr.match(SIX_TO_FOUR_CIDR) ||
      addr.match(RFC6145_TRANSLATED_CIDR)
    ) {
      return true;
    }

    // 3. 标准 IPv4-mapped IPv6 (::ffff:0:0/96): 提取内嵌 IPv4 递归判定（放行 [::ffff:1.1.1.1]，拦截内网）
    if (addr.isIPv4MappedAddress()) {
      const v4 = addr.toIPv4Address();
      return isPrivateOrReservedIp(v4.toString());
    }

    // 4. 非生产环境下允许本地 Clash TUN Fake-IPv6 虚拟网段 2001:2::/48（除非显式禁用）
    if (!isProd && process.env.BLOCK_BENCHMARKING_IP !== 'true' && addr.match(IPV6_BENCHMARKING_CIDR)) {
      return false;
    }

    // 5. 仅放行公网单播 IPv6（拦截 fc00::/7 ULA、fe80::/10 linkLocal、ff00::/8 multicast 等）
    return addr.range() !== 'unicast';
  }

  return true;
}

/**
 * 同步校验 URL 格式、协议及静态主机/IP 黑名单
 * @param {string} urlString
 * @param {{ requireHttps?: boolean }} [opts]
 * @returns {{ safe: boolean, error?: string }}
 */
function isSafeExternalUrl(urlString, opts = {}) {
  if (typeof urlString !== 'string' || !urlString.trim()) {
    return { safe: false, error: 'URL 不能为空' };
  }

  let parsed;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return { safe: false, error: 'URL 格式无效' };
  }

  if (opts.requireHttps) {
    if (parsed.protocol !== 'https:') {
      return { safe: false, error: '生产环境仅允许使用 HTTPS 协议地址' };
    }
  } else if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, error: `不支持的协议: ${parsed.protocol}，仅允许 http 与 https` };
  }

  if (parsed.username || parsed.password) {
    return { safe: false, error: 'URL 严禁携带用户名或密码凭证' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.nip.io') ||
    hostname.endsWith('.sslip.io') ||
    hostname.endsWith('.xip.io') ||
    hostname.endsWith('.localtest.me')
  ) {
    return { safe: false, error: '禁止访问回环、内部主机或DNS重绑定域名' };
  }

  const cleanIp = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (net.isIP(cleanIp)) {
    if (isPrivateOrReservedIp(cleanIp)) {
      return { safe: false, error: `禁止向私有或保留 IP [${cleanIp}] 发起请求` };
    }
  }

  return { safe: true };
}

/**
 * 异步深度解析 DNS 并校验全部解析出的 IP，返回固定地址清单以防止 DNS Rebinding TOCTOU
 * @param {string} urlString
 * @param {{ requireHttps?: boolean }} [opts]
 * @returns {Promise<{ safe: boolean, error?: string, ip?: string, addresses?: Array<{address: string, family: number}>, hostname?: string, isOfficial?: boolean }>}
 */
async function validateSafeUrlAsync(urlString, opts = {}) {
  const syncCheck = isSafeExternalUrl(urlString, opts);
  if (!syncCheck.safe) return syncCheck;

  try {
    const parsed = new URL(urlString.trim());
    const hostname = parsed.hostname.toLowerCase();
    const cleanIp = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
    const isOfficial = isOfficialAiUrl(urlString);

    if (net.isIP(cleanIp)) {
      if (isPrivateOrReservedIp(cleanIp)) {
        return { safe: false, error: `禁止向私有或保留 IP [${cleanIp}] 发起请求` };
      }
      const family = net.isIPv6(cleanIp) ? 6 : 4;
      const addresses = [{ address: cleanIp, family }];
      return { safe: true, ip: cleanIp, addresses, hostname: cleanIp, isOfficial };
    }

    const addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return { safe: false, error: `域名 [${hostname}] 未返回任何可用 IP 地址` };
    }

    for (const addr of addresses) {
      if (isPrivateOrReservedIp(addr.address)) {
        return { safe: false, error: `域名 [${hostname}] 解析到受限内网 IP [${addr.address}]，已被拦截` };
      }
    }

    return {
      safe: true,
      ip: addresses[0].address,
      addresses: addresses.map(a => ({ address: a.address, family: a.family || (net.isIPv6(a.address) ? 6 : 4) })),
      hostname,
      isOfficial
    };
  } catch (err) {
    return { safe: false, error: `DNS 解析失败: ${err.message}` };
  }
}

/**
 * 构造锁定已验证 DNS 解析结果的 undici Agent，彻底封堵 DNS Rebinding 与 TLS SNI 绕过。
 * @param {string} expectedHostname
 * @param {Array<{ address: string, family: number }>} addresses
 * @returns {undici.Agent}
 */
function createPinnedDispatcher(expectedHostname, addresses) {
  if (!expectedHostname || !Array.isArray(addresses) || addresses.length === 0) {
    throw new Error('Invalid pinned dispatcher configuration');
  }
  const normalizedExpected = String(expectedHostname).toLowerCase().replace(/^\[|\]$/g, '');
  const pinnedList = addresses.map(a => ({
    address: a.address,
    family: a.family || (net.isIPv6(a.address) ? 6 : 4)
  }));

  return new undici.Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        const cleanHost = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
        if (cleanHost !== normalizedExpected) {
          return callback(new Error('DNS_HOST_MISMATCH'));
        }
        if (options && options.all) {
          return callback(null, pinnedList);
        }
        return callback(null, pinnedList[0].address, pinnedList[0].family);
      }
    }
  });
}

/**
 * DeepSeek 官方地址严格白名单校验
 * @param {string} urlString
 * @returns {boolean}
 */
function isAllowedDeepseekUrl(urlString) {
  if (typeof urlString !== 'string' || !urlString.trim()) return false;
  try {
    const parsed = new URL(urlString.trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname.toLowerCase() !== 'api.deepseek.com') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (cleanPath !== '' && cleanPath !== '/v1') return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  OFFICIAL_AI_HOSTS,
  isOfficialAiUrl,
  isPrivateOrReservedIp,
  isSafeExternalUrl,
  validateSafeUrlAsync,
  createPinnedDispatcher,
  isAllowedDeepseekUrl
};
