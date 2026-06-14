-- StatePass Sync Server Schema
-- PostgreSQL

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login    TIMESTAMP WITH TIME ZONE,
  is_active     BOOLEAN DEFAULT true,
  is_admin      BOOLEAN DEFAULT false
);

-- User profiles table (stores StatePass site entries — never passwords)
CREATE TABLE IF NOT EXISTS user_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  profile_name    VARCHAR(100) NOT NULL,
  site            VARCHAR(255),
  login           VARCHAR(255),
  default_length  INT DEFAULT 16  CHECK (default_length >= 4 AND default_length <= 64),
  default_counter INT DEFAULT 1   CHECK (default_counter >= 1),
  lowercase       BOOLEAN DEFAULT true,
  uppercase       BOOLEAN DEFAULT true,
  digits          BOOLEAN DEFAULT true,
  symbols         BOOLEAN DEFAULT true,
  iterations      INT DEFAULT 600000 CHECK (iterations >= 100000),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, profile_name)
);

-- Trusted devices / sync tokens
CREATE TABLE IF NOT EXISTS sync_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash   VARCHAR(255) UNIQUE NOT NULL,   -- stored as bcrypt hash, never plaintext
  device_id    VARCHAR(255),
  device_name  VARCHAR(255),
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at   TIMESTAMP WITH TIME ZONE NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked      BOOLEAN DEFAULT false
);

-- Audit log (immutable — no DELETE)
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  event      VARCHAR(100) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  meta       JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rate limiting buckets (simple sliding window)
CREATE TABLE IF NOT EXISTS rate_limit (
  key        VARCHAR(255) PRIMARY KEY,
  count      INT DEFAULT 1,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Refresh tokens (for JWT rotation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  device_id  VARCHAR(255),
  issued_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked    BOOLEAN DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id  ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_tokens_user_id    ON sync_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_tokens_device     ON sync_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id      ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at   ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
