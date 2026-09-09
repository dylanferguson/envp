package store

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"net/url"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/oklog/ulid/v2"
	_ "modernc.org/sqlite"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(t.Context(), filepath.Join(t.TempDir(), "shares.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	})
	return s
}

func TestExpiry(t *testing.T) {
	s := testStore(t)
	now := time.UnixMilli(1_000_000)
	s.now = func() time.Time { return now }
	created, err := s.Create(t.Context(), []byte{4, 5}, time.Minute, 20)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ulid.ParseStrict(created.ID); err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Minute - time.Millisecond)
	read, err := s.Consume(t.Context(), created.ID)
	if err != nil || !bytes.Equal(read.Envelope, created.Envelope) {
		t.Fatalf("consume: %+v, %v", read, err)
	}
	now = now.Add(time.Millisecond)
	if _, err := s.Consume(t.Context(), created.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expiry: %v", err)
	}
	if _, err := s.Consume(t.Context(), "00000000000000000000000000"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
}

func TestPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "shares.db")
	s, err := Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	created, err := s.Create(t.Context(), []byte{1, 2, 3}, time.Hour, 20)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	}()
	read, err := s.Consume(t.Context(), created.ID)
	if err != nil || !bytes.Equal(read.Envelope, created.Envelope) || !read.ExpiresAt.Equal(created.ExpiresAt) {
		t.Fatalf("reopened consume: %+v, %v", read, err)
	}
}

func TestSweepBatches(t *testing.T) {
	s := testStore(t)
	now := time.Now()
	s.now = func() time.Time { return now }
	for range 501 {
		if _, err := s.Create(t.Context(), []byte{1}, time.Minute, 20); err != nil {
			t.Fatal(err)
		}
	}
	live, err := s.Create(t.Context(), []byte{2}, time.Hour, 20)
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Minute)
	if count, err := s.Sweep(t.Context()); err != nil || count != 501 {
		t.Fatalf("sweep: %d, %v", count, err)
	}
	if count, err := s.Sweep(t.Context()); err != nil || count != 0 {
		t.Fatalf("second sweep: %d, %v", count, err)
	}
	if err := s.Peek(t.Context(), live.ID); err != nil {
		t.Fatalf("live share: %v", err)
	}
}

func TestConcurrentCreateReadAndSweep(t *testing.T) {
	s := testStore(t)
	var wg sync.WaitGroup
	ids := make(chan string, 100)
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			share, err := s.Create(t.Context(), []byte{9, 8, 7}, time.Hour, 20)
			if err != nil {
				t.Error(err)
				return
			}
			ids <- share.ID
			read, err := s.Consume(t.Context(), share.ID)
			if err != nil || !bytes.Equal(read.Envelope, share.Envelope) {
				t.Errorf("consume: %+v, %v", read, err)
			}
			if _, err := s.Sweep(t.Context()); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	close(ids)
	seen := make(map[string]bool)
	for id := range ids {
		if seen[id] {
			t.Errorf("duplicate ID: %s", id)
		}
		seen[id] = true
	}
	if len(seen) != 100 {
		t.Fatalf("created %d shares", len(seen))
	}
}

func TestConsumeExhausts(t *testing.T) {
	s := testStore(t)
	created, err := s.Create(t.Context(), []byte{1, 2, 3}, time.Hour, 3)
	if err != nil {
		t.Fatal(err)
	}
	for range 3 {
		read, err := s.Consume(t.Context(), created.ID)
		if err != nil || !bytes.Equal(read.Envelope, created.Envelope) {
			t.Fatalf("consume: %+v, %v", read, err)
		}
	}
	if _, err := s.Consume(t.Context(), created.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("fourth consume: %v", err)
	}
	if err := s.Peek(t.Context(), created.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("peek after exhaust: %v", err)
	}
}

func TestPeekDoesNotConsume(t *testing.T) {
	s := testStore(t)
	created, err := s.Create(t.Context(), []byte{7, 8}, time.Hour, 3)
	if err != nil {
		t.Fatal(err)
	}
	for range 5 {
		if err := s.Peek(t.Context(), created.ID); err != nil {
			t.Fatalf("peek: %v", err)
		}
	}
	for range 3 {
		read, err := s.Consume(t.Context(), created.ID)
		if err != nil || !bytes.Equal(read.Envelope, created.Envelope) {
			t.Fatalf("consume: %+v, %v", read, err)
		}
	}
	if _, err := s.Consume(t.Context(), created.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("after max consumes: %v", err)
	}
}

func TestConcurrentConsume(t *testing.T) {
	s := testStore(t)
	created, err := s.Create(t.Context(), []byte{9}, time.Hour, 20)
	if err != nil {
		t.Fatal(err)
	}
	var successes atomic.Int32
	var wg sync.WaitGroup
	for range 200 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			read, err := s.Consume(t.Context(), created.ID)
			if errors.Is(err, ErrNotFound) {
				return
			}
			if err != nil {
				t.Error(err)
				return
			}
			if !bytes.Equal(read.Envelope, created.Envelope) {
				t.Errorf("envelope: %v", read.Envelope)
			}
			successes.Add(1)
		}()
	}
	wg.Wait()
	if successes.Load() != 20 {
		t.Fatalf("successes: %d", successes.Load())
	}
	if _, err := s.Consume(t.Context(), created.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("after concurrent consume: %v", err)
	}
}

func TestSweepCollectsExhausted(t *testing.T) {
	s := testStore(t)
	created, err := s.Create(t.Context(), []byte{1}, time.Hour*24, 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Consume(t.Context(), created.ID); err != nil {
		t.Fatal(err)
	}
	if count, err := s.Sweep(t.Context()); err != nil || count != 1 {
		t.Fatalf("sweep: %d, %v", count, err)
	}
	if err := s.Peek(t.Context(), created.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("peek after sweep: %v", err)
	}
	if _, err := s.Consume(t.Context(), created.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("consume after sweep: %v", err)
	}
}

func TestLegacySchemaUpgrade(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	dsn := url.URL{Scheme: "file", Path: filepath.ToSlash(path)}
	db, err := sql.Open("sqlite", dsn.String())
	if err != nil {
		t.Fatal(err)
	}
	expiresAt := time.Now().Add(time.Hour).UnixMilli()
	if _, err := db.ExecContext(t.Context(), `
		CREATE TABLE shares (
			id TEXT PRIMARY KEY,
			envelope BLOB NOT NULL,
			expires_at INTEGER NOT NULL
		) STRICT`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(t.Context(), `INSERT INTO shares (id, envelope, expires_at) VALUES (?, ?, ?)`,
		"01ARZ3NDEKTSV4RRFFQ69G5FAV", []byte{1, 2, 3}, expiresAt); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	s, err := Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	}()
	read, err := s.Consume(t.Context(), "01ARZ3NDEKTSV4RRFFQ69G5FAV")
	if err != nil || !bytes.Equal(read.Envelope, []byte{1, 2, 3}) {
		t.Fatalf("consume after upgrade: %+v, %v", read, err)
	}
}

func TestSweepEveryStopsWithoutCallback(t *testing.T) {
	s := testStore(t)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	called := false
	done := make(chan struct{})
	go func() {
		s.SweepEvery(ctx, time.Hour, func(int64, time.Duration, error) { called = true })
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("SweepEvery did not stop")
	}
	if called {
		t.Fatal("callback ran after cancel")
	}
}
