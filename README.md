<p align="center">
  <img src="web/public/favicon.svg" width="56" height="56" alt="envp">
</p>

<h1 align="center">envp</h1>

<p align="center">
  Securely share your .env<br>
  Encrypt with the browser, and share a link with a key the server never sees.
</p>

<p align="center">
  <a href="https://envp.dylanferguson.co">envp.dylanferguson.co</a>
</p>

<p align="center">
  <img src="assets/screenshot.png" alt="envp" width="640">
</p>

## Run locally

```bash
mise install
vp install
mise run dev
```

UI on [http://127.0.0.1:5173](http://127.0.0.1:5173), API on `:8080`.

## Docker

```bash
docker compose up --build
```

App on [http://127.0.0.1:8080](http://127.0.0.1:8080). Set `PUBLIC_ORIGIN` when the hostname is not localhost.
