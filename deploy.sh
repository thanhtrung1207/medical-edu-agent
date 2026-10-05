#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$SCRIPT_DIR"
FRONTEND_DIR="$REPO_ROOT/frontend"

TARGET="all"
TARGET_SELECTED=false
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [--all | --backend | --frontend] [--dry-run]

Deploy the backend to an existing Hugging Face Space and/or the frontend
application to an existing Vercel project. The default target is --all,
which deploys the backend first and then the frontend.

Options:
  --all        Deploy backend and frontend (default)
  --backend    Deploy only the backend
  --frontend   Deploy only the frontend
  --dry-run    Validate configuration and print redacted commands only
  -h, --help   Show this help text

Required environment variables:
  Backend:  HF_TOKEN, HF_SPACE_ID
  Frontend: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID

Required commands:
  Backend:  git, tar, hf (official Hugging Face CLI)
  Frontend: vercel (installed Vercel CLI)
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

select_target() {
  local requested_target="$1"

  if [[ "$TARGET_SELECTED" == true && "$TARGET" != "$requested_target" ]]; then
    fail "choose only one of --all, --backend, or --frontend"
  fi

  TARGET="$requested_target"
  TARGET_SELECTED=true
}

require_env() {
  local deployment="$1"
  shift

  local name
  local -a missing=()
  for name in "$@"; do
    if [[ -z "${!name-}" ]]; then
      missing+=("$name")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    fail "missing required environment variable(s) for ${deployment} deployment: ${missing[*]}"
  fi
}

require_command() {
  local command_name="$1"
  local install_hint="$2"

  command -v "$command_name" >/dev/null 2>&1 || \
    fail "required command '${command_name}' was not found; ${install_hint}"
}

readonly -a HF_EXCLUDES=(
  '.git'
  '.git/**'
  '.env'
  '.env.*'
  '**/.env'
  '**/.env.*'
  'venv/**'
  '.venv/**'
  '.verify_venv/**'
  '__pycache__/**'
  '**/__pycache__/**'
  '.pytest_cache/**'
  '**/.pytest_cache/**'
  '.mypy_cache/**'
  '**/.mypy_cache/**'
  '.ruff_cache/**'
  '**/.ruff_cache/**'
  '.cache/**'
  '**/.cache/**'
  'node_modules/**'
  '**/node_modules/**'
  'frontend/.next/**'
  'frontend/out/**'
  'frontend/.vercel/**'
  'frontend/.vercel-tmp/**'
  '.codegraph/**'
  '.qoder/**'
  '.claude/**'
  '**/.claude/**'
  '.superpowers/**'
  '.worktrees/**'
  '.idea/**'
  '.vscode/**'
  'knowledge-site/.quarto/**'
  'knowledge-site/_site/**'
  'coverage/**'
  '**/coverage/**'
  'build/**'
  '**/build/**'
  'dist/**'
  '**/dist/**'
  'htmlcov/**'
  '**/htmlcov/**'
  'data/embeddings/**'
  'data/uploads/**'
  '*.db'
  '*.db-*'
  '**/*.db'
  '**/*.db-*'
  '*.sqlite'
  '*.sqlite-*'
  '**/*.sqlite'
  '**/*.sqlite-*'
  '*.sqlite3'
  '*.sqlite3-*'
  '**/*.sqlite3'
  '**/*.sqlite3-*'
  '*.log'
  '**/*.log'
  '.coverage'
  '**/.coverage'
  'coverage.xml'
  '**/coverage.xml'
  '*.tsbuildinfo'
  '**/*.tsbuildinfo'
  '*.pem'
  '**/*.pem'
  '*.key'
  '**/*.key'
  '*.p12'
  '**/*.p12'
  '*.pfx'
  '**/*.pfx'
  '*.ppk'
  '**/*.ppk'
  '.ssh/**'
  '**/.ssh/**'
  'id_rsa*'
  '**/id_rsa*'
  'id_ed25519*'
  '**/id_ed25519*'
  '.DS_Store'
  '**/.DS_Store'
)

