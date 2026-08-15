use std::{
    collections::HashMap,
    convert::Infallible,
    net::{IpAddr, SocketAddr},
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::{
    body::Body,
    header::{self, HeaderValue},
    Method, Request, Response, StatusCode,
};
use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use tokio::sync::RwLock;

pub const MAX_BODY: usize = 65_536;
pub const CLEANUP_BATCH: usize = 500;
const VALID_EXPIRIES: [u64; 3] = [3_600, 86_400, 604_800];

pub type RespBody = Full<Bytes>;

#[derive(Clone, Debug)]
struct Share {
    envelope: Vec<u8>,
    expires_at: u64,
}

#[derive(Clone)]
pub struct Store {
    backend: Backend,
}

#[derive(Clone)]
enum Backend {
    Memory(Arc<RwLock<HashMap<String, Share>>>),
    Sqlite(Arc<Mutex<Connection>>),
}

impl Store {
    pub fn memory() -> Self {
        Self { backend: Backend::Memory(Arc::new(RwLock::new(HashMap::new()))) }
    }

    pub fn sqlite(path: impl AsRef<Path>) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS shares (
                id TEXT PRIMARY KEY,
                payload BLOB NOT NULL,
                expires_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS shares_expires_at ON shares(expires_at);",
        )?;
        Ok(Self { backend: Backend::Sqlite(Arc::new(Mutex::new(conn))) })
    }

    async fn put(&self, id: String, envelope: Vec<u8>, expires_at: u64) -> Result<(), ()> {
        match &self.backend {
            Backend::Memory(shares) => {
                shares.write().await.insert(id, Share { envelope, expires_at });
                Ok(())
            }
            Backend::Sqlite(conn) => {
                let conn = Arc::clone(conn);
                tokio::task::spawn_blocking(move || {
                    conn.lock().map_err(|_| ())?.execute(
                        "INSERT INTO shares(id, payload, expires_at) VALUES (?1, ?2, ?3)",
                        params![id, envelope, expires_at],
                    ).map(|_| ()).map_err(|_| ())
                }).await.map_err(|_| ())?
            }
        }
    }

    async fn get(&self, id: &str, now: u64) -> Result<Option<Vec<u8>>, ()> {
        match &self.backend {
            Backend::Memory(shares) => {
                let mut shares = shares.write().await;
                match shares.get(id) {
                    Some(share) if share.expires_at > now => Ok(Some(share.envelope.clone())),
                    Some(_) => { shares.remove(id); Ok(None) }
                    None => Ok(None),
                }
            }
            Backend::Sqlite(conn) => {
                let conn = Arc::clone(conn);
                let id = id.to_owned();
                tokio::task::spawn_blocking(move || {
                    let mut conn = conn.lock().map_err(|_| ())?;
                    let tx = conn.transaction().map_err(|_| ())?;
                    let row: Option<(Vec<u8>, u64)> = tx.query_row(
                        "SELECT payload, expires_at FROM shares WHERE id = ?1",
                        [&id], |row| Ok((row.get(0)?, row.get(1)?)),
                    ).optional().map_err(|_| ())?;
                    let result = match row {
                        Some((envelope, expires_at)) if expires_at > now => Some(envelope),
                        Some(_) => { tx.execute("DELETE FROM shares WHERE id = ?1", [&id]).map_err(|_| ())?; None }
                        None => None,
                    };
                    tx.commit().map_err(|_| ())?;
                    Ok(result)
                }).await.map_err(|_| ())?
            }
        }
    }

    pub async fn cleanup(&self, now: u64, limit: usize) -> Result<usize, ()> {
        match &self.backend {
            Backend::Memory(shares) => {
                let mut shares = shares.write().await;
                let ids: Vec<String> = shares.iter().filter(|(_, s)| s.expires_at <= now)
                    .take(limit).map(|(id, _)| id.clone()).collect();
                let count = ids.len();
                for id in ids { shares.remove(&id); }
                Ok(count)
            }
            Backend::Sqlite(conn) => {
                let conn = Arc::clone(conn);
                tokio::task::spawn_blocking(move || {
                    conn.lock().map_err(|_| ())?.execute(
                        "DELETE FROM shares WHERE id IN (
                           SELECT id FROM shares WHERE expires_at <= ?1 ORDER BY expires_at LIMIT ?2
                         )", params![now, limit as i64],
                    ).map_err(|_| ())
                }).await.map_err(|_| ())?
            }
        }
    }
}

