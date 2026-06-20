#!/bin/bash
# Cleanup script — removes ALL previous APRS Tracker installs, RPM build
# artifacts, and stale downloads, so you start fresh with no version
# confusion.
#
# Safe to run anytime, including before every reinstall. It only ever
# touches things under the "aprs-tracker" name.

set -e

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
echo "Looking for extracted project folders / old zips in common locations..."
for dir in "$HOME/Downloads" "$HOME/Desktop" "$HOME"; do
    if [ -d "$dir" ]; then
        find "$dir" -maxdepth 2 -iname "aprs-desktop*" -print 2>/dev/null | while read -r found; do
            echo "  Found: $found"
        done
    fi
done
echo ""
read -rp "Delete all 'aprs-desktop*' files/folders listed above from Downloads, Desktop, and home? [y/N] " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    for dir in "$HOME/Downloads" "$HOME/Desktop" "$HOME"; do
        if [ -d "$dir" ]; then
            find "$dir" -maxdepth 2 -iname "aprs-desktop*" -exec rm -rf {} + 2>/dev/null || true
        fi
    done
    echo "Removed."
else
    echo "Skipped — left in place."
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
echo "Clean slate. Download the latest aprs-desktop.zip and start fresh:"
echo "  cd ~/Downloads"
echo "  unzip -o aprs-desktop.zip"
echo "  cd aprs-desktop/rpm"
echo "  grep Version aprs-tracker.spec    # confirm this is the version you expect"
echo "  bash build.sh"
echo "════════════════════════════════════════════"
