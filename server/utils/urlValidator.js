/**
 * urlValidator.js
 * SSRF (Server-Side Request Forgery) Protection Utility
 * 
 * 严格验证外部传入的 Webhook 或 API URL，防止向回环地址、局域网内网地址或云元数据端点发送请求。
 */

const { URL } = require('url');
const net = require('net');

/**
 * 判断 IP 地址是否属于私有、回环、链路本地或保留网段
 * @param {string} ip 
 * @returns {boolean}
 */
function isPrivateOrReservedIp(ip) {
  if (!ip) return true;

  // IPv4 检查
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    // 0.0.0.0/8 (当前网络)
    if (parts[0] === 0) return true;

    // 10.0.0.0/8 (私有网络 RFC 1918)
    if (parts[0] === 10) return true;

    // 127.0.0.0/8 (回环地址)
    if (parts[0] === 127) return true;

    // 169.254.0.0/16 (链路本地 / 云厂商元数据端点 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;

    // 172.16.0.0/12 (私有网络 RFC 1918: 172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0/16 (私有网络 RFC 1918)
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 100.64.0.0/10 (运营商级 NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;

    // 192.0.0.0/24, 192.0.2.0/24 (保留/文档)
    if (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) return true;

    // 198.18.0.0/15 (基准测试)
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;

    // 198.51.100.0/24, 203.0.113.0/24 (文档保留)
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;

    // 224.0.0.0/4 (多播组播) & 240.0.0.0/4 (保留广播)
    if (parts[0] >= 224) return true;

    return false;
  }

  // IPv6 检查
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // ::1 回环
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
    // :: 未指定
    if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;
    // fc00::/7 唯一本地地址 (ULA)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // fe80::/10 链路本地地址
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    // IPv4 映射的 IPv6 (::ffff:127.0.0.1 等)
    if (normalized.startsWith('::ffff:')) {
      const ipv4Part = normalized.slice(7);
      return isPrivateOrReservedIp(ipv4Part);
    }
    return false;
  }

  return true;
}

/**
 * 校验 URL 是否为安全合法的外部公网请求地址
 * @param {string} urlString 
 * @returns {{ safe: boolean, error?: string }}
 */
function isSafeExternalUrl(urlString) {
  if (typeof urlString !== 'string' || !urlString.trim()) {
    return { safe: false, error: 'URL 不能为空' };
  }

  let parsed;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return { safe: false, error: 'URL 格式无效' };
  }

  // 1. 协议白名单限制 (只允许 http 和 https)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, error: `不支持的协议: ${parsed.protocol}，仅允许 http 与 https` };
  }

  // 2. 禁止携带凭据信息
  if (parsed.username || parsed.password) {
    return { safe: false, error: 'URL 严禁携带用户名或密码凭证' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 3. 常见内网名称与回环/DNS重绑定域名拦截
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.nip.io') ||
    hostname.endsWith('.sslip.io') ||
    hostname.endsWith('.xip.io') ||
    hostname.endsWith('.localtest.me')
  ) {
    return { safe: false, error: '禁止访问回环、内部主机或DNS重绑定域名' };
  }

  // 4. IP 直接访问检查
  const cleanIp = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (net.isIP(cleanIp)) {
    if (isPrivateOrReservedIp(cleanIp)) {
      return { safe: false, error: `禁止向私有或保留 IP [${cleanIp}] 发起请求` };
    }
  }

  return { safe: true };
}

module.exports = {
  isPrivateOrReservedIp,
  isSafeExternalUrl
};
