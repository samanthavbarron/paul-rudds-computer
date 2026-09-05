{
  description = "Paul's Computer — development and reference tools";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }: let
    systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
    forAllSystems = nixpkgs.lib.genAttrs systems;
  in {
    devShells = forAllSystems (system: let pkgs = import nixpkgs { inherit system; }; in {
      default = pkgs.mkShell {
        packages = with pkgs; [ nodejs_22 git ffmpeg yt-dlp deno ];
        shellHook = ''
          echo "Paul's Computer: npm install && npm run dev"
        '';
      };
      browser = pkgs.mkShell {
        packages = with pkgs; [ nodejs_22 git chromium ];
        PLAYWRIGHT_CHROMIUM_EXECUTABLE = "${pkgs.chromium}/bin/chromium";
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
      };
      reference = pkgs.mkShell {
        packages = with pkgs; [ yt-dlp ffmpeg deno (python3.withPackages (p: [ p.pillow ])) ];
      };
    });
  };
}
