package obs

import (
	"context"
	"log/slog"
	"strings"
)

func LogHandler(next slog.Handler) slog.Handler {
	return traceHandler{Handler: next}
}

type traceHandler struct {
	slog.Handler
}

func (h traceHandler) Handle(ctx context.Context, rec slog.Record) error {
	if id, ok := traceIDFrom(ctx); ok {
		rec = rec.Clone()
		rec.AddAttrs(slog.String("trace_id", id))
	}
	return h.Handler.Handle(ctx, rec)
}

func (h traceHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return traceHandler{Handler: h.Handler.WithAttrs(attrs)}
}

func (h traceHandler) WithGroup(name string) slog.Handler {
	return traceHandler{Handler: h.Handler.WithGroup(name)}
}

type traceKey struct{}

func contextWithTraceID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, traceKey{}, id)
}

func traceIDFrom(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(traceKey{}).(string)
	return id, ok && id != ""
}

func traceIDFromHeader(value string) string {
	parts := strings.Split(value, "-")
	if len(parts) != 4 {
		return ""
	}
	if parts[0] != "00" {
		return ""
	}
	if len(parts[1]) != 32 || len(parts[2]) != 16 || len(parts[3]) != 2 {
		return ""
	}
	for _, part := range parts[1:] {
		for _, c := range part {
			if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
				return ""
			}
		}
	}
	return strings.ToLower(parts[1])
}
