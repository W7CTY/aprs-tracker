# APRSaR Tracker

Native desktop SAR & APRS toolkit for ham radio operators and Search & Rescue teams.  
**W7CTY / 914 Communications**

**Current version: 6.1.11**

---

## What It Does

APRSaR Tracker is a full-featured GTK4 desktop application combining live APRS position tracking with a complete SAR operations toolkit, weather, mesh networking, and two-way APRS messaging — all in one self-contained app with no browser or server required.

---

## Installation

### Fedora Linux

Download `aprs-desktop-6.1.11.zip` from the [Releases](https://github.com/W7CTY/aprs-tracker/releases) page, then:

```bash
cd ~/Downloads && unzip -o aprs-desktop-6.1.11.zip && cd aprs-desktop/rpm && bash build.sh <<< "Y"
```

**First time only — clear WebKit cache before launching:**
```bash
rm -rf ~/.cache/webkitgtk ~/.cache/aprs-tracker ~/.local/share/aprs-tracker
aprs-tracker
```

After the first launch with a clean cache, the launcher handles this automatically on every subsequent start.

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

Download `APRSaR-Tracker-6.1.11.zip` from the [Releases](https://github.com/W7CTY/aprs-tracker-electron/releases) page, extract, and run `Install.bat`.

Windows repo: [W7CTY/aprs-tracker-electron](https://github.com/W7CTY/aprs-tracker-electron)

---

## Menu

| Group | Items |
|-------|-------|
| Primary | APRS, Weather, Messages, Mesh |
| SAR Operations | Subjects, Search, SAR Ops, Roster, Operations |
| Tools & Data | Tools, Offline, Log |
| App | About, Help |

---

## Features

### Map
- NatGeo default base layer; switchable to Dark, Street, Topo, Satellite
- Fullscreen map toggle — hides sidebar, expands to full window
- Compact weather HUD in fullscreen (temp, feels-like, wind)
- Live APRS stations with color-coded markers
- NWS alert polygons on map, color-coded by severity
- Offline tile caching

### APRS
- Live station tracking via aprs.fi
- Single callsign lookup and continuous tracking
- Mobile, fixed, weather, digi, and mesh node markers

### Weather
- Current conditions from Open-Meteo
- Wind rose in current conditions (speed, direction, gusts)
- 7-day forecast accordion with NWS official text forecasts
- NWS push notifications for Extreme/Severe/Moderate alerts (background polling)
- NWS Alert Zones overlay on map
- Active NWS alerts with severity and expiry

### SAR Operations
- Multi-subject tracking with APRS callsign integration
- Search sector drawing, area calculation, status tracking
- Roster with live map tracking per member
- SAR planning markers and elapsed-time timer
- Digital T-Cards with QR scanner
- GPX/KML import/export
- Printable briefing sheets

### Calculators & Tools
- Coordinate converter (DD, DMS, DDM, UTM)
- Distance & bearing, two-point intersection
- Rope rescue, marine, search math calculators
- Field references

### Comms & Data
- Two-way APRS-IS messaging
- Meshtastic MQTT and MeshCore mesh node tracking
- Multiple named operation profiles

### App
- Light/dark theme
- Auto-log crash recovery (saves state every 60s, restores after unclean shutdown)
- In-app auto-update checker
- Incident log with export

---

## File Layout

```
aprs-desktop/
├── src/
│   ├── aprs_tracker_app.py     GTK4/WebKit Python wrapper
│   ├── aprs-tracker.html       Self-contained app
│   ├── sar-core.js             SAR toolkit JS
│   ├── tile_cache.py           Offline tile cache
│   ├── mesh_backend.py         Meshtastic + MeshCore
│   ├── aprs_messaging.py       APRS-IS messaging
│   ├── update_checker.py       Auto-updater
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
