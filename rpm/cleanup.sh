#!/bin/bash
# Cleanup script — removes ALL previous APRS Tracker installs, RPM build
# artifacts, and stale downloads, so you start fresh with no version
# confusion.
#
# Safe to run anytime, including before every reinstall. It only ever
# touches things under the "aprs-tracker" name, and never deletes the
# copy of the project it's currently running from.

set -e

# Figure out which "aprs-desktop" folder this script itself lives in
# (two levels up from rpm/cleanup.sh), so step 4 can skip it. Without
# this, running the script from inside an aprs-desktop/rpm/ checkout
# would delete its own parent directory mid-run and strand the shell.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OWN_PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# cd somewhere that's guaranteed to still exist after any deletion below,
# so a stray rm of a directory we're sitting in can never break the shell.
cd "$HOME"

echo "════════════════════════════════════════════"
echo "  APRS Tracker — Full Cleanup"
echo "  W7CTY / 914 Communications"
echo "════════════════════════════════════════════"
echo ""

# ── 1. Uninstall the package if present (any version) ─────────
if rpm -q aprs-tracker &>/dev/null; then
    INSTALLED=$(rpm -q aprs-tracker)
    echo "Removing installed package: $INSTALLED"
    sudo dnf remove -y aprs-tracker
else
    echo "No installed aprs-tracker package found."
fi
echo ""

# ── 2. Remove all built RPMs (every version) ───────────────────
echo "Removing built RPMs from ~/rpmbuild..."
find "$HOME/rpmbuild/RPMS" -name "aprs-tracker-*.rpm" -print -delete 2>/dev/null || true
find "$HOME/rpmbuild/SRPMS" -name "aprs-tracker-*.rpm" -print -delete 2>/dev/null || true
find "$HOME/rpmbuild/SOURCES" -name "aprs-tracker-*.tar.gz" -print -delete 2>/dev/null || true
find "$HOME/rpmbuild/SPECS" -name "aprs-tracker.spec" -print -delete 2>/dev/null || true
echo ""

# ── 3. Remove leftover build directories ───────────────────────
echo "Removing leftover build directories..."
find "$HOME/rpmbuild/BUILD" -maxdepth 1 -name "aprs-tracker-*" -print -exec rm -rf {} + 2>/dev/null || true
find "$HOME/rpmbuild/BUILDROOT" -maxdepth 1 -name "aprs-tracker-*" -print -exec rm -rf {} + 2>/dev/null || true
find /tmp -maxdepth 1 -name "aprs-tracker-*" -print -exec rm -rf {} + 2>/dev/null || true
find /tmp -maxdepth 1 -name "aprs-tracker-update-*" -print -delete 2>/dev/null || true
echo ""

# ── 4. Remove any manually-extracted source/zip copies ─────────
# Excludes the copy of the project this script is currently running
# from (OWN_PROJECT_DIR) — deleting that out from under a running
# script strands the shell's working directory and breaks every
# command after it.
echo "Looking for extracted project folders / old zips in common locations..."
echo "(Keeping the copy currently in use: $OWN_PROJECT_DIR)"
FOUND_LIST=()
SEEN_PATHS=()
for dir in "$HOME/Downloads" "$HOME/Desktop" "$HOME"; do
    if [ -d "$dir" ]; then
        while IFS= read -r found; do
            real_found="$(cd "$found" 2>/dev/null && pwd || echo "$found")"
            if [ "$real_found" = "$OWN_PROJECT_DIR" ]; then
                continue
            fi
            # Skip duplicates (the same path can surface from more than
            # one search root, e.g. ~/Downloads/x and ~ both matching x)
            already_seen=0
            for seen in "${SEEN_PATHS[@]:-}"; do
                [ "$seen" = "$real_found" ] && already_seen=1 && break
            done
            [ "$already_seen" -eq 1 ] && continue
            SEEN_PATHS+=("$real_found")
            FOUND_LIST+=("$found")
            echo "  Found: $found"
        done < <(find "$dir" -maxdepth 2 -iname "aprs-desktop*" 2>/dev/null)
    fi
done
echo ""

if [ "${#FOUND_LIST[@]}" -eq 0 ]; then
    echo "Nothing else to remove."
else
    read -rp "Delete the ${#FOUND_LIST[@]} item(s) listed above? [y/N] " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        for item in "${FOUND_LIST[@]}"; do
            rm -rf "$item"
        done
        echo "Removed."
    else
        echo "Skipped — left in place."
    fi
fi
echo ""

# ── 5. Clear icon cache so old icons don't linger ───────────────
echo "Refreshing icon cache..."
gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor 2>/dev/null || true
update-desktop-database -q /usr/share/applications 2>/dev/null || true
echo ""

# ── 6. Verify clean state ───────────────────────────────────────
echo "════════════════════════════════════════════"
echo "  Verification"
echo "════════════════════════════════════════════"
if rpm -q aprs-tracker &>/dev/null; then
    echo "  ⚠ Package still installed: $(rpm -q aprs-tracker)"
else
    echo "  ✓ No aprs-tracker package installed"
fi

REMAINING_RPMS=$(find "$HOME/rpmbuild" -iname "aprs-tracker-*" 2>/dev/null | wc -l)
echo "  Remaining files under ~/rpmbuild matching aprs-tracker: $REMAINING_RPMS"

echo ""
echo "Clean slate. The copy of the project you're running this from is"
echo "still here:"
echo "  $OWN_PROJECT_DIR"
echo ""
echo "Continue with:"
echo "  cd $SCRIPT_DIR"
echo "  grep Version aprs-tracker.spec    # confirm this is the version you expect"
echo "  bash build.sh"
echo "════════════════════════════════════════════"
