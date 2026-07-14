import dotenv from 'dotenv';
import path from 'path';
// Load .env explicitly dari folder backend agar npm run dev dari root bisa membacanya
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { initDatabase } from './utils/database';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error.middleware';
import authRoutes from './routes/auth.route';
import settingsRoutes from './routes/settings.route';
import mendeleyRoutes from './routes/mendeley.route';
import aiRoutes from './routes/ai.route';
import citationRoutes from './routes/citation.route';
import smartCitationRoutes from './routes/smart-citation.route';
import keyPoolRoutes from './routes/key-pool.route';
import chatRoutes from './routes/chat.route';
import systemRoutes from './routes/system.route';
import skillsRoutes from './routes/skills.route';

const app = express();
const PORT = process.env.PORT || 3001;

// ── HTTP server + Socket.IO ────────────────────────────────────
const httpServer = http.createServer(app);
export const io = new SocketIOServer(httpServer, {
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
});

// ── Per-IP rate limiter (max 2000 req / 60 detik) ──────────────
const rateLimiter = new RateLimiterMemory({ points: 2000, duration: 60 });
const rateLimitMiddleware = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  try {
    await rateLimiter.consume(req.ip ?? 'unknown');
    next();
  } catch {
    res.status(429).json({ error: 'Too Many Requests. Coba lagi nanti.' });
  }
};

// ── Security & Middleware ──────────────────────────────────────
app.use(
  helmet({
    // Office Add-in memerlukan iframe — matikan frameGuard agar manifest bisa di-load
    frameguard: false,
    // CSP dikecualikan karena Office.js punya kebutuhan khusus
    contentSecurityPolicy: false,
  })
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use(rateLimitMiddleware);

// ── Socket.IO — Real-time events ──────────────────────────────
io.on('connection', (socket) => {
  logger.info(`🔌 Socket connected: ${socket.id}`);

  // Client bisa emit 'cancel_stream' untuk membatalkan generasi AI
  socket.on('cancel_stream', (sessionId: string) => {
    logger.info(`⛔ Cancel stream requested for session: ${sessionId}`);
    // Emit ke room session agar route handler bisa mendengar
    socket.to(`session:${sessionId}`).emit('stream_cancelled');
    socket.emit('stream_cancelled'); // juga ke sender itu sendiri
  });

  socket.on('join_session', (sessionId: string) => {
    socket.join(`session:${sessionId}`);
    logger.info(`📥 Socket ${socket.id} joined session:${sessionId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// Export untuk diakses dari routes
export function getIO(): SocketIOServer {
  return io;
}

// ── Routes ───────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/settings', settingsRoutes);
app.use('/settings/key-pool', keyPoolRoutes);
app.use('/mendeley', mendeleyRoutes);
app.use('/ai', aiRoutes);
app.use('/citation', citationRoutes);
app.use('/smart-citation', smartCitationRoutes);
app.use('/chat', chatRoutes);
app.use('/system', systemRoutes);
app.use('/skills', skillsRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const version = process.env.APP_VERSION || process.env.npm_package_version || '1.0.0';
  res.json({ status: 'ok', version, timestamp: new Date().toISOString() });
});

// ── Error handler (must be last) ─────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────
async function start() {
  try {
    await initDatabase();
    logger.info('✅ Database initialized');

    httpServer.listen(PORT, () => {
      logger.info(`🚀 AutoBib backend running on http://localhost:${PORT}`);
      logger.info(`🔌 Socket.IO ready on ws://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error('❌ Failed to start server', err);
    process.exit(1);
  }
}

start();
