import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database/autobib.db');
const SCHEMA_PATH = path.join(__dirname, '../../database/schema.sql');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export async function initDatabase(): Promise<void> {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  
  try {
    db.exec("ALTER TABLE user_settings ADD COLUMN local_bridge_url TEXT DEFAULT 'http://127.0.0.1:3000'");
  } catch (e) {
    // Column might already exist, ignore error
  }
  
  logger.info(`Database ready at ${DB_PATH}`);
}
