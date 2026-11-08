# Development environment. flake.nix builds the shipped binary and images.
{ pkgs, config, ... }:
let
  go = config.languages.go.package;
  node = config.languages.javascript.package;
in
{
  languages.go = {
    enable = true;
    package = pkgs.go_1_27;
  };
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
      description = "Frontend checks and golangci-lint";
      packages = [
        go
        node
        pkgs.golangci-lint
      ];
      exec = ''
        set -e
        export GOROOT="${go}/share/go" GOTOOLCHAIN=local
        cd "$(git rev-parse --show-toplevel)"
        node_modules/.bin/vp check
        golangci-lint run
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
      exec = "build-images && node scripts/smoke-container.mjs && node scripts/smoke-nginx.mjs";
    };
    e2e-tests = {
      description = "Playwright against docker compose (nginx + API)";
      exec = ''build-images && playwright test "$@"'';
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
