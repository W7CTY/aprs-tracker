Name:           aprs-tracker
Version:        2.2.0
Release:        1%{?dist}
Summary:        Full-featured SAR & APRS toolkit for ham radio operators

License:        Proprietary
URL:            https://github.com/W7CTY/aprs-tracker
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch

Requires:       python3
Requires:       python3-gobject
Requires:       gtk4
Requires:       libadwaita
Requires:       webkitgtk6.0
Requires:       python3-cryptography

# Mesh networking (Meshtastic MQTT + MeshCore companion radio) is optional.
# paho-mqtt, meshtastic, and meshcore are not packaged for Fedora, so they
# are installed via pip post-install rather than as hard RPM dependencies.
# The app runs fine for APRS-only use without them; the MESH tab will show
# a one-time setup hint if they're missing.
Recommends:     python3-pip

%description
APRS Tracker is a native desktop SAR (Search & Rescue) toolkit and live
APRS position tracking application, built for ham radio operators and
SAR teams.

Features:
 - Live APRS station data via aprs.fi, with wildcard callsign search
 - Multi-subject tracking with color-coded map markers and status
 - Search sector drawing, area calculation, and status tracking
   (unsearched / in progress / cleared)
 - Waypoint placement and distance/bearing calculator
 - Coordinate converter (Decimal, DMS, DDM, UTM)
 - Personnel/team roster with check-in, deployment status, and sector
   assignment
 - Timestamped incident log with manual entries and text export
 - Live weather conditions, 5-day forecast, and animated radar overlay
   on the map (via Open-Meteo and RainViewer)
 - Mesh network integration: Meshtastic (public or private MQTT broker)
   and MeshCore (USB/Serial, BLE, or Wi-Fi companion radio) node
   positions merged onto the same map, optional feature
 - Light / dark theme

Developed by W7CTY / 914 Communications.

To enable mesh networking support, install the optional Python packages:
  pip3 install --user paho-mqtt meshtastic meshcore cryptography

%prep
%setup -q

%build
# Nothing to build — pure Python + bundled HTML/JS

%install
rm -rf %{buildroot}

# Application files
install -d %{buildroot}%{_datadir}/aprs-tracker
install -m 644 aprs_tracker_app.py %{buildroot}%{_datadir}/aprs-tracker/
install -m 644 mesh_backend.py %{buildroot}%{_datadir}/aprs-tracker/
install -m 644 update_checker.py %{buildroot}%{_datadir}/aprs-tracker/
install -m 644 VERSION %{buildroot}%{_datadir}/aprs-tracker/
install -m 644 aprs-tracker.html %{buildroot}%{_datadir}/aprs-tracker/

# Launcher script
install -d %{buildroot}%{_bindir}
install -m 755 aprs-tracker-launcher.sh %{buildroot}%{_bindir}/aprs-tracker

# Desktop entry
install -d %{buildroot}%{_datadir}/applications
install -m 644 aprs-tracker.desktop %{buildroot}%{_datadir}/applications/

# Icons (hicolor theme, multiple sizes)
for size in 16 22 24 32 48 64 128 256 512; do
  install -d %{buildroot}%{_datadir}/icons/hicolor/${size}x${size}/apps
  install -m 644 icons/aprs-tracker-${size}.png \
    %{buildroot}%{_datadir}/icons/hicolor/${size}x${size}/apps/aprs-tracker.png
done

# Scalable SVG icon
install -d %{buildroot}%{_datadir}/icons/hicolor/scalable/apps
install -m 644 icons/aprs-tracker.svg \
  %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/aprs-tracker.svg

