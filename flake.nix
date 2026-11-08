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

          envp = buildGoModule {
            pname = "envp";
            version = self.shortRev or self.dirtyShortRev or "unknown";
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
          inherit envp;
        }
        // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux { inherit envp-image; }
      );
    };
}
