const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('./middleware/auth');
const { signatureMiddleware } = require('./middleware/signature');
const { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, MAX_BODY_SIZE, NODE_ENV } = require('./config');
const logger = require('./services/logger');

// Import routes
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

function createApp() {
  const app = express();

  // Trust proxy for reverse proxy environments (e.g. Nginx, Docker)
  app.set('trust proxy', 'loopback');

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
        // unsafe-inline needed for Vite-built SPA inline styles; unsafe-eval removed in production
        scriptSrc: NODE_ENV === 'development'
          ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
          : ["'self'"], // Security fix: Removed 'unsafe-inline' for production
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        fontSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'"],
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
    ...rawAllowed
  ]);

  app.use(cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (curl, server-to-server, mobile native HTTP) or 'null' (sandboxed webviews)
      if (!origin || origin === 'null') {
        return callback(null, true);
      }

      // Allow if wildcard or explicitly configured
      if (process.env.ALLOWED_ORIGINS === '*' || explicitAllowed.has(origin)) {
        return callback(null, true);
      }

      // Allow localhost with any port or without port (Capacitor Android/iOS WebView, local dev)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Allow Capacitor / Ionic / local file schemas
      if (/^(capacitor|ionic|file):\/\//.test(origin)) {
        return callback(null, true);
      }

      // Allow LAN private IPs (e.g. mobile phone connecting to PC over same Wi-Fi)
      if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Allow onrender.com and other cloud deployments
      if (origin.endsWith('.onrender.com') || origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }

      // For public mobile client access: allow origin (API security is enforced by token & HMAC signature)
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-timestamp',
      'x-signature',
      'x-api-key',
      'x-form-fields',
      'x-file-fields',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'Pragma'
    ],
    exposedHeaders: ['Content-Disposition', 'x-timestamp', 'Retry-After'],
    optionsSuccessStatus: 200,
    maxAge: 86400
  }));
  app.use(express.json({ limit: MAX_BODY_SIZE }));
  app.use(express.urlencoded({ extended: true, limit: MAX_BODY_SIZE }));

  // Rate limiting on API routes
  const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '请求太频繁，请休息片刻' }
  });
  app.use('/api/', apiLimiter);

  // Authentication middleware (optional in dev)
  app.use('/api/', authMiddleware);

  // Signature verification middleware
  app.use('/api/', signatureMiddleware);

  // --- API Routes ---
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

  // --- Serve static frontend ---
  const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(CLIENT_DIST)) {
    const staticLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 2000, // higher limit for static assets
      standardHeaders: true,
      legacyHeaders: false
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
    // SPA fallback: return index.html for all non-API, non-static routes
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
    logger.info('[Static] Serving frontend from client/dist (with no-cache for HTML/SW)');
  }

  // --- Global error handler ---
  app.use((err, req, res, _next) => {
    logger.error('[Unhandled Error]', err);
    const status = err.status || 500;
    res.status(status).json({
      error: status === 500 ? '内部服务器错误' : err.message,
      code: err.code || (status === 500 ? 'ERR_INTERNAL' : 'ERR_BAD_REQUEST'),
      details: NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  return app;
}

module.exports = { createApp };
