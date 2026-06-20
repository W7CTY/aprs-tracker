#!/bin/bash
# Build script for APRS Tracker RPM
# Run this on your Fedora machine after extracting the project.
set -e

VERSION="2.1.2"
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
echo ""
echo "  Install with:"
echo "    sudo dnf install \"$RPM_PATH\""
echo ""
echo "  Then launch from your app menu, or run:"
echo "    aprs-tracker"
echo ""
echo "  Optional — for Meshtastic/MeshCore mesh networking support:"
echo "    pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography"
echo "  (the RPM post-install attempts this automatically; this is a"
echo "   fallback if that step failed, e.g. no internet during install)"
echo "════════════════════════════════════════════"
