-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  CHECK (role IN ('admin', 'user'))
);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  info_hash bytea NOT NULL,
  created_at timestamp with time zone NOT NULL,
  PRIMARY KEY (user_id, info_hash)
);

CREATE INDEX IF NOT EXISTS user_favorites_created_at_idx ON user_favorites (created_at);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS user_favorites;
DROP TABLE IF EXISTS users;

-- +goose StatementEnd
