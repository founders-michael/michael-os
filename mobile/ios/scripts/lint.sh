#!/bin/sh
# Runs as an Xcode build phase and in CI, so a lint or format finding fails the build.
set -eu
cd "$(dirname "$0")/.."

# Xcode build phases do not inherit the shell PATH.
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

if ! command -v swiftlint >/dev/null 2>&1; then
  echo "error: SwiftLint is not installed. Run: brew install swiftlint"
  exit 1
fi

swiftlint lint --strict --quiet
xcrun swift-format lint --strict --recursive --parallel MichaelOS Packages
