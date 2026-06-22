# APRS Tracker — Fedora Desktop App

Native GTK4 + WebKitGTK desktop application for ham radio operators and
SAR (Search & Rescue) teams. W7CTY / 914 Communications.

---

## Installation

**Requires Fedora Linux** (or another `dnf`-based distro) with internet
access for the initial dependency install and live map/APRS data.

### 1. Get the source

```bash
git clone https://github.com/W7CTY/aprs-tracker.git
cd aprs-tracker
```

(Don't have `git`? `sudo dnf install git` first, or use GitHub's
"Download ZIP" button under the green **Code** button on the repo page
and extract it instead.)

### 2. Build and install the RPM (recommended)

```bash
cd rpm/
bash build.sh
```

This will:
1. Install `rpm-build` and GTK4/WebKit dependencies if missing (asks for sudo)
2. Stage all files into the proper RPM source layout
3. Build the RPM
4. Ask whether to install it right away (`sudo dnf install`, default
   Yes) — accept to install immediately, or decline and run the
   printed command yourself later. On a successful install, the source
   `aprs-desktop.zip` you extracted is deleted automatically since it's
   no longer needed; declining or a failed install leaves it in place.

If you skip the prompt, the install command looks like:

```bash
sudo dnf install ~/rpmbuild/RPMS/noarch/aprs-tracker-<version>-1.fc*.noarch.rpm
```

After install, **APRS Tracker** appears in your application launcher
(GNOME Activities / KDE menu) with its own icon, or run from terminal:

```bash
aprs-tracker
```

**Reinstalling or upgrading from an old copy?** Run `bash rpm/cleanup.sh`
first — it removes any previously installed version, old build
artifacts, and stale extracted copies of the project, so you're always
building from a clean slate.

### 3. Optional: mesh networking and APRS-IS messaging

The MESH and MSG tabs need a few Python packages that aren't in Fedora's
official repos, so they're not hard RPM dependencies. The installer
attempts this automatically; if it didn't take (e.g. no internet during
install), run it yourself:

```bash
pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography aprslib
```

The app works fully for APRS tracking and SAR tools without these — only
the MESH and MSG tabs need them.

### Quick test without building an RPM

To try the app immediately without installing anything system-wide:

```bash
sudo dnf install python3-gobject gtk4 libadwaita webkitgtk6.0
cd src/
python3 aprs_tracker_app.py
```

This runs directly from source — useful for testing before building the
RPM, or for development.

---

## What's different from the browser version

- **Native window** — proper title bar, fullscreen (F11), reload (F5)
- **No Flask server needed** — talks directly to aprs.fi and OpenStreetMap
- **Geolocation and camera auto-granted** — WebKitGTK permission prompts
  are handled automatically in the app wrapper, so the "Me" button and
  the T-Cards QR scanner work without a browser permission popup (camera
  access is explicitly limited to video only, never audio)
- **External links open in your system browser** — e.g. "Open on aprs.fi"
  launches via `xdg-open`/`Gio.AppInfo`, since the app has no concept of
  tabs/new windows
- **Self-contained** — the HTML/JS/Leaflet bundle is installed to
  `/usr/share/aprs-tracker/`, no internet needed except for live map tiles
  and APRS data

---

## Full SAR Toolkit Feature Set (v3.0)

**Map**
- Four switchable base layers (top-left globe icon), Nat Geo by default:
  Street (CartoCDN, follows light/dark theme), Topo (Esri World Topo Map),
  Satellite (Esri World Imagery), and National Geographic style (Esri)
- Live APRS stations with color-coded markers (mobile/fixed/WX/digi/mesh)
- Multi-subject markers — distinct colored pin per tracked subject
- Roster members with a callsign tracked the same way, square markers
  color-coded by status
- Search sector polygons, color-coded by status
- Waypoint markers, numbered, plus typed LKP/PLS/IPP/Clue markers
- Cursor coordinate readout
- Street layer tiles can be pre-downloaded for offline use (see OFFLINE
  tab below)

**OPS (Operations)** — Run separate searches without their data mixing
together. Create a new named operation, switch between active ones,
rename, archive (hide without deleting), or permanently delete. Every
tab's data — subjects, sectors, roster, log, markers — is scoped to
whichever operation is currently active. (Kit Lists are the one
exception — see KIT below.)

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

**ROSTER** — Check in personnel with name, callsign, and role. Track status
(Staged / Deployed / Returned) and assign each member to a search sector.
Members with a callsign are tracked live on the map exactly like Subjects
— position, last-update age, manual refresh or 60-second auto-tracking —
so the roster and the map stay in sync instead of being two disconnected
views of who's where.

**TCARDS (Digital T-Cards)** — Generates a printable card per roster
member with name, callsign, role, and a scannable QR code. The same tab
has a camera-based scanner: point the device's camera at a printed card
to toggle that person between Deployed and Returned, for rapid sign-in
and sign-out at the command post. Print one card at a time or all of them
at once.

**LOG** — Timestamped incident log, saved permanently to disk (survives
app restarts). Key events (subject added, sector status changes, roster
check-ins, SAR marker placements) are logged automatically; add manual
entries for anything else. The view groups entries by date (Today /
Yesterday / earlier) as a real history, not just a session log. Export
the full log to a `.txt` file, or clear it (with a confirmation prompt)
when starting a new operation.

**TOOLS**
- Coordinate converter: paste decimal degrees or DMS, get DD / DMS / DDM / UTM
- Distance & bearing calculator between any two points, with one-tap line
  drawing on the map
- Waypoint drop mode — tap the map to place numbered markers
- GPX/KML import and export — share sectors, waypoints, subjects, and SAR
  markers with CalTopo, SARTopo, Garmin units, or ATAK, or pull their data
  into this app

**NAV** — Two-point path intersection: given two known points and a
bearing from each, calculates where the paths cross and the distance
from each point to that crossing. Also a pacing reference tool: store
your paces-per-100m for different terrain (open field, dense forest,
uphill, etc.), and get a quick-reference table from 5m to 100m for
whichever profile you select.

**SEARCH MATH** — A more rigorous companion to the SAR OPS sweep
estimator:
- AMDR → Effective Sweep Width: enter a measured detection range from an
  AMDR field test and the object's visibility class, get an estimated
  effective sweep width (using published correction factors from land-SAR
  detection research)
- Probability Calculator: coverage, Probability of Detection (POD), and
  Probability of Success (POD × POA) for a sector, given sweep width,
  searcher speed, number of searchers, hours searched, and area
- Effort Planning: given a target POD, solve for either the hours needed
  or the number of searchers needed

  Uses the standard random-search (exponential) detection model — a
  planning aid, not a substitute for a qualified search planner or your
  team's SOPs.

**ROPE** — Rope rescue rigging calculators:
- Two-point anchor force: force on each leg of a Y-hang anchor for a
  given included angle (reproduces the standard 0°→50%, 90°→71%,
  120°→100% critical angle, 150°→193% benchmarks)
- Redirection/deviation force: resultant force on a redirect anchor point
  given rope tension and deflection angle
- Slope angle force table: force on a line holding a load, by slope angle
  from horizontal

**MARINE** — TVMDC course conversion (Compass ↔ True, accounting for
variation and deviation) and DST60 (enter any two of Distance/Speed/Time,
solve for the third).

**KIT (Kit Lists)** — Personal or group gear checklists: description,
storage location (where it lives at home/base), pack location (which
pocket/pouch), replacement value, quantity owned, quantity needed, and
notes. Tap an item to mark it packed; lock the list to prevent accidental
changes once everything's loaded, then unlock to check items back in
afterward. Unlike most tabs, kit lists persist independently of the
active Operation — they're about a person's own gear, not any one search.

**REFS (Field References)** — Bundled, fully offline reference content:
trauma assessment (ABCDE primary assessment and the MARCH protocol for
severe trauma), hypothermia field staging and treatment, a rope rescue
quick reference (anchor angle benchmarks, common knots, edge/load-release
reminders), and ground-to-air signals. Quick-reference reminders only —
not a substitute for wilderness medicine, rope rescue, or SAR training.

