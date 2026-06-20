# APRS Tracker — Fedora Desktop App

Native GTK4 + WebKitGTK desktop application. W7CTY / 914 Communications.

---

## Quick test (no install, no RPM)

If you just want to try it immediately:

```bash
sudo dnf install python3-gobject gtk4 libadwaita webkitgtk6.0
cd src/
python3 aprs_tracker_app.py
```

This runs directly from source — useful for testing before building the RPM.

---

## Full install via RPM (recommended)

```bash
cd rpm/
bash build.sh
```

This will:
1. Install `rpm-build` and GTK4/WebKit dependencies if missing (asks for sudo)
2. Stage all files into the proper RPM source layout
3. Build the RPM
4. Print the install command

Then:

```bash
sudo dnf install ~/rpmbuild/RPMS/noarch/aprs-tracker-1.0.0-1.fc*.noarch.rpm
```

After install, **APRS Tracker** appears in your application launcher (GNOME Activities / KDE menu) with its own icon, or run from terminal:

```bash
aprs-tracker
```

---

## What's different from the browser version

- **Native window** — proper title bar, fullscreen (F11), reload (F5)
- **No Flask server needed** — talks directly to aprs.fi and OpenStreetMap
- **Geolocation auto-granted** — WebKitGTK permission prompt is handled
  automatically in the app wrapper, so the "Me" button works without a
  browser permission popup
- **External links open in your system browser** — e.g. "Open on aprs.fi"
  launches via `xdg-open`/`Gio.AppInfo`, since the app has no concept of
  tabs/new windows
- **Self-contained** — the HTML/JS/Leaflet bundle is installed to
  `/usr/share/aprs-tracker/`, no internet needed except for live map tiles,
  APRS data, and weather/radar

---

## Full SAR Toolkit Feature Set (v2.4)

**Map**
- Live APRS stations with color-coded markers (mobile/fixed/WX/digi/mesh)
- Multi-subject markers — distinct colored pin per tracked subject
- Roster members with a callsign tracked the same way, square markers
  color-coded by status
- Search sector polygons, color-coded by status
- Waypoint markers, numbered, plus typed LKP/PLS/IPP/Clue markers
- Live weather radar overlay (toggle on/off)
- Cursor coordinate readout
- Base map tiles cache to disk automatically as you browse — the app
  keeps working with no signal in whatever area you've already viewed

**OPS (Operations)** — Run separate searches without their data mixing
together. Create a new named operation, switch between active ones,
rename, archive (hide without deleting), or permanently delete. Every
tab's data — subjects, sectors, roster, log, markers — is scoped to
whichever operation is currently active.

**STNS** — Live APRS station list, sorted by most recently heard. Look up
one exact callsign at a time with Track (aprs.fi's API only supports
specific callsign lookups, not area or wildcard search).

**SUBJ (Subjects)** — Add multiple search subjects independently of APRS.
Each gets a name, optional APRS callsign for auto-tracking, a unique map
color, and a status (Active / Lost / Found / Standby). Refresh positions
individually or all at once.

**SEARCH** — Draw search sectors directly on the map (tap points, Finish).
Each sector shows estimated area in mi², cycles through
Unsearched → In Progress → Cleared by tapping its status badge, can be
assigned to a roster member, and has a one-tap **Briefing** button that
generates a printable assignment sheet (area, assigned team, boundary
coordinates, blank lines for field notes).

**SAR OPS** — Dedicated search-operation tools:
- Elapsed-time timer for the active search (start/stop, auto-logged)
- Typed planning markers: LKP (Last Known Point), PLS (Point Last Seen),
  IPP (Initial Planning Point) — each a singleton, re-placing moves it —
  plus multi-instance Clue/evidence markers
- A sweep-width-based search effort estimator: enter sector area, sweep
  width, team speed, and number of teams to get an estimated coverage
  time for a sector (a planning aid, not a substitute for a qualified
  search planner)
- Print a full operation summary sheet (subjects, sectors, roster,
  reference points all in one document)

**TOOLS**
- Coordinate converter: paste decimal degrees or DMS, get DD / DMS / DDM / UTM
- Distance & bearing calculator between any two points, with one-tap line
  drawing on the map
- Waypoint drop mode — tap the map to place numbered markers
- GPX/KML import and export — share sectors, waypoints, subjects, and SAR
  markers with CalTopo, SARTopo, Garmin units, or ATAK, or pull their data
  into this app

**WX (Weather)** — Current conditions (temp, wind, gusts, humidity,
visibility, pressure, precipitation) and 5-day forecast for the map center,
via Open-Meteo (no API key required). Toggle a live precipitation radar
overlay (RainViewer, updates every 5 minutes). A clear/transparent radar
with no error means there's genuinely no precipitation nearby, not a bug.

**OFFLINE** — Map tiles cache to disk automatically as you use the app
(passive). For deliberate pre-staging before heading into a dead zone,
download the entire current map view across a zoom range explicitly.
Shows cache size and tile count, with a one-tap clear option.

**MESH (Mesh Networks)** — Connect to Meshtastic and/or MeshCore mesh
networks and merge node positions onto the same map as APRS traffic.

- **Meshtastic**: connects over MQTT to either the public broker
  (`mqtt.meshtastic.org`) or a private/team broker. Public broker positions
  are intentionally low-precision (a built-in privacy feature of the
  network); use a private broker and channel for full-precision tracking.
  Packets are decoded and AES-CTR decrypted automatically.
- **MeshCore**: connects to a physical companion radio attached to this
  computer over USB/Serial, Bluetooth, or Wi-Fi/TCP. Unlike Meshtastic,
  MeshCore has no public internet broker — it's local-radio-first by
  design, so this requires actual MeshCore hardware plugged into or
  paired with the machine running the app.

