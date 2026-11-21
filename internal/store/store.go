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

const defaultRemainingReads = 20

var (
	ErrNotFound = errors.New("share not found")
	ErrCapacity = errors.New("share storage is full")
)

// Limits caps active shares so a flood of creates cannot exhaust the disk.
// Zero values select the default caps.
type Limits struct {
	MaxActiveShares int64
	MaxActiveBytes  int64
}

// DefaultLimits keeps a 1gb volume well clear of full: worst case is
// 256 MiB of envelopes plus indexes and WAL checkpoints.
func DefaultLimits() Limits {
	return Limits{MaxActiveShares: 50_000, MaxActiveBytes: 256 << 20}
}

func (l Limits) withDefaults() Limits {
	if l.MaxActiveShares <= 0 {
		l.MaxActiveShares = DefaultLimits().MaxActiveShares
	}
	if l.MaxActiveBytes <= 0 {
		l.MaxActiveBytes = DefaultLimits().MaxActiveBytes
	}
	return l
}

type Share struct {
	ID        string
	Envelope  []byte
	ExpiresAt time.Time
}

type Stats struct {
	ActiveShares int64
	ActiveBytes  int64
}

type Store struct {
	db            *sql.DB
	peekShare     *sql.Stmt
	deleteExpired *sql.Stmt
	stats         *sql.Stmt
	limits        Limits
	now           func() time.Time
}

func Open(ctx context.Context, path string, limits Limits) (*Store, error) {
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
	s := &Store{db: db, limits: limits.withDefaults(), now: time.Now}
	if err := s.init(ctx); err != nil {
		return nil, errors.Join(err, db.Close())
	}
	return s, nil
}

const (
	deleteExpiredSQL = "DELETE FROM shares WHERE id IN (SELECT id FROM shares WHERE expires_at <= ? LIMIT 500)"
	selectStatsSQL   = "SELECT count, bytes FROM share_stats WHERE id = 1"
)

func (s *Store) init(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS shares (
			id TEXT PRIMARY KEY,
			envelope BLOB NOT NULL,
			expires_at INTEGER NOT NULL,
			remaining_reads INTEGER NOT NULL
		) STRICT;
		CREATE INDEX IF NOT EXISTS shares_expires_at ON shares (expires_at);
		CREATE TABLE IF NOT EXISTS share_stats (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			count INTEGER NOT NULL,
			bytes INTEGER NOT NULL
		) STRICT;
		CREATE TRIGGER IF NOT EXISTS shares_after_insert AFTER INSERT ON shares BEGIN
			UPDATE share_stats SET count = count + 1, bytes = bytes + LENGTH(NEW.envelope) WHERE id = 1;
		END;
		CREATE TRIGGER IF NOT EXISTS shares_after_delete AFTER DELETE ON shares BEGIN
			UPDATE share_stats SET count = count - 1, bytes = bytes - LENGTH(OLD.envelope) WHERE id = 1;
		END;
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
	// Clean up any pre-existing exhausted rows and reconcile stats on startup.
	if _, err := s.db.ExecContext(ctx, `
		DELETE FROM shares WHERE remaining_reads <= 0;
		INSERT OR REPLACE INTO share_stats (id, count, bytes)
		SELECT 1, COUNT(*), COALESCE(SUM(LENGTH(envelope)), 0) FROM shares;
	`); err != nil {
		return fmt.Errorf("reconcile share stats: %w", err)
	}
	s.peekShare, err = s.db.PrepareContext(ctx, "SELECT 1 FROM shares WHERE id = ? AND expires_at > ? AND remaining_reads > 0")
	if err != nil {
		return fmt.Errorf("prepare peek: %w", err)
	}
	s.deleteExpired, err = s.db.PrepareContext(ctx, deleteExpiredSQL)
	if err != nil {
		return fmt.Errorf("prepare sweep: %w", err)
	}
	s.stats, err = s.db.PrepareContext(ctx, selectStatsSQL)
	if err != nil {
		return fmt.Errorf("prepare stats: %w", err)
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

func (s *Store) Stats(ctx context.Context) (Stats, error) {
	var st Stats
	if err := s.stats.QueryRowContext(ctx).Scan(&st.ActiveShares, &st.ActiveBytes); err != nil {
		return Stats{}, fmt.Errorf("read share stats: %w", err)
	}
	return st, nil
}

func (s *Store) Create(ctx context.Context, envelope []byte, ttl time.Duration, maxReads int) (Share, error) {
	now := s.now()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Share{}, fmt.Errorf("begin create: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := s.ensureCapacityTx(ctx, tx, now.UnixMilli(), int64(len(envelope))); err != nil {
		return Share{}, err
	}
	id, err := ulid.New(ulid.Timestamp(now), rand.Reader)
	if err != nil {
		return Share{}, fmt.Errorf("generate share ID: %w", err)
	}
	share := Share{ID: id.String(), Envelope: envelope, ExpiresAt: now.Add(ttl).Truncate(time.Millisecond)}
	if _, err := tx.ExecContext(ctx, "INSERT INTO shares (id, envelope, expires_at, remaining_reads) VALUES (?, ?, ?, ?)",
		share.ID, share.Envelope, share.ExpiresAt.UnixMilli(), maxReads); err != nil {
		return Share{}, fmt.Errorf("create share: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Share{}, fmt.Errorf("commit share: %w", err)
	}
	return share, nil
}

func (s *Store) ensureCapacityTx(ctx context.Context, tx *sql.Tx, cutoff, incoming int64) error {
	overCap := func() (bool, error) {
		var shares, total int64
		if err := tx.QueryRowContext(ctx, selectStatsSQL).Scan(&shares, &total); err != nil {
			return false, fmt.Errorf("check capacity: %w", err)
		}
		return shares >= s.limits.MaxActiveShares || total+incoming > s.limits.MaxActiveBytes, nil
	}
	over, err := overCap()
	if err != nil {
		return err
	}
	for over {
		res, err := tx.ExecContext(ctx, deleteExpiredSQL, cutoff)
		if err != nil {
			return fmt.Errorf("reclaim expired shares: %w", err)
		}
		deleted, err := res.RowsAffected()
		if err != nil {
			return fmt.Errorf("count reclaimed shares: %w", err)
		}
		if deleted == 0 {
			return ErrCapacity
		}
		over, err = overCap()
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Consume(ctx context.Context, id string) (Share, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Share{}, fmt.Errorf("begin consume: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	share := Share{ID: id}
	var expiresAt int64
	var remaining int
	err = tx.QueryRowContext(ctx, `
		UPDATE shares SET remaining_reads = remaining_reads - 1
		WHERE id = ? AND expires_at > ? AND remaining_reads > 0
		RETURNING envelope, expires_at, remaining_reads`,
		id, s.now().UnixMilli(),
	).Scan(&share.Envelope, &expiresAt, &remaining)
	if errors.Is(err, sql.ErrNoRows) {
		return Share{}, ErrNotFound
	}
	if err != nil {
		return Share{}, fmt.Errorf("consume share: %w", err)
	}
	if remaining == 0 {
		if _, err := tx.ExecContext(ctx, "DELETE FROM shares WHERE id = ?", id); err != nil {
			return Share{}, fmt.Errorf("delete exhausted share: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return Share{}, fmt.Errorf("commit consume: %w", err)
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
