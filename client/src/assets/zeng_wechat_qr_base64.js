// 安全合规说明：已清除硬编码的个人微信二维码图片数据。
// 如需在海报中展示官方客服二维码，请通过环境变量 VITE_SUPPORT_QR_DATA_URL 注入企业微信活码或由运行时 QRCode 动态生成。
export const ZENG_WECHAT_QR_BASE64 = import.meta?.env?.VITE_SUPPORT_QR_DATA_URL || '';
export default ZENG_WECHAT_QR_BASE64;
