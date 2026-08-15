package main

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

var errNotFound = errors.New("share not found")

type share struct {
	Envelope  []byte
	ExpiresAt int64
}

type store interface {
	Put(context.Context, string, []byte, int64) error
	Get(context.Context, string, int64) (share, error)
	Cleanup(context.Context, int64, int) (int64, error)
	Close() error
}

type memoryStore struct {
	mu     sync.RWMutex
	shares map[string]share
}

func newMemoryStore() *memoryStore {
	return &memoryStore{shares: make(map[string]share)}
}

func (s *memoryStore) Put(_ context.Context, id string, envelope []byte, expiresAt int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.shares[id] = share{Envelope: append([]byte(nil), envelope...), ExpiresAt: expiresAt}
	return nil
}

func (s *memoryStore) Get(_ context.Context, id string, now int64) (share, error) {
	s.mu.RLock()
	record, ok := s.shares[id]
	s.mu.RUnlock()
	if !ok {
		return share{}, errNotFound
	}
	if record.ExpiresAt <= now {
		s.mu.Lock()
		if current, exists := s.shares[id]; exists && current.ExpiresAt <= now {
			delete(s.shares, id)
		}
		s.mu.Unlock()
		return share{}, errNotFound
	}
	record.Envelope = append([]byte(nil), record.Envelope...)
	return record, nil
}

func (s *memoryStore) Cleanup(_ context.Context, now int64, limit int) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var deleted int64
	for id, record := range s.shares {
		if deleted == int64(limit) {
			break
		}
		if record.ExpiresAt <= now {
			delete(s.shares, id)
			deleted++
		}
	}
	return deleted, nil
}

func (*memoryStore) Close() error { return nil }

type sqliteStore struct{ db *sql.DB }

func newSQLiteStore(path string) (*sqliteStore, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	for _, statement := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA busy_timeout=5000",
		"PRAGMA synchronous=NORMAL",
		`CREATE TABLE IF NOT EXISTS shares (
            id TEXT PRIMARY KEY,
			payload BLOB NOT NULL,
            expires_at INTEGER NOT NULL
        )`,
		"CREATE INDEX IF NOT EXISTS shares_expires_at ON shares(expires_at)",
	} {
		if _, err := db.Exec(statement); err != nil {
			db.Close()
			return nil, err
		}
	}
	return &sqliteStore{db: db}, nil
}

func (s *sqliteStore) Put(ctx context.Context, id string, envelope []byte, expiresAt int64) error {
	_, err := s.db.ExecContext(ctx,
		"INSERT INTO shares(id, payload, expires_at) VALUES (?, ?, ?)",
		id, envelope, expiresAt)
	return err
}

func (s *sqliteStore) Get(ctx context.Context, id string, now int64) (share, error) {
	var record share
	err := s.db.QueryRowContext(ctx,
		"SELECT payload, expires_at FROM shares WHERE id = ? AND expires_at > ?",
		id, now).Scan(&record.Envelope, &record.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		// Lazy physical deletion is best-effort; logical expiry is enforced by the query.
		_, _ = s.db.ExecContext(ctx, "DELETE FROM shares WHERE id = ? AND expires_at <= ?", id, now)
		return share{}, errNotFound
	}
	return record, err
}

func (s *sqliteStore) Cleanup(ctx context.Context, now int64, limit int) (int64, error) {
	result, err := s.db.ExecContext(ctx, `DELETE FROM shares WHERE id IN (
        SELECT id FROM shares WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
    )`, now, limit)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (s *sqliteStore) Close() error { return s.db.Close() }

func cleanupLoop(ctx context.Context, s store, now func() time.Time, interval time.Duration, limit int, report func(error)) {
	run := func() {
		cleanupCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		_, err := s.Cleanup(cleanupCtx, now().Unix(), limit)
		if err != nil && !errors.Is(err, context.Canceled) {
			report(err)
		}
	}
	run()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}
