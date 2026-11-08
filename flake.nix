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
            };
          };
        in
        {
          default = envp;
          inherit envp web;
        }
        // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux { inherit envp-image; }
      );
    };
}
