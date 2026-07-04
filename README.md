# APRSaR Tracker

Native desktop SAR & APRS toolkit for ham radio operators and Search & Rescue teams.  
**W7CTY / 914 Communications**

**Current version: 6.1.1**

---

## What It Does

APRSaR Tracker is a full-featured GTK4 desktop application combining live APRS position tracking with a complete SAR operations toolkit, weather, mesh networking, and two-way APRS messaging — all in one self-contained app with no browser or server required.

---

## Installation

### Fedora Linux

Download `aprs-desktop-6.1.1.zip` from the [Releases](https://github.com/W7CTY/aprs-tracker/releases) page, then:

```bash
cd ~/Downloads && unzip -o aprs-desktop-6.1.1.zip && cd aprs-desktop/rpm && bash build.sh
```

The script installs dependencies, builds the RPM, and prompts to install. Previous versions (including any beta) are automatically removed before installing.

After install, launch from your app menu or run:

```bash
aprs-tracker
```

### Run from source (no install)

```bash
sudo dnf install python3-gobject gtk4 libadwaita webkitgtk6.0
cd src/
python3 aprs_tracker_app.py
```

### Optional: Mesh networking & APRS-IS messaging

```bash
pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography aprslib
```

---

## Windows

Download `APRSaR-Tracker-6.1.1.zip` from the [Releases](https://github.com/W7CTY/aprs-tracker-electron/releases) page, extract, and run `Install.bat`. No admin rights required.

Windows repo: [W7CTY/aprs-tracker-electron](https://github.com/W7CTY/aprs-tracker-electron)

---

## Features

### Map
- NatGeo default base layer; switchable to Dark, Street, Topo, Satellite
- Fullscreen map toggle — hides sidebar, expands to full window
- Live APRS stations with color-coded markers
- Search sector polygons color-coded by status
- Waypoint, LKP/PLS/IPP/Clue markers
- NWS alert polygons on map, color-coded by severity
- Offline tile caching (Street layer)

### APRS
- Live station tracking via aprs.fi
- Single callsign lookup and continuous tracking
- Mobile, fixed, weather, digi, and mesh node markers

### Weather
- Current conditions from Open-Meteo (no API key)
- 7-day forecast accordion — tap each day for Overnight/Morning/Afternoon/Evening breakdown
- Official NWS text forecasts (day/night narrative) inside each forecast day
- Wind rose showing speed, direction, and gusts
- NWS alert zones overlay on map
- Active NWS alerts with severity, expiry, and headline

### SAR Operations
- Multi-subject tracking with APRS callsign integration
- Search sector drawing, area calculation, status tracking
- Roster with live map tracking per member
- SAR planning markers and elapsed-time timer
- Digital T-Cards with QR scanner for rapid check-in
- Search effort estimator and probability-of-detection calculator
- GPX/KML import/export (CalTopo, SARTopo, Garmin, ATAK)
- Printable briefing sheets and operation summary

### Calculators
- Coordinate converter (DD, DMS, DDM, UTM)
- Distance & bearing calculator
- Two-point path intersection
- Rope rescue: anchor force, redirection force, slope angle table
- Marine: TVMDC course conversion, DST60
- Pacing reference tables

### Comms & Data
- Two-way APRS-IS messaging (requires callsign + aprslib)
- Meshtastic MQTT mesh node tracking
- MeshCore companion radio node tracking
- Multiple named operation profiles

### App
- Light/dark theme
- In-app auto-update checker with one-click install
- Permanently saved incident log with export
- Offline field references: trauma, hypothermia, rope rescue, ground-to-air signals

---

## Menu

Map · APRS · Weather · Messages · Mesh · Subjects · Search · SAR Ops · Roster · Operations · Tools · Offline · Log · About · Help

---

## Auto-Updates

The app checks for new releases on launch. When an update is available, an orange **Update** button appears in the header bar. Click it to download and install via a graphical auth prompt — no terminal needed.

---

## File Layout

```
aprs-desktop/
├── src/
│   ├── aprs_tracker_app.py     GTK4/WebKit Python wrapper
│   ├── aprs-tracker.html       Self-contained app (Leaflet inlined)
│   ├── sar-core.js             SAR toolkit JS source
│   ├── tile_cache.py           Offline map tile cache
│   ├── mesh_backend.py         Meshtastic + MeshCore backend
│   ├── aprs_messaging.py       APRS-IS messaging backend
│   ├── update_checker.py       GitHub release auto-updater
│   └── VERSION
├── data/
│   ├── aprs-tracker.desktop
│   ├── aprs-tracker-launcher.sh
│   └── icons/
└── rpm/
    ├── aprs-tracker.spec
    └── build.sh
```

---

W7CTY · 914 Communications · Indianapolis, IN
