# System packages for WHITEHAT on Replit. Foundry (forge/anvil) and slither must be installed
# separately — see README. The app runs without them against bytecode, with reduced coverage.
{ pkgs }: {
  deps = [
    pkgs.nodejs_22
    pkgs.python311
    pkgs.python311Packages.pip
  ];
}
