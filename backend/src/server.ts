import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
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

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

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

    app.listen(PORT, () => {
      logger.info(`🚀 AutoBib backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error('❌ Failed to start server', err);
    process.exit(1);
  }
}

start();
