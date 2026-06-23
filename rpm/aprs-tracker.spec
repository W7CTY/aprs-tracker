Name:           aprs-tracker
Version:        4.0.6
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
APRSaR Tracker is a native desktop SAR (Search & Rescue) toolkit and live
APRS position tracking application, built for ham radio operators and
SAR teams.

Features:
 - Live APRS station data via aprs.fi
 - Multi-subject tracking with color-coded map markers and status
 - Search sector drawing, area calculation, and status tracking
   (unsearched / in progress / cleared)
 - Waypoint placement, distance/bearing calculator, coordinate converter
   (Decimal, DMS, DDM, UTM), two-point path intersection, and pacing
   reference tables
 - Personnel/team roster with check-in, deployment status, sector
   assignment, and live position tracking for members with a callsign
 - Digital T-Cards: printable per-member QR codes for rapid command-post
   check-in via camera scan, toggling deployed/returned status
 - Permanently saved, dated incident log/history with export
 - Live weather conditions and 5-day forecast (via Open-Meteo)
 - Four map layers: Street, Topo (Esri World Topo Map), Satellite, and National
   Geographic (Esri) -- switchable from the map layers button
 - Mesh network integration: Meshtastic (public or private MQTT broker)
   and MeshCore (USB/Serial, BLE, or Wi-Fi companion radio) node
   positions merged onto the same map, optional feature
 - Two-way APRS-IS text messaging (optional, requires a callsign)
 - Emergency alert tab: loud local alarm + desktop notification, plus
   one-tap APRS-IS paging to every roster member with a callsign
 - Multiple named, switchable Operation profiles so separate searches
   don't mix data, with archive/delete management
 - GPX and KML import/export for interop with CalTopo, SARTopo, Garmin
   units, and ATAK
 - Printable sector briefing sheets, full operation summary sheets, and
   personnel T-Cards
 - Offline map tile caching: automatic as you browse, plus an explicit
   "download this area" option to pre-stage before losing signal
 - SAR planning tools: LKP/PLS/IPP/Clue markers, search operation timer,
   sweep-width search effort estimator, and a full AMDR/effective-sweep-
   width/probability-of-detection calculator suite with bidirectional
   effort planning (solve for hours needed or searchers needed)
 - Rope rescue calculators: two-point anchor force, redirection/
   deviation force, and a slope-angle force table
 - Marine calculators: TVMDC course conversion and DST60 (distance/
   speed/time)
 - Personal/group kit lists with storage location, pack location, value,
   quantities, pack-lock, and check-in/check-out tracking
 - Bundled offline field references: trauma assessment (ABCDE/MARCH),
   hypothermia staging and treatment, rope rescue quick reference, and
   ground-to-air signals -- no network needed
 - In-app update checking with one-click install (no terminal needed)
   and optional automatic restart into the new version
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
  pip3 install \
    'paho-mqtt>=1.6' 'meshtastic>=2.3' 'meshcore>=0.1' \
    'cryptography>=3.4' 'aprslib>=0.7' \
    >> /var/log/aprs-tracker-install.log 2>&1 || \
  echo "aprs-tracker: optional packages could not be installed automatically." \
       "Run: pip3 install paho-mqtt meshtastic meshcore cryptography aprslib" >&2
fi

%postun
/usr/bin/gtk-update-icon-cache -q -t -f %{_datadir}/icons/hicolor &>/dev/null || :
/usr/bin/update-desktop-database -q %{_datadir}/applications &>/dev/null || :

%changelog
* Sun Jun 21 2026 W7CTY <w7cty@914communications.com> - 3.0.1-1
- Fixed the Topo map layer not loading correctly: OpenTopoMap's tile
  server has a documented history of returning bad/blank tiles at
  native zoom 16-17 (confirmed by multiple independent reports, not
  unique to this app). Replaced it with Esri's World Topo Map -- the
  same reliable CDN-backed infrastructure already used for the
  Satellite and Nat Geo layers in this app, with no known zoom-range
  quality issues. Tile URL ordering verified against a real downloaded
  tile before shipping.
- Removed CalTopo Team Sync entirely per request: the CALTOPO tab,
  caltopo_sync.py backend, its RPM packaging entries, and all
  documentation. GPX/KML export/import (which can still be used to
  move data into/out of CalTopo manually) is unaffected and unchanged.
