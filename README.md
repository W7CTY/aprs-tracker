# APRSaR Tracker

Ham radio APRS tracking and Search & Rescue toolkit for Fedora Linux. Live station tracking, SAR operations management, weather radar, and mesh network integration in a single native desktop app.

---

## Installation

**Requires Fedora Linux.**

```bash
cd ~/Downloads
unzip -o aprs-desktop.zip
cd aprs-desktop/rpm
bash build.sh
```

The build script installs all dependencies and prompts to install the RPM when done. The exact install command is always printed at the end for copy-paste.

**Optional** — for mesh networking and APRS-IS messaging:

```bash
pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography aprslib
```

---

## What It Does

- **Live APRS tracking** — follow any callsign on the map with a live trail showing movement history
- **Area beacon loading** — automatically loads nearby APRS stations when no callsign is being tracked
- **SAR operations** — search sectors, subjects, roster, incident log, T-Cards, printed briefings
- **Weather** — current conditions, 5-day forecast, precipitation type/intensity breakdown, live radar overlay (OpenWeatherMap), NWS active alerts
- **Mesh networks** — Meshtastic and MeshCore node positions on the same map as APRS traffic
- **APRS-IS messaging** — two-way text messaging using your callsign
- **Offline maps** — pre-download street map tiles for use without internet
- **SAR calculators** — distance/bearing, coordinates, search math, rope rescue, marine, navigation
- **Auto-updates** — notifies when a new version is available with a one-click install

---

## Usage

Launch from your application menu or run `aprs-tracker` in a terminal.

**Tracking a station:** Enter a callsign in the search bar and tap Track. The station appears on the map with a live trail. Position refreshes every 30 seconds by default.

**SAR operations:** Use the dropdown menu (☰) to navigate between tabs. Create an operation in the OPS tab, draw search sectors on the map, and manage personnel in the ROSTER tab.

**Radar:** Open the WX tab, tap Show Radar on Map. Radar updates automatically on a configurable interval.

**Settings:** Adjust all refresh intervals in the SETTINGS tab under the App group.

---

## What's New in 5.1.0

- Fixed APRS station loading errors introduced in a previous security update
- Smooth weather radar via OpenWeatherMap (configurable refresh interval)
- Precipitation type and intensity breakdown in the WX tab (rain, snow, freezing rain, mix)
- User-configurable refresh intervals for APRS tracking, area beacons, roster, and radar
- In-app update notification banner with one-click download and install
- Settings tab for all interval preferences
- Map opens centered on Indianapolis at zoom 7

---

W7CTY · 914 Communications · Indianapolis, IN · w7cty@outlook.com
