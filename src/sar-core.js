/* ════════════════════════════════════════════════════════
   SAR TOOLKIT — core module
   W7CTY / 914 Communications
   ════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────
var subjects   = [];   // {id, name, callsign, color, status, notes, lastLat, lastLon, lastTime}
var sectors    = [];   // {id, name, status, points:[[lat,lon],...], assignedTo, notes}
var roster     = [];   // {id, name, callsign, role, status, sector, notes}
var incidentLog = [];  // {id, time, type:'auto'|'manual', text}
var subjMarkers = {};  // id -> leaflet marker
var sectorLayers = {}; // id -> leaflet polygon
var drawMode   = null; // null | 'waypoint' | 'sector' | 'measure'
var sectorDraft = [];  // points being drawn for new sector
var measurePts  = [];
var measureLine = null;
var radarLayer  = null;
var radarOn     = false;
var radarTimer  = null;
var weatherData = null;

var SUBJ_COLORS = ['#f85149','#39d0d8','#e3b341','#c792ea','#3fb950','#f0821e','#58a6ff','#ff7eb6'];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function nowStr() {
  var d = new Date();
  return d.toTimeString().slice(0,8);
}

function logEvent(text, type) {
  type = type || 'auto';
  incidentLog.unshift({ id: uid(), time: nowStr(), type: type, text: text });
  if (incidentLog.length > 500) incidentLog.pop();
  if (curTab === 'log') renderTabInto('log','tcont');
}

// ════════════════════════════════════════════════════════
//  COORDINATE CONVERSION
// ════════════════════════════════════════════════════════

function ddToDMS(lat, lon) {
  function conv(val, isLat) {
    var dir = val >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
    val = Math.abs(val);
    var d = Math.floor(val);
    var mFull = (val - d) * 60;
    var m = Math.floor(mFull);
    var s = ((mFull - m) * 60).toFixed(2);
    return d + '\u00B0' + m + '\u2032' + s + '\u2033 ' + dir;
  }
  return conv(lat, true) + '  ' + conv(lon, false);
}

function ddToDDM(lat, lon) {
  function conv(val, isLat) {
    var dir = val >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
    val = Math.abs(val);
    var d = Math.floor(val);
    var m = ((val - d) * 60).toFixed(3);
    return d + '\u00B0 ' + m + '\u2032 ' + dir;
  }
  return conv(lat, true) + '  ' + conv(lon, false);
}

// Simplified UTM conversion (WGS84)
function ddToUTM(lat, lon) {
  var a = 6378137.0, eccSq = 0.00669438;
  var k0 = 0.9996;
  var zone = Math.floor((lon + 180) / 6) + 1;
  var lonOrigin = (zone - 1) * 6 - 180 + 3;
  var latRad = lat * Math.PI / 180;
  var lonRad = lon * Math.PI / 180;
  var lonOriginRad = lonOrigin * Math.PI / 180;
  var eccPrimeSq = eccSq / (1 - eccSq);
  var N = a / Math.sqrt(1 - eccSq * Math.sin(latRad) * Math.sin(latRad));
  var T = Math.tan(latRad) * Math.tan(latRad);
  var C = eccPrimeSq * Math.cos(latRad) * Math.cos(latRad);
  var A = Math.cos(latRad) * (lonRad - lonOriginRad);
  var M = a * ((1 - eccSq/4 - 3*eccSq*eccSq/64 - 5*Math.pow(eccSq,3)/256) * latRad
    - (3*eccSq/8 + 3*eccSq*eccSq/32 + 45*Math.pow(eccSq,3)/1024) * Math.sin(2*latRad)
    + (15*eccSq*eccSq/256 + 45*Math.pow(eccSq,3)/1024) * Math.sin(4*latRad)
    - (35*Math.pow(eccSq,3)/3072) * Math.sin(6*latRad));
  var easting = k0*N*(A + (1-T+C)*Math.pow(A,3)/6
    + (5-18*T+T*T+72*C-58*eccPrimeSq)*Math.pow(A,5)/120) + 500000.0;
  var northing = k0*(M + N*Math.tan(latRad)*(A*A/2 + (5-T+9*C+4*C*C)*Math.pow(A,4)/24
    + (61-58*T+T*T+600*C-330*eccPrimeSq)*Math.pow(A,6)/720));
  if (lat < 0) northing += 10000000.0;
  var hemi = lat >= 0 ? 'N' : 'S';
  return zone + hemi + ' ' + Math.round(easting) + 'E ' + Math.round(northing) + 'N';
}

function parseDMS(str) {
  // Parses formats like "38 30 15 N" or "38.5042 -77.4667" or DDM
  str = str.trim();
  // Try plain decimal pair first: "38.5, -77.46"
  var dd = str.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (dd) return { lat: parseFloat(dd[1]), lon: parseFloat(dd[2]) };

  // Try DMS with direction letters
  var re = /(\d+)[°\s]+(\d+)['\u2032\s]+([\d.]+)["\u2033]?\s*([NSEW])/gi;
  var matches = [];
  var m;
  while ((m = re.exec(str)) !== null) matches.push(m);
  if (matches.length === 2) {
    function toDD(mm) {
      var v = parseFloat(mm[1]) + parseFloat(mm[2])/60 + parseFloat(mm[3])/3600;
      if (mm[4].toUpperCase() === 'S' || mm[4].toUpperCase() === 'W') v = -v;
      return v;
    }
    return { lat: toDD(matches[0]), lon: toDD(matches[1]) };
  }
  return null;
}

function runCoordConvert() {
  var input = document.getElementById('cc-input').value.trim();
  var parsed = parseDMS(input);
  if (!parsed) { toast('Could not parse coordinates. Try "38.5, -77.46" or DMS format.'); return; }
  var lat = parsed.lat, lon = parsed.lon;
  document.getElementById('cc-result').innerHTML =
    '<div class="result-box"><div class="rk">DECIMAL DEGREES</div><div class="rv">' + lat.toFixed(6) + ', ' + lon.toFixed(6) + '</div></div>'
  + '<div class="result-box"><div class="rk">DEGREES MIN SEC</div><div class="rv" style="font-size:12px">' + ddToDMS(lat,lon) + '</div></div>'
  + '<div class="result-box"><div class="rk">DEGREES DEC MIN</div><div class="rv" style="font-size:12px">' + ddToDDM(lat,lon) + '</div></div>'
  + '<div class="result-box"><div class="rk">UTM</div><div class="rv" style="font-size:12px">' + ddToUTM(lat,lon) + '</div></div>'
  + '<button class="sbtn sbtn-cyan sbtn-full" style="margin-top:8px" onclick="map.setView([' + lat + ',' + lon + '],14);toast(\'Centered on coordinates\')">Center map here</button>'
  + '<button class="sbtn sbtn-full" style="margin-top:6px" onclick="placeWaypointAt(' + lat + ',' + lon + ')">Drop waypoint here</button>';
}

// ════════════════════════════════════════════════════════
//  DISTANCE & BEARING
// ════════════════════════════════════════════════════════

function haversine(lat1, lon1, lat2, lon2) {
  var R = 6371; // km
  var dLat = (lat2-lat1) * Math.PI/180;
  var dLon = (lon2-lon1) * Math.PI/180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2)*Math.sin(dLon/2);
  var c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function bearing(lat1, lon1, lat2, lon2) {
  var dLon = (lon2-lon1) * Math.PI/180;
  var y = Math.sin(dLon) * Math.cos(lat2*Math.PI/180);
  var x = Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180) -
    Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLon);
  var brng = Math.atan2(y, x) * 180/Math.PI;
  return (brng + 360) % 360;
}

function compassDir(deg) {
  var dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg/22.5) % 16];
}

function runDistanceBearing() {
  var p1 = parseDMS(document.getElementById('db-p1').value.trim());
  var p2 = parseDMS(document.getElementById('db-p2').value.trim());
  if (!p1 || !p2) { toast('Enter both points as "lat, lon"'); return; }
  var distKm = haversine(p1.lat, p1.lon, p2.lat, p2.lon);
  var distMi = distKm * 0.621371;
  var brg = bearing(p1.lat, p1.lon, p2.lat, p2.lon);
  document.getElementById('db-result').innerHTML =
    '<div class="result-box"><div class="rk">DISTANCE</div><div class="rv">' + distMi.toFixed(2) + ' mi  (' + distKm.toFixed(2) + ' km)</div></div>'
  + '<div class="result-box"><div class="rk">BEARING (P1&rarr;P2)</div><div class="rv">' + brg.toFixed(1) + '&deg;  ' + compassDir(brg) + '</div></div>'
  + '<button class="sbtn sbtn-cyan sbtn-full" style="margin-top:8px" onclick="drawDistLine(' + p1.lat + ',' + p1.lon + ',' + p2.lat + ',' + p2.lon + ')">Draw line on map</button>';
}

var distLineLayer = null;
function drawDistLine(lat1,lon1,lat2,lon2) {
  if (distLineLayer) map.removeLayer(distLineLayer);
  distLineLayer = L.polyline([[lat1,lon1],[lat2,lon2]], { color:'#39d0d8', weight:3, dashArray:'6 6' }).addTo(map);
  map.fitBounds(L.latLngBounds([[lat1,lon1],[lat2,lon2]]).pad(0.2));
  toast('Line drawn on map');
}

// ════════════════════════════════════════════════════════
//  SUBJECTS (multi-subject tracking)
// ════════════════════════════════════════════════════════

function addSubject() {
  var name = document.getElementById('subj-name').value.trim();
  var cs   = document.getElementById('subj-call').value.trim().toUpperCase();
  if (!name) { toast('Enter a subject name'); return; }
  var color = SUBJ_COLORS[subjects.length % SUBJ_COLORS.length];
  var subj = { id: uid(), name: name, callsign: cs, color: color, status: 'active', notes: '', lastLat: null, lastLon: null, lastTime: null };
  subjects.push(subj);
  document.getElementById('subj-name').value = '';
  document.getElementById('subj-call').value = '';
  logEvent('Subject added: ' + name + (cs ? ' (' + cs + ')' : ''));
  if (cs) refreshSubjectPosition(subj.id);
  renderTabInto('subjects','tcont');
}

function removeSubject(id) {
  var s = subjects.find(function(x){return x.id===id;});
  if (subjMarkers[id]) { map.removeLayer(subjMarkers[id]); delete subjMarkers[id]; }
  subjects = subjects.filter(function(x){return x.id!==id;});
  if (s) logEvent('Subject removed: ' + s.name);
  renderTabInto('subjects','tcont');
}

function setSubjStatus(id, status) {
  var s = subjects.find(function(x){return x.id===id;});
  if (!s) return;
  s.status = status;
  logEvent('Subject ' + s.name + ' status -> ' + status.toUpperCase(), status==='found' ? 'manual' : 'auto');
  renderTabInto('subjects','tcont');
  placeSubjMarker(s);
}

async function refreshSubjectPosition(id) {
  var s = subjects.find(function(x){return x.id===id;});
  if (!s || !s.callsign) return;
  try {
    var en = await aprsGet({ name: s.callsign, what:'loc' });
    if (en.length) {
      s.lastLat = parseFloat(en[0].lat);
      s.lastLon = parseFloat(en[0].lng);
      s.lastTime = en[0].lasttime;
      placeSubjMarker(s);
      renderTabInto('subjects','tcont');
    }
  } catch(e) {}
}

function refreshAllSubjects() {
  subjects.forEach(function(s){ if (s.callsign) refreshSubjectPosition(s.id); });
}

function placeSubjMarker(s) {
  if (s.lastLat == null) return;
  if (subjMarkers[s.id]) map.removeLayer(subjMarkers[s.id]);
  var icon = L.divIcon({
    className: '',
    html: '<div style="width:26px;height:26px;background:' + s.color + ';border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>',
    iconSize: [26,26], iconAnchor: [13,26]
  });
  var m = L.marker([s.lastLat, s.lastLon], { icon: icon }).addTo(map);
  m.bindTooltip(s.name + (s.callsign ? ' ('+s.callsign+')' : ''), { permanent:true, direction:'top', offset:[0,-26], className:'aprs-label' });
  m.on('click', function() { focusSubject(s.id); });
  subjMarkers[s.id] = m;
}

function focusSubject(id) {
  var s = subjects.find(function(x){return x.id===id;});
  if (!s || s.lastLat == null) { toast('No position data for this subject yet'); return; }
  map.setView([s.lastLat, s.lastLon], 14);
}

function subjStatusBadge(status) {
  var map_ = { active:['st-active','ACTIVE'], lost:['st-lost','LOST'], found:['st-found','FOUND'], standby:['st-standby','STANDBY'] };
  var v = map_[status] || map_.active;
  return '<span class="subj-status ' + v[0] + '">' + v[1] + '</span>';
}

function subjectsHTML() {
  var html = '<div class="sec-h">Add Subject</div>'
    + '<div class="field"><input class="finput" id="subj-name" placeholder="Subject name"/></div>'
    + '<div class="field"><input class="finput" id="subj-call" placeholder="APRS callsign (optional)" style="text-transform:uppercase"/></div>'
    + '<button class="sbtn sbtn-primary sbtn-full" onclick="addSubject()">+ Add Subject</button>';

  html += '<div class="sec-h" style="margin-top:18px">Tracked Subjects (' + subjects.length + ')</div>';
  if (!subjects.length) {
    html += '<div class="empty">No subjects added yet.</div>';
  } else {
    html += '<button class="sbtn sbtn-cyan sbtn-full" style="margin-bottom:10px" onclick="refreshAllSubjects()">&#8635; Refresh all positions</button>';
    subjects.forEach(function(s) {
      var posStr = s.lastLat != null ? s.lastLat.toFixed(5) + ', ' + s.lastLon.toFixed(5) : 'No position data';
      html += '<div class="subj-card" style="border-left-color:' + s.color + '">'
        + '<div class="subj-head"><div class="subj-name"><span class="color-dot" style="background:' + s.color + '"></span>' + s.name + '</div>' + subjStatusBadge(s.status) + '</div>'
        + (s.callsign ? '<div class="subj-meta">APRS: ' + s.callsign + '</div>' : '')
        + '<div class="subj-meta">' + posStr + (s.lastTime ? ' &middot; ' + ago(s.lastTime) : '') + '</div>'
        + '<div class="subj-actions">'
        + '<button class="sbtn" style="font-size:11px;padding:5px 8px" onclick="focusSubject(\'' + s.id + '\')">Locate</button>'
        + (s.callsign ? '<button class="sbtn sbtn-cyan" style="font-size:11px;padding:5px 8px" onclick="refreshSubjectPosition(\'' + s.id + '\')">&#8635;</button>' : '')
        + '<button class="sbtn sbtn-green" style="font-size:11px;padding:5px 8px" onclick="setSubjStatus(\'' + s.id + '\',\'found\')">Found</button>'
        + '<button class="sbtn sbtn-red" style="font-size:11px;padding:5px 8px" onclick="removeSubject(\'' + s.id + '\')">&#x2715;</button>'
        + '</div></div>';
    });
  }
  return html;
}

// ════════════════════════════════════════════════════════
//  SEARCH SECTORS
// ════════════════════════════════════════════════════════

function startSectorDraw() {
  drawMode = 'sector';
  sectorDraft = [];
  toast('Sector draw mode: click map to add points, then Finish Sector');
  updateDrawToolbar();
}

function finishSectorDraw() {
  if (sectorDraft.length < 3) { toast('Need at least 3 points for a sector'); return; }
  var name = 'Sector ' + String.fromCharCode(65 + sectors.length);
  var sector = { id: uid(), name: name, status: 'unsearched', points: sectorDraft.slice(), assignedTo: '', notes: '' };
  sectors.push(sector);
  drawSectorLayer(sector);
  logEvent('Search sector created: ' + name);
  drawMode = null;
  sectorDraft = [];
  updateDrawToolbar();
  renderTabInto('search','tcont');
}

function cancelDraw() {
  drawMode = null;
  sectorDraft = [];
  if (window._draftLine) { map.removeLayer(window._draftLine); window._draftLine = null; }
  updateDrawToolbar();
}

function sectorColor(status) {
  return { unsearched:'#f85149', progress:'#e3b341', cleared:'#3fb950' }[status] || '#f85149';
}

function drawSectorLayer(sector) {
  if (sectorLayers[sector.id]) map.removeLayer(sectorLayers[sector.id]);
  var col = sectorColor(sector.status);
  var poly = L.polygon(sector.points, { color: col, weight: 2, fillColor: col, fillOpacity: 0.15 }).addTo(map);
  poly.bindTooltip(sector.name, { permanent: true, direction:'center', className:'aprs-label' });
  poly.on('click', function() { swTab('search'); });
  sectorLayers[sector.id] = poly;
}

function cycleSectorStatus(id) {
  var s = sectors.find(function(x){return x.id===id;});
  if (!s) return;
  var order = ['unsearched','progress','cleared'];
  s.status = order[(order.indexOf(s.status)+1) % order.length];
  drawSectorLayer(s);
  logEvent('Sector ' + s.name + ' status -> ' + s.status.toUpperCase());
  renderTabInto('search','tcont');
}

function removeSector(id) {
  var s = sectors.find(function(x){return x.id===id;});
  if (sectorLayers[id]) { map.removeLayer(sectorLayers[id]); delete sectorLayers[id]; }
  sectors = sectors.filter(function(x){return x.id!==id;});
  if (s) logEvent('Sector removed: ' + s.name);
  renderTabInto('search','tcont');
}

function sectorAreaKm2(points) {
  // Shoelace formula on equirectangular-projected points (good enough for SAR-scale sectors)
  if (points.length < 3) return 0;
  var R = 6371;
  var rad = Math.PI/180;
  var lat0 = points[0][0] * rad;
  var xy = points.map(function(p) {
    var x = R * (p[1]*rad) * Math.cos(lat0);
    var y = R * (p[0]*rad);
    return [x,y];
  });
  var area = 0;
  for (var i=0;i<xy.length;i++) {
    var j = (i+1) % xy.length;
    area += xy[i][0]*xy[j][1] - xy[j][0]*xy[i][1];
  }
  return Math.abs(area/2);
}

function searchHTML() {
  var html = '<div class="sec-h">Search Sectors</div>'
    + '<div class="frow" style="margin-bottom:10px">'
    + '<button class="sbtn sbtn-primary" onclick="startSectorDraw()">+ Draw Sector</button>'
    + (drawMode==='sector' ? '<button class="sbtn sbtn-red" onclick="finishSectorDraw()">Finish (' + sectorDraft.length + ' pts)</button><button class="sbtn" onclick="cancelDraw()">Cancel</button>' : '')
    + '</div>';

  if (!sectors.length) {
    html += '<div class="empty">No search sectors defined.<br>Use Draw Sector, then tap the map to outline an area.</div>';
  } else {
    sectors.forEach(function(s) {
      var areaKm2 = sectorAreaKm2(s.points);
      var areaMi2 = (areaKm2 * 0.386102).toFixed(2);
      var statusLbl = { unsearched:'UNSEARCHED', progress:'IN PROGRESS', cleared:'CLEARED' }[s.status];
      var statusCls = { unsearched:'ss-unsearched', progress:'ss-progress', cleared:'ss-cleared' }[s.status];
      html += '<div class="sector-card">'
        + '<div class="sector-head"><span class="sector-name">' + s.name + '</span>'
        + '<span class="sector-status ' + statusCls + '" onclick="cycleSectorStatus(\'' + s.id + '\')">' + statusLbl + '</span></div>'
        + '<div style="font-size:12px;color:var(--muted)">~' + areaMi2 + ' mi&sup2; &middot; ' + s.points.length + ' points</div>'
        + (s.assignedTo ? '<div style="font-size:12px;color:var(--text);margin-top:3px">Assigned: ' + s.assignedTo + '</div>' : '')
        + '<div class="subj-actions">'
        + '<button class="sbtn" style="font-size:11px;padding:5px 8px" onclick="map.fitBounds(L.latLngBounds(' + JSON.stringify(s.points) + ').pad(0.15))">View</button>'
        + '<button class="sbtn sbtn-red" style="font-size:11px;padding:5px 8px" onclick="removeSector(\'' + s.id + '\')">&#x2715;</button>'
        + '</div></div>';
    });
  }
  return html;
}

// ════════════════════════════════════════════════════════
//  WAYPOINTS (single-point markers, distinct from sectors)
// ════════════════════════════════════════════════════════

var waypoints = [];
var waypointLayers = {};

function placeWaypointAt(lat, lon) {
  var label = 'WP' + (waypoints.length + 1);
  var wp = { id: uid(), label: label, lat: lat, lon: lon, time: nowStr() };
  waypoints.push(wp);
  var icon = L.divIcon({
    className: '',
    html: '<div style="width:22px;height:22px;background:#f0821e;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#000;font-family:monospace">' + waypoints.length + '</div>',
    iconSize:[22,22], iconAnchor:[11,11]
  });
  var m = L.marker([lat,lon], { icon: icon }).addTo(map);
  m.bindTooltip(label, { className:'aprs-label' });
  waypointLayers[wp.id] = m;
  logEvent('Waypoint dropped: ' + label + ' @ ' + lat.toFixed(5) + ',' + lon.toFixed(5));
  toast(label + ' placed');
}

function toggleWaypointMode() {
  drawMode = drawMode === 'waypoint' ? null : 'waypoint';
  updateDrawToolbar();
  toast(drawMode === 'waypoint' ? 'Tap the map to drop waypoints' : 'Waypoint mode off');
}

// ════════════════════════════════════════════════════════
//  PERSONNEL / ROSTER
// ════════════════════════════════════════════════════════

function addRosterMember() {
  var name = document.getElementById('ros-name').value.trim();
  var cs   = document.getElementById('ros-call').value.trim().toUpperCase();
  var role = document.getElementById('ros-role').value.trim();
  if (!name) { toast('Enter a name'); return; }
  var member = { id: uid(), name: name, callsign: cs, role: role, status: 'staged', sector: '', notes: '' };
  roster.push(member);
  document.getElementById('ros-name').value = '';
  document.getElementById('ros-call').value = '';
  document.getElementById('ros-role').value = '';
  logEvent('Team member checked in: ' + name + (role?' ('+role+')':''));
  renderTabInto('roster','tcont');
}

function setRosterStatus(id, status) {
  var m = roster.find(function(x){return x.id===id;});
  if (!m) return;
  m.status = status;
  logEvent(m.name + ' -> ' + status.toUpperCase());
  renderTabInto('roster','tcont');
}

function removeRosterMember(id) {
  var m = roster.find(function(x){return x.id===id;});
  roster = roster.filter(function(x){return x.id!==id;});
  if (m) logEvent('Removed from roster: ' + m.name);
  renderTabInto('roster','tcont');
}

function assignRosterSector(id, sectorName) {
  var m = roster.find(function(x){return x.id===id;});
  if (!m) return;
  m.sector = sectorName;
  var sec = sectors.find(function(s){return s.name===sectorName;});
  if (sec) sec.assignedTo = m.name;
  logEvent(m.name + ' assigned to ' + sectorName);
  renderTabInto('roster','tcont');
}

function rosterHTML() {
  var html = '<div class="sec-h">Check In Personnel</div>'
    + '<div class="field"><input class="finput" id="ros-name" placeholder="Name"/></div>'
    + '<div class="frow field">'
    + '<input class="finput" id="ros-call" placeholder="Callsign" style="text-transform:uppercase"/>'
    + '<input class="finput" id="ros-role" placeholder="Role (e.g. Team Lead)"/>'
    + '</div>'
    + '<button class="sbtn sbtn-primary sbtn-full" onclick="addRosterMember()">+ Check In</button>';

  html += '<div class="sec-h" style="margin-top:18px">Roster (' + roster.length + ')</div>';
  if (!roster.length) {
    html += '<div class="empty">No personnel checked in yet.</div>';
  } else {
    var sectorOpts = '<option value="">Unassigned</option>' + sectors.map(function(s){return '<option value="'+s.name+'">'+s.name+'</option>';}).join('');
    roster.forEach(function(m) {
      var stCls = { staged:'rst-staged', deployed:'rst-deployed', returned:'rst-returned' }[m.status];
      html += '<div class="roster-card">'
        + '<div class="roster-head"><span class="roster-name">' + m.name + '</span><span class="subj-status ' + stCls + '">' + m.status.toUpperCase() + '</span></div>'
        + (m.role ? '<div style="font-size:12px;color:var(--muted)">' + m.role + (m.callsign?' &middot; '+m.callsign:'') + '</div>' : (m.callsign?'<div style="font-size:12px;color:var(--muted)">'+m.callsign+'</div>':''))
        + '<select class="fselect" style="margin-top:6px;font-size:12px;padding:5px 8px" onchange="assignRosterSector(\'' + m.id + '\',this.value)">' + sectorOpts.replace('value="'+m.sector+'"','value="'+m.sector+'" selected') + '</select>'
        + '<div class="subj-actions">'
        + '<button class="sbtn sbtn-cyan" style="font-size:11px;padding:5px 8px" onclick="setRosterStatus(\'' + m.id + '\',\'deployed\')">Deploy</button>'
        + '<button class="sbtn sbtn-green" style="font-size:11px;padding:5px 8px" onclick="setRosterStatus(\'' + m.id + '\',\'returned\')">Return</button>'
        + '<button class="sbtn sbtn-red" style="font-size:11px;padding:5px 8px" onclick="removeRosterMember(\'' + m.id + '\')">&#x2715;</button>'
        + '</div></div>';
    });
  }
  return html;
}

// ════════════════════════════════════════════════════════
//  INCIDENT LOG
// ════════════════════════════════════════════════════════

function addManualLog() {
  var txt = document.getElementById('log-input').value.trim();
  if (!txt) return;
  logEvent(txt, 'manual');
  document.getElementById('log-input').value = '';
  renderTabInto('log','tcont');
}

function exportLog() {
  var lines = ['APRS TRACKER — INCIDENT LOG', 'Exported: ' + new Date().toString(), 'W7CTY / 914 Communications', ''];
  incidentLog.slice().reverse().forEach(function(e) {
    lines.push('[' + e.time + '] ' + (e.type==='manual'?'(manual) ':'') + e.text);
  });
  var blob = new Blob([lines.join('\n')], { type:'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'sar-incident-log-' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast('Log exported');
}

function logHTML() {
  var html = '<div class="sec-h">Add Log Entry</div>'
    + '<div class="field"><textarea class="ftextarea" id="log-input" placeholder="Log entry..."></textarea></div>'
    + '<div class="frow">'
    + '<button class="sbtn sbtn-primary" onclick="addManualLog()">+ Add Entry</button>'
    + '<button class="sbtn sbtn-cyan" onclick="exportLog()">&#11015; Export</button>'
    + '</div>';
  html += '<div class="sec-h" style="margin-top:18px">Log (' + incidentLog.length + ' entries)</div>';
  if (!incidentLog.length) {
    html += '<div class="empty">No log entries yet.<br>Events are logged automatically.</div>';
  } else {
    incidentLog.forEach(function(e) {
      html += '<div class="log-entry ' + e.type + '"><div class="log-time">' + e.time + (e.type==='manual'?' &middot; MANUAL':'') + '</div><div class="log-text">' + e.text + '</div></div>';
    });
  }
  return html;
}

// ════════════════════════════════════════════════════════
//  WEATHER
// ════════════════════════════════════════════════════════

async function loadWeather() {
  var c = map.getCenter();
  document.getElementById('tcont').innerHTML = '<div class="empty">Loading weather...</div>';
  try {
    var r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lng
      + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,pressure_msl'
      + '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=5');
    weatherData = await r.json();
    if (curTab === 'weather') renderTabInto('weather','tcont');
  } catch(e) {
    document.getElementById('tcont').innerHTML = '<div class="empty">Weather unavailable: ' + e.message + '</div>';
  }
}

function wmoDesc(code) {
  var map_ = {
    0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
    45:'Fog', 48:'Rime fog', 51:'Light drizzle', 53:'Drizzle', 55:'Dense drizzle',
    61:'Light rain', 63:'Rain', 65:'Heavy rain', 71:'Light snow', 73:'Snow', 75:'Heavy snow',
    77:'Snow grains', 80:'Light showers', 81:'Showers', 82:'Violent showers',
    85:'Snow showers', 86:'Heavy snow showers', 95:'Thunderstorm', 96:'Thunderstorm w/ hail', 99:'Severe thunderstorm'
  };
  return map_[code] || 'Unknown';
}

function wmoIcon(code) {
  if (code === 0) return '\u2600\uFE0F';
  if (code <= 2) return '\u26C5';
  if (code === 3) return '\u2601\uFE0F';
  if (code === 45 || code === 48) return '\u{1F32B}\uFE0F';
  if (code >= 51 && code <= 65) return '\u{1F327}\uFE0F';
  if (code >= 71 && code <= 86) return '\u{1F328}\uFE0F';
  if (code >= 95) return '\u26C8\uFE0F';
  return '\u{1F324}\uFE0F';
}

function weatherHTML() {
  if (!weatherData) {
    loadWeather();
    return '<div class="empty">Loading weather for map center...</div>';
  }
  var cur = weatherData.current;
  var daily = weatherData.daily;
  var html = '<div class="sec-h">Current Conditions</div>'
    + '<div class="result-box" style="text-align:center;padding:16px">'
    + '<div style="font-size:36px">' + wmoIcon(cur.weather_code) + '</div>'
    + '<div style="font-size:28px;font-weight:700;color:var(--orange);margin:4px 0">' + Math.round(cur.temperature_2m) + '\u00B0F</div>'
    + '<div style="color:var(--muted)">' + wmoDesc(cur.weather_code) + ' &middot; Feels ' + Math.round(cur.apparent_temperature) + '\u00B0F</div>'
    + '</div>'
    + '<div class="frow" style="margin-top:8px">'
    + '<div class="result-box"><div class="rk">WIND</div><div class="rv" style="font-size:13px">' + Math.round(cur.wind_speed_10m) + ' mph ' + compassDir(cur.wind_direction_10m) + '</div></div>'
    + '<div class="result-box"><div class="rk">GUSTS</div><div class="rv" style="font-size:13px">' + Math.round(cur.wind_gusts_10m) + ' mph</div></div>'
    + '</div>'
    + '<div class="frow">'
    + '<div class="result-box"><div class="rk">HUMIDITY</div><div class="rv" style="font-size:13px">' + cur.relative_humidity_2m + '%</div></div>'
    + '<div class="result-box"><div class="rk">VISIBILITY</div><div class="rv" style="font-size:13px">' + (cur.visibility ? (cur.visibility*0.000621371).toFixed(1)+' mi' : '--') + '</div></div>'
    + '</div>'
    + '<div class="frow">'
    + '<div class="result-box"><div class="rk">PRESSURE</div><div class="rv" style="font-size:13px">' + Math.round(cur.pressure_msl) + ' hPa</div></div>'
    + '<div class="result-box"><div class="rk">PRECIP</div><div class="rv" style="font-size:13px">' + cur.precipitation + ' in</div></div>'
    + '</div>';

  html += '<div class="sec-h" style="margin-top:16px">5-Day Forecast</div>';
  for (var i=0; i<daily.time.length; i++) {
    var d = new Date(daily.time[i] + 'T12:00:00');
    var dayName = i===0 ? 'Today' : d.toLocaleDateString(undefined,{weekday:'short'});
    html += '<div class="result-box" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px">'
      + '<span style="font-family:monospace;font-size:12px;width:48px">' + dayName + '</span>'
      + '<span style="font-size:18px">' + wmoIcon(daily.weather_code[i]) + '</span>'
      + '<span style="font-size:12px;color:var(--muted)">' + Math.round(daily.precipitation_probability_max[i]) + '%</span>'
      + '<span style="font-family:monospace;font-size:13px"><span style="color:var(--orange)">' + Math.round(daily.temperature_2m_max[i]) + '\u00B0</span> / ' + Math.round(daily.temperature_2m_min[i]) + '\u00B0</span>'
      + '</div>';
  }

  html += '<div class="sec-h" style="margin-top:16px">Radar Overlay</div>'
    + '<button class="sbtn ' + (radarOn?'sbtn-primary':'') + ' sbtn-full" onclick="toggleRadar()">' + (radarOn?'Radar ON \u2014 tap to hide':'Show live radar on map') + '</button>'
    + '<div style="font-size:11px;color:var(--muted);margin-top:6px">Radar updates every 5 minutes. Source: RainViewer.</div>'
    + '<button class="sbtn sbtn-cyan sbtn-full" style="margin-top:10px" onclick="weatherData=null;loadWeather()">&#8635; Refresh weather</button>';

  return html;
}

// ── Live radar overlay (RainViewer public tile API, no key required) ──
async function toggleRadar() {
  radarOn = !radarOn;
  if (radarOn) {
    try {
      var r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      var d = await r.json();
      var frames = d.radar && d.radar.past ? d.radar.past : [];
      if (!frames.length) { toast('Radar data unavailable'); radarOn = false; return; }
      var latest = frames[frames.length - 1];
      var tileUrl = d.host + latest.path + '/256/{z}/{x}/{y}/4/1_1.png';
      if (radarLayer) map.removeLayer(radarLayer);
      radarLayer = L.tileLayer(tileUrl, {
        opacity: 0.55, zIndex: 450,
        maxNativeZoom: 9, minZoom: 0, maxZoom: 19, tileSize: 256
      }).addTo(map);
      toast('Live radar enabled');
      if (radarTimer) clearInterval(radarTimer);
      radarTimer = setInterval(toggleRadarRefresh, 5*60*1000);
    } catch(e) {
      toast('Radar error: ' + e.message);
      radarOn = false;
    }
  } else {
    if (radarLayer) { map.removeLayer(radarLayer); radarLayer = null; }
    if (radarTimer) { clearInterval(radarTimer); radarTimer = null; }
    toast('Radar disabled');
  }
  if (curTab === 'weather') renderTabInto('weather','tcont');
}

async function toggleRadarRefresh() {
  if (!radarOn) return;
  try {
    var r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    var d = await r.json();
    var frames = d.radar.past;
    var latest = frames[frames.length - 1];
    var tileUrl = d.host + latest.path + '/256/{z}/{x}/{y}/4/1_1.png';
    if (radarLayer) map.removeLayer(radarLayer);
    radarLayer = L.tileLayer(tileUrl, {
      opacity: 0.55, zIndex: 450,
      maxNativeZoom: 9, minZoom: 0, maxZoom: 19, tileSize: 256
    }).addTo(map);
  } catch(e) {}
}

// ════════════════════════════════════════════════════════
//  TOOLS TAB (coordinate converter + distance/bearing combined)
// ════════════════════════════════════════════════════════

function toolsHTML() {
  return '<div class="sec-h">Coordinate Converter</div>'
    + '<div class="field"><input class="finput" id="cc-input" placeholder="38.5, -77.46  or  38°30\'15&quot; N"/></div>'
    + '<button class="sbtn sbtn-primary sbtn-full" onclick="runCoordConvert()">Convert</button>'
    + '<div id="cc-result"></div>'
    + '<div class="tool-divider"></div>'
    + '<div class="sec-h">Distance &amp; Bearing</div>'
    + '<div class="field"><label class="flabel">Point 1</label><input class="finput" id="db-p1" placeholder="lat, lon"/></div>'
    + '<div class="field"><label class="flabel">Point 2</label><input class="finput" id="db-p2" placeholder="lat, lon"/></div>'
    + '<button class="sbtn sbtn-primary sbtn-full" onclick="runDistanceBearing()">Calculate</button>'
    + '<div id="db-result"></div>'
    + '<div class="tool-divider"></div>'
    + '<div class="sec-h">Waypoints</div>'
    + '<button class="sbtn ' + (drawMode==='waypoint'?'sbtn-primary':'') + ' sbtn-full" onclick="toggleWaypointMode()">' + (drawMode==='waypoint'?'Tap map to place \u2014 tap again to stop':'+ Drop waypoint (tap map)') + '</button>'
    + (waypoints.length ? '<div style="font-size:11px;color:var(--muted);margin-top:8px">' + waypoints.length + ' waypoint(s) placed</div>' : '');
}

// ════════════════════════════════════════════════════════
//  DRAW TOOLBAR & MAP CLICK ROUTING
// ════════════════════════════════════════════════════════

function updateDrawToolbar() {
  var el = document.getElementById('draw-toolbar');
  if (!el) return;
  if (drawMode === 'sector') {
    el.innerHTML = '<button class="draw-btn on">Sector: click points (' + sectorDraft.length + ')</button>'
      + '<button class="draw-btn" onclick="finishSectorDraw()">Finish</button>'
      + '<button class="draw-btn" onclick="cancelDraw()">Cancel</button>';
  } else if (drawMode === 'waypoint') {
    el.innerHTML = '<button class="draw-btn on">Waypoint mode: tap map</button>'
      + '<button class="draw-btn" onclick="cancelDraw()">Done</button>';
  } else {
    el.innerHTML = '';
  }
}

function handleMapClickForTools(e) {
  if (drawMode === 'sector') {
    sectorDraft.push([e.latlng.lat, e.latlng.lng]);
    if (window._draftLine) map.removeLayer(window._draftLine);
    if (sectorDraft.length > 1) {
      window._draftLine = L.polyline(sectorDraft, { color:'#f0821e', weight:2, dashArray:'4 4' }).addTo(map);
    }
    updateDrawToolbar();
    return true;
  }
  if (drawMode === 'waypoint') {
    placeWaypointAt(e.latlng.lat, e.latlng.lng);
    return true;
  }
  return false;
}

// ════════════════════════════════════════════════════════
//  COORD DISPLAY UNDER CURSOR
// ════════════════════════════════════════════════════════

function initCoordDisplay() {
  map.on('mousemove', function(e) {
    var el = document.getElementById('coord-display');
    if (el) el.textContent = e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
  });
}

// ════════════════════════════════════════════════════════
//  TAB INTEGRATION — extends the existing tabHTML() router
// ════════════════════════════════════════════════════════

function renderTabInto(tab, containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = sarTabHTML2(tab);
}

// ════════════════════════════════════════════════════════
//  MESH NETWORKS — Meshtastic (MQTT) + MeshCore (companion radio)
// ════════════════════════════════════════════════════════

var MESH_API = 'http://127.0.0.1:8731';
var meshtasticOn = false;
var meshcoreOn = false;
var meshtasticBroker = 'public';   // 'public' | 'custom'
var meshtasticCustomHost = '';
var meshtasticCustomPort = 1883;
var meshtasticCustomTLS = false;
var meshtasticCustomUser = '';
var meshtasticCustomPass = '';
var meshtasticTopic = 'msh/US/2/json';
var meshcoreTransport = 'serial';
var meshcoreAddress = '/dev/ttyUSB0';
var meshcorePorts = [];
var meshPollTimer = null;
var meshLastError = { meshtastic: null, meshcore: null };
var meshNodeIds = { meshtastic: {}, meshcore: {} }; // track which station entries are mesh-sourced

async function meshApiCall(path) {
  var r = await fetch(MESH_API + path);
  return r.json();
}

async function toggleMeshtastic() {
  if (meshtasticOn) {
    try { await meshApiCall('/mesh/meshtastic/stop'); } catch(e) {}
    meshtasticOn = false;
    removeMeshNodes('meshtastic');
    toast('Meshtastic disconnected');
  } else {
    var qs = new URLSearchParams();
    if (meshtasticBroker === 'custom') {
      qs.set('host', meshtasticCustomHost || 'localhost');
      qs.set('port', meshtasticCustomPort || 1883);
      qs.set('tls', meshtasticCustomTLS ? '1' : '0');
      qs.set('user', meshtasticCustomUser || '');
      qs.set('pass', meshtasticCustomPass || '');
      qs.set('topic', meshtasticTopic || 'msh/US/2/json');
    } else {
      qs.set('host', 'mqtt.meshtastic.org');
      qs.set('port', '1883');
      qs.set('topic', meshtasticTopic || 'msh/US/2/json');
    }
    try {
      var res = await meshApiCall('/mesh/meshtastic/start?' + qs.toString());
      meshtasticOn = true;
      toast('Connecting to Meshtastic broker\u2026');
      startMeshPolling();
    } catch(e) {
      toast('Mesh backend unreachable. Is the app fully started?');
    }
  }
  if (curTab === 'mesh') renderTabInto('mesh','tcont');
}

async function toggleMeshcore() {
  if (meshcoreOn) {
    try { await meshApiCall('/mesh/meshcore/stop'); } catch(e) {}
    meshcoreOn = false;
    removeMeshNodes('meshcore');
    toast('MeshCore disconnected');
  } else {
    var qs = new URLSearchParams({
      transport: meshcoreTransport,
      address: meshcoreAddress
    });
    try {
      var res = await meshApiCall('/mesh/meshcore/start?' + qs.toString());
      meshcoreOn = true;
      toast('Connecting to MeshCore device\u2026');
      startMeshPolling();
    } catch(e) {
      toast('Mesh backend unreachable. Is the app fully started?');
    }
  }
  if (curTab === 'mesh') renderTabInto('mesh','tcont');
}

async function refreshMeshcorePorts() {
  try {
    var res = await meshApiCall('/mesh/meshcore/ports');
    meshcorePorts = res.ports || [];
  } catch(e) { meshcorePorts = []; }
  if (curTab === 'mesh') renderTabInto('mesh','tcont');
}

function startMeshPolling() {
  if (meshPollTimer) return;
  meshPollTimer = setInterval(pollMeshStatus, 5000);
  pollMeshStatus();
}

function stopMeshPollingIfIdle() {
  if (!meshtasticOn && !meshcoreOn && meshPollTimer) {
    clearInterval(meshPollTimer);
    meshPollTimer = null;
  }
}

async function pollMeshStatus() {
  try {
    var status = await meshApiCall('/mesh/status');
    meshLastError.meshtastic = status.meshtastic.error;
    meshLastError.meshcore = status.meshcore.error;

    if (meshtasticOn) applyMeshNodes('meshtastic', status.meshtastic.nodes);
    if (meshcoreOn)   applyMeshNodes('meshcore', status.meshcore.nodes);

    if (curTab === 'mesh') renderTabInto('mesh','tcont');
  } catch(e) {
    // backend not reachable yet, keep trying silently
  }
}

function applyMeshNodes(protocol, nodesObj) {
  var symbolTag = protocol === 'meshtastic' ? 'MESHTASTIC' : 'MESHCORE';
  Object.keys(nodesObj).forEach(function(nodeId) {
    var n = nodesObj[nodeId];
    if (n.lat == null || n.lon == null) return;
    var stName = (protocol === 'meshtastic' ? 'MT-' : 'MC-') + (n.short_name || n.name || nodeId).toString().toUpperCase();
    var fakeStation = {
      name: stName,
      lat: n.lat, lng: n.lon,
      symbol: symbolTag,
      comment: n.long_name || n.name || nodeId,
      lasttime: Math.floor(n.last_update || (Date.now()/1000)),
      path: protocol === 'meshtastic' ? 'MQTT' : (meshcoreTransport.toUpperCase())
    };
    meshNodeIds[protocol][stName] = true;
    var i = stations.findIndex(function(s){return s.name===stName;});
    if (i >= 0) stations[i] = fakeStation; else stations.push(fakeStation);
    placeMark(fakeStation, false);
  });
  render();
}

function removeMeshNodes(protocol) {
  Object.keys(meshNodeIds[protocol]).forEach(function(stName) {
    if (markers[stName]) { map.removeLayer(markers[stName]); delete markers[stName]; }
    stations = stations.filter(function(s){return s.name!==stName;});
  });
  meshNodeIds[protocol] = {};
  render();
}

function meshHTML() {
  var mtBadge = meshtasticOn
    ? '<span class="badge" style="background:#1f3a2e;color:#3fb950">CONNECTING/LIVE</span>'
    : '<span class="badge" style="background:#1e2430;color:#8b949e">OFF</span>';
  var mcBadge = meshcoreOn
    ? '<span class="badge" style="background:#1f3a2e;color:#3fb950">CONNECTING/LIVE</span>'
    : '<span class="badge" style="background:#1e2430;color:#8b949e">OFF</span>';

  var mtCount = Object.keys(meshNodeIds.meshtastic).length;
  var mcCount = Object.keys(meshNodeIds.meshcore).length;

  var html = '';

  // ── Meshtastic section ──────────────────────────────────
  html += '<div class="sec-h">Meshtastic ' + mtBadge + '</div>';
  html += '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Connects over MQTT. Public broker shows low-precision positions (privacy feature). Use a private broker/channel for full accuracy.</div>';

  html += '<div class="frow field">'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text)"><input type="radio" name="mtbroker" ' + (meshtasticBroker==='public'?'checked':'') + ' onchange="meshtasticBroker=\'public\';renderTabInto(\'mesh\',\'tcont\')"/> Public broker</label>'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text)"><input type="radio" name="mtbroker" ' + (meshtasticBroker==='custom'?'checked':'') + ' onchange="meshtasticBroker=\'custom\';renderTabInto(\'mesh\',\'tcont\')"/> Private broker</label>'
    + '</div>';

  if (meshtasticBroker === 'custom') {
    html += '<div class="field"><input class="finput" placeholder="Broker host" value="' + meshtasticCustomHost + '" onchange="meshtasticCustomHost=this.value"/></div>'
      + '<div class="frow field">'
      + '<input class="finput" placeholder="Port" type="number" value="' + meshtasticCustomPort + '" onchange="meshtasticCustomPort=this.value"/>'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text)"><input type="checkbox" ' + (meshtasticCustomTLS?'checked':'') + ' onchange="meshtasticCustomTLS=this.checked"/> TLS</label>'
      + '</div>'
      + '<div class="frow field">'
      + '<input class="finput" placeholder="Username (optional)" value="' + meshtasticCustomUser + '" onchange="meshtasticCustomUser=this.value"/>'
      + '<input class="finput" type="password" placeholder="Password" value="' + meshtasticCustomPass + '" onchange="meshtasticCustomPass=this.value"/>'
      + '</div>';
  }
  html += '<div class="field"><label class="flabel">Topic root</label><input class="finput" value="' + meshtasticTopic + '" onchange="meshtasticTopic=this.value"/></div>';

  html += '<button class="sbtn ' + (meshtasticOn?'sbtn-red':'sbtn-primary') + ' sbtn-full" onclick="toggleMeshtastic()">' + (meshtasticOn ? 'Disconnect' : 'Connect') + '</button>';

  if (meshLastError.meshtastic) {
    html += '<div style="font-size:11px;color:var(--red);margin-top:6px">Error: ' + meshLastError.meshtastic + '</div>';
  }
  if (meshtasticOn) {
    html += '<div style="font-size:12px;color:var(--text);margin-top:8px">' + mtCount + ' node(s) with position on map</div>';
  }

  html += '<div class="tool-divider"></div>';

  // ── MeshCore section ─────────────────────────────────────
  html += '<div class="sec-h">MeshCore ' + mcBadge + '</div>';
  html += '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Requires a MeshCore companion radio connected to this computer (USB/Serial or BLE). No internet broker \u2014 local hardware only.</div>';

  html += '<div class="frow field">'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text)"><input type="radio" name="mctransport" ' + (meshcoreTransport==='serial'?'checked':'') + ' onchange="meshcoreTransport=\'serial\';renderTabInto(\'mesh\',\'tcont\')"/> USB/Serial</label>'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text)"><input type="radio" name="mctransport" ' + (meshcoreTransport==='ble'?'checked':'') + ' onchange="meshcoreTransport=\'ble\';renderTabInto(\'mesh\',\'tcont\')"/> Bluetooth</label>'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text)"><input type="radio" name="mctransport" ' + (meshcoreTransport==='tcp'?'checked':'') + ' onchange="meshcoreTransport=\'tcp\';renderTabInto(\'mesh\',\'tcont\')"/> Wi-Fi/TCP</label>'
    + '</div>';

  if (meshcoreTransport === 'serial') {
    var portOpts = meshcorePorts.length
      ? meshcorePorts.map(function(p){ return '<option value="'+p+'"' + (p===meshcoreAddress?' selected':'') + '>'+p+'</option>'; }).join('')
      : '<option value="">No devices found</option>';
    html += '<div class="frow field">'
      + '<select class="fselect" onchange="meshcoreAddress=this.value">' + portOpts + '</select>'
      + '<button class="sbtn" onclick="refreshMeshcorePorts()">&#8635;</button>'
      + '</div>';
  } else if (meshcoreTransport === 'ble') {
    html += '<div class="field"><input class="finput" placeholder="BLE MAC address (12:34:56:78:90:AB)" value="' + meshcoreAddress + '" onchange="meshcoreAddress=this.value"/></div>';
  } else {
    html += '<div class="field"><input class="finput" placeholder="IP address or hostname" value="' + meshcoreAddress + '" onchange="meshcoreAddress=this.value"/></div>';
  }

  html += '<button class="sbtn ' + (meshcoreOn?'sbtn-red':'sbtn-primary') + ' sbtn-full" onclick="toggleMeshcore()">' + (meshcoreOn ? 'Disconnect' : 'Connect') + '</button>';

  if (meshLastError.meshcore) {
    html += '<div style="font-size:11px;color:var(--red);margin-top:6px">Error: ' + meshLastError.meshcore + '</div>';
  }
  if (meshcoreOn) {
    html += '<div style="font-size:12px;color:var(--text);margin-top:8px">' + mcCount + ' node(s) with position on map</div>';
  }

  html += '<div class="tool-divider"></div>'
    + '<div style="font-size:11px;color:var(--muted)">Mesh nodes appear on the map with pink markers and a MESH badge in the station list, mixed in alongside APRS stations.</div>';

  return html;
}

function sarTabHTML2(t) {
  if (t === 'subjects') return subjectsHTML();
  if (t === 'search')   return searchHTML();
  if (t === 'tools')    return toolsHTML();
  if (t === 'roster')   return rosterHTML();
  if (t === 'log')      return logHTML();
  if (t === 'weather')  return weatherHTML();
  if (t === 'mesh')     return meshHTML();
  return tabHTML(t); // fall back to original stations/trail/sar/info
}
