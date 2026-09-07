package store

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/oklog/ulid/v2"
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
	created, err := s.Create(t.Context(), []byte{4, 5}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ulid.ParseStrict(created.ID); err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Minute - time.Millisecond)
	read, err := s.Read(t.Context(), created.ID)
	if err != nil || !bytes.Equal(read.Envelope, created.Envelope) {
		t.Fatalf("read: %+v, %v", read, err)
	}
	now = now.Add(time.Millisecond)
	if _, err := s.Read(t.Context(), created.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expiry: %v", err)
	}
	if _, err := s.Read(t.Context(), "00000000000000000000000000"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
}

func TestPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "shares.db")
	s, err := Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	created, err := s.Create(t.Context(), []byte{1, 2, 3}, time.Hour)
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
	read, err := s.Read(t.Context(), created.ID)
	if err != nil || !bytes.Equal(read.Envelope, created.Envelope) || !read.ExpiresAt.Equal(created.ExpiresAt) {
		t.Fatalf("reopened read: %+v, %v", read, err)
	}
}

func TestSweepBatches(t *testing.T) {
	s := testStore(t)
	now := time.Now()
	s.now = func() time.Time { return now }
	for range 501 {
		if _, err := s.Create(t.Context(), []byte{1}, time.Minute); err != nil {
			t.Fatal(err)
		}
	}
	live, err := s.Create(t.Context(), []byte{2}, time.Hour)
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
	if _, err := s.Read(t.Context(), live.ID); err != nil {
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
			share, err := s.Create(t.Context(), []byte{9, 8, 7}, time.Hour)
			if err != nil {
				t.Error(err)
				return
			}
			ids <- share.ID
			read, err := s.Read(t.Context(), share.ID)
			if err != nil || !bytes.Equal(read.Envelope, share.Envelope) {
				t.Errorf("read: %+v, %v", read, err)
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

func TestCanceledOperation(t *testing.T) {
	s := testStore(t)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := s.Create(ctx, []byte{1}, time.Minute); !errors.Is(err, context.Canceled) {
		t.Fatalf("create: %v", err)
	}
}

func TestPing(t *testing.T) {
	s := testStore(t)
	if err := s.Ping(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	if err := s.Ping(t.Context()); err == nil {
		t.Fatal("Ping after Close should fail")
	}
}
