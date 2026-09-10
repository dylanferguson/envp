CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  envelope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  remaining_reads INTEGER NOT NULL
) STRICT;

CREATE INDEX shares_expires_at ON shares (expires_at);
