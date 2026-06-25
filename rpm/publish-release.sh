#!/bin/bash
# Publish a GitHub release for APRS Tracker, with the built RPM attached.
# Run this AFTER bash build.sh has successfully produced the RPM.
#
# Uses the GitHub CLI (gh), authenticated once via `gh auth login` and
# stored securely by gh itself (not by this script, not by this app).
# No token is ever typed into or read by this script directly.
#
# Usage: bash publish-release.sh

set -e

NAME="aprs-tracker"
REPO="W7CTY/aprs-tracker"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPEC_FILE="$SCRIPT_DIR/aprs-tracker.spec"

echo "════════════════════════════════════════════"
echo "  Publishing APRS Tracker Release"
echo "  W7CTY / 914 Communications"
echo "════════════════════════════════════════════"
echo ""

# ── 1. Make sure gh is installed ────────────────────────────────
if ! command -v gh &>/dev/null; then
    echo "GitHub CLI (gh) not found -- installing..."
    if command -v dnf &>/dev/null; then
        # Fedora 42+ ships gh directly; fall back to the official repo
        # if that's not available on this system.
        sudo dnf install -y gh 2>/dev/null || {
            echo "Adding the official GitHub CLI repo..."
            sudo dnf install -y 'dnf-command(config-manager)'
            sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
            sudo dnf install -y gh
        }
    else
        echo "ERROR: dnf not found. Install gh manually: https://cli.github.com"
        exit 1
    fi
fi
echo "gh found: $(gh --version | head -1)"
echo ""

# ── 2. Make sure we're authenticated ────────────────────────────
# gh stores credentials itself (in the OS keyring where available, or
# an encrypted config file otherwise) -- this script never sees, asks
# for, or stores a token.
if ! gh auth status &>/dev/null; then
    echo "Not logged in to GitHub yet. This is a one-time step -- gh"
    echo "remembers it after this, so you won't be asked again."
    echo ""
    gh auth login
    echo ""
fi
echo "Authenticated as: $(gh api user --jq .login 2>/dev/null || echo '(unknown)')"
echo ""

# ── 3. Get version from the spec file ───────────────────────────
VERSION=$(grep '^Version:' "$SPEC_FILE" | awk '{print $2}')
TAG="v${VERSION}"

# ── 4. Find the built RPM ───────────────────────────────────────
RPM_PATH=$(find "$HOME/rpmbuild/RPMS" -name "${NAME}-${VERSION}*.rpm" | head -1)
if [ -z "$RPM_PATH" ]; then
    echo "ERROR: No RPM found for version ${VERSION}."
    echo "Run 'bash build.sh' first."
    exit 1
fi
echo "Found RPM: $RPM_PATH"
echo "Release tag: $TAG"
echo ""

# ── 5. Extract changelog entry for this version from the spec ──
RELEASE_NOTES=$(awk "/^\* .* - ${VERSION}-/{flag=1; next} /^\* .* - /{flag=0} flag" "$SPEC_FILE" | sed 's/^- //')
if [ -z "$RELEASE_NOTES" ]; then
    RELEASE_NOTES="Release ${VERSION}"
fi

# ── 6. Create the release with the RPM attached ─────────────────
# `gh release create` handles tagging, release creation, and asset
# upload in a single step.
if gh release view "$TAG" --repo "$REPO" &>/dev/null; then
    echo "Release $TAG already exists -- uploading/replacing the RPM asset..."
    gh release upload "$TAG" "$RPM_PATH" --repo "$REPO" --clobber
else
    echo "Creating release $TAG..."
    gh release create "$TAG" "$RPM_PATH" \
        --repo "$REPO" \
        --title "$TAG" \
        --notes "$RELEASE_NOTES"
fi

echo ""
echo "════════════════════════════════════════════"
echo "  Release ${TAG} published!"
echo "  https://github.com/${REPO}/releases/tag/${TAG}"
echo ""
echo "  The app's in-app update checker will now find"
echo "  this release automatically on next launch."
echo "════════════════════════════════════════════"