- build.sh now offers to install the just-built RPM immediately
  (sudo dnf install) instead of only printing the command, and on a
  confirmed-successful install deletes the source aprs-desktop.zip you
  extracted the project from (checked in both the directory next to
  the extracted project and ~/Downloads). The zip is left in place if
  install is skipped or fails. Hardened the install prompt against a
  closed/non-interactive stdin, where a naive `read` would otherwise
  kill the whole script under `set -e` immediately after a successful
  build and before printing the manual install fallback instructions.
* Sun Jun 21 2026 W7CTY <w7cty@914communications.com> - 3.0.0-1
- Major feature release covering gaps identified against established SAR
  app feature sets (volunteerrescue.org's mobile app feature list and a
  prior SAR-app planning pass):
- CalTopo Team sync (new CALTOPO tab + caltopo_sync.py backend): push
  sectors (as Shapes) and waypoints/SAR markers/clues (as Markers) to a
  CalTopo Team map, or pull CalTopo map objects in as importable
  waypoints/sectors. Implements CalTopo's documented Team API exactly
  (HMAC-SHA256 signed requests) -- requires a CalTopo Team account with
  an admin-created Service Account, not a personal CalTopo login.
- Digital T-Cards (new TCARDS tab): generates a printable card per
  roster member with a scannable QR code; a camera-based scanner toggles
  that member between Deployed/Returned for rapid command-post check-in.
  Camera permission handling added to the app wrapper, explicitly
  restricted to video only (denies any future audio request) even
  though the app's own JS never requests audio.
- NAV tab: two-point path intersection (given two points and a bearing
  from each, find where the paths cross) using the standard spherical
  great-circle intersection formula, plus a pacing calculator (store
  paces-per-100m profiles for different terrain, get a 5m-100m
  quick-reference table).
- SEARCH MATH tab: AMDR-to-effective-sweep-width conversion (using
  published correction factors for high/medium/low visibility objects),
  a full coverage/POD/probability-of-success calculator, and
  bidirectional effort planning (given a target POD, solve for hours
  needed or searchers needed). Uses the standard random-search
  (exponential) detection model, clearly labeled as a planning aid.
- ROPE tab: two-point anchor force calculator, redirection/deviation
  force calculator, and a slope-angle force table -- all verified
  against published rope-rescue rigging benchmarks before shipping.
- MARINE tab: TVMDC (True-Variation-Magnetic-Deviation-Compass) course
  conversion in both directions, and DST60 (solve for any of Distance/
  Speed/Time given the other two).
- KIT tab: personal/group gear checklists (description, storage
  location, pack location, value, quantities, notes), tap-to-pack
  tracking, and a lock/unlock state to prevent accidental changes once
  packed. Persists independently of the active Operation, since kit
  lists are about a person's own gear, not any one search.
- REFS tab: bundled offline field references covering trauma assessment
  (ABCDE and MARCH), hypothermia field staging and treatment, a rope
  rescue quick reference, and ground-to-air signals. Conservative,
  widely-taught frameworks only, clearly labeled as reminders rather
  than a substitute for training.
- ALERT tab: loud local alarm (synthesized tone, no external audio
  file) plus a native desktop notification on this machine, and one-tap
  APRS-IS paging to every roster member with a callsign. Real iOS
  Critical Alerts are not implemented -- they require a native iOS app
  and an Apple entitlement granted case-by-case (often denied); this is
  documented in-app rather than silently omitted. Meshtastic paging is
  also not implemented, since the mesh backend is receive-only (tracks
  positions, never sends) -- flagged in-app as a known gap.
- Sidebar tab dropdown reorganized into Live / SAR Toolkit /
  Calculators / Comms & Data / App groups to accommodate the new tabs.