Mesh nodes show up on the map as pink markers and carry a `MESH` badge in
the station list, mixed in with APRS stations. This is an **optional**
feature — the app works fully for APRS-only use without it. Mesh support
needs extra Python packages not available in Fedora's repos, so
they're installed via pip (the RPM attempts this automatically on
install; see Setup below if it didn't take):

```bash
pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography aprslib
```

**MSG (APRS Messaging)** — Two-way APRS text messaging over APRS-IS.
aprs.fi's API is read-only (position lookup only); this connects directly
to APRS-IS using your own callsign, the same network real APRS
radios/clients use to send messages. Send and receive messages with
automatic ack handling. **Optional** — requires the `aprslib` package
and a valid amateur radio callsign; receive-only mode works without a
passcode, sending requires one (derived automatically from your callsign,
not a secret you need to look up).

**ROSTER** — Check in personnel with name, callsign, and role. Track status
(Staged / Deployed / Returned) and assign each member to a search sector.
Members with a callsign are tracked live on the map exactly like Subjects
— position, last-update age, manual refresh or 60-second auto-tracking —
so the roster and the map stay in sync instead of being two disconnected
views of who's where.

**LOG** — Timestamped incident log, saved permanently to disk (survives
app restarts). Key events (subject added, sector status changes, roster
check-ins, SAR marker placements) are logged automatically; add manual
entries for anything else. The view groups entries by date (Today /
Yesterday / earlier) as a real history, not just a session log. Export
the full log to a `.txt` file, or clear it (with a confirmation prompt)
when starting a new operation.
  search planner)

**ABOUT** — Shows the installed version number (read live from the RPM
database), developer/contact info, links to the GitHub repo, releases,
and issue tracker, and a list of the external data sources the app uses.

**TRAIL / INFO** — Position history for the currently tracked APRS callsign,
and an in-app reference for all controls.

---

## Tab Navigation

With 11 tabs in the sidebar, the strip scrolls horizontally. Left/right
arrow buttons flank the tab bar for quick navigation without needing to
swipe/scroll — useful on a touchscreen or when working quickly in the
field. Switching to a tab also auto-scrolls it into view.

---

## Auto-Updates

The app checks `github.com/W7CTY/aprs-tracker` for new releases a few
seconds after launch. If a newer version is found, an **Update** button
lights up (orange) in the header bar. Clicking it shows what's new and
offers to install — it downloads the RPM, then runs
`pkexec dnf install -y <rpm>`, which pops a native graphical
authentication prompt (no terminal needed). Once it finishes, close and
reopen the app to pick up the new version.

If no update is found, or the check fails (no internet, GitHub rate
limit, etc.), the app stays silent — it never nags or interrupts.

### Publishing a new release (for the developer)

After bumping the version in `rpm/aprs-tracker.spec` and `rpm/build.sh`,
and adding a changelog entry:

```bash
cd rpm/
bash build.sh                    # builds the RPM
bash publish-release.sh          # tags + creates a GitHub release + uploads the RPM
```

`publish-release.sh` reads the version from the spec file, finds the
just-built RPM in `~/rpmbuild/RPMS/`, creates a GitHub release tagged
`vX.Y.Z` with that version's changelog entry as the release notes, and
uploads the RPM as a release asset. It'll prompt for a GitHub Personal
Access Token (repo scope) if `GITHUB_TOKEN` isn't set in the environment.

Once published, every installed copy of the app will detect the new
version on its next launch.

---

## File layout

```
aprs-desktop/
├── src/
│   ├── aprs_tracker_app.py     ← GTK4/WebKit Python wrapper
│   ├── mesh_backend.py         ← Meshtastic MQTT + MeshCore backend (optional)
│   ├── tile_cache.py           ← Offline map tile cache (SQLite-backed)
│   ├── aprs_messaging.py       ← APRS-IS two-way messaging backend (optional)
│   ├── update_checker.py       ← GitHub Releases auto-update checker
│   ├── VERSION                 ← fallback version string for dev/source runs
│   ├── aprs-tracker.html       ← Self-contained map app (Leaflet inlined)
│   ├── sar-core.js             ← SAR toolkit JS source (inlined into the HTML at build time)
│   └── sar-styles.css          ← SAR toolkit CSS source (inlined into the HTML at build time)
├── data/
│   ├── aprs-tracker.desktop    ← App launcher entry
│   ├── aprs-tracker-launcher.sh
│   └── icons/
│       ├── aprs-tracker.svg
│       └── aprs-tracker-{16,22,24,32,48,64,128,256,512}.png
└── rpm/
    ├── aprs-tracker.spec       ← RPM spec
    ├── build.sh                ← One-command build script
    ├── cleanup.sh              ← Removes all previous installs/builds before a fresh one
    └── publish-release.sh      ← Tags + publishes a GitHub release with the RPM attached
```

**Note:** `sar-core.js` and `sar-styles.css` are reference copies of code
that's already inlined directly into `aprs-tracker.html`. If you edit the
SAR toolkit JS/CSS, edit it inside `aprs-tracker.html` directly (or edit
the source files and re-inline them) — the build script only packages
`aprs-tracker.html`, not the separate `.js`/`.css` files.

---

## Updating the app later

If you want to change the map/UI (edit `src/aprs-tracker.html`) or the
window behavior (edit `src/aprs_tracker_app.py`), just re-run:

```bash
cd rpm/
bash build.sh
sudo dnf reinstall ~/rpmbuild/RPMS/noarch/aprs-tracker-1.0.0-1.fc*.noarch.rpm
```

---

W7CTY · 914 Communications · 2531 Harts Mill Rd, Mineral VA 23117