HF_EXCLUDE_ARGS=()
for pattern in "${HF_EXCLUDES[@]}"; do
  HF_EXCLUDE_ARGS+=(--exclude "$pattern")
done
readonly -a HF_EXCLUDE_ARGS

dry_run_backend() {
  printf '%s\n' \
    '[dry-run] Backend: create temporary staging directory from git archive HEAD' \
    "[dry-run] Backend: (export HF_TOKEN; hf upload <HF_SPACE_ID> <staging-dir> . --repo-type space --delete '*' --exclude <pattern> [--exclude <pattern> ...])" \
    '[dry-run] Backend: remove temporary staging directory'
  printf '[dry-run] Backend exclusions:'
  printf ' %s' "${HF_EXCLUDES[@]}"
  printf '\n'
}

dry_run_frontend() {
  printf '%s\n' \
    '[dry-run] Frontend: (cd <repo-root>/frontend && export VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; vercel pull --yes --environment=production)' \
    '[dry-run] Frontend: (cd <repo-root>/frontend && export VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; vercel build --prod)' \
    '[dry-run] Frontend: (cd <repo-root>/frontend && export VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; vercel deploy --prebuilt --prod)'
}

deploy_backend() {
  printf '%s\n' 'Deploying backend to Hugging Face Space...'
  (
    local staging_dir
    staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/medical-edu-agent-deploy.XXXXXX")"
    trap 'rm -rf -- "$staging_dir"' EXIT

    git -C "$REPO_ROOT" archive HEAD | tar -x -C "$staging_dir"
    export HF_TOKEN
    hf upload "$HF_SPACE_ID" "$staging_dir" . \
      --repo-type space \
      --delete '*' \
      "${HF_EXCLUDE_ARGS[@]}"
  )
  printf '%s\n' 'Backend deployment submitted successfully.'
}

deploy_frontend() {
  printf '%s\n' 'Deploying frontend to Vercel production...'
  (
    cd "$FRONTEND_DIR"
    export VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID

    vercel pull \
      --yes \
      --environment=production
    vercel build \
      --prod
    vercel deploy \
      --prebuilt \
      --prod
  )
  printf '%s\n' 'Frontend production deployment completed successfully.'
}

while (( $# > 0 )); do
  case "$1" in
    --all)
      select_target all
      ;;
    --backend)
      select_target backend
      ;;
    --frontend)
      select_target frontend
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "unknown argument: $1"
      ;;
  esac
  shift
done

if [[ "$TARGET" == all || "$TARGET" == backend ]]; then
  [[ -f "$REPO_ROOT/Dockerfile" ]] || fail "repository root does not contain Dockerfile"
  require_env backend HF_TOKEN HF_SPACE_ID
fi
if [[ "$TARGET" == all || "$TARGET" == frontend ]]; then
  [[ -f "$FRONTEND_DIR/package.json" ]] || fail "frontend/package.json was not found"
  require_env frontend VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID
fi

if [[ "$DRY_RUN" == true ]]; then
  if [[ "$TARGET" == all || "$TARGET" == backend ]]; then
    dry_run_backend
  fi
  if [[ "$TARGET" == all || "$TARGET" == frontend ]]; then
    dry_run_frontend
  fi
  exit 0
fi

if [[ "$TARGET" == all || "$TARGET" == backend ]]; then
  require_command git "install Git before deploying"
  require_command tar "install tar before deploying"
  require_command hf "install the official Hugging Face CLI before deploying"
fi
if [[ "$TARGET" == all || "$TARGET" == frontend ]]; then
  require_command vercel "install the Vercel CLI before deploying"
fi

if [[ "$TARGET" == all || "$TARGET" == backend ]]; then
  deploy_backend
fi
if [[ "$TARGET" == all || "$TARGET" == frontend ]]; then
  deploy_frontend
fi
