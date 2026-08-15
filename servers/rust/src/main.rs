use std::{convert::Infallible, env, net::SocketAddr, path::PathBuf, time::Duration};

use env_share_rust::{unix_seconds, App, Store, CLEANUP_BATCH};
use hyper::{body::Incoming, server::conn::http1, service::service_fn, Request};
use hyper_util::rt::TokioIo;
use tokio::{net::TcpListener, task::JoinSet};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let address: SocketAddr = env::var("ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into()).parse()?;
    let origin = env::var("APP_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into());
    let _: hyper::header::HeaderValue = origin.parse()?;
    let store = match env::var("STORE").as_deref() {
        Ok("sqlite") => Store::sqlite(env::var_os("SQLITE_PATH").map(PathBuf::from).unwrap_or_else(|| "shares.db".into()))?,
        Ok("memory") | Err(_) => Store::memory(),
        Ok(other) => return Err(format!("unsupported STORE value: {other}").into()),
    };

    store.cleanup(unix_seconds(), CLEANUP_BATCH).await.map_err(|_| "startup cleanup failed")?;
    let cleanup_store = store.clone();
    let cleanup = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3_600));
        interval.tick().await;
        loop {
            interval.tick().await;
            let _ = cleanup_store.cleanup(unix_seconds(), CLEANUP_BATCH).await;
        }
    });

    let app = App::new(store, origin);
    let listener = TcpListener::bind(address).await?;
    eprintln!("listening on {address}");
    let mut connections = JoinSet::new();
    loop {
        tokio::select! {
            accepted = listener.accept() => {
                let (stream, peer) = accepted?;
                let app = app.clone();
                connections.spawn(async move {
                    let io = TokioIo::new(stream);
                    let service = service_fn(move |req: Request<Incoming>| {
                        let app = app.clone();
                        async move {
                            match tokio::time::timeout(Duration::from_secs(10), app.handle(req, peer)).await {
                                Ok(resp) => resp,
                                Err(_) => Ok::<_, Infallible>(hyper::Response::builder()
                                    .status(408)
                                    .header("content-type", "application/json")
                                    .header("cache-control", "no-store")
                                    .header("x-content-type-options", "nosniff")
                                    .body(http_body_util::Full::new(bytes::Bytes::from_static(br#"{"error":"invalid_request"}"#))).unwrap()),
                            }
                        }
                    });
                    let _ = http1::Builder::new()
                        .header_read_timeout(Duration::from_secs(5))
                        .timer(hyper_util::rt::TokioTimer::new())
                        .serve_connection(io, service).await;
                });
            }
            _ = shutdown_signal() => break,
        }
    }
    cleanup.abort();
    let drain = async { while connections.join_next().await.is_some() {} };
    let _ = tokio::time::timeout(Duration::from_secs(10), drain).await;
    Ok(())
}

#[cfg(unix)]
async fn shutdown_signal() {
    use tokio::signal::unix::{signal, SignalKind};

    let mut terminate = signal(SignalKind::terminate()).expect("install SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate.recv() => {}
    }
}

#[cfg(not(unix))]
async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
