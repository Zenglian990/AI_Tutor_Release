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

function createApp() {
  const app = express();

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
          : ["'self'", "'unsafe-inline'"],
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
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || 
          allowedOrigins.includes(origin) || 
          origin.startsWith('http://localhost:') || 
          origin.startsWith('http://127.0.0.1:') || 
          origin.startsWith('https://localhost:') || 
          origin.startsWith('https://127.0.0.1:')) {
        callback(null, true);
      } else if (NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
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

  // --- Serve static frontend ---
  const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    // SPA fallback: return index.html for all non-API, non-static routes
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
    logger.info('[Static] Serving frontend from client/dist');
  }

  // --- Global error handler ---
  app.use((err, req, res, _next) => {
    logger.error('[Unhandled Error]', err);
    const status = err.status || 500;
    res.status(status).json({
      error: status === 500 ? '服务器内部错误' : err.message,
      details: NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  return app;
}

module.exports = { createApp };
