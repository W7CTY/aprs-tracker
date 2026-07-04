#!/bin/bash
# APRSaR Tracker RPM build script.
# Run from the rpm/ directory: bash build.sh
set -e

VERSION="6.1.10"
NAME="aprs-tracker"
BUILDROOT="$HOME/rpmbuild"

echo ""
echo "--------------------------------------------"
echo "  APRSaR Tracker RPM Build  v${VERSION}"
echo "  W7CTY / 914 Communications"
echo "--------------------------------------------"
echo ""

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

# Stage source files
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
cp "$SCRIPT_DIR/../data/aprs-tracker.desktop"       "$STAGE/"
cp "$SCRIPT_DIR/../data/aprs-tracker-launcher.sh"   "$STAGE/"
cp "$SCRIPT_DIR/../data/icons/aprs-tracker.svg"     "$STAGE/icons/"
cp "$SCRIPT_DIR"/../data/icons/aprs-tracker-*.png   "$STAGE/icons/"

# Tarball and build RPM
cd /tmp
tar czf "${NAME}-${VERSION}.tar.gz" "${NAME}-${VERSION}"
cp "${NAME}-${VERSION}.tar.gz" "$BUILDROOT/SOURCES/"
cp "$SCRIPT_DIR/aprs-tracker.spec" "$BUILDROOT/SPECS/"

echo "Building RPM..."
rpmbuild -bb "$BUILDROOT/SPECS/aprs-tracker.spec"

# Find the built RPM -- abort with a clear message if rpmbuild didn't produce one
RPM_PATH=$(find "$BUILDROOT/RPMS" -name "${NAME}-${VERSION}*.rpm" 2>/dev/null | sort -V | tail -1)
if [ -z "$RPM_PATH" ]; then
    echo ""
    echo "ERROR: rpmbuild finished but no RPM was found under $BUILDROOT/RPMS/"
    echo "Check the rpmbuild output above for errors."
    exit 1
fi

echo ""
echo "--------------------------------------------"
echo "  Build complete: $RPM_PATH"
echo "--------------------------------------------"
echo ""

# Offer to install now.
INSTALL_NOW="n"
read -rp "Install it now? [Y/n] " INSTALL_NOW || INSTALL_NOW="n"
INSTALL_NOW="${INSTALL_NOW:-Y}"

INSTALL_SUCCEEDED=0
if [[ "$INSTALL_NOW" =~ ^[Yy] ]]; then
    # Remove any old version (including beta/preview) first
    for pkg in aprs-tracker aprs-tracker-beta aprs-tracker-preview; do
        sudo rpm -e --nodeps "$pkg" &>/dev/null || true
    done
    # Remove installed files directly in case rpm db is out of sync
    sudo rm -rf /usr/share/aprs-tracker/
    sudo rm -f /usr/bin/aprs-tracker
    # Clear WebKit cache so new HTML loads fresh
    rm -rf "$HOME/.cache/webkitgtk" "$HOME/.cache/aprs-tracker/webcache" "$HOME/.local/share/aprs-tracker" 2>/dev/null
    echo "Installing $RPM_PATH..."
    if sudo rpm -ivh --nodeps "$RPM_PATH" 2>&1; then
        INSTALL_SUCCEEDED=1
        echo ""
        # Verify the installed HTML has the correct menu
        if grep -q 'data-m="stations".*APRS' /usr/share/aprs-tracker/aprs-tracker.html 2>/dev/null; then
            echo "Installed and verified v'$VERSION'. Launch with:"
        else
            echo "WARNING: installed HTML may be cached. Run:"
            echo "  rm -rf ~/.cache/webkitgtk ~/.local/share/aprs-tracker"
            echo "Then launch:"
        fi
        echo "  aprs-tracker"
    else
        echo ""
        echo "Retrying with --force..."
        if sudo rpm -ivh --nodeps --force "$RPM_PATH" 2>&1; then
            INSTALL_SUCCEEDED=1
            echo "Installed. Launch from your app menu, or run:"
            echo "  aprs-tracker"
        else
            echo "Install failed. Run manually:"
            echo "  sudo rpm -ivh --nodeps --force \"$RPM_PATH\""
        fi
    fi
fi

# Always print the install command
echo ""
echo "--------------------------------------------"
echo "  Install command (save this):"
echo ""
echo "  sudo rpm -Uvh --nodeps \"$RPM_PATH\""
echo "--------------------------------------------"
echo ""

# Clean up source zip after a successful install
if [ "$INSTALL_SUCCEEDED" -eq 1 ]; then
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    PARENT_DIR="$(dirname "$PROJECT_ROOT")"
    for ZIP_CANDIDATE in "$PARENT_DIR/aprs-desktop.zip" "$HOME/Downloads/aprs-desktop.zip"; do
        if [ -f "$ZIP_CANDIDATE" ]; then
            rm -f "$ZIP_CANDIDATE"
            echo "Removed $ZIP_CANDIDATE"
        fi
    done
fi

echo "Optional -- for Meshtastic/MeshCore and APRS-IS messaging:"
echo "  pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography aprslib"
echo "(RPM post-install attempts this automatically; use this if it failed)"
echo ""
