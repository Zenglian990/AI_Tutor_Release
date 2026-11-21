const multer = require('multer');
const path = require('path');

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/heic',
  'image/heif'
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'
]);

const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/aac',
  'audio/x-m4a',
  'audio/m4a',
  'audio/flac',
  'audio/opus'
]);

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.webm', '.mp4', '.mpeg', '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.opus'
]);

// 进程级并发上传槽位控制，防止高并发大文件 buffer 导致 OOM
const MAX_CONCURRENT_UPLOADS = parseInt(process.env.MAX_CONCURRENT_UPLOADS || '10', 10);
let activeUploads = 0;

function detectImageFormat(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const b0 = buffer[0], b1 = buffer[1], b2 = buffer[2], b3 = buffer[3];

  if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return 'image/jpeg';
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) return 'image/png';
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return 'image/gif';
  if (b0 === 0x42 && b1 === 0x4D) return 'image/bmp';

  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46 && buffer.length >= 12) {
    if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'image/webp';
    }
  }

  if (buffer.length >= 12 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.slice(8, 12).toString('ascii').toLowerCase();
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return 'image/heic';
    }
  }
  return null;
}

function detectAudioMimeType(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // WebM: 0x1A 0x45 0xDF 0xA3
  if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
    return 'audio/webm';
  }
  // RIFF .... WAVE
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return 'audio/wav';
  }
  // OGG: OggS
  if (buffer.toString('ascii', 0, 4) === 'OggS') {
    return 'audio/ogg';
  }
  // FLAC: fLaC
  if (buffer.toString('ascii', 0, 4) === 'fLaC') {
    return 'audio/flac';
  }
  // MP3: ID3 or MPEG frame sync
  if (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)) {
    return 'audio/mp3';
  }
  // MP4 / M4A / AAC: ftyp
  if (buffer.length >= 12) {
    const chunk = buffer.toString('ascii', 4, 12);
    if (chunk.includes('ftyp') || chunk.includes('M4A ') || chunk.includes('mp42') || chunk.includes('isom')) {
      return 'audio/aac';
    }
  }

  return null;
}

function createValidationError(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'ERR_UPLOAD_VALIDATION';
  err.isUploadValidation = true;
  return err;
}

function createSafeUpload({ kind = 'image', maxSizeBytes = 10 * 1024 * 1024 } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeBytes, files: 1 },
    fileFilter: (req, file, cb) => {
      const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
      const ext = path.extname(String(file.originalname || '')).toLowerCase();

      if (kind === 'image') {
        if (mime === 'image/svg+xml' || ext === '.svg') {
          return cb(createValidationError('出于安全防护，禁止上传 SVG 图片文件'), false);
        }
        if (!ALLOWED_IMAGE_TYPES.has(mime)) {
          return cb(createValidationError(`不支持的图片格式: ${mime}`), false);
        }
        if (ext && !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
          return cb(createValidationError(`不支持的图片扩展名: ${ext}`), false);
        }
        return cb(null, true);
      }

      if (kind === 'audio') {
        if (!ALLOWED_AUDIO_TYPES.has(mime)) {
          return cb(createValidationError(`不支持的音频格式: ${mime}`), false);
        }
        if (ext && !ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
          return cb(createValidationError(`不支持的音频扩展名: ${ext}`), false);
        }
        return cb(null, true);
      }

      if (kind === 'json') {
        const isJsonMime = mime === 'application/json' || mime === 'text/json' || mime === 'text/plain' || mime === 'application/octet-stream';
        if (!isJsonMime || (ext && ext !== '.json')) {
          return cb(createValidationError('仅允许上传 .json 格式的备份数据文件'), false);
        }
        return cb(null, true);
      }

      return cb(createValidationError('不支持的文件上传类型'), false);
    }
  });
}

/**
 * 包装 Multer single 上传中间件，提供：
 * 1. 进程级并发上传槽位保护（超限返 503 + Retry-After）
 * 2. 将 MulterError / fileFilter 校验异常统一转化为 HTTP 400（绝不返 500）
 */
function withUploadGuard(multerSingleMiddleware) {
  return (req, res, next) => {
    if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
      res.set('Retry-After', '2');
      return res.status(503).json({
        error: '当前上传请求过多，请稍后重试',
        code: 'ERR_UPLOAD_BUSY'
      });
    }

    activeUploads++;
    let released = false;
    const releaseSlot = () => {
      if (!released) {
        released = true;
        activeUploads = Math.max(0, activeUploads - 1);
      }
    };

    res.once('finish', releaseSlot);
    res.once('close', releaseSlot);

    multerSingleMiddleware(req, res, (err) => {
      if (err) {
        releaseSlot();
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '上传文件体积超过最大限制', code: 'ERR_FILE_TOO_LARGE' });
          }
          if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: '上传文件数量或字段名非法', code: 'ERR_INVALID_UPLOAD_FIELD' });
          }
          return res.status(400).json({ error: `文件上传格式错误: ${err.code}`, code: 'ERR_MULTER' });
        }
        if (err.isUploadValidation || err.status === 400) {
          return res.status(400).json({ error: err.message || '不支持的文件类型', code: err.code || 'ERR_UPLOAD_VALIDATION' });
        }
        return res.status(400).json({ error: '文件上传解析失败', code: 'ERR_UPLOAD_PARSE' });
      }
      return next();
    });
  };
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_AUDIO_EXTENSIONS,
  detectImageFormat,
  detectAudioMimeType,
  createSafeUpload,
  withUploadGuard
};
