#!/bin/sh
# Xcode lets a package target import any sibling module that happens to be built, declared or not.
# SwiftPM's explicit import check does not, so this build fails when a target imports a module
# it does not list in Package.swift, such as one feature importing another.
set -eu
cd "$(dirname "$0")/../Packages"
swift build \
  --explicit-target-dependency-import-check error \
  --triple arm64-apple-ios17.0-simulator \
  --sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  "$@"
