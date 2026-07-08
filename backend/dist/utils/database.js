"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.initDatabase = initDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("./logger");
const DB_PATH = process.env.DB_PATH || path_1.default.join(__dirname, '../../database/autobib.db');
const SCHEMA_PATH = path_1.default.join(__dirname, '../../database/schema.sql');
let db;
function getDb() {
    if (!db)
        throw new Error('Database not initialized. Call initDatabase() first.');
    return db;
}
async function initDatabase() {
    const dbDir = path_1.default.dirname(DB_PATH);
    if (!fs_1.default.existsSync(dbDir))
        fs_1.default.mkdirSync(dbDir, { recursive: true });
    db = new better_sqlite3_1.default(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const schema = fs_1.default.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);
    try {
        db.exec("ALTER TABLE user_settings ADD COLUMN local_bridge_url TEXT DEFAULT 'http://127.0.0.1:3000'");
    }
    catch (e) {
        // Column might already exist, ignore error
    }
    logger_1.logger.info(`Database ready at ${DB_PATH}`);
}
//# sourceMappingURL=database.js.map