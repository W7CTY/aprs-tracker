# APRSaR Tracker

Ham radio APRS tracking and Search & Rescue toolkit for Fedora Linux. Live station tracking on a full mapping interface, SAR operations management, weather with live radar, and mesh radio integration.

---

## Installation

**Requires Fedora Linux.**

```bash
cd ~/Downloads
unzip -o aprs-desktop.zip
cd aprs-desktop/rpm
bash build.sh
```

The script installs all dependencies, builds the RPM, and prompts to install it. The exact install command is always printed at the end for copy-paste.

**For mesh networking and APRS-IS messaging (optional):**

```bash
pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography aprslib
```

---

## What It Does

**APRS Tracking**
Track any amateur radio station by callsign. The station appears on the map with a live movement trail. Nearby beacons load automatically when no specific station is being tracked.

**Search & Rescue**
Draw search sectors on the map, manage subjects and personnel, track assignments and status, generate printed briefing sheets and T-Cards, and maintain a permanent incident log.

**Weather**
Current conditions, 5-day forecast, hourly precipitation breakdown by type (rain, snow, freezing rain), live radar overlay, and NWS active alerts for any location.

**Calculators**
Distance and bearing, coordinate conversion, search probability math, rope rescue rigging, marine navigation, pacing tables, and path intersection.

**Mesh Networks**
Meshtastic and MeshCore node positions merged onto the same map as APRS traffic.

**APRS-IS Messaging**
Two-way text messaging to any station using your callsign.

**Offline Maps**
Pre-download map tiles for areas you'll be operating in without internet.

---

## Usage

Launch from your application menu or run `aprs-tracker` in a terminal.

Use the **☰ menu** to navigate between tabs. Tabs are grouped by function — Live, SAR Toolkit, Calculators, Comms & Data, and App.

**Tracking a station:** Enter a callsign in the top bar and tap Track.

**SAR operation:** Create a named operation in the OPS tab, draw sectors on the map, add subjects and roster members in their tabs.

**Weather radar:** Open the WX tab and tap Show Radar on Map.

**Refresh intervals:** Adjust all polling frequencies in the SETTINGS tab.

**Updates:** A banner appears automatically when a new version is available. Tap Download & Install to update without opening a terminal.

---

## What's New

- Live radar via OpenWeatherMap — smooth, updates every 10 minutes
- Hourly precipitation type and intensity breakdown (rain, snow, freezing rain, mix)
- NWS active weather alerts with severity color coding
- User-configurable refresh intervals for all data sources (SETTINGS tab)
- In-app update notifications with one-click install
- Live movement trail drawn on the map while tracking a mobile station
- Nearby APRS beacons load automatically when no station is tracked
- Weather location can be set by city/state or coordinates

---

W7CTY · 914 Communications · Indianapolis, IN · w7cty@outlook.com
