# APRSaR Tracker

Native desktop SAR & APRS toolkit for ham radio operators and Search & Rescue teams.  
**W7CTY / 914 Communications**

**Current version: 6.2.0**

---

## Installation

### Fedora Linux

Download `aprs-desktop-6.2.0.zip` from the [Releases](https://github.com/W7CTY/aprs-tracker/releases) page, then:

```bash
cd ~/Downloads && unzip -o aprs-desktop-6.2.0.zip && cd aprs-desktop/rpm && bash build.sh <<< "Y"
```

The installer removes any previous version, clears the WebKit cache, and cleans up extracted files automatically.

### Run from source

```bash
sudo dnf install python3-gobject gtk4 libadwaita webkitgtk6.0
cd src/ && python3 aprs_tracker_app.py
```

### Optional: Mesh & APRS-IS messaging

```bash
pip3 install --break-system-packages paho-mqtt meshtastic meshcore cryptography aprslib
```

---

## Windows

Download `APRSaR-Tracker-6.2.0.zip` from the [Releases](https://github.com/W7CTY/aprs-tracker-electron/releases) page, extract, and run `Install.bat`.

---

## Menu

| Group | Items |
|-------|-------|
| Primary | APRS, Weather, Messages, Mesh |
| SAR Operations | Subjects, Search, SAR Ops, Roster, Operations |
| Tools & Data | Tools, Offline, Log |
| App | About, Help |

---

## What's New in 6.2.0

- **Weather auto-refresh** — current conditions and forecast update every 15 minutes automatically; pauses when app is minimized, resumes on focus
- **Temperature "last updated" timestamp** shown in Current Conditions header
- **Hourly forecast graph** — SVG temperature curve + precip probability bars for next 24 hours
- **Sunrise/sunset times** displayed in Current Conditions
- **Lightning overlay** — Blitzortung strike tiles, auto-refreshes every 10 minutes
- **NWS audio alert** — plays a single alert tone for Extreme/Severe/Moderate alerts
- **Expandable NWS alerts** — tap any alert to expand full detail (description, instructions, severity, certainty)
- **APRS alert messaging** — sends NWS and SAR alerts via APRS-IS to a configurable callsign list
- **Station path history playback** — animated track replay from aprs.fi history
- **PHG coverage circles** — draws coverage rings from station PHG data
- **Dead reckoning** — projects station location based on last known speed and course
- **Heard list** — shows all heard stations sorted by last heard time
- **Repeater overlay** — loads nearby repeaters from RepeaterBook API
- **Winlink gateway overlay** — loads nearby Winlink gateways
- **FEMA flood zone overlay** — NFHL WMS tiles
- **Maidenhead grid square** — displayed for current map center in Tools tab
- **MGRS coordinate** — displayed for current map center in Tools tab
- **Magnetic declination** — fetches from NOAA for current map center
- **Lost Person Behavior profiles** — 8 profiles with search radius rings on map
- **Clue logging** — log physical/track/visual clues with GPS coordinates
- **Hasty team assignment** — assign roster members to search sectors
- **POA/POD calculator** — probability of area/detection per sector
- **ICS-204 and ICS-209 form generation** — exports to text file
- **Debriefing checklist** — 10-item post-search debrief tracker in SAR Ops tab
- **Session notes** — freeform notepad saved with the operation
- **Keyboard shortcuts** — F (fullscreen), R (radar), D (theme), Esc (close), 1-4 (tabs)
- **Night mode auto-switch** — follows sunrise/sunset when weather is loaded
- **Print map view** — opens print-ready map in new window
- **Alert polling lifecycle** — stops when app is hidden, resumes on focus
- **Crash recovery weather restore** — reloads weather after unclean shutdown
- **Post-install cleanup** — extracted installer files deleted automatically
- **Windows icon rebuild** — ICO rebuilt pixel-for-pixel from source PNGs

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F | Toggle fullscreen map |
| R | Toggle radar |
| D | Toggle dark/light theme |
| Esc | Exit fullscreen / close popup |
| 1 | APRS tab |
| 2 | Weather tab |
| 3 | Messages tab |
| 4 | SAR Ops tab |

---

W7CTY · 914 Communications · Indianapolis, IN
