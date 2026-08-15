# env-share

Runtime comparison for an encrypted, expiring environment-variable sharing
service. The browser owns encryption and decryption. Each backend stores only
opaque encrypted bytes and exposes the same HTTP contract.

Implementations:

- `servers/javascript`: Node.js native HTTP server
- `servers/go`: Go `net/http` server
- `servers/rust`: Rust async HTTP server

See [`conformance/CONTRACT.md`](conformance/CONTRACT.md) for the shared API.
