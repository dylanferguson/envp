// Package store persists encrypted shares in SQLite. It never handles decryption keys.
package store

import (
	"context"
	"crypto/rand"
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

var ErrNotFound = errors.New("share not found")

type Share struct {
	ID        string
	Envelope  []byte
	ExpiresAt time.Time
}

type Store struct {
	db            *sql.DB
	insert        *sql.Stmt
	selectShare   *sql.Stmt
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
			expires_at INTEGER NOT NULL
		) STRICT;
		CREATE INDEX IF NOT EXISTS shares_expires_at ON shares (expires_at);
	`)
	if err != nil {
		return fmt.Errorf("initialize shares: %w", err)
	}
	s.insert, err = s.db.PrepareContext(ctx, "INSERT INTO shares (id, envelope, expires_at) VALUES (?, ?, ?)")
	if err != nil {
		return fmt.Errorf("prepare create: %w", err)
	}
	s.selectShare, err = s.db.PrepareContext(ctx, "SELECT envelope, expires_at FROM shares WHERE id = ? AND expires_at > ?")
	if err != nil {
		return fmt.Errorf("prepare read: %w", err)
	}
	s.deleteExpired, err = s.db.PrepareContext(ctx, "DELETE FROM shares WHERE id IN (SELECT id FROM shares WHERE expires_at <= ? LIMIT 500)")
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

func (s *Store) Create(ctx context.Context, envelope []byte, ttl time.Duration) (Share, error) {
	now := s.now()
	id, err := ulid.New(ulid.Timestamp(now), rand.Reader)
	if err != nil {
		return Share{}, fmt.Errorf("generate share ID: %w", err)
	}
	share := Share{ID: id.String(), Envelope: envelope, ExpiresAt: now.Add(ttl).Truncate(time.Millisecond)}
	if _, err := s.insert.ExecContext(ctx, share.ID, share.Envelope, share.ExpiresAt.UnixMilli()); err != nil {
		return Share{}, fmt.Errorf("create share: %w", err)
	}
	return share, nil
}

func (s *Store) Read(ctx context.Context, id string) (Share, error) {
	share := Share{ID: id}
	var expiresAt int64
	err := s.selectShare.QueryRowContext(ctx, id, s.now().UnixMilli()).Scan(&share.Envelope, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Share{}, ErrNotFound
	}
	if err != nil {
		return Share{}, fmt.Errorf("read share: %w", err)
	}
	share.ExpiresAt = time.UnixMilli(expiresAt)
	return share, nil
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
