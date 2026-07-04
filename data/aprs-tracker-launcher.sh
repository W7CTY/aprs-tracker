#!/bin/bash
# Clear WebKit cache directory before launch to ensure updated HTML always loads
CACHE_DIR="$HOME/.cache/aprs-tracker"
WK_CACHE="$HOME/.cache/webkitgtk"
WK_CACHE2="$HOME/.local/share/aprs-tracker"

# Remove our app's WebKit cache entries
rm -rf "$CACHE_DIR/webcache" 2>/dev/null
rm -rf "$WK_CACHE" 2>/dev/null
rm -rf "$WK_CACHE2" 2>/dev/null

exec python3 /usr/share/aprs-tracker/aprs_tracker_app.py "$@"
