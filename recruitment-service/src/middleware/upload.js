const path = require('path');
const multer = require('multer');
const env = require('../config/env');
const { BadRequestError } = require('../utils/AppError');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain'
]);

const RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const ALLOWED_EXTENSIONS_BY_MIME = {
  'application/pdf': new Set(['.pdf']),
  'application/msword': new Set(['.doc']),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': new Set(['.docx']),
  'image/png': new Set(['.png']),
  'image/jpeg': new Set(['.jpg', '.jpeg']),
  'image/webp': new Set(['.webp']),
  'text/plain': new Set(['.txt'])
};

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.msi', '.dll', '.bat', '.cmd', '.sh', '.ps1', '.vbs',
  '.js', '.mjs', '.cjs', '.html', '.htm', '.svg', '.php', '.py', '.jar',
  '.phtml', '.asp', '.aspx', '.jsp', '.scr', '.com'
]);

function extractAllExtensionSegments(originalname) {
  const base = path.basename(String(originalname || '').trim());
  const parts = base.split('.');
  if (parts.length <= 1) return [];
  return parts.slice(1).map((segment) => `.${segment.toLowerCase()}`);
}

function createUploadMiddleware({ allowedMimeTypes = ALLOWED_MIME_TYPES, maxSizeMb = env.storage.maxUploadSizeMb } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxSizeMb * 1024 * 1024,
      files: 3
    },
    fileFilter: (_req, file, cb) => {
      const rawName = String(file.originalname || '');
      if (!rawName || rawName.includes('\0') || rawName.length > 180) {
        return cb(
          new BadRequestError(
            'Uploaded file name is missing or invalid.',
            null,
            'INVALID_FILE_NAME'
          )
        );
      }

      const ext = path.extname(rawName).toLowerCase();
      if (!allowedMimeTypes.has(file.mimetype)) {
        return cb(
          new BadRequestError(
            `Unsupported file type: ${file.mimetype}`,
            { allowedMimeTypes: [...allowedMimeTypes] },
            'UNSUPPORTED_FILE_TYPE'
          )
        );
      }

      const allSegments = extractAllExtensionSegments(rawName);
      const dangerousSegment = allSegments.find((seg) => DANGEROUS_EXTENSIONS.has(seg));
      if (dangerousSegment) {
        return cb(
          new BadRequestError(
            `Forbidden file extension detected: ${dangerousSegment}`,
            { extension: dangerousSegment },
            'UNSUPPORTED_FILE_EXTENSION'
          )
        );
      }

      const expectedExts = ALLOWED_EXTENSIONS_BY_MIME[file.mimetype];
      if (!ext || (expectedExts && !expectedExts.has(ext))) {
        return cb(
          new BadRequestError(
            `File extension '${ext || 'none'}' does not match MIME type '${file.mimetype}'`,
            { extension: ext || null, mimeType: file.mimetype },
            'UNSUPPORTED_FILE_EXTENSION'
          )
        );
      }
      return cb(null, true);
    }
  });
}

module.exports = {
  createUploadMiddleware,
  ALLOWED_MIME_TYPES,
  RESUME_MIME_TYPES,
  ALLOWED_EXTENSIONS_BY_MIME,
  DANGEROUS_EXTENSIONS
};

