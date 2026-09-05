import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('sqlite.db');
export const db = drizzle(sqlite, { schema });

// Initialize database (create tables if they don't exist)
// In a real app, you'd use migrations, but for simplicity here we'll just ensure tables exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS performers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    voice_type TEXT,
    experience TEXT,
    notes TEXT,
    custom_fields TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS custom_attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    options TEXT,
    required INTEGER DEFAULT 0,
    "order" INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS auditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    location TEXT,
    status TEXT DEFAULT 'open',
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS audition_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audition_id INTEGER REFERENCES auditions(id),
    performer_id INTEGER REFERENCES performers(id),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    score INTEGER,
    feedback TEXT,
    passed_to_callback INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS callbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audition_id INTEGER REFERENCES auditions(id),
    performer_id INTEGER REFERENCES performers(id),
    scheduled_time TEXT,
    notes TEXT,
    final_decision TEXT DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS login_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    created_at INTEGER
  );
`);