- Inlined QRCode.js (generation) and jsQR (camera-based decoding) so
  the app remains fully self-contained with no CDN dependency.
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.6.0-1
- SECURITY: fixed multiple stored XSS vulnerabilities where APRS station
  names/comments, mesh node names, subject/sector/roster names, incoming
  APRS-IS message text, and imported GPX/KML waypoint labels were
  concatenated unescaped into innerHTML. The most severe instance (the
  STNS tab's station list) also embedded an unescaped JSON payload
  inside a single-quoted onclick HTML attribute, allowing a malicious
  APRS station name to break out of the attribute and inject arbitrary
  script -- reachable just by viewing the default tab with that station
  in range, no interaction required beyond the app receiving the
  packet. A second copy of the same bug existed independently in the
  station detail panel and in SAR-mode's dedicated tab. All affected
  call sites (bindTooltip calls, innerHTML station/subject/sector/
  roster/message rendering, the aprs.fi link, GPX/KML imported labels)
  now go through a proper HTML-escaping function. The aprs.fi outbound
  link now also percent-encodes the callsign via encodeURIComponent
  instead of raw string concatenation into the href attribute.
- SECURITY: fixed APRS-IS packet injection -- outgoing message text and
  the connecting callsign were not stripped of embedded CR/LF before
  being formatted into raw APRS-IS protocol lines, which could let a
  crafted message or callsign smuggle a second, attacker-controlled
  packet onto the network under the authenticated session. Also fixed
  the message-number suffix format itself ({nnnnn} with a trailing
  brace, which does not match the APRS spec's {nnnnn with no closing
  brace) -- likely the actual cause of messages failing to deliver/ack.
- SECURITY: the in-app updater now verifies a downloaded RPM is
  structurally valid (correct magic number, parses with `rpm -qp`)
  before ever handing it to pkexec for installation, and rejects HTML
  responses served in place of the expected binary asset. This does
  not add cryptographic/GPG signature verification -- authenticity
  still relies on HTTPS transport security and the integrity of the
  GitHub release pipeline.
- Fixed a resource leak: disconnecting from both Meshtastic and
  MeshCore never stopped the 5-second status poll, which then ran
  forever for the rest of the session.
- Fixed the offline tile download job hanging indefinitely with no
  error shown if the background download thread hit an unexpected
  exception; it now reports an 'error' status and the UI surfaces it.
- Renamed "W7CTY" to "Robert W Donze - W7CTY" throughout user-visible
  attribution (header, About tab, printed sheets, GPX export, exported
  log header); actual APRS callsign fields/placeholders are unchanged.
- Added a native header-bar dropdown menu (Reload, Toggle Fullscreen,
  Check for Updates, Help/Instructions, About) replacing the previous
  loose icon buttons, plus a quick-reference Help dialog.
- Rewrote the INFO tab into a comprehensive help section covering every
  tab in the app, for first-time users; the previous version covered
  only the top search bar.
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.5.2-1
- Fixed outgoing APRS messages using a malformed message-number suffix
  ({nnnnn} with a trailing closing brace) that does not match the APRS
  spec (which is {nnnnn with no closing brace at all). Verified against
  aprslib's own packet parser: the old format caused the message number
  to be swallowed into the message text instead of being recognized,
  which is consistent with messages failing to deliver/ack properly.
  Incoming message parsing was already correct and is unaffected.
- The in-app updater now offers to restart the app automatically after
  a successful install, instead of just telling you to close and reopen
  it yourself. Launches a fully detached new instance of the just-
  installed version, then quits the current one. Declining ("Later")
  leaves the running copy untouched.
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.5.1-1
- Fixed a major bug in the MSG tab: the 4-second status poll fully
  rebuilt the entire tab's HTML on every tick, including the To and
  Message input fields, wiping out anything being typed almost as soon
  as it was entered. The poll now updates only the message list, badge,
  and error display; the input fields are never touched while typing.
- Fixed the same underlying bug in the MESH tab (5-second poll), which
  could similarly wipe broker host/port/username/password/topic/BLE
  address fields while editing them.
- Nat Geo (Esri National Geographic style) is now the default map layer
  on launch, instead of Street.
* Sat Jun 20 2026 W7CTY <w7cty@914communications.com> - 2.5.0-1
- Fixed the map sometimes loading completely blank: the base layer was
  routed exclusively through the local tile_cache proxy with no
  fallback, so any problem with that local server (not running, port
  conflict, etc.) meant zero tiles could ever load. Base map tiles now
  load directly from their providers; the tile cache backend is still
  used for the explicit offline-download feature in the OFFLINE tab,
  but is no longer a single point of failure for seeing a map at all.
- Added a map layers picker (top-left, globe icon): Street (CartoCDN,
  follows light/dark theme), Topo (Esri World Topo Map), Satellite (Esri World
  Imagery), and Nat Geo (Esri National Geographic style). All four are
  free, no API key, no referer requirement.
- Removed the weather radar overlay entirely (RainViewer integration,
  the Radar Overlay button in the WX tab, and the dedicated radar map
  pane). Current conditions and the 5-day forecast are unaffected.
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
