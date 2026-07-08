"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const database_1 = require("./utils/database");
const logger_1 = require("./utils/logger");
const error_middleware_1 = require("./middleware/error.middleware");
const auth_route_1 = __importDefault(require("./routes/auth.route"));
const settings_route_1 = __importDefault(require("./routes/settings.route"));
const mendeley_route_1 = __importDefault(require("./routes/mendeley.route"));
const ai_route_1 = __importDefault(require("./routes/ai.route"));
const citation_route_1 = __importDefault(require("./routes/citation.route"));
const smart_citation_route_1 = __importDefault(require("./routes/smart-citation.route"));
const key_pool_route_1 = __importDefault(require("./routes/key-pool.route"));
const chat_route_1 = __importDefault(require("./routes/chat.route"));
const system_route_1 = __importDefault(require("./routes/system.route"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// ── Middleware ────────────────────────────────────────────────
app.use((0, cors_1.default)({
    origin: true,
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, morgan_1.default)('dev'));
// ── Routes ───────────────────────────────────────────────────
app.use('/auth', auth_route_1.default);
app.use('/settings', settings_route_1.default);
app.use('/settings/key-pool', key_pool_route_1.default);
app.use('/mendeley', mendeley_route_1.default);
app.use('/ai', ai_route_1.default);
app.use('/citation', citation_route_1.default);
app.use('/smart-citation', smart_citation_route_1.default);
app.use('/chat', chat_route_1.default);
app.use('/system', system_route_1.default);
// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});
// ── Error handler (must be last) ─────────────────────────────
app.use(error_middleware_1.errorHandler);
// ── Start ─────────────────────────────────────────────────────
async function start() {
    try {
        await (0, database_1.initDatabase)();
        logger_1.logger.info('✅ Database initialized');
        app.listen(PORT, () => {
            logger_1.logger.info(`🚀 AutoBib backend running on http://localhost:${PORT}`);
        });
    }
    catch (err) {
        logger_1.logger.error('❌ Failed to start server', err);
        process.exit(1);
    }
}
start();
//# sourceMappingURL=server.js.map