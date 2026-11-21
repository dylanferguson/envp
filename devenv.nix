# Development environment. flake.nix builds the shipped binary and images.
{ pkgs, config, ... }:
let
  go = pkgs.go_1_27;
  node = config.languages.javascript.package;
  # Release binary: Bombadil is not in nixpkgs and its flake builds from source.
  bombadil =
    let
      version = "0.7.10";
      system = pkgs.stdenv.hostPlatform.system;
      src = pkgs.fetchurl {
        url = "https://github.com/antithesishq/bombadil/releases/download/v${version}/bombadil-${system}";
        sha256 =
          {
            aarch64-darwin = "3d7866e2e8356390a0f2560853e3c775839f8c8ff648c9552c0105f7f78d1d72";
            aarch64-linux = "67ee0099c287aba90cfee37b317312678277f51a1b2986c49e339b1509509e73";
            x86_64-linux = "6f2664ca7d4067017b4efb26db5c29d6dcfecdc78131f96989d336f12420cc1b";
          }
          .${system};
      };
    in
    pkgs.runCommand "bombadil-${version}" { } "install -Dm755 ${src} $out/bin/bombadil";
in
{
  # Not languages.go: it rebuilds delve, gopls and other Go tools against go_1_27,
  # which are uncached and which this project does not use.
  env.GOROOT = "${go}/share/go";
  env.GOTOOLCHAIN = "local";
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    pnpm = {
      enable = true;
      package = pkgs.pnpm_11;
      install.enable = true;
    };
  };
  packages = [
    bombadil
    go
    pkgs.golangci-lint
    pkgs.shellcheck
  ];

  # `devenv up`: Vite UI on :5173 and the Go API, restarted on Go changes.
  processes = {
    web.exec = "vp dev";
    api = {
      exec = "go run ./cmd/envp";
      watch = {
        paths = [
          ./cmd
          ./internal
          ./go.mod
          ./go.sum
        ];
        extensions = [
          "go"
          "mod"
          "sum"
        ];
      };
    };
  };

  scripts = {
    # Self-contained so the pre-commit hook also works outside the devenv shell.
    check = {
      description = "Frontend checks, golangci-lint and zizmor";
      packages = [
        go
        node
        pkgs.golangci-lint
        pkgs.zizmor
      ];
      exec = ''
        set -e
        export GOROOT="${go}/share/go" GOTOOLCHAIN=local
        cd "$(git rev-parse --show-toplevel)"
        node_modules/.bin/vp check
        golangci-lint run
        zizmor --offline .github/workflows
      '';
    };
    unit-tests = {
      description = "Frontend unit tests and Go tests";
      exec = "vp test run && go test -race ./...";
    };
    build-api = {
      description = "Go API binary in dist/envp";
      exec = ''CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.commit=''${GIT_COMMIT:-$(git rev-parse HEAD)}" -o dist/envp ./cmd/envp'';
    };
    build-images = {
      description = "Build both images with Nix and load them as envp:nix and envp-nginx:nix";
      exec = ''
        set -e
        sys="''${NIX_IMAGE_SYSTEM:-$(uname -m | sed s/arm64/aarch64/)-linux}"
        for image in envp-image nginx-image; do
          nix build ".#packages.$sys.$image" -o "result-$image"
          docker load < "result-$image"
        done
      '';
    };
    smoke-tests = {
      description = "Smoke-test both images";
      exec = ''
        set -e
        if [ -z "''${SKIP_IMAGE_BUILD:-}" ]; then build-images; fi
        node scripts/smoke-container.mjs && node scripts/smoke-nginx.mjs
      '';
    };
    e2e-tests = {
      description = "Playwright against docker compose (nginx + API)";
      exec = ''
        set -e
        if [ -z "''${SKIP_IMAGE_BUILD:-}" ]; then build-images; fi
        playwright test "$@"
      '';
    };
    fuzz-tests = {
      description = "Bombadil explores the UI from `devenv up`, using your installed Chrome";
      packages = [ pkgs.curl ];
      exec = ''
        url=http://127.0.0.1:5173/
        if ! curl -sf -o /dev/null "$url"; then
          echo "No UI at $url. Run 'devenv up' first." >&2
          exit 1
        fi
        if [ $# -eq 0 ]; then set -- --time-limit 2m; fi
        bombadil browser test --headless \
          --output-path "$DEVENV_ROOT/test-results/bombadil" --output-path-overwrite \
          "$@" "$url"
      '';
    };
    install-browsers = {
      description = "Install Playwright browsers";
      exec = "playwright install --with-deps --only-shell";
    };
    compose-up = {
      description = "Run nginx + API in docker compose";
      exec = "build-images && docker compose up";
    };
  };

  git-hooks.hooks.check = {
    enable = true;
    name = "check";
    entry = "${config.scripts.check.scriptPackage}/bin/check";
    pass_filenames = false;
    always_run = true;
  };
}
