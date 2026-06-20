Name:           aprs-tracker
Version:        2.4.1
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

# Mesh networking (Meshtastic MQTT + MeshCore companion radio) and APRS-IS
# two-way messaging are optional. paho-mqtt, meshtastic, meshcore, and
# aprslib are not packaged for Fedora, so they are installed via pip
# post-install rather than as hard RPM dependencies. The app runs fine
# for APRS-only use without them; the MESH/MSG tabs will show a one-time
# setup hint if they're missing.
Recommends:     python3-pip

%description
APRS Tracker is a native desktop SAR (Search & Rescue) toolkit and live
APRS position tracking application, built for ham radio operators and
SAR teams.

Features:
 - Live APRS station data via aprs.fi
 - Multi-subject tracking with color-coded map markers and status
 - Search sector drawing, area calculation, and status tracking
   (unsearched / in progress / cleared)
 - Waypoint placement and distance/bearing calculator
 - Coordinate converter (Decimal, DMS, DDM, UTM)
 - Personnel/team roster with check-in, deployment status, sector
   assignment, and live position tracking for members with a callsign
 - Permanently saved, dated incident log/history with export
 - Live weather conditions, 5-day forecast, and animated radar overlay
   on the map (via Open-Meteo and RainViewer)
 - Mesh network integration: Meshtastic (public or private MQTT broker)
   and MeshCore (USB/Serial, BLE, or Wi-Fi companion radio) node
   positions merged onto the same map, optional feature
 - Two-way APRS-IS text messaging (optional, requires a callsign)
 - Multiple named, switchable Operation profiles so separate searches
   don't mix data, with archive/delete management
 - GPX and KML import/export for interop with CalTopo, SARTopo, Garmin
   units, and ATAK
 - Printable sector briefing sheets and full operation summary sheets
 - Offline map tile caching: automatic as you browse, plus an explicit
   "download this area" option to pre-stage before losing signal
 - SAR planning tools: LKP/PLS/IPP/Clue markers, search operation timer,
   sweep-width search effort estimator
 - In-app update checking with one-click install (no terminal needed)
 - Light / dark theme

Developed by W7CTY / 914 Communications.

To enable mesh networking and/or APRS-IS messaging support, install the
optional Python packages:
  pip3 install --user paho-mqtt meshtastic meshcore cryptography aprslib

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
install -m 644 tile_cache.py %{buildroot}%{_datadir}/aprs-tracker/
install -m 644 aprs_messaging.py %{buildroot}%{_datadir}/aprs-tracker/
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
%{_datadir}/aprs-tracker/tile_cache.py
%{_datadir}/aprs-tracker/aprs_messaging.py
%{_datadir}/aprs-tracker/update_checker.py
%{_datadir}/aprs-tracker/VERSION
%{_datadir}/aprs-tracker/aprs-tracker.html
%{_datadir}/applications/aprs-tracker.desktop
%{_datadir}/icons/hicolor/*/apps/aprs-tracker.png
%{_datadir}/icons/hicolor/scalable/apps/aprs-tracker.svg

%post
/usr/bin/gtk-update-icon-cache -q -t -f %{_datadir}/icons/hicolor &>/dev/null || :
/usr/bin/update-desktop-database -q %{_datadir}/applications &>/dev/null || :

# Best-effort install of optional mesh networking + APRS messaging
# dependencies. Not fatal if this fails (no internet, pip unavailable,
# etc.) — the app works fine without it, just without the MESH/MSG
# tabs' live data.
if command -v pip3 &>/dev/null; then
  pip3 install --break-system-packages --quiet \
    paho-mqtt meshtastic meshcore cryptography aprslib &>/dev/null || \
  echo "aprs-tracker: optional packages could not be installed automatically." \
       "Run: pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography aprslib" >&2
fi

%postun
/usr/bin/gtk-update-icon-cache -q -t -f %{_datadir}/icons/hicolor &>/dev/null || :
/usr/bin/update-desktop-database -q %{_datadir}/applications &>/dev/null || :

%changelog
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.4.1-1
- Fixed cleanup.sh deleting its own project directory mid-run when
  invoked from inside an extracted aprs-desktop/rpm/ checkout (e.g.
  ~/Downloads/aprs-desktop/rpm). It now detects the project folder
  it's actually running from and excludes that one copy from
  deletion, and cd's to $HOME first so a stray deletion can never
  strand the shell's working directory again. Also de-duplicates the
  found-items list (the same path could be listed twice when it
  matched more than one search root).
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.4.0-1
- Operation profiles: name, switch between, archive, and delete
  separate searches so their subjects/sectors/roster/log/markers don't
  mix together. Auto-created "Default" operation on first run after
  upgrading; existing data is preserved.
- GPX and KML import/export: sectors, waypoints, subjects, and SAR
  markers can now be shared with CalTopo, SARTopo, Garmin units, and
  ATAK, or imported from those tools into this app.
- Printable briefing sheets: a one-page assignment sheet per sector
  (area, assigned team, boundary points, blank notes lines), or a full
  operation summary sheet (subjects, sectors, roster, reference
  points). Uses the native print dialog, no extra dependencies.
- Offline map tile caching: every tile viewed is cached to disk
  automatically (SQLite-backed) so the app keeps working with no
  signal. An explicit "Download this area" action in the new OFFLINE
  tab pre-fetches a bounding box across a zoom range for deliberate
  pre-staging before a deployment.
- Two-way APRS-IS messaging: connects to APRS-IS (not aprs.fi, which is
  read-only) using your callsign, in the new MSG tab. Send and receive
  real APRS text messages, with automatic ack handling. Optional,
  requires the aprslib package.
- New OPS tab for managing operation profiles.
- Roster members with a callsign are now tracked live on the map, same
  as Subjects: position, last-update age, a square marker color-coded
  by status (staged/deployed/returned), manual or 60s auto-refresh.
  Tracked roster positions are included in GPX/KML exports.
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.3.0-1
- Weather radar: added tile load/error diagnostics (toast notifications)
  so a real failure surfaces instead of an unexplained blank overlay;
  clarified that a clear/transparent radar with no errors means no
  precipitation nearby, not a bug
- Incident log is now permanently saved to disk (localStorage) and
  survives app restarts; the LOG tab is now a real history view grouped
  by date (Today / Yesterday / earlier), with a Clear button (confirms
  before deleting) alongside Export
- Added left/right scroll arrow buttons flanking the sidebar tab strip
  for quick navigation across the now 11 tabs
- Added ABOUT tab showing the installed version number (read live from
  the RPM database), developer info, links to the GitHub repo/releases/
  issue tracker, and a list of data sources
- New SAR OPS tab: search operation elapsed-time timer (start/stop,
  auto-logged); typed SAR planning markers (LKP, PLS, IPP, and
  multi-instance Clue markers) distinct from generic waypoints; a
  sweep-width-based search effort time estimator for sector coverage
  planning
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
