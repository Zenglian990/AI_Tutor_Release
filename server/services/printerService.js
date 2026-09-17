const net = require('net');
const logger = require('./logger');

/**
 * Validates whether the printer host is a safe local LAN address or loopback.
 * Prevents SSRF / public IP abuse.
 */
function isSafeLocalPrinterHost(host) {
  if (!host || typeof host !== 'string') return false;
  const h = host.trim().toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;

  // Private IPv4 ranges
  // 10.0.0.0/8
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  // 172.16.0.0/12
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  // 192.168.0.0/16
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;

  return false;
}

/**
 * Format questions into clean, printable A4 text paper for receipt/standard network printers.
 */
function formatExamForPrinter({
  title = '名师专属微测试卷',
  studentName = '曾练',
  grade = '7_up',
  subject = '数学',
  questions = [],
  printMode = 'blank_student' // 'blank_student' | 'with_answers'
}) {
  const divider = '='.repeat(64);
  const subDivider = '-'.repeat(64);
  const dateStr = new Date().toLocaleDateString('zh-CN');

  let text = '';
  // Printer initialization (ESC @: Initialize printer in ESC/P)
  text += '\x1b\x40';

  // Title and header
  text += `${divider}\n`;
  text += `        【曾先生智慧私教】${title}\n`;
  text += `${divider}\n`;
  text += `学员姓名: ${studentName.padEnd(10, ' ')} 年级: ${grade}   科目: ${subject}\n`;
  text += `测验日期: ${dateStr.padEnd(14, ' ')} 模式: ${printMode === 'blank_student' ? '空白实战演练' : '详析精讲核对'}\n`;
  text += `卷面总分: 100分              建议答题时长: 45分钟\n`;
  text += `${subDivider}\n\n`;

  // Questions listing
  questions.forEach((q, idx) => {
    const num = idx + 1;
    const score = q.score || 10;
    const qBody = q.body || q.content || q.text || q.question || '';

    text += `【第 ${num} 题】 (${score}分)\n`;
    text += `${qBody}\n\n`;

    if (printMode === 'blank_student') {
      text += `【手写解答与草稿验算区】:\n`;
      text += `  ________________________________________________________\n`;
      text += `  ________________________________________________________\n`;
      text += `  ________________________________________________________\n`;
      text += `  ________________________________________________________\n\n`;
    } else {
      if (q.standardAnswer || q.answer) {
        text += `【标准参考推导】:\n${q.standardAnswer || q.answer}\n\n`;
      }
      if (q.keyInsight || q.explanation) {
        text += `【名师题眼破局】:\n${q.keyInsight || q.explanation}\n\n`;
      }
    }
    text += `${subDivider}\n`;
  });

  // Footer
  text += `\n* 严谨书写每一个推导步骤，草稿纸是理科思维最强抓手。\n`;
  text += `${divider}\n\n\n`;
  // Form feed (Eject page / cut)
  text += '\x0c';

  return text;
}

/**
 * Send raw data buffer directly to network printer over TCP Port 9100 / IPP
 */
function sendToNetworkPrinter({
  host,
  port = 9100,
  data,
  timeoutMs = 6000,
  mock = false
}) {
  return new Promise((resolve, reject) => {
    if (!host) {
      return reject(new Error('未指定打印机局域网 IP 地址'));
    }

    if (!isSafeLocalPrinterHost(host)) {
      return reject(new Error('出于安全防护，仅支持连接局域网局域地址 (如 192.168.x.x, 10.x.x.x) 或本机测试'));
    }

    const payload = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

    // Support simulated mock mode for CI/test environments without physical printers
    if (mock || process.env.MOCK_PRINTER === 'true') {
      logger.info(`[PrinterService] Mock print completed to ${host}:${port} (${payload.length} bytes)`);
      return resolve({
        success: true,
        simulated: true,
        host,
        port,
        bytesSent: payload.length,
        message: `[测试模式] 试卷已成功模拟出纸发送至 ${host}:${port} (${payload.length} 字节)`
      });
    }

    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeoutMs);

    socket.connect(port, host, () => {
      isConnected = true;
      logger.info(`[PrinterService] Connected to network printer at ${host}:${port}`);
      socket.write(payload, () => {
        logger.info(`[PrinterService] Dispatched ${payload.length} bytes to ${host}:${port}`);
        socket.end();
      });
    });

    socket.on('close', () => {
      if (isConnected) {
        resolve({
          success: true,
          host,
          port,
          bytesSent: payload.length,
          message: `试卷任务已成功发送到网络打印机 (${host}:${port})`
        });
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`连接打印机超时 (${timeoutMs}ms)。请检查打印机 IP [${host}] 是否在线，或已开启端口 ${port}。`));
    });

    socket.on('error', (err) => {
      socket.destroy();
      let errorMsg = `打印机通信失败: ${err.message}`;
      if (err.code === 'ECONNREFUSED') {
        errorMsg = `打印机端口 [${port}] 拒绝连接。请确认打印机已开机并开启了 RAW 9100 端口服务。`;
      } else if (err.code === 'EHOSTUNREACH') {
        errorMsg = `打印机 IP [${host}] 无法连通，请确认电脑与打印机连接在同一路由器/WiFi。`;
      }
      reject(new Error(errorMsg));
    });
  });
}

module.exports = {
  isSafeLocalPrinterHost,
  formatExamForPrinter,
  sendToNetworkPrinter
};
