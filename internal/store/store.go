// Package store persists encrypted shares in SQLite. It never handles decryption keys.
package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/oklog/ulid/v2"
	_ "modernc.org/sqlite"
)

const defaultRemainingReads = 20

var ErrNotFound = errors.New("share not found")

type Share struct {
	ID        string
	Envelope  []byte
	ExpiresAt time.Time
}

type DeleteTokenHash [32]byte

type Created struct {
	Share
	DeleteToken []byte
}

func HashDeleteToken(token []byte) DeleteTokenHash {
	return sha256.Sum256(token)
}

type Store struct {
	db            *sql.DB
	insert        *sql.Stmt
	consumeShare  *sql.Stmt
	peekShare     *sql.Stmt
	revokeShare   *sql.Stmt
	deleteExpired *sql.Stmt
	now           func() time.Time
}

func Open(ctx context.Context, path string) (*Store, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve database path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0700); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}
	dsn := url.URL{Scheme: "file", Path: filepath.ToSlash(abs)}
	settings := url.Values{}
	// These settings apply to replacement connections as well as the first one.
	settings.Add("_pragma", "busy_timeout(5000)")
	settings.Add("_pragma", "journal_mode(WAL)")
	settings.Add("_pragma", "synchronous(FULL)")
	dsn.RawQuery = settings.Encode()
	db, err := sql.Open("sqlite", dsn.String())
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	// SQLite has one writer. Queue work in database/sql instead of competing for locks.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	s := &Store{db: db, now: time.Now}
	if err := s.init(ctx); err != nil {
		return nil, errors.Join(err, db.Close())
	}
	return s, nil
}

func (s *Store) init(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS shares (
			id TEXT PRIMARY KEY,
			envelope BLOB NOT NULL,
			expires_at INTEGER NOT NULL,
			remaining_reads INTEGER NOT NULL,
			delete_token_hash BLOB NOT NULL
		) STRICT;
		CREATE INDEX IF NOT EXISTS shares_expires_at ON shares (expires_at);
	`)
	if err != nil {
		return fmt.Errorf("initialize shares: %w", err)
	}
	var columnCount int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('shares') WHERE name = 'remaining_reads'`).Scan(&columnCount); err != nil {
		return fmt.Errorf("check remaining_reads column: %w", err)
	}
	if columnCount == 0 {
		if _, err := s.db.ExecContext(ctx, fmt.Sprintf(`ALTER TABLE shares ADD COLUMN remaining_reads INTEGER NOT NULL DEFAULT %d`, defaultRemainingReads)); err != nil {
			return fmt.Errorf("add remaining_reads column: %w", err)
		}
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('shares') WHERE name = 'delete_token_hash'`).Scan(&columnCount); err != nil {
		return fmt.Errorf("check delete_token_hash column: %w", err)
	}
	if columnCount == 0 {
		if _, err := s.db.ExecContext(ctx, `ALTER TABLE shares ADD COLUMN delete_token_hash BLOB`); err != nil {
			return fmt.Errorf("add delete_token_hash column: %w", err)
		}
	}
	s.insert, err = s.db.PrepareContext(ctx, "INSERT INTO shares (id, envelope, expires_at, remaining_reads, delete_token_hash) VALUES (?, ?, ?, ?, ?)")
	if err != nil {
		return fmt.Errorf("prepare create: %w", err)
	}
	s.consumeShare, err = s.db.PrepareContext(ctx, `
		UPDATE shares SET remaining_reads = remaining_reads - 1
		WHERE id = ? AND expires_at > ? AND remaining_reads > 0
		RETURNING envelope, expires_at`)
	if err != nil {
		return fmt.Errorf("prepare consume: %w", err)
	}
	s.peekShare, err = s.db.PrepareContext(ctx, "SELECT 1 FROM shares WHERE id = ? AND expires_at > ? AND remaining_reads > 0")
	if err != nil {
		return fmt.Errorf("prepare peek: %w", err)
	}
	s.revokeShare, err = s.db.PrepareContext(ctx, `
		DELETE FROM shares
		WHERE id = ? AND delete_token_hash = ? AND expires_at > ? AND remaining_reads > 0`)
	if err != nil {
		return fmt.Errorf("prepare revoke: %w", err)
	}
	s.deleteExpired, err = s.db.PrepareContext(ctx, "DELETE FROM shares WHERE id IN (SELECT id FROM shares WHERE expires_at <= ? OR remaining_reads <= 0 LIMIT 500)")
	if err != nil {
		return fmt.Errorf("prepare sweep: %w", err)
	}
	return nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Ping(ctx context.Context) error {
	var one int
	if err := s.db.QueryRowContext(ctx, "SELECT 1").Scan(&one); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}
	if one != 1 {
		return fmt.Errorf("ping database: unexpected result %d", one)
	}
	return nil
}

func (s *Store) Create(ctx context.Context, envelope []byte, ttl time.Duration, maxReads int) (Created, error) {
	now := s.now()
	id, err := ulid.New(ulid.Timestamp(now), rand.Reader)
	if err != nil {
		return Created{}, fmt.Errorf("generate share ID: %w", err)
	}
	deleteToken := make([]byte, 32)
	if _, err := rand.Read(deleteToken); err != nil {
		return Created{}, fmt.Errorf("generate delete token: %w", err)
	}
	tokenHash := HashDeleteToken(deleteToken)
	share := Share{ID: id.String(), Envelope: envelope, ExpiresAt: now.Add(ttl).Truncate(time.Millisecond)}
	if _, err := s.insert.ExecContext(ctx, share.ID, share.Envelope, share.ExpiresAt.UnixMilli(), maxReads, tokenHash[:]); err != nil {
		return Created{}, fmt.Errorf("create share: %w", err)
	}
	return Created{Share: share, DeleteToken: deleteToken}, nil
}

func (s *Store) Revoke(ctx context.Context, id string, tokenHash DeleteTokenHash) error {
	result, err := s.revokeShare.ExecContext(ctx, id, tokenHash[:], s.now().UnixMilli())
	if err != nil {
		return fmt.Errorf("revoke share: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count revoked shares: %w", err)
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) Consume(ctx context.Context, id string) (Share, error) {
	share := Share{ID: id}
	var expiresAt int64
	err := s.consumeShare.QueryRowContext(ctx, id, s.now().UnixMilli()).Scan(&share.Envelope, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Share{}, ErrNotFound
	}
	if err != nil {
		return Share{}, fmt.Errorf("consume share: %w", err)
	}
	share.ExpiresAt = time.UnixMilli(expiresAt)
	return share, nil
}

func (s *Store) Peek(ctx context.Context, id string) error {
	var one int
	err := s.peekShare.QueryRowContext(ctx, id, s.now().UnixMilli()).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("peek share: %w", err)
	}
	return nil
}

func (s *Store) Sweep(ctx context.Context) (int64, error) {
	cutoff := s.now().UnixMilli()
	var total int64
	for {
		result, err := s.deleteExpired.ExecContext(ctx, cutoff)
		if err != nil {
			return total, fmt.Errorf("sweep shares: %w", err)
		}
		count, err := result.RowsAffected()
		if err != nil {
			return total, fmt.Errorf("count expired shares: %w", err)
		}
		total += count
		if count < 500 {
			return total, nil
		}
	}
}

func (s *Store) SweepEvery(ctx context.Context, every time.Duration, after func(deleted int64, took time.Duration, err error)) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			start := time.Now()
			n, err := s.Sweep(ctx)
			took := time.Since(start)
			if err != nil && ctx.Err() != nil {
				return
			}
			after(n, took, err)
		}
	}
}
