CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  started_at INTEGER,
  ends_at INTEGER,
  duration_ms INTEGER NOT NULL,
  question_time_ms INTEGER NOT NULL,
  prize_amounts_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  choices_json TEXT NOT NULL,
  correct_choice_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_room ON questions(room_id, position);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  joined_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  choice_id TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  time_taken_ms INTEGER NOT NULL,
  is_correct INTEGER NOT NULL,
  points INTEGER NOT NULL,
  UNIQUE(player_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_answers_player ON answers(player_id);

CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  amount TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  confirmed_at INTEGER,
  UNIQUE(room_id, rank)
);