%files
%{_bindir}/aprs-tracker
%{_datadir}/aprs-tracker/aprs_tracker_app.py
%{_datadir}/aprs-tracker/mesh_backend.py
%{_datadir}/aprs-tracker/update_checker.py
%{_datadir}/aprs-tracker/VERSION
%{_datadir}/aprs-tracker/aprs-tracker.html
%{_datadir}/applications/aprs-tracker.desktop
%{_datadir}/icons/hicolor/*/apps/aprs-tracker.png
%{_datadir}/icons/hicolor/scalable/apps/aprs-tracker.svg

%post
/usr/bin/gtk-update-icon-cache -q -t -f %{_datadir}/icons/hicolor &>/dev/null || :
/usr/bin/update-desktop-database -q %{_datadir}/applications &>/dev/null || :

# Best-effort install of optional mesh networking dependencies.
# Not fatal if this fails (no internet, pip unavailable, etc.) —
# the app works fine without it, just without the MESH tab's live data.
if command -v pip3 &>/dev/null; then
  pip3 install --break-system-packages --quiet \
    paho-mqtt meshtastic meshcore cryptography &>/dev/null || \
  echo "aprs-tracker: optional mesh networking packages could not be installed automatically." \
       "Run: pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography" >&2
fi

%postun
/usr/bin/gtk-update-icon-cache -q -t -f %{_datadir}/icons/hicolor &>/dev/null || :
/usr/bin/update-desktop-database -q %{_datadir}/applications &>/dev/null || :

%changelog
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.2.0-1
- Added automatic update checking and one-click installation. The app
  checks github.com/W7CTY/aprs-tracker for new releases a few seconds
  after launch; an Update button lights up in the header bar when a
  newer version is available. Clicking it shows the changelog and
  installs via a graphical pkexec/polkit prompt -- no terminal needed.
- Update checks fail silently (no nagging) if there's no internet or
  no newer release.
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.1.2-1
- Fixed the actual cause of "Zoom Level Not Supported" tiles: OSM's
  tile.openstreetmap.org now enforces a strict tile usage policy
  requiring a browser Referer header, which a file:// loaded WebKitGTK
  view never sends. Every tile request was getting blocked and
  returning OSM's generic "Access Blocked" placeholder graphic
  (which happens to read "Zoom Level Not Supported"), regardless of
  zoom level -- this had nothing to do with zoom or the radar overlay.
- Switched the base map to CartoCDN (basemaps.cartocdn.com), a free
  tile provider with no API key and no Referer requirement, with
  native light/dark tile variants that now swap automatically with
  the app's theme toggle instead of relying on a CSS filter.
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.1.1-1
- Fixed weather radar overlay not rendering by giving it a dedicated
  map pane (was sharing a pane with the base map tiles, which made
  stacking order unreliable). Radar opacity raised for visibility.
  Note: a clear/transparent radar means no precipitation nearby, not
  a bug.
- Removed "Area" button and wildcard callsign search (KD4*, etc.).
  aprs.fi's public API only supports looking up specific, known
  callsigns by exact name -- it has no area/radius or wildcard search
  endpoint. These features always failed silently because they were
  built on a wrong assumption about the API. Use Track with an exact
  callsign instead.
- "Me" and "Set Location" no longer attempt a (broken) area lookup
  after positioning -- they just center the map and place the marker.
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.1.0-1
- Added Meshtastic support: connects to the public mqtt.meshtastic.org
  broker or a private/team broker over MQTT, decodes and decrypts
  position packets, merges nodes onto the map
- Added MeshCore support: connects to a companion radio over USB/Serial,
  Bluetooth, or Wi-Fi, pulls contact positions
- New MESH tab for connection management (broker/transport settings,
  connect/disconnect, live status)
- Mesh nodes appear on the map with pink markers and a MESH badge,
  merged into the same station list as APRS traffic
- Optional feature: pip3 install paho-mqtt meshtastic meshcore
  cryptography (auto-attempted on install, app works fine without it)
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.0.2-1
- Added manual "Set Location" override (type coordinates or tap the map)
  to work around inaccurate GeoClue2/Wi-Fi-based geolocation on desktop
  Linux systems
- GPS "Me" button now shows accuracy radius and a warning to verify
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.0.1-1
- Fixed radar overlay showing "Zoom Level Not Supported" tiles by
  capping maxNativeZoom to RainViewer's supported range
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.0.0-1
- Full SAR toolkit: multi-subject tracking, search sectors, roster,
  incident log, coordinate tools, distance/bearing calculator
- Live weather conditions, forecast, and radar overlay
- Fixed "Open on aprs.fi" link to open in system browser
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 1.0.0-1
- Initial release
- Live APRS tracking via aprs.fi
- Wildcard callsign search
- SAR mode panel
- Light/dark theme toggle
