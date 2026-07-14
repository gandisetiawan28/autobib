import winston from 'winston';
import path from 'path';
import fs from 'fs';
import DailyRotateFile from 'winston-daily-rotate-file';

const LOG_DIR = path.dirname(process.env.LOG_FILE || './logs/autobib.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const sharedFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) =>
    stack
      ? `${timestamp} [${level.toUpperCase()}] ${message}\n${stack}`
      : `${timestamp} [${level.toUpperCase()}] ${message}`
  )
);

// Daily rotate transport — rotasi setiap hari, simpan 14 hari terakhir, max 50MB per file
const dailyRotateTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'autobib-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,        // Compress file lama dengan gzip
  maxSize: '50m',             // Max 50MB per file
  maxFiles: '14d',            // Hapus file lebih dari 14 hari
  format: sharedFormat,
});

dailyRotateTransport.on('rotate', (oldFilename, newFilename) => {
  console.log(`[Logger] Rotated: ${oldFilename} → ${newFilename}`);
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: sharedFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) =>
          `${timestamp} ${level}: ${message}`
        )
      ),
    }),
    dailyRotateTransport,
  ],
});
