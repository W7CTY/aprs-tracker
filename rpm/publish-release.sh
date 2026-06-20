#!/bin/bash
# Publish a GitHub release for APRS Tracker, with the built RPM attached.
# Run this AFTER bash build.sh has successfully produced the RPM.
#
# Usage: bash publish-release.sh [github_token]
#   If github_token isn't passed as an argument, set it in the
#   GITHUB_TOKEN environment variable, or this script will prompt for it.

set -e

NAME="aprs-tracker"
REPO="W7CTY/aprs-tracker"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPEC_FILE="$SCRIPT_DIR/aprs-tracker.spec"

# ── Get version from the spec file ──────────────────────────
VERSION=$(grep '^Version:' "$SPEC_FILE" | awk '{print $2}')
TAG="v${VERSION}"

echo "════════════════════════════════════════════"
echo "  Publishing APRS Tracker release ${TAG}"
echo "════════════════════════════════════════════"

# ── Find the built RPM ───────────────────────────────────────
RPM_PATH=$(find "$HOME/rpmbuild/RPMS" -name "${NAME}-${VERSION}*.rpm" | head -1)
if [ -z "$RPM_PATH" ]; then
    echo "ERROR: No RPM found for version ${VERSION}."
    echo "Run 'bash build.sh' first."
    exit 1
fi
echo "Found RPM: $RPM_PATH"

# ── Get GitHub token ─────────────────────────────────────────
TOKEN="${1:-$GITHUB_TOKEN}"
if [ -z "$TOKEN" ]; then
    read -rsp "GitHub Personal Access Token: " TOKEN
    echo ""
fi

# ── Extract changelog entry for this version from the spec ───
RELEASE_NOTES=$(awk "/^\* .* - ${VERSION}-/{flag=1; next} /^\* .* - /{flag=0} flag" "$SPEC_FILE" | sed 's/^- //')
if [ -z "$RELEASE_NOTES" ]; then
    RELEASE_NOTES="Release ${VERSION}"
fi

# ── Create the release (or get existing one) ──────────────────
echo "Creating GitHub release ${TAG}..."
RELEASE_JSON=$(curl -s -X POST \
    -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/releases" \
    -d "{
        \"tag_name\": \"${TAG}\",
        \"name\": \"${TAG}\",
        \"body\": $(echo "$RELEASE_NOTES" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
        \"draft\": false,
        \"prerelease\": false
    }")

RELEASE_ID=$(echo "$RELEASE_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))")

if [ -z "$RELEASE_ID" ]; then
    echo "ERROR: Failed to create release. Response:"
    echo "$RELEASE_JSON" | python3 -m json.tool
    exit 1
fi

echo "Release created (ID: $RELEASE_ID)"

# ── Upload the RPM asset ───────────────────────────────────────
RPM_NAME=$(basename "$RPM_PATH")
echo "Uploading $RPM_NAME..."

UPLOAD_URL="https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=${RPM_NAME}"
curl -s -X POST \
    -H "Authorization: token $TOKEN" \
    -H "Content-Type: application/x-rpm" \
    --data-binary "@${RPM_PATH}" \
    "$UPLOAD_URL" | python3 -c "import json,sys; d=json.load(sys.stdin); print('Uploaded:', d.get('browser_download_url', d.get('message')))"

echo ""
echo "════════════════════════════════════════════"
echo "  Release ${TAG} published!"
echo "  https://github.com/${REPO}/releases/tag/${TAG}"
echo ""
echo "  The app's in-app update checker will now find"
echo "  this release automatically on next launch."
echo "════════════════════════════════════════════"