**ALERT (Emergency Alert)** — A loud local alarm (synthesized tone, no
external audio file needed) plus a native desktop notification on this
machine, for waking up the operator. A second section sends the same
message as an APRS-IS page to every roster member with a callsign.
Real iOS Critical Alerts (which wake a muted phone) require a native iOS
app and a special Apple entitlement granted case-by-case — not buildable
into this desktop app. Meshtastic paging isn't implemented either, since
the mesh backend only tracks positions and has no send capability yet.

**WX (Weather)** — Current conditions (temp, wind, gusts, humidity,
visibility, pressure, precipitation) and 5-day forecast for the map center,
via Open-Meteo (no API key required).

**OFFLINE** — Pre-download Street layer map tiles for the current map
view across a zoom range, so they're available with no signal. Topo,
Satellite, and Nat Geo layers aren't included in offline caching — switch
to Street before downloading an area. Shows cache size and tile count,
with a one-tap clear option.

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

**ABOUT** — Shows the installed version number (read live from the RPM
database), developer/contact info, links to the GitHub repo, releases,
and issue tracker, and a list of the external data sources the app uses.

**TRAIL / INFO** — Position history for the currently tracked APRS callsign,
and an in-app reference for all controls.

---

## Tab Navigation

With 18+ tabs, the sidebar uses a dropdown menu instead of a scrolling
strip. Tap the current tab name (top of the sidebar) to open a list
grouped into Live, SAR Toolkit, Calculators, Comms & Data, and App;
tap any item to switch, or tap outside the dropdown to close it without
changing tabs.

---

## Auto-Updates

The app checks `github.com/W7CTY/aprs-tracker` for new releases a few
seconds after launch. If a newer version is found, an **Update** button
lights up (orange) in the header bar. Clicking it shows what's new and
offers to install — it downloads the RPM, then runs
`pkexec dnf install -y <rpm>`, which pops a native graphical
authentication prompt (no terminal needed). Once installed, it offers to
restart the app automatically (launches the new version, then closes the
current window) — choose "Later" to keep working in the current session
and restart manually whenever you're ready.

If no update is found, or the check fails (no internet, GitHub rate
limit, etc.), the app stays silent — it never nags or interrupts.

### Publishing a new release (for the developer)

After bumping the version in `rpm/aprs-tracker.spec` and `rpm/build.sh`,
and adding a changelog entry:

```bash
cd rpm/
bash build.sh                    # builds the RPM (will ask whether to install it locally too)
bash publish-release.sh          # tags + creates a GitHub release + uploads the RPM
```

`publish-release.sh` uses the [GitHub CLI](https://cli.github.com)
(`gh`) — it installs `gh` automatically if it's missing, and the first
time it runs, it'll walk through `gh auth login` (opens a browser, no
token to copy/paste). After that one-time login, `gh` remembers the
session itself (stored securely by `gh`, not by this script or this
repo) and every future run is fully non-interactive.

The script reads the version from the spec file, finds the just-built
RPM in `~/rpmbuild/RPMS/`, and creates (or updates) a GitHub release
tagged `vX.Y.Z` with that version's changelog entry as the release
notes, with the RPM attached as a release asset.

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
│   ├── aprs-tracker.html       ← Self-contained app (Leaflet, QRCode.js, jsQR inlined)
│   └── sar-core.js             ← SAR toolkit JS source (inlined into the HTML at build time)
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

**As an end user**, the easiest path is the in-app auto-updater described
above — it checks for new releases automatically and installs them with
one click.

**If you're modifying the source** (editing `src/aprs-tracker.html`,
`src/aprs_tracker_app.py`, etc.), rebuild and reinstall with:

```bash
cd rpm/
bash cleanup.sh   # removes the old install/build artifacts first
bash build.sh     # builds, then asks whether to install right away
```

If you decline the install prompt, run it manually:

```bash
sudo dnf install ~/rpmbuild/RPMS/noarch/aprs-tracker-<version>-1.fc*.noarch.rpm
```

Use `dnf install`, not `dnf reinstall` — `reinstall` only works when the
exact same version is already on the system, and will report "Nothing to
do" on a version bump.

---

W7CTY · 914 Communications · 2531 Harts Mill Rd, Mineral VA 23117
