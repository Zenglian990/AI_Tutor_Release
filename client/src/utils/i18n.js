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
    'btn.knowledgeTest': '📝 知识测试',
    'btn.reviewOnly': '🎯 仅复测未掌握',
    'mode.direct': '💡 直接解答',
    'mode.direct_title': 'AI直接给出完整答案和解析',
    'mode.guided': '🤔 引导模式',
    'mode.guided_title': 'AI先给提示引导学生自己思考',
    'mode.strict': '🦉 苏格拉底模式',
    'mode.strict_title': 'AI只用提问引导，绝不直接给答案',
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
    'settings.theme': '主题模式',
    'settings.profile': '当前档案',
    'settings.socratic': '苏格拉底模式',
    'settings.save': '保存设置',
    'settings.close': '关闭',
    // Onboarding
    'onboarding.steps': [
      {
        title: '🎓 欢迎来到曾练专属私教！',
        content: '这是一个基于人教版 1-9 年级教材构建的 AI 深度教材伴读系统。让我们用 1 分钟了解如何使用它。'
      },
      {
        title: '🗺️ 探索你的「学习地图」',
        content: '点击下方的「学习地图」按钮。在这里，你可以按章节解锁关卡。AI 会根据你的进度，进行新知导读、核心概念拆解和热身互动！'
      },
      {
        title: '📖 记录并巩固「我的错题本」',
        content: '点击 AI 消息右下角的「加入错题本」或主菜单的「错题本」。系统会根据艾宾浩斯遗忘曲线（SM-2 算法）自动计算下一次复习时间，并主动发起「变式题复测」挑战！'
      },
      {
        title: '📊 查看「学习报表」与「家长监工」',
        content: '家长可以通过 Parental Gate 家长验证码安全进入「学习报表」和「运营分析」，查看本周学习统计；还能通过「家长监工」一键生成专业的 Markdown 微信周报。'
      }
    ],
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
    'btn.knowledgeTest': '📝 Knowledge Test',
    'btn.reviewOnly': '🎯 Review Unmastered',
    'mode.direct': '💡 Direct Answer',
    'mode.direct_title': 'AI gives complete answer and explanation directly',
    'mode.guided': '🤔 Guided Mode',
    'mode.guided_title': 'AI gives hints to guide student thinking first',
    'mode.strict': '🦉 Socratic Mode',
    'mode.strict_title': 'AI only guides with questions, never gives direct answers',
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
    'settings.theme': 'Theme',
    'settings.profile': 'Current Profile',
    'settings.socratic': 'Socratic Mode',
    'settings.save': 'Save Settings',
    'settings.close': 'Close',
    // Onboarding
    'onboarding.steps': [
      {
        title: '🎓 Welcome to AI Tutor!',
        content: 'This is an interactive RAG tutoring system built on standard textbooks for grades 1-9. Let\'s take 1 minute to learn how to use it.'
      },
      {
        title: '🗺️ Explore the "Learning Map"',
        content: 'Click the "Learning Map" button. You can unlock chapters stage-by-stage. The AI will guide you through core concepts and checkpoints interactively!'
      },
      {
        title: '📖 Consolidate with the "Mistake Book"',
        content: 'Save errors to your "Mistake Book". The system uses the SM-2 algorithm to schedule memory intervals and generates challenge variations automatically!'
      },
      {
        title: '📊 "Stats Report" & Parental Gate',
        content: 'Parents can securely enter "Stats Report" and "Ops Stats" via a PIN gate to view detailed graphs, or click "Parent Supervisor" to generate weekly text reports.'
      }
    ],
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
