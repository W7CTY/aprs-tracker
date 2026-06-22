#!/bin/bash
# Build script for APRS Tracker RPM
# Run this on your Fedora machine after extracting the project.
set -e

VERSION="3.0.6"
NAME="aprs-tracker"
BUILDROOT="$HOME/rpmbuild"

echo "════════════════════════════════════════════"
echo "  APRS Tracker RPM Build"
echo "  W7CTY / 914 Communications"
echo "════════════════════════════════════════════"

# Ensure rpmbuild tooling is present
if ! command -v rpmbuild &>/dev/null; then
    echo "Installing rpm-build and required GTK4/WebKit deps..."
    sudo dnf install -y rpm-build rpmdevtools \
        python3-gobject gtk4 libadwaita webkitgtk6.0 \
        gtk4-devel libadwaita-devel webkitgtk6.0-devel
fi

# Set up the standard rpmbuild tree
rpmdev-setuptree 2>/dev/null || mkdir -p "$BUILDROOT"/{SPECS,SOURCES,BUILD,RPMS,SRPMS}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Stage the source directory as aprs-tracker-1.0.0/
STAGE="/tmp/${NAME}-${VERSION}"
rm -rf "$STAGE"
mkdir -p "$STAGE/icons"

cp "$SCRIPT_DIR/../src/aprs_tracker_app.py" "$STAGE/"
cp "$SCRIPT_DIR/../src/mesh_backend.py"     "$STAGE/"
cp "$SCRIPT_DIR/../src/tile_cache.py"       "$STAGE/"
cp "$SCRIPT_DIR/../src/aprs_messaging.py"   "$STAGE/"
cp "$SCRIPT_DIR/../src/update_checker.py"   "$STAGE/"
cp "$SCRIPT_DIR/../src/VERSION"             "$STAGE/"
cp "$SCRIPT_DIR/../src/aprs-tracker.html"   "$STAGE/"
cp "$SCRIPT_DIR/../data/aprs-tracker.desktop" "$STAGE/"
cp "$SCRIPT_DIR/../data/aprs-tracker-launcher.sh" "$STAGE/"
cp "$SCRIPT_DIR/../data/icons/aprs-tracker.svg" "$STAGE/icons/"
cp "$SCRIPT_DIR"/../data/icons/aprs-tracker-*.png "$STAGE/icons/"

# Tarball it
cd /tmp
tar czf "${NAME}-${VERSION}.tar.gz" "${NAME}-${VERSION}"
cp "${NAME}-${VERSION}.tar.gz" "$BUILDROOT/SOURCES/"
cp "$SCRIPT_DIR/aprs-tracker.spec" "$BUILDROOT/SPECS/"

echo ""
echo "Building RPM..."
rpmbuild -bb "$BUILDROOT/SPECS/aprs-tracker.spec"

RPM_PATH=$(find "$BUILDROOT/RPMS" -name "${NAME}-${VERSION}*.rpm" | head -1)

echo ""
echo "════════════════════════════════════════════"
echo "  Build complete!"
echo "  RPM: $RPM_PATH"
echo "════════════════════════════════════════════"
echo ""

# Offer to install right away. Only on a confirmed-successful install do
# we delete the source zip you extracted this from -- if install is
# skipped or fails, the zip is left in place so nothing is lost.
# The `|| INSTALL_NOW="n"` guards against a closed/non-interactive
# stdin, where `read` itself fails -- without it, `set -e` would kill
# the whole script right here, after the RPM was already built, and
# never print the manual install fallback instructions below.
INSTALL_NOW="n"
read -rp "Install it now with sudo dnf install? [Y/n] " INSTALL_NOW || INSTALL_NOW="n"
INSTALL_NOW="${INSTALL_NOW:-Y}"

INSTALL_SUCCEEDED=0
if [[ "$INSTALL_NOW" =~ ^[Yy] ]]; then
    if sudo dnf install -y "$RPM_PATH"; then
        INSTALL_SUCCEEDED=1
        echo ""
        echo "Installed. Launch from your app menu, or run: aprs-tracker"
    else
        echo ""
        echo "Install failed -- run it yourself when ready:"
        echo "  sudo dnf install \"$RPM_PATH\""
    fi
else
    echo "Skipped. Install later with:"
    echo "  sudo dnf install \"$RPM_PATH\""
fi

# Delete the source zip after a successful install. PROJECT_ROOT is the
# extracted aprs-desktop/ folder this script lives inside
# (rpm/build.sh -> rpm -> aprs-desktop); the zip is whatever
# aprs-desktop.zip sits next to that folder, per the documented
# 'unzip aprs-desktop.zip && cd aprs-desktop/rpm' flow. Only deletes a
# zip that's actually still there -- never errors if it's already gone
# or was extracted somewhere this script can't find it.
if [ "$INSTALL_SUCCEEDED" -eq 1 ]; then
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    PARENT_DIR="$(dirname "$PROJECT_ROOT")"
    for ZIP_CANDIDATE in "$PARENT_DIR/aprs-desktop.zip" "$HOME/Downloads/aprs-desktop.zip"; do
        if [ -f "$ZIP_CANDIDATE" ]; then
            rm -f "$ZIP_CANDIDATE"
            echo "Removed $ZIP_CANDIDATE (install succeeded, no longer needed)"
        fi
    done
fi

echo ""
echo "Optional — for Meshtastic/MeshCore mesh networking and APRS-IS"
echo "messaging support:"
echo "  pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography aprslib"
echo "(the RPM post-install attempts this automatically; this is a"
echo " fallback if that step failed, e.g. no internet during install)"
echo "════════════════════════════════════════════"
