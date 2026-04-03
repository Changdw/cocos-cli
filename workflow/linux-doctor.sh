#!/usr/bin/env bash
set -euo pipefail

MODE="check"
STRICT=0

for arg in "$@"; do
  case "$arg" in
    --install-basic)
      MODE="install-basic"
      ;;
    --strict)
      STRICT=1
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  bash workflow/linux-doctor.sh
  bash workflow/linux-doctor.sh --install-basic
  bash workflow/linux-doctor.sh --strict

Options:
  --install-basic  Install packages needed by download-tools.js (currently unzip)
  --strict         Exit with non-zero code when required tools are missing
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

resolve_static_tool() {
  for candidate in "$@"; do
    if [[ -x "$candidate" && ! -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
static_tools_dir="$repo_root/static/tools"

install_basic_packages() {
  local runner=""
  if [[ "$(id -u)" != "0" ]]; then
    if has_cmd sudo; then
      runner="sudo"
    else
      echo "Need root or sudo to install packages." >&2
      exit 1
    fi
  fi

  if has_cmd dnf; then
    $runner dnf install -y unzip
    return
  fi

  if has_cmd yum; then
    $runner yum install -y unzip
    return
  fi

  if has_cmd apt-get; then
    $runner apt-get update
    $runner apt-get install -y unzip
    return
  fi

  echo "Unsupported package manager. Install unzip manually." >&2
  exit 1
}

if [[ "$MODE" == "install-basic" ]]; then
  install_basic_packages
fi

errors=0

report_ok() {
  printf '[OK]   %s: %s\n' "$1" "$2"
}

report_warn() {
  printf '[WARN] %s: %s\n' "$1" "$2"
}

report_err() {
  printf '[MISS] %s: %s\n' "$1" "$2"
  errors=$((errors + 1))
}

echo '== Cocos CLI Linux Doctor =='
echo 'Runtime discovery only checks files under static/tools.'

if tool="$(resolve_static_tool "$static_tools_dir/FBX-glTF-conv/FBX-glTF-conv" "$static_tools_dir/FBX-glTF-conv/linux/FBX-glTF-conv")"; then
  report_ok "FBX-glTF-conv" "$tool"
else
  report_warn "FBX-glTF-conv" 'Not installed; Linux will fall back to FBX2glTF when available'
fi

if tool="$(resolve_static_tool "$static_tools_dir/FBX2glTF/FBX2glTF" "$static_tools_dir/FBX2glTF/linux/FBX2glTF")"; then
  report_ok "FBX2glTF" "$tool"
else
  report_err "FBX2glTF" 'Install it at static/tools/FBX2glTF/FBX2glTF'
fi

if tool="$(resolve_static_tool "$static_tools_dir/cmft/linux/cmftRelease64" "$static_tools_dir/cmft/cmftRelease64")"; then
  report_ok "cmft" "$tool"
else
  report_warn "cmft" 'Needed only for HDR/EXR and cubemap bake workflows'
fi

if tool="$(resolve_static_tool "$static_tools_dir/mali_linux/convert")"; then
  report_ok "mali convert" "$tool"
else
  report_warn "mali convert" 'Needed only for EXR to HDR fallback workflows'
fi

if tool="$(resolve_static_tool "$static_tools_dir/LightFX/uvunwrap" "$static_tools_dir/uvunwrap/uvunwrap")"; then
  report_ok "uvunwrap" "$tool"
else
  report_warn "uvunwrap" 'Needed only for lightmap UV unwrap workflows'
fi

if tool="$(resolve_static_tool "$static_tools_dir/unzip" "$static_tools_dir/unzip/bin/unzip")"; then
  report_ok "unzip" "$tool"
else
  report_warn "unzip" 'Needed only for instantiation-asset zip import workflows'
fi

echo
echo 'Recommended static/tools layout:'
echo "  $static_tools_dir/FBX2glTF/FBX2glTF"
echo "  $static_tools_dir/FBX-glTF-conv/FBX-glTF-conv"
echo "  $static_tools_dir/cmft/linux/cmftRelease64"
echo "  $static_tools_dir/mali_linux/convert"
echo "  $static_tools_dir/uvunwrap/uvunwrap"
echo "  $static_tools_dir/unzip"
echo
echo 'download-tools.js may still use the system unzip command during installation.'

if [[ "$STRICT" == "1" && "$errors" -gt 0 ]]; then
  exit 1
fi
