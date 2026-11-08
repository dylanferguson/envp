{
  description = "envp API binary and container image";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      commit = self.rev or self.dirtyRev or "unknown";
      nonRootUid = "65532";
      seconds = n: n * 1000000000; # Docker health check durations are nanoseconds.
    in
    {
      packages = forAllSystems (
        pkgs:
        let
          inherit (pkgs) lib;
          buildGoModule = pkgs.buildGoModule.override { go = pkgs.go_1_27; };
          pnpm = pkgs.pnpm_11;
          # Not the commit: dependency fetches are named after it, so a per-commit
          # version would refetch them on every commit.
          version = "0.1.0";

          envp = buildGoModule {
            pname = "envp";
            inherit version;
            src = lib.fileset.toSource {
              root = ./.;
              fileset = lib.fileset.unions [
                ./go.mod
                ./go.sum
                ./cmd
                ./internal
              ];
            };
            # Update when go.sum changes: set to lib.fakeHash, build, copy the "got:" hash.
            vendorHash = "sha256-lRGGj2Q0Vb0N2f/ddDtqIu1DDpPPIVrH1Oq3xCz7LlA=";
            subPackages = [ "cmd/envp" ];
            env.CGO_ENABLED = 0;
            ldflags = [
              "-s"
              "-w"
              "-X main.commit=${commit}"
            ];
          };

          web = pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
            pname = "envp-web";
            inherit version;
            src = lib.fileset.toSource {
              root = ./.;
              fileset = lib.fileset.unions [
                ./package.json
                ./pnpm-lock.yaml
                ./pnpm-workspace.yaml
                ./tsconfig.json
                ./vite.config.ts
                ./web
              ];
            };
            nativeBuildInputs = [
              pkgs.nodejs_24
              pnpm
              pkgs.pnpmConfigHook
            ];
            pnpmDeps = pkgs.fetchPnpmDeps {
              inherit (finalAttrs) pname version src;
              inherit pnpm;
              fetcherVersion = 5;
              # Update when pnpm-lock.yaml changes, the same way as vendorHash.
              hash = "sha256-5w4S87gx5Ln/iJ4sr7tqC+KfPB77xK0NulxzKsiMKUc=";
            };
            env.GIT_COMMIT = commit;
            buildPhase = ''
              runHook preBuild
              pnpm exec vp build
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              cp -r dist/client $out
              runHook postInstall
            '';
          });

          # buildLayeredImage, not streamLayeredImage: the stream script is a Linux
          # program, so macOS could not run it to load the image.
          envp-image = pkgs.dockerTools.buildLayeredImage {
            name = "envp";
            tag = "nix";
            fakeRootCommands = ''
              mkdir data
              chown ${nonRootUid}:${nonRootUid} data
            '';
            config = {
              Entrypoint = [ "${envp}/bin/envp" ];
              User = "${nonRootUid}:${nonRootUid}";
              # Leave PORT unset so compose/Fly can put the API on 8081 behind nginx.
              Env = [
                "INTERNAL_PORT=9090"
                "DB_PATH=/data/shares.db"
              ];
              ExposedPorts = {
                "8080/tcp" = { };
                "9090/tcp" = { };
              };
              Volumes."/data" = { };
              Healthcheck = {
                Test = [
                  "CMD"
                  "${envp}/bin/envp"
                  "healthcheck"
                ];
                Interval = seconds 30;
                Timeout = seconds 3;
                StartPeriod = seconds 5;
                Retries = 3;
              };
            };
          };

          # Same uid/gid as the official nginx image, for `user nginx;` in nginx.conf.
          nginxNss = pkgs.dockerTools.fakeNss.override {
            extraPasswdLines = [ "nginx:x:101:101:nginx:/var/empty:/bin/false" ];
            extraGroupLines = [ "nginx:x:101:" ];
          };

          # Replaces the official image's /docker-entrypoint.sh, which only ran
          # write-origin-token.sh for this config.
          nginxEntrypoint = pkgs.writeScript "nginx-entrypoint" ''
            #!${pkgs.busybox}/bin/sh
            set -eu
            sh ${./deploy/nginx/write-origin-token.sh}
            exec nginx -c /etc/nginx/nginx.conf -e stderr -g 'daemon off;'
          '';

          nginx-image = pkgs.dockerTools.buildLayeredImage {
            name = "envp-nginx";
            tag = "nix";
            contents = [
              pkgs.nginx
              pkgs.busybox
              nginxNss
            ];
            extraCommands = ''
              mkdir -p etc/nginx/conf.d usr/share/nginx run var/log/nginx
              mkdir -m 1777 tmp
              cp ${pkgs.nginx}/conf/mime.types etc/nginx/mime.types
              cp ${./deploy/nginx/nginx.conf} etc/nginx/nginx.conf
              cp ${./deploy/nginx/security_headers.conf} etc/nginx/security_headers.conf
              cp ${./deploy/nginx/default.conf} etc/nginx/conf.d/default.conf
              ln -s ${web} usr/share/nginx/html
              ln -s /dev/stdout var/log/nginx/access.log
              ln -s /dev/stderr var/log/nginx/error.log
            '';
            config = {
              Entrypoint = [ "${nginxEntrypoint}" ];
              Env = [ "PATH=/bin" ];
              ExposedPorts."8080/tcp" = { };
              StopSignal = "SIGQUIT";
              Healthcheck = {
                Test = [
                  "CMD-SHELL"
                  ''wget -q -O /dev/null --header="X-Origin-Token: $X_ORIGIN_TOKEN" http://127.0.0.1:8080/ || exit 1''
                ];
                Interval = seconds 5;
                Timeout = seconds 3;
                StartPeriod = seconds 2;
                Retries = 10;
              };
            };
          };
        in
        {
          default = envp;
          inherit envp web;
        }
        // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux { inherit envp-image nginx-image; }
      );
    };
}
