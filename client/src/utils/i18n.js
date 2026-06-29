export const translations = {
  'zh-CN': {
    // Header & Sidebar
    'app.title': '曾练专属私教',
    'app.subtitle': '基于人教版1-9年级教材的智能辅导系统',
    'btn.mistake': '🔔 错题复测',
    'btn.parent': '📈 家长监工',
    'btn.report': '📊 学习报表',
    'btn.notebook': '📖 我的错题本',
    'btn.map': '🗺️ 学习地图',
    'btn.plan': '🎯 智能规划',
    'mode.direct': '💡 直接解答',
    'mode.guided': '🤔 引导模式',
    'mode.strict': '🦉 苏格拉底模式',
    // Input bar
    'input.placeholder': '问问课本里的知识，或上传题目...',
    'input.tts.on': '已开启自动朗读',
    'input.tts.off': '已关闭自动朗读',
    // Settings
    'settings.title': '⚙️ 系统设置',
    'settings.backend': '后端服务器地址',
    'settings.backend_hint': '网页运行留空即可。移动端测试请输入电脑本地 IP，如 http://192.168.1.100:3001',
    'settings.backend_note': '⚠️ 注意：在手机运行临时安装包时，手机与电脑须处于同一 Wi-Fi。',
    'settings.token': '🔑 访问令牌 (API Token)',
    'settings.token_hint': '输入后端 .env 中配置的 API_TOKEN',
    'settings.token_note': '🔒 访问令牌用于安全保护。须与后端 .env 中的 API_TOKEN 一致。',
    'settings.test': '🔍 测试连接',
    'settings.language': '🌐 语言 (Language)',
    'settings.save': '保存设置',
    'settings.close': '关闭',
    // Theme
    'theme.title': '🎨 主题切换 (Theme)',
    'theme.light': '☀️ 浅色模式',
    'theme.dark': '🌙 深色模式',
    // Onboarding
    'onboarding.skip': '跳过引导',
    'onboarding.back': '上一步',
    'onboarding.next': '下一步',
    'onboarding.start': '开始探索 🚀',
  },
  'en-US': {
    // Header & Sidebar
    'app.title': 'Zeng Practice Tutor',
    'app.subtitle': 'AI tutoring based on China PEP textbooks (Grades 1-9)',
    'btn.mistake': '🔔 Review Challenge',
    'btn.parent': '📈 Parental Gate',
    'btn.report': '📊 Stats Report',
    'btn.notebook': '📖 Mistake Book',
    'btn.map': '🗺️ Learning Map',
    'btn.plan': '🎯 Smart Plan',
    'mode.direct': '💡 Direct Answer',
    'mode.guided': '🤔 Guided Mode',
    'mode.strict': '🦉 Socratic Mode',
    // Input bar
    'input.placeholder': 'Ask textbook questions or upload image...',
    'input.tts.on': 'Auto TTS On',
    'input.tts.off': 'Auto TTS Off',
    // Settings
    'settings.title': '⚙️ System Settings',
    'settings.backend': 'Backend Server URL',
    'settings.backend_hint': 'Leave blank for web. Enter computer local IP for mobile, e.g. http://192.168.1.100:3001',
    'settings.backend_note': '⚠️ Note: For mobile testing, both devices must be on the same Wi-Fi.',
    'settings.token': '🔑 Access Token (API Token)',
    'settings.token_hint': 'Enter API_TOKEN configured in backend .env',
    'settings.token_note': '🔒 Used to authorize request. Must match API_TOKEN in backend .env.',
    'settings.test': '🔍 Test Connection',
    'settings.language': '🌐 Language (语言)',
    'settings.save': 'Save Settings',
    'settings.close': 'Close',
    // Theme
    'theme.title': '🎨 Theme Toggle (主题)',
    'theme.light': '☀️ Light Mode',
    'theme.dark': '🌙 Dark Mode',
    // Onboarding
    'onboarding.skip': 'Skip',
    'onboarding.back': 'Back',
    'onboarding.next': 'Next',
    'onboarding.start': 'Get Started 🚀',
  }
};

export function getTranslation(lang, key) {
  const dict = translations[lang] || translations['zh-CN'];
  return dict[key] || key;
}