#[derive(Clone)]
pub struct App {
    store: Store,
    origin: Arc<str>,
    limiter: Arc<Mutex<HashMap<(IpAddr, bool), Window>>>,
}

#[derive(Clone, Copy)]
struct Window { started: u64, count: u32 }

impl App {
    pub fn new(store: Store, origin: impl Into<Arc<str>>) -> Self {
        Self { store, origin: origin.into(), limiter: Arc::new(Mutex::new(HashMap::new())) }
    }

    pub async fn handle<B>(&self, req: Request<B>, peer: SocketAddr) -> Result<Response<RespBody>, Infallible>
    where
        B: Body<Data = Bytes> + Unpin,
    {
        Ok(self.route(req, peer).await)
    }

    async fn route<B>(&self, req: Request<B>, peer: SocketAddr) -> Response<RespBody>
    where
        B: Body<Data = Bytes> + Unpin,
    {
        let now = unix_seconds();
        let path = req.uri().path().to_owned();
        if req.method() == Method::OPTIONS && (path == "/shares" || path.starts_with("/shares/")) {
            return self.options(&req);
        }
        if req.method() == Method::POST && path == "/shares" {
            let cors = self.origin_matches(&req);
            if !self.allowed(peer.ip(), true, now) {
                let mut response = error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
                if cors { self.add_cors(&mut response); }
                return response;
            }
            let mut response = self.create(req, now).await;
            if cors { self.add_cors(&mut response); }
            return response;
        }
        if req.method() == Method::GET && path.starts_with("/shares/") {
            let cors = self.origin_matches(&req);
            if !self.allowed(peer.ip(), false, now) {
                let mut response = error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
                if cors { self.add_cors(&mut response); }
                return response;
            }
            let mut response = self.fetch(&path[8..], now).await;
            if cors { self.add_cors(&mut response); }
            return response;
        }
        error(StatusCode::NOT_FOUND, "not_found")
    }

    fn allowed(&self, ip: IpAddr, post: bool, now: u64) -> bool {
        let max = if post { 10 } else { 120 };
        let Ok(mut map) = self.limiter.lock() else { return false };
        // Bound stale limiter state during ordinary traffic.
        if map.len() > 10_000 { map.retain(|_, w| now.saturating_sub(w.started) < 120); }
        let w = map.entry((ip, post)).or_insert(Window { started: now, count: 0 });
        if now.saturating_sub(w.started) >= 60 { *w = Window { started: now, count: 0 }; }
        if w.count >= max { false } else { w.count += 1; true }
    }

    fn origin_allowed<B>(&self, req: &Request<B>) -> bool {
        req.headers().get(header::ORIGIN).map_or(true, |v| v.as_bytes() == self.origin.as_bytes())
    }

    fn origin_matches<B>(&self, req: &Request<B>) -> bool {
        req.headers().get(header::ORIGIN).is_some_and(|v| v.as_bytes() == self.origin.as_bytes())
    }

