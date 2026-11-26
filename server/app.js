const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('./middleware/auth');
const { signatureMiddleware } = require('./middleware/signature');
const { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, MAX_BODY_SIZE, NODE_ENV } = require('./config');
const { isSafeProductionMode } = require('./utils/paramValidator');
const logger = require('./services/logger');

// Import routes
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const visionRoutes = require('./routes/vision');
const mistakesRoutes = require('./routes/mistakes');
const chaptersRoutes = require('./routes/chapters');
const miscRoutes = require('./routes/misc');
const ttsRoutes = require('./routes/tts');
const testPaperRoutes = require('./routes/testPaper');
const configRoutes = require('./routes/config');
const mentorRoutes = require('./routes/mentor');
const campaignRoutes = require('./routes/campaign');
const parentRoutes = require('./routes/parent');
const homeworkRoutes = require('./routes/homework');
const gamificationRoutes = require('./routes/gamification');
const membershipRoutes = require('./routes/membership');
const { router: feynmanRoutes } = require('./routes/feynman');
const { router: essayRoutes } = require('./routes/essay');
const { router: englishRoleplayRoutes } = require('./routes/englishRoleplay');
const learningMapRoutes = require('./routes/learningMap');

function createApp() {
  const app = express();

  // Trust first-hop proxy for Cloud Run / Nginx reverse proxy environments
  app.set('trust proxy', 1);

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms`);
    });
    next();
  });

  // --- Security headers ---
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        fontSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https:", "wss:", "http://localhost:*", "http://127.0.0.1:*"],
        mediaSrc: ["'self'", "data:", "blob:", "https:"],
        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // --- Core middleware ---
  const rawAllowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const explicitAllowed = new Set([
    'http://localhost:5173',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
    'https://ai-tutor-79709693345.asia-east1.run.app',
    'https://ai-tutor-release.onrender.com',
    'https://zenglian-ai-tutor.onrender.com',
    ...rawAllowed
  ]);

  const isAllowedOrigin = (origin, host) => {
    // Allow non-browser server-to-server requests (no Origin header)
    if (!origin) return true;

    // Explicitly reject 'null' origin to prevent sandboxed iframe exploits
    if (origin === 'null') return false;

    // Allow if explicitly configured in ALLOWED_ORIGINS (never reflect wildcard with credentials)
    if (explicitAllowed.has(origin)) {
      return true;
    }

    // Same-origin check: verify protocol + host accurately
    if (host) {
      try {
        const url = new URL(origin);
        const expectedProto = NODE_ENV === 'production' ? 'https:' : url.protocol;
        if (url.host === host && (NODE_ENV !== 'production' || url.protocol === expectedProto)) {
          return true;
        }
      } catch (e) {}
    }

    // Allow Capacitor / Ionic native app WebView origins (iOS capacitor://localhost, Android https://localhost & http://localhost)
    if (
      /^(capacitor|ionic):\/\/localhost(:\d+)?$/.test(origin) ||
      origin === 'https://localhost' ||
      origin === 'http://localhost'
    ) {
      return true;
    }

    // Only allow localhost/LAN private IPs in non-production environments
    if (NODE_ENV !== 'production') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return true;
      }
      if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return true;
      }
    }

    return false;
  };

  app.use(cors((req, callback) => {
    const origin = req.header('Origin');
    const host = req.get('host');
    const isWildcard = process.env.ALLOWED_ORIGINS === '*';
    const allowed = isAllowedOrigin(origin, host);

    if (allowed) {
      return callback(null, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        exposedHeaders: ['Content-Disposition', 'x-timestamp', 'Retry-After', 'X-Student-Session-Token'],
        optionsSuccessStatus: 200,
        maxAge: 86400
      });
    }

    if (isWildcard && origin && origin !== 'null') {
      // Wildcard mode must NEVER enable credentials: true
      return callback(null, {
        origin: '*',
        credentials: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        exposedHeaders: ['Content-Disposition', 'x-timestamp', 'Retry-After', 'X-Student-Session-Token'],
        optionsSuccessStatus: 200,
        maxAge: 86400
      });
    }

    // If request is for static assets or non-API routes, do NOT block pipeline with 403 error
    if (!req.path.startsWith('/api/')) {
      return callback(null, { origin: false });
    }

    // Block unauthorized cross-origin API requests
    const corsErr = new Error(`Origin ${origin} not allowed by CORS`);
    corsErr.status = 403;
    corsErr.code = 'ERR_CORS_REJECTED';
    corsErr.isCors = true;
    return callback(corsErr);
  }));
  app.use(express.json({
    limit: MAX_BODY_SIZE,
    verify: (req, res, buf) => {
      req.rawBody = buf ? buf.toString('utf8') : '';
    }
  }));
  app.use(express.urlencoded({
    extended: true,
    limit: MAX_BODY_SIZE,
    verify: (req, res, buf) => {
      req.rawBody = buf ? buf.toString('utf8') : '';
    }
  }));

  // Rate limiting on API routes (disable forwardedHeader strict validation for Cloud Run GFE RFC 7239 headers)
  const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { forwardedHeader: false, trustProxy: false },
    message: { error: '请求太频繁，请休息片刻' }
  });
  app.use('/api/', apiLimiter);

  // Prevent intermediate/browser caching of dynamic API responses
  app.use('/api/', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Authentication middleware (optional in dev)
  app.use('/api/', authMiddleware);

  // Signature verification middleware
  app.use('/api/', signatureMiddleware);

  // --- API Routes ---
  app.use('/api', authRoutes);
  app.use('/api', chatRoutes);
  app.use('/api', visionRoutes);
  app.use('/api', mistakesRoutes);
  app.use('/api', chaptersRoutes);
  app.use('/api', miscRoutes);
  app.use('/api', ttsRoutes);
  app.use('/api', testPaperRoutes);
  app.use('/api', configRoutes);
  app.use('/api', mentorRoutes);
  app.use('/api', campaignRoutes);
  app.use('/api', parentRoutes);
  app.use('/api', homeworkRoutes);
  app.use('/api', gamificationRoutes);
  app.use('/api', membershipRoutes);
  app.use('/api', feynmanRoutes);
  app.use('/api', essayRoutes);
  app.use('/api', englishRoleplayRoutes);
  app.use('/api', learningMapRoutes);

  // Terminate unmatched /api/* routes with JSON 404 before reaching staticLimiter
  app.use('/api', (req, res) => {
    return res.status(404).json({
      error: '请求的 API 接口不存在',
      code: 'ERR_API_NOT_FOUND'
    });
  });

  // --- APK Release Download & Protection ---
  const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
  app.get(/\.apk$/i, (req, res) => {
    const filename = path.basename(req.path);
    const distPath = path.join(CLIENT_DIST, filename);
    const rootPath = path.join(__dirname, '..', filename);

    let targetPath = null;
    if (fs.existsSync(distPath) && fs.statSync(distPath).isFile()) {
      targetPath = distPath;
    } else if (fs.existsSync(rootPath) && fs.statSync(rootPath).isFile()) {
      targetPath = rootPath;
    }

    if (targetPath) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      return res.sendFile(path.basename(targetPath), { root: path.dirname(targetPath) });
    }

    return res.status(404).json({ error: 'APK release file not found on server' });
  });

  // --- Serve static frontend ---
  if (fs.existsSync(CLIENT_DIST)) {
    const staticLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 2000, // higher limit for static assets
      standardHeaders: true,
      legacyHeaders: false,
      validate: { forwardedHeader: false, trustProxy: false }
    });
    app.use(staticLimiter);
    app.use(express.static(CLIENT_DIST, {
      setHeaders: (res, filePath) => {
        const norm = filePath.replace(/\\/g, '/');
        if (norm.endsWith('.html') || norm.endsWith('.json') || norm.endsWith('sw.js') || norm.includes('workbox')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else if (norm.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    // 避免浏览器默认请求 /favicon.ico 落入 SPA fallback 或报 NotFoundError
    app.get('/favicon.ico', (req, res) => {
      const svgIcon = path.join(CLIENT_DIST, 'favicon.svg');
      if (fs.existsSync(svgIcon)) {
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.sendFile('favicon.svg', { root: CLIENT_DIST });
      }
      return res.status(204).end();
    });
    // SPA fallback: return index.html for all non-API, non-static routes
    // 使用 { root: CLIENT_DIST } 避免部署路径含点目录（如 .gemini）时被 send 误判为 dotfile 返 404
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      if (req.path.endsWith('.apk')) {
        return res.status(404).json({ error: 'APK release file not found on server' });
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile('index.html', { root: CLIENT_DIST });
    });
    logger.info('[Static] Serving frontend from client/dist (with no-cache for HTML/SW)');
  }

  // --- Global error handler ---
  app.use((err, req, res, _next) => {
    const isCorsBlock = err.isCors || (err.message && (err.message.includes('not allowed by CORS') || err.message.includes('Origin null is rejected')));
    if (isCorsBlock) {
      logger.warn(`[CORS Blocked] ${err.message} (IP: ${req.ip || 'unknown'})`);
      return res.status(403).json({
        error: 'CORS 跨域安全策略拦截',
        code: 'ERR_CORS_FORBIDDEN'
      });
    }

    logger.error('[Unhandled Error]', err);
    const status = err.status || 500;
    const isProd = isSafeProductionMode();
    const isDevOrTest = !isProd && (NODE_ENV === 'development' || NODE_ENV === 'test' || process.env.NODE_ENV === 'test');
    res.status(status).json({
      error: status === 500
        ? (isProd ? '内部服务器错误' : (err.message ? `内部服务器错误: ${err.message}` : '内部服务器错误'))
        : err.message,
      code: err.code || (status === 500 ? 'ERR_INTERNAL' : 'ERR_BAD_REQUEST'),
      details: isDevOrTest ? err.stack : undefined
    });
  });

  return app;
}

module.exports = { createApp };
