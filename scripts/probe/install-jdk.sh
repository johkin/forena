#!/bin/sh
# Install the exact probe JDK into a caller-selected task directory.
set -eu
probe_jdk_dir="${1:?Usage: install-jdk.sh DIRECTORY}"
mkdir -p "$probe_jdk_dir"
probe_jdk_archive="$(mktemp)"
trap 'rm -f "$probe_jdk_archive"' EXIT HUP INT TERM
curl --fail --show-error --location \
  https://download.oracle.com/java/26/archive/jdk-26.0.2.1_linux-x64_bin.tar.gz \
  --output "$probe_jdk_archive"
printf '%s  %s\n' 30410726d866e16154571879785a44736009bc34e409cb66473b6e797d883df7 "$probe_jdk_archive" | sha256sum --check --strict
tar -xzf "$probe_jdk_archive" --strip-components=1 -C "$probe_jdk_dir"
"$probe_jdk_dir/bin/java" --version