    fn add_cors(&self, response: &mut Response<RespBody>) {
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_ORIGIN,
            HeaderValue::from_str(&self.origin).expect("APP_ORIGIN must be a valid header value"),
        );
        response.headers_mut().insert(header::VARY, HeaderValue::from_static("Origin"));
    }

    async fn create<B>(&self, req: Request<B>, now: u64) -> Response<RespBody>
    where
        B: Body<Data = Bytes> + Unpin,
    {
        if !self.origin_allowed(&req)
            || !is_octet_stream(req.headers().get(header::CONTENT_TYPE)) {
            return error(StatusCode::BAD_REQUEST, "invalid_request");
        }
        let expiry = req.headers().get("x-share-expiry-seconds")
            .and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u64>().ok());
        let Some(expiry) = expiry.filter(|v| VALID_EXPIRIES.contains(v)) else {
            return error(StatusCode::BAD_REQUEST, "invalid_request");
        };
        if req.body().size_hint().lower() > MAX_BODY as u64
            || req.body().size_hint().upper().is_some_and(|n| n > MAX_BODY as u64) {
            return error(StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large");
        }
        let mut body = req.into_body();
        let mut envelope = Vec::new();
        while let Some(frame) = body.frame().await {
            let Ok(frame) = frame else { return error(StatusCode::BAD_REQUEST, "invalid_request") };
            if let Ok(chunk) = frame.into_data() {
                if envelope.len().saturating_add(chunk.len()) > MAX_BODY {
                    return error(StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large");
                }
                envelope.extend_from_slice(&chunk);
            }
        }
        if envelope.is_empty() { return error(StatusCode::BAD_REQUEST, "invalid_request"); }
        let mut random = [0u8; 16];
        OsRng.fill_bytes(&mut random);
        let id = URL_SAFE_NO_PAD.encode(random);
        let expires_at = now + expiry;
        if self.store.put(id.clone(), envelope, expires_at).await.is_err() {
            return error(StatusCode::INTERNAL_SERVER_ERROR, "internal_error");
        }
        json(StatusCode::CREATED, serde_json::json!({
            "id": id, "path": format!("/shares/{id}"), "expiresAt": expires_at
        }).to_string())
    }

    async fn fetch(&self, id: &str, now: u64) -> Response<RespBody> {
        if !valid_id(id) { return error(StatusCode::NOT_FOUND, "not_found"); }
        match self.store.get(id, now).await {
            Ok(Some(envelope)) => response(StatusCode::OK, "application/octet-stream", envelope),
            Ok(None) => error(StatusCode::NOT_FOUND, "not_found"),
            Err(()) => error(StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
        }
    }

    fn options<B>(&self, req: &Request<B>) -> Response<RespBody> {
        if req.headers().get(header::ORIGIN).is_some_and(|v| v.as_bytes() == self.origin.as_bytes()) {
            let mut resp = response(StatusCode::NO_CONTENT, "application/octet-stream", Vec::new());
            resp.headers_mut().insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_str(&self.origin).unwrap());
            resp.headers_mut().insert(header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET, POST, OPTIONS"));
            resp.headers_mut().insert(header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("Content-Type, X-Share-Expiry-Seconds"));
            resp.headers_mut().insert(header::VARY, HeaderValue::from_static("Origin"));
            resp
        } else { error(StatusCode::BAD_REQUEST, "invalid_request") }
    }
}

fn is_octet_stream(value: Option<&HeaderValue>) -> bool {
    value
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .is_some_and(|media_type| media_type.eq_ignore_ascii_case("application/octet-stream"))
}

fn valid_id(id: &str) -> bool {
    id.len() == 22 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        && URL_SAFE_NO_PAD.decode(id).is_ok_and(|v| v.len() == 16)
}

pub fn unix_seconds() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn response(status: StatusCode, content_type: &'static str, body: Vec<u8>) -> Response<RespBody> {
    let mut resp = Response::new(Full::new(Bytes::from(body)));
    *resp.status_mut() = status;
    resp.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    resp.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    resp.headers_mut().insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    resp
}

fn json(status: StatusCode, body: String) -> Response<RespBody> {
    response(status, "application/json", body.into_bytes())
}

fn error(status: StatusCode, code: &str) -> Response<RespBody> {
    json(status, format!(r#"{{"error":"{code}"}}"#))
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;

    fn peer() -> SocketAddr { "127.0.0.1:1234".parse().unwrap() }

    fn post(body: Vec<u8>, expiry: &str) -> Request<Full<Bytes>> {
        Request::builder().method(Method::POST).uri("/shares")
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .header("x-share-expiry-seconds", expiry)
            .body(Full::new(Bytes::from(body))).unwrap()
    }

    #[tokio::test]
    async fn memory_store_enforces_expiry_and_lazy_deletes() {
        let store = Store::memory();
        store.put("id".into(), b"ciphertext".to_vec(), 100).await.unwrap();
        assert_eq!(store.get("id", 99).await.unwrap(), Some(b"ciphertext".to_vec()));
        assert_eq!(store.get("id", 100).await.unwrap(), None);
        assert_eq!(store.get("id", 99).await.unwrap(), None);
    }

    #[tokio::test]
    async fn sqlite_store_persists_and_enforces_expiry() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("shares.db");
        let store = Store::sqlite(&path).unwrap();
        store.put("id".into(), vec![0, 255], 50).await.unwrap();
        drop(store);
        let reopened = Store::sqlite(&path).unwrap();
        assert_eq!(reopened.get("id", 49).await.unwrap(), Some(vec![0, 255]));
        assert_eq!(reopened.get("id", 50).await.unwrap(), None);
    }

    #[tokio::test]
    async fn cleanup_is_bounded() {
        let store = Store::memory();
        for n in 0..3 { store.put(n.to_string(), vec![1], 1).await.unwrap(); }
        assert_eq!(store.cleanup(1, 2).await.unwrap(), 2);
        assert_eq!(store.cleanup(1, 2).await.unwrap(), 1);
    }

    #[test]
    fn ids_are_canonical_128_bit_base64url() {
        let mut bytes = [0u8; 16];
        OsRng.fill_bytes(&mut bytes);
        let id = URL_SAFE_NO_PAD.encode(bytes);
        assert!(valid_id(&id));
        assert!(!valid_id(&(id + "=")));
        assert!(!valid_id("not-an-id"));
    }

    #[tokio::test]
    async fn create_and_fetch_preserve_opaque_bytes() {
        let app = App::new(Store::memory(), "https://example.test");
        let created = app.handle(post(vec![0, 1, 254, 255], "3600"), peer()).await.unwrap();
        assert_eq!(created.status(), StatusCode::CREATED);
        assert_eq!(created.headers()[header::CACHE_CONTROL], "no-store");
        let json: serde_json::Value = serde_json::from_slice(
            &created.into_body().collect().await.unwrap().to_bytes()).unwrap();
        let path = json["path"].as_str().unwrap();
        let get = Request::builder().uri(path).body(Full::new(Bytes::new())).unwrap();
        let fetched = app.handle(get, peer()).await.unwrap();
        assert_eq!(fetched.status(), StatusCode::OK);
        assert_eq!(fetched.headers()[header::CONTENT_TYPE], "application/octet-stream");
        assert_eq!(fetched.headers()["x-content-type-options"], "nosniff");
        assert_eq!(fetched.into_body().collect().await.unwrap().to_bytes(), Bytes::from_static(&[0, 1, 254, 255]));
    }

    #[tokio::test]
    async fn accepts_octet_stream_content_type_case_insensitively_with_parameters() {
        let app = App::new(Store::memory(), "https://example.test");
        let mut request = post(vec![1], "3600");
        request.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("Application/Octet-Stream; charset=binary"),
        );

        assert_eq!(
            app.handle(request, peer()).await.unwrap().status(),
            StatusCode::CREATED
        );
    }

    #[tokio::test]
    async fn rejects_invalid_expiry_origin_empty_and_oversize_bodies() {
        let app = App::new(Store::memory(), "https://example.test");
        assert_eq!(app.handle(post(vec![1], "60"), peer()).await.unwrap().status(), StatusCode::BAD_REQUEST);
        assert_eq!(app.handle(post(Vec::new(), "3600"), peer()).await.unwrap().status(), StatusCode::BAD_REQUEST);
        assert_eq!(app.handle(post(vec![1; MAX_BODY + 1], "3600"), peer()).await.unwrap().status(), StatusCode::PAYLOAD_TOO_LARGE);
        let mut wrong_origin = post(vec![1], "3600");
        wrong_origin.headers_mut().insert(header::ORIGIN, HeaderValue::from_static("https://evil.test"));
        assert_eq!(app.handle(wrong_origin, peer()).await.unwrap().status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn malformed_and_missing_ids_have_identical_errors() {
        let app = App::new(Store::memory(), "https://example.test");
        for path in ["/shares/bad", "/shares/AAAAAAAAAAAAAAAAAAAAAA"] {
            let req = Request::builder().uri(path).body(Full::new(Bytes::new())).unwrap();
            let response = app.handle(req, peer()).await.unwrap();
            assert_eq!(response.status(), StatusCode::NOT_FOUND);
            assert_eq!(response.into_body().collect().await.unwrap().to_bytes(), Bytes::from_static(br#"{"error":"not_found"}"#));
        }
    }

    #[tokio::test]
    async fn post_rate_limit_is_ten_requests_per_minute() {
        let app = App::new(Store::memory(), "https://example.test");
        for _ in 0..10 {
            assert_eq!(app.handle(post(vec![1], "3600"), peer()).await.unwrap().status(), StatusCode::CREATED);
        }
        let limited = app.handle(post(vec![1], "3600"), peer()).await.unwrap();
        assert_eq!(limited.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(limited.into_body().collect().await.unwrap().to_bytes(), Bytes::from_static(br#"{"error":"rate_limited"}"#));
    }
}
