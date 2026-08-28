#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
runtime_base="${XDG_DATA_HOME:-${HOME}/.local/share}"
runtime_dir="${ERASEGRAPH_TRUEFORGE_RUNTIME:-${runtime_base}/erasegraph-trueforge}"
srt_file="${runtime_dir}/node_modules/@anthropic-ai/sandbox-runtime/dist/sandbox/linux-sandbox-utils.js"
trueforge_manifest="${runtime_dir}/node_modules/@truefoundry/trueforge/package.json"

for dependency in node npm python3 bwrap; do
  if ! command -v "${dependency}" >/dev/null 2>&1; then
    echo "Missing required local-sandbox dependency: ${dependency}" >&2
    exit 1
  fi
done
if ! python3 -c 'import venv' >/dev/null 2>&1; then
  echo "Python's venv module is required by the TrueForge local sandbox." >&2
  exit 1
fi

mkdir -p "${runtime_dir}"
if [[ ! -f "${trueforge_manifest}" ]]; then
  npm install \
    --prefix "${runtime_dir}" \
    --no-save \
    --package-lock=false \
    @truefoundry/trueforge@0.1.4
fi

node -e '
  const manifest = require(process.argv[1]);
  if (manifest.name !== "@truefoundry/trueforge" || manifest.version !== "0.1.4") {
    throw new Error("Expected exact @truefoundry/trueforge 0.1.4 runtime.");
  }
' "${trueforge_manifest}"

node "${project_root}/scripts/patch-trueforge-srt.mjs" apply "${srt_file}"
exec "${runtime_dir}/node_modules/.bin/trueforge" "$@"
