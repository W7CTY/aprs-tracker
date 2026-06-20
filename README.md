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

## Full SAR Toolkit Feature Set (v2.0)

**Map**
- Live APRS stations with color-coded markers (mobile/fixed/WX/digi)
- Multi-subject markers — distinct colored pin per tracked subject
- Search sector polygons, color-coded by status
- Waypoint markers, numbered
- Live weather radar overlay (toggle on/off)
- Cursor coordinate readout

**STNS** — Live APRS station list, sorted by most recently heard. Wildcard
callsign search (`KD4*`, `*-9`, `W7C?Y`) searches a 300km radius around the
map center.

**SUBJ (Subjects)** — Add multiple search subjects independently of APRS.
Each gets a name, optional APRS callsign for auto-tracking, a unique map
color, and a status (Active / Lost / Found / Standby). Refresh positions
individually or all at once.

**SEARCH** — Draw search sectors directly on the map (tap points, Finish).
Each sector shows estimated area in mi², cycles through
Unsearched → In Progress → Cleared by tapping its status badge, and can be
assigned to a roster member.

**TOOLS**
- Coordinate converter: paste decimal degrees or DMS, get DD / DMS / DDM / UTM
- Distance & bearing calculator between any two points, with one-tap line
  drawing on the map
- Waypoint drop mode — tap the map to place numbered markers

**WX (Weather)** — Current conditions (temp, wind, gusts, humidity,
visibility, pressure, precipitation) and 5-day forecast for the map center,
via Open-Meteo (no API key required). Toggle a live precipitation radar
overlay (RainViewer, updates every 5 minutes).

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
needs three extra Python packages not available in Fedora's repos, so
they're installed via pip (the RPM attempts this automatically on
install; see Setup below if it didn't take):

```bash
pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography
```

**ROSTER** — Check in personnel with name, callsign, and role. Track status
(Staged / Deployed / Returned) and assign each member to a search sector.

**LOG** — Timestamped incident log. Key events (subject added, sector
status changes, roster check-ins) are logged automatically; add manual
entries for anything else. Export the full log to a `.txt` file at any time.

**TRAIL / INFO** — Position history for the currently tracked APRS callsign,
and an in-app reference for all controls.

---

## File layout

```
aprs-desktop/
├── src/
│   ├── aprs_tracker_app.py     ← GTK4/WebKit Python wrapper
│   ├── mesh_backend.py         ← Meshtastic MQTT + MeshCore backend (optional)
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
    └── build.sh                ← One-command build script
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
