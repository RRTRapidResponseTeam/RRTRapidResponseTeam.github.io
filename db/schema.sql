PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  discord_username TEXT,
  discord_global_name TEXT,
  discord_joined_at TEXT,
  discord_boost_since TEXT,
  discord_pending INTEGER DEFAULT 0,
  discord_deaf INTEGER DEFAULT 0,
  discord_mute INTEGER DEFAULT 0,
  discord_roles_json TEXT NOT NULL DEFAULT '[]',
  access_role TEXT NOT NULL DEFAULT 'ticket',
  password_hash TEXT,
  password_salt TEXT,
  activation_hash TEXT,
  activation_expires_at INTEGER,
  birth_date TEXT,
  joined_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_access_role ON users(access_role);
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS questionnaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  questionnaire_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  options_json TEXT NOT NULL DEFAULT '[]',
  required INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_questions_questionnaire ON questions(questionnaire_id, sort_order);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  questionnaire_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  FOREIGN KEY(questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_date ON submissions(submitted_at);
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  value TEXT NOT NULL,
  FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);

CREATE TABLE IF NOT EXISTS rank_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  old_rank TEXT,
  new_rank TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  reason TEXT,
  changed_by TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rank_history_user ON rank_history(user_id, changed_at DESC);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guide_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guide_key TEXT NOT NULL,
  block_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  theory TEXT NOT NULL,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(guide_key, block_no)
);
CREATE INDEX IF NOT EXISTS idx_guide_blocks_guide ON guide_blocks(guide_key, sort_order);

CREATE TABLE IF NOT EXISTS guide_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(block_id) REFERENCES guide_blocks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_guide_questions_block ON guide_questions(block_id, sort_order);

CREATE TABLE IF NOT EXISTS guide_progress (
  user_id TEXT NOT NULL,
  guide_key TEXT NOT NULL,
  block_id INTEGER NOT NULL,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  resets INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, guide_key, block_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(block_id) REFERENCES guide_blocks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_guide_progress_user ON guide_progress(user_id, guide_key);

CREATE TABLE IF NOT EXISTS guide_attempt_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  guide_key TEXT NOT NULL,
  block_id INTEGER NOT NULL,
  question_id INTEGER,
  correct INTEGER NOT NULL,
  wrong_count_after INTEGER NOT NULL,
  resets_after INTEGER NOT NULL,
  event TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(block_id) REFERENCES guide_blocks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_guide_attempt_log_user ON guide_attempt_log(user_id, guide_key, created_at DESC);

INSERT OR IGNORE INTO questionnaires (id,title,description,active,created_at,updated_at)
VALUES (1,'Опросник RRT','Заполните все обязательные вопросы.',1,strftime('%s','now'),strftime('%s','now'));
