/* ════════════════════════════════════════════════════════
   SAR TOOLKIT — core module
   W7CTY / 914 Communications
   ════════════════════════════════════════════════════════ */

// ════════════════════════════════════════════════════════
//  OPERATION PROFILES
// ════════════════════════════════════════════════════════
// Wraps subjects/sectors/roster/log/waypoints/SAR markers into a named,
// switchable, persisted container so a team can run separate searches
// without their data bleeding together, and can archive a closed search
// rather than losing it on the next "Clear".

var OPS_INDEX_KEY = 'aprs_tracker_operations_index_v1';
var OPS_DATA_PREFIX = 'aprs_tracker_operation_';
var currentOpId = null;
var currentOpName = 'Default';

function opsIndex() {
  try {
    var raw = localStorage.getItem(OPS_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function saveOpsIndex(idx) {
  try { localStorage.setItem(OPS_INDEX_KEY, JSON.stringify(idx)); } catch(e) {}
}

function currentOpStateBlob() {
  return {
    subjects: subjects, sectors: sectors, roster: roster,
    incidentLog: incidentLog, waypoints: waypoints,
    sarMarkers2: sarMarkers2, clueMarkers: clueMarkers,
    searchStartTime: searchStartTime,
    savedAt: Date.now()
  };
}

function saveCurrentOperation() {
  if (!currentOpId) return;
  try {
    localStorage.setItem(OPS_DATA_PREFIX + currentOpId, JSON.stringify(currentOpStateBlob()));
    var idx = opsIndex();
    var entry = idx.find(function(o){ return o.id === currentOpId; });
    if (entry) {
      entry.updatedAt = Date.now();
      entry.subjectCount = subjects.length;
      entry.sectorCount = sectors.length;
      saveOpsIndex(idx);
    }
  } catch(e) { console.log('Could not save operation:', e); }
}

function clearMapLayersForOpSwitch() {
  Object.keys(subjMarkers).forEach(function(id){ if (subjMarkers[id]) map.removeLayer(subjMarkers[id]); });
  Object.keys(sectorLayers).forEach(function(id){ if (sectorLayers[id]) map.removeLayer(sectorLayers[id]); });
  Object.keys(waypointLayers).forEach(function(id){ if (waypointLayers[id]) map.removeLayer(waypointLayers[id]); });
  Object.keys(sarMarkerLayers).forEach(function(id){ if (sarMarkerLayers[id]) map.removeLayer(sarMarkerLayers[id]); });
  Object.keys(rosterMarkers).forEach(function(id){ if (rosterMarkers[id]) map.removeLayer(rosterMarkers[id]); });
  subjMarkers = {}; sectorLayers = {}; waypointLayers = {}; sarMarkerLayers = {}; rosterMarkers = {};
}

function loadOperationData(opId) {
  try {
    var raw = localStorage.getItem(OPS_DATA_PREFIX + opId);
    var blob = raw ? JSON.parse(raw) : null;
    subjects = (blob && blob.subjects) || [];
    sectors = (blob && blob.sectors) || [];
    roster = (blob && blob.roster) || [];
    incidentLog = (blob && blob.incidentLog) || [];
    waypoints = (blob && blob.waypoints) || [];
    sarMarkers2 = (blob && blob.sarMarkers2) || {};
    clueMarkers = (blob && blob.clueMarkers) || [];
    searchStartTime = (blob && blob.searchStartTime) || null;
  } catch(e) {
    subjects = []; sectors = []; roster = []; incidentLog = [];
    waypoints = []; sarMarkers2 = {}; clueMarkers = []; searchStartTime = null;
  }
}

function redrawOperationOnMap() {
  subjects.forEach(function(s){ if (s.lastLat != null) placeSubjMarker(s); });
  sectors.forEach(function(s){ drawSectorLayer(s); });
  waypoints.forEach(function(wp, i) {
    var icon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;background:#f0821e;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#000;font-family:monospace">' + (i+1) + '</div>',
      iconSize:[22,22], iconAnchor:[11,11]
    });
    var m = L.marker([wp.lat, wp.lon], { icon: icon }).addTo(map);
    m.bindTooltip(htmlEscape(wp.label), { className:'aprs-label' });
    waypointLayers[wp.id] = m;
  });
  ['lkp','pls','ipp'].forEach(function(type) {
    if (sarMarkers2[type]) {
      var e = sarMarkers2[type];
      placeSarMarkerAtSilent(type, e.lat, e.lon, e.time);
    }
  });
  clueMarkers.forEach(function(c) { placeSarMarkerAtSilent('clue', c.lat, c.lon, c.time, c.id); });
  roster.forEach(function(m){ if (m.lastLat != null) placeRosterMarker(m); });
}

function createOperation(name) {
  name = (name || '').trim() || ('Operation ' + new Date().toLocaleDateString());
  var id = uid();
  var idx = opsIndex();
  idx.unshift({ id: id, name: name, createdAt: Date.now(), updatedAt: Date.now(), subjectCount: 0, sectorCount: 0, archived: false });
  saveOpsIndex(idx);

  // Save current op before switching away
  saveCurrentOperation();
  clearMapLayersForOpSwitch();

  currentOpId = id;
  currentOpName = name;
  subjects = []; sectors = []; roster = []; incidentLog = [];
  waypoints = []; sarMarkers2 = {}; clueMarkers = []; searchStartTime = null;
  saveCurrentOperation();
  localStorage.setItem('aprs_tracker_active_op_id', id);
  logEvent('Operation created: ' + name);
  toast('New operation: ' + name);
  if (curTab === 'log' || curTab === 'sarops') renderTabInto(curTab,'tcont');
}

function switchOperation(opId) {
  if (opId === currentOpId) return;
  saveCurrentOperation();
  clearMapLayersForOpSwitch();

  var idx = opsIndex();
  var entry = idx.find(function(o){ return o.id === opId; });
  if (!entry) { toast('Operation not found'); return; }

  currentOpId = opId;
  currentOpName = entry.name;
  loadOperationData(opId);
  redrawOperationOnMap();
  localStorage.setItem('aprs_tracker_active_op_id', opId);
  toast('Switched to: ' + entry.name);
  renderTabInto(curTab,'tcont');
}

function renameOperation(opId, newName) {
  newName = (newName || '').trim();
  if (!newName) return;
  var idx = opsIndex();
  var entry = idx.find(function(o){ return o.id === opId; });
  if (entry) {
    entry.name = newName;
    saveOpsIndex(idx);
    if (opId === currentOpId) currentOpName = newName;
    renderTabInto('operations','tcont');
  }
}

function archiveOperation(opId) {
  var idx = opsIndex();
  var entry = idx.find(function(o){ return o.id === opId; });
  if (!entry) return;
  entry.archived = !entry.archived;
  saveOpsIndex(idx);
  renderTabInto('operations','tcont');
  toast(entry.archived ? 'Operation archived' : 'Operation restored');
}

function deleteOperation(opId) {
  var idx = opsIndex();
  var entry = idx.find(function(o){ return o.id === opId; });
  if (!entry) return;
  if (!confirm('Permanently delete "' + entry.name + '" and all its data? This cannot be undone.')) return;
  localStorage.removeItem(OPS_DATA_PREFIX + opId);
  idx = idx.filter(function(o){ return o.id !== opId; });
  saveOpsIndex(idx);
  if (opId === currentOpId) {
    // Fall back to another op, or create a fresh default
    if (idx.length) {
      switchOperation(idx[0].id);
    } else {
      createOperation('Default');
    }
  }
  renderTabInto('operations','tcont');
  toast('Operation deleted');
}

function initOperations() {
  var idx = opsIndex();
  var lastActiveId = localStorage.getItem('aprs_tracker_active_op_id');
  if (!idx.length) {
    // First run: nothing to migrate, just create a fresh Default operation
    createOperation('Default');
    return;
  }
  var entry = idx.find(function(o){ return o.id === lastActiveId; }) || idx[0];
  currentOpId = entry.id;
  currentOpName = entry.name;
  loadOperationData(entry.id);
  redrawOperationOnMap();
}

function operationsHTML() {
  var idx = opsIndex();
  var active = idx.filter(function(o){ return !o.archived; });
  var archived = idx.filter(function(o){ return o.archived; });

  var html = '<div class="sec-h">Current Operation</div>'
    + '<div class="result-box" style="text-align:center;padding:14px">'
    + '<div class="rk">ACTIVE</div>'
    + '<div class="rv" style="font-size:16px">' + currentOpName + '</div>'
    + '</div>'
    + '<div class="field"><input class="finput" id="new-op-name" placeholder="New operation name"/></div>'
    + '<button class="sbtn sbtn-primary sbtn-full" onclick="createOperation(document.getElementById(\'new-op-name\').value)">+ New Operation</button>';

  html += '<div class="sec-h" style="margin-top:18px">All Operations (' + active.length + ')</div>';
  if (!active.length) {
    html += '<div class="empty">No operations yet.</div>';
  } else {
    active.forEach(function(o) {
      var isCurrent = o.id === currentOpId;
      html += '<div class="card' + (isCurrent ? ' sel' : '') + '" style="cursor:default">'
        + '<div style="display:flex;justify-content:space-between;align-items:center">'
        + '<span class="cc">' + o.name + (isCurrent ? ' <span class="badge" style="background:#1f3a2e;color:#3fb950">ACTIVE</span>' : '') + '</span>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + o.subjectCount + ' subject(s) &middot; ' + o.sectorCount + ' sector(s) &middot; updated ' + new Date(o.updatedAt).toLocaleString() + '</div>'
        + '<div class="subj-actions">'
        + (isCurrent ? '' : '<button class="sbtn sbtn-cyan" style="font-size:11px;padding:5px 8px" onclick="switchOperation(\'' + o.id + '\')">Switch To</button>')
        + '<button class="sbtn" style="font-size:11px;padding:5px 8px" onclick="var n=prompt(\'Rename operation:\',' + JSON.stringify(o.name) + ');if(n)renameOperation(\'' + o.id + '\',n)">Rename</button>'
        + '<button class="sbtn" style="font-size:11px;padding:5px 8px" onclick="archiveOperation(\'' + o.id + '\')">Archive</button>'
        + '<button class="sbtn sbtn-red" style="font-size:11px;padding:5px 8px" onclick="deleteOperation(\'' + o.id + '\')">Delete</button>'
        + '</div></div>';
    });
  }

  if (archived.length) {
    html += '<div class="sec-h" style="margin-top:18px">Archived (' + archived.length + ')</div>';
    archived.forEach(function(o) {
      html += '<div class="card" style="cursor:default;opacity:.7">'
        + '<span class="cc" style="font-size:13px">' + o.name + '</span>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + o.subjectCount + ' subject(s) &middot; ' + o.sectorCount + ' sector(s)</div>'
        + '<div class="subj-actions">'
        + '<button class="sbtn sbtn-cyan" style="font-size:11px;padding:5px 8px" onclick="switchOperation(\'' + o.id + '\')">Switch To</button>'
        + '<button class="sbtn" style="font-size:11px;padding:5px 8px" onclick="archiveOperation(\'' + o.id + '\')">Restore</button>'
        + '<button class="sbtn sbtn-red" style="font-size:11px;padding:5px 8px" onclick="deleteOperation(\'' + o.id + '\')">Delete</button>'
        + '</div></div>';
    });
  }

  return html;
}

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
var weatherData = null;

var SUBJ_COLORS = ['#f85149','#39d0d8','#e3b341','#c792ea','#3fb950','#f0821e','#58a6ff','#ff7eb6'];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// HTML-escapes any string before it's concatenated into an innerHTML
// string. MUST be used around every user-typed or remote-sourced field
// (subject/sector/roster names, log text, APRS message text/callsigns,
// etc.) before it's rendered -- without this, a crafted name or
// message (including ones received from other stations over the public
// APRS-IS network, not just local input) can inject and execute
// arbitrary script in the page.
function htmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}


function nowStr() {
  var d = new Date();
  return d.toTimeString().slice(0,8);
}

function logEvent(text, type) {
  type = type || 'auto';
  var now = new Date();
  incidentLog.unshift({
    id: uid(),
    time: nowStr(),
    date: now.toISOString().slice(0,10),  // YYYY-MM-DD, for grouping in history view
    epoch: now.getTime(),
    type: type,
    text: text
  });
  if (incidentLog.length > 2000) incidentLog.length = 2000; // cap so storage doesn't grow unbounded
  saveCurrentOperation();
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
      saveCurrentOperation();
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
  m.bindTooltip(htmlEscape(s.name) + (s.callsign ? ' ('+htmlEscape(s.callsign)+')' : ''), { permanent:true, direction:'top', offset:[0,-26], className:'aprs-label' });
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
        + '<div class="subj-head"><div class="subj-name"><span class="color-dot" style="background:' + s.color + '"></span>' + htmlEscape(s.name) + '</div>' + subjStatusBadge(s.status) + '</div>'
        + (s.callsign ? '<div class="subj-meta">APRS: ' + htmlEscape(s.callsign) + '</div>' : '')
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
  pendingSarMarkerType = null;
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
  poly.bindTooltip(htmlEscape(sector.name), { permanent: true, direction:'center', className:'aprs-label' });
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
        + '<div class="sector-head"><span class="sector-name">' + htmlEscape(s.name) + '</span>'
        + '<span class="sector-status ' + statusCls + '" onclick="cycleSectorStatus(\'' + s.id + '\')">' + statusLbl + '</span></div>'
        + '<div style="font-size:12px;color:var(--muted)">~' + areaMi2 + ' mi&sup2; &middot; ' + s.points.length + ' points</div>'
        + (s.assignedTo ? '<div style="font-size:12px;color:var(--text);margin-top:3px">Assigned: ' + htmlEscape(s.assignedTo) + '</div>' : '')
        + '<div class="subj-actions">'
        + '<button class="sbtn" style="font-size:11px;padding:5px 8px" onclick="map.fitBounds(L.latLngBounds(' + JSON.stringify(s.points) + ').pad(0.15))">View</button>'
        + '<button class="sbtn sbtn-cyan" style="font-size:11px;padding:5px 8px" onclick="printBriefing(\'' + s.id + '\')">&#128424; Briefing</button>'
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

// ── Typed SAR markers: LKP, PLS, IPP, Clue ─────────────────
// Distinct from generic numbered waypoints -- these carry SAR-specific
// meaning and only one LKP/PLS/IPP should exist at a time (re-placing
// moves it, doesn't stack), matching standard SAR planning practice.
var sarMarkerTypes = {
  lkp:  { label: 'LKP', name: 'Last Known Point',     color: '#f85149' },
  pls:  { label: 'PLS', name: 'Point Last Seen',       color: '#e3b341' },
  ipp:  { label: 'IPP', name: 'Initial Planning Point', color: '#39d0d8' },
  clue: { label: 'CLUE', name: 'Clue / Evidence',      color: '#c792ea' }
};
var sarMarkers2 = {}; // type -> {lat,lon,time} for lkp/pls/ipp (singletons)
var clueMarkers = []; // clues can be multiple
var sarMarkerLayers = {};
var pendingSarMarkerType = null;

function startSarMarkerPlacement(type) {
  pendingSarMarkerType = type;
  drawMode = 'sarmarker';
  toast('Tap the map to place ' + sarMarkerTypes[type].name);
  updateDrawToolbar();
}

function drawSarMarkerIcon(type, lat, lon, layerKey) {
  var info = sarMarkerTypes[type];
  if (sarMarkerLayers[layerKey]) map.removeLayer(sarMarkerLayers[layerKey]);
  var icon = L.divIcon({
    className: '',
    html: '<div style="width:30px;height:30px;background:' + info.color + ';border:3px solid #fff;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#000;font-family:monospace;box-shadow:0 2px 6px rgba(0,0,0,.5);transform:rotate(45deg)"><span style="transform:rotate(-45deg)">' + info.label + '</span></div>',
    iconSize:[30,30], iconAnchor:[15,15]
  });
  var m = L.marker([lat,lon], { icon: icon }).addTo(map);
  m.bindTooltip(info.name, { className:'aprs-label' });
  sarMarkerLayers[layerKey] = m;
  return m;
}

function placeSarMarkerAt(type, lat, lon) {
  var info = sarMarkerTypes[type];
  var entry = { lat: lat, lon: lon, time: nowStr() };

  if (type === 'clue') {
    entry.id = uid();
    clueMarkers.push(entry);
  } else {
    sarMarkers2[type] = entry; // singleton: lkp/pls/ipp each only one active
  }

  var layerKey = type === 'clue' ? entry.id : type;
  drawSarMarkerIcon(type, lat, lon, layerKey);

  logEvent(info.name + ' marked @ ' + lat.toFixed(5) + ',' + lon.toFixed(5), 'manual');
  toast(info.name + ' placed');
  saveCurrentOperation();
}

function placeSarMarkerAtSilent(type, lat, lon, time, existingId) {
  // Redraws a marker on the map without re-logging or re-saving --
  // used when an operation's saved data is loaded back in.
  var layerKey = type === 'clue' ? existingId : type;
  drawSarMarkerIcon(type, lat, lon, layerKey);
}

function removeSarMarker(type, id) {
  var layerKey = type === 'clue' ? id : type;
  if (sarMarkerLayers[layerKey]) { map.removeLayer(sarMarkerLayers[layerKey]); delete sarMarkerLayers[layerKey]; }
  if (type === 'clue') {
    clueMarkers = clueMarkers.filter(function(c){ return c.id !== id; });
  } else {
    delete sarMarkers2[type];
  }
  renderTabInto('sarops','tcont');
}

function toggleWaypointMode() {
  drawMode = drawMode === 'waypoint' ? null : 'waypoint';
  updateDrawToolbar();
  toast(drawMode === 'waypoint' ? 'Tap the map to drop waypoints' : 'Waypoint mode off');
}

// ════════════════════════════════════════════════════════
//  SEARCH OPERATIONAL TIMER
// ════════════════════════════════════════════════════════

var searchStartTime = null; // epoch ms, null = not running
var searchTimerInterval = null;

function startSearchTimer() {
  if (searchStartTime) return;
  searchStartTime = Date.now();
  logEvent('Search operation started', 'manual');
  if (searchTimerInterval) clearInterval(searchTimerInterval);
  searchTimerInterval = setInterval(function() {
    if (curTab === 'sarops') renderTabInto('sarops','tcont');
  }, 1000);
  renderTabInto('sarops','tcont');
}

function stopSearchTimer() {
  if (!searchStartTime) return;
  var elapsed = formatElapsed(Date.now() - searchStartTime);
  logEvent('Search operation ended \u2014 elapsed: ' + elapsed, 'manual');
  searchStartTime = null;
  if (searchTimerInterval) { clearInterval(searchTimerInterval); searchTimerInterval = null; }
  renderTabInto('sarops','tcont');
}

function formatElapsed(ms) {
  var totalSec = Math.floor(ms / 1000);
  var h = Math.floor(totalSec / 3600);
  var m = Math.floor((totalSec % 3600) / 60);
  var s = totalSec % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

// ════════════════════════════════════════════════════════
//  SWEEP WIDTH / SEARCH EFFORT ESTIMATOR
// ════════════════════════════════════════════════════════
// Simplified ground-search planning helper. Effective sweep width and
// POD tables vary by terrain/visibility/searcher training (see NSS
// ground search references) -- this gives a quick area-coverage time
// estimate for a single sector, not a substitute for a qualified
// search planner.

function runSweepEstimate() {
  var areaInput = document.getElementById('se-area').value;
  var sweepWidth = parseFloat(document.getElementById('se-sweep').value);
  var teamSpeed = parseFloat(document.getElementById('se-speed').value);
  var numTeams = parseInt(document.getElementById('se-teams').value) || 1;

  var areaMi2 = parseFloat(areaInput);
  if (!areaMi2 || !sweepWidth || !teamSpeed) {
    toast('Fill in area, sweep width, and team speed');
    return;
  }

  // Convert: area (mi²) -> ft², sweep width (ft), speed (mph) -> ft/hr
  var areaFt2 = areaMi2 * 27878400; // 1 sq mi = 27,878,400 sq ft
  var speedFtPerHr = teamSpeed * 5280;
  var coverageRatePerTeam = sweepWidth * speedFtPerHr; // ft² per hour per team
  var totalCoverageRate = coverageRatePerTeam * numTeams;
  var hoursNeeded = areaFt2 / totalCoverageRate;

  document.getElementById('se-result').innerHTML =
    '<div class="result-box"><div class="rk">ESTIMATED TIME TO SWEEP SECTOR</div><div class="rv">' + hoursNeeded.toFixed(1) + ' hours</div></div>'
  + '<div class="result-box"><div class="rk">WITH ' + numTeams + ' TEAM(S) AT ' + teamSpeed + ' MPH</div><div class="rv" style="font-size:13px">' + (hoursNeeded*60).toFixed(0) + ' minutes total</div></div>'
  + '<div style="font-size:11px;color:var(--muted);margin-top:8px">Rough estimate only \u2014 actual coverage depends on terrain, vegetation density, visibility, and searcher training (POD). Not a substitute for a qualified search planner.</div>';
}

function sarOpsHTML() {
  var html = '<div class="sec-h">Search Operation Timer</div>';
  if (searchStartTime) {
    var elapsed = formatElapsed(Date.now() - searchStartTime);
    html += '<div class="result-box" style="text-align:center;padding:16px">'
      + '<div class="rk">ELAPSED</div>'
      + '<div class="rv" style="font-size:28px;font-family:monospace">' + elapsed + '</div>'
      + '</div>'
      + '<button class="sbtn sbtn-red sbtn-full" onclick="stopSearchTimer()">Stop / Log End Time</button>';
  } else {
    html += '<button class="sbtn sbtn-primary sbtn-full" onclick="startSearchTimer()">&#9654; Start Search Timer</button>';
  }

  html += '<div class="tool-divider"></div>'
    + '<div class="sec-h">SAR Markers</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">Standard search-planning reference points. Tap a button, then tap the map.</div>';

  ['lkp','pls','ipp'].forEach(function(type) {
    var info = sarMarkerTypes[type];
    var existing = sarMarkers2[type];
    html += '<div class="frow" style="margin-bottom:6px">'
      + '<button class="sbtn ' + (pendingSarMarkerType===type && drawMode==='sarmarker' ? 'sbtn-primary' : '') + '" style="flex:2" onclick="startSarMarkerPlacement(\'' + type + '\')">' + info.label + ' \u2014 ' + info.name + '</button>'
      + (existing ? '<button class="sbtn sbtn-red" onclick="removeSarMarker(\'' + type + '\')">&#x2715;</button>' : '')
      + '</div>';
    if (existing) {
      html += '<div style="font-size:11px;color:var(--muted);margin:-2px 0 8px 4px">' + existing.lat.toFixed(5) + ', ' + existing.lon.toFixed(5) + ' &middot; ' + existing.time + '</div>';
    }
  });

  html += '<button class="sbtn ' + (pendingSarMarkerType==='clue' && drawMode==='sarmarker' ? 'sbtn-primary' : '') + ' sbtn-full" onclick="startSarMarkerPlacement(\'clue\')">+ CLUE \u2014 Mark Evidence/Clue</button>';
  if (clueMarkers.length) {
    html += '<div style="margin-top:8px">';
    clueMarkers.forEach(function(c, i) {
      html += '<div class="card" style="cursor:default;padding:8px 10px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center">'
        + '<span class="cc" style="font-size:12px">CLUE ' + (i+1) + '</span>'
        + '<button class="sbtn sbtn-red" style="font-size:10px;padding:3px 7px" onclick="removeSarMarker(\'clue\',\'' + c.id + '\')">&#x2715;</button>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--muted)">' + c.lat.toFixed(5) + ', ' + c.lon.toFixed(5) + ' &middot; ' + c.time + '</div>'
        + '</div>';
    });
    html += '</div>';
  }

  html += '<div class="tool-divider"></div>'
    + '<div class="sec-h">Sweep / Search Effort Estimate</div>'
    + '<div class="field"><label class="flabel">Sector area (sq mi)</label><input class="finput" id="se-area" type="number" step="0.01" placeholder="e.g. 0.5"/></div>'
    + '<div class="frow field">'
    + '<div style="flex:1"><label class="flabel">Sweep width (ft)</label><input class="finput" id="se-sweep" type="number" placeholder="e.g. 50"/></div>'
    + '<div style="flex:1"><label class="flabel">Team speed (mph)</label><input class="finput" id="se-speed" type="number" step="0.1" placeholder="e.g. 1.5"/></div>'
    + '</div>'
    + '<div class="field"><label class="flabel">Number of teams</label><input class="finput" id="se-teams" type="number" value="1" min="1"/></div>'
    + '<button class="sbtn sbtn-primary sbtn-full" onclick="runSweepEstimate()">Calculate</button>'
    + '<div id="se-result"></div>'
    + '<div class="tool-divider"></div>'
    + '<div class="sec-h">Printable Briefing</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">Print a one-page summary of the whole operation, or use the Briefing button on an individual sector card in the SEARCH tab for a per-team assignment sheet.</div>'
    + '<button class="sbtn sbtn-primary sbtn-full" onclick="printOperationSummary()">&#128424; Print Operation Summary</button>';

  return html;
}

// ════════════════════════════════════════════════════════
//  PERSONNEL / ROSTER
// ════════════════════════════════════════════════════════

function addRosterMember() {
  var name = document.getElementById('ros-name').value.trim();
  var cs   = document.getElementById('ros-call').value.trim().toUpperCase();
  var role = document.getElementById('ros-role').value.trim();
  if (!name) { toast('Enter a name'); return; }
  var member = { id: uid(), name: name, callsign: cs, role: role, status: 'staged', sector: '', notes: '', lastLat: null, lastLon: null, lastTime: null };
  roster.push(member);
  document.getElementById('ros-name').value = '';
  document.getElementById('ros-call').value = '';
  document.getElementById('ros-role').value = '';
  logEvent('Team member checked in: ' + name + (role?' ('+role+')':''));
  if (cs) refreshRosterPosition(member.id);
  renderTabInto('roster','tcont');
}

function setRosterStatus(id, status) {
  var m = roster.find(function(x){return x.id===id;});
  if (!m) return;
  m.status = status;
  logEvent(m.name + ' -> ' + status.toUpperCase());
  if (m.lastLat != null) placeRosterMarker(m); // recolor marker for new status
  renderTabInto('roster','tcont');
}

function removeRosterMember(id) {
  var m = roster.find(function(x){return x.id===id;});
  roster = roster.filter(function(x){return x.id!==id;});
  removeRosterMarker(id);
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

// ── Roster position tracking ─────────────────────────────────
// Mirrors how Subjects track an APRS callsign: if a roster member has
// a callsign, their position is pulled from aprs.fi and shown on the
// map, so the roster and the live map aren't two disconnected views
// of who's where.

var rosterMarkers = {};
var rosterAutoRefresh = false;
var rosterRefreshTimer = null;

async function refreshRosterPosition(id) {
  var m = roster.find(function(x){return x.id===id;});
  if (!m || !m.callsign) return;
  try {
    var en = await aprsGet({ name: m.callsign, what:'loc' });
    if (en.length) {
      m.lastLat = parseFloat(en[0].lat);
      m.lastLon = parseFloat(en[0].lng);
      m.lastTime = en[0].lasttime;
      placeRosterMarker(m);
      renderTabInto('roster','tcont');
      saveCurrentOperation();
    }
  } catch(e) {}
}

function refreshAllRoster() {
  var withCallsigns = roster.filter(function(m){ return m.callsign; });
  if (!withCallsigns.length) { toast('No roster members have a callsign set'); return; }
  withCallsigns.forEach(function(m){ refreshRosterPosition(m.id); });
  toast('Refreshing ' + withCallsigns.length + ' tracked member(s)\u2026');
}

function toggleRosterAutoRefresh() {
  rosterAutoRefresh = !rosterAutoRefresh;
  if (rosterAutoRefresh) {
    refreshAllRoster();
    rosterRefreshTimer = setInterval(refreshAllRoster, 60000);
    toast('Auto-tracking roster every 60s');
  } else {
    if (rosterRefreshTimer) { clearInterval(rosterRefreshTimer); rosterRefreshTimer = null; }
    toast('Roster auto-tracking off');
  }
  renderTabInto('roster','tcont');
}

function placeRosterMarker(m) {
  if (m.lastLat == null) return;
  if (rosterMarkers[m.id]) map.removeLayer(rosterMarkers[m.id]);
  var statusColor = { staged:'#e3b341', deployed:'#3fb950', returned:'#8b949e' }[m.status] || '#39d0d8';
  var icon = L.divIcon({
    className: '',
    html: '<div style="width:24px;height:24px;background:' + statusColor + ';border:2.5px solid #fff;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#000;font-family:monospace;box-shadow:0 2px 6px rgba(0,0,0,.5)">' + (m.name.charAt(0).toUpperCase()) + '</div>',
    iconSize:[24,24], iconAnchor:[12,12]
  });
  var mk = L.marker([m.lastLat, m.lastLon], { icon: icon }).addTo(map);
  mk.bindTooltip(htmlEscape(m.name) + ' (' + htmlEscape(m.callsign) + ')' + (m.role ? ' \u2014 '+htmlEscape(m.role) : ''), { className:'aprs-label' });
  mk.on('click', function() { focusRosterMember(m.id); });
  rosterMarkers[m.id] = mk;
}

function removeRosterMarker(id) {
  if (rosterMarkers[id]) { map.removeLayer(rosterMarkers[id]); delete rosterMarkers[id]; }
}

function focusRosterMember(id) {
  var m = roster.find(function(x){return x.id===id;});
  if (!m || m.lastLat == null) { toast('No position data for this team member yet'); return; }
  map.setView([m.lastLat, m.lastLon], 14);
}

function positionAgeLabel(lastTime) {
  if (!lastTime) return null;
  var ageSec = Math.floor(Date.now()/1000) - lastTime;
  if (ageSec < 120) return ageSec + 's ago';
  if (ageSec < 3600) return Math.floor(ageSec/60) + 'm ago';
  if (ageSec < 86400) return Math.floor(ageSec/3600) + 'h ago';
  return Math.floor(ageSec/86400) + 'd ago';
}

function rosterHTML() {
  var trackableCount = roster.filter(function(m){ return m.callsign; }).length;
  var html = '<div class="sec-h">Check In Personnel</div>'
    + '<div class="field"><input class="finput" id="ros-name" placeholder="Name"/></div>'
    + '<div class="frow field">'
    + '<input class="finput" id="ros-call" placeholder="Callsign (optional, enables tracking)" style="text-transform:uppercase"/>'
    + '<input class="finput" id="ros-role" placeholder="Role (e.g. Team Lead)"/>'
    + '</div>'
    + '<button class="sbtn sbtn-primary sbtn-full" onclick="addRosterMember()">+ Check In</button>';

  if (trackableCount) {
    html += '<div class="tool-divider"></div>'
      + '<div class="sec-h">Live Tracking</div>'
      + '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">' + trackableCount + ' member(s) have a callsign and can be tracked on the map, same as the SUBJ tab.</div>'
      + '<div class="frow">'
      + '<button class="sbtn sbtn-cyan" onclick="refreshAllRoster()">&#8635; Refresh Now</button>'
      + '<button class="sbtn ' + (rosterAutoRefresh?'sbtn-primary':'') + '" onclick="toggleRosterAutoRefresh()">' + (rosterAutoRefresh?'Auto ON (60s)':'Auto-Track Off') + '</button>'
      + '</div>';
  }

  html += '<div class="sec-h" style="margin-top:18px">Roster (' + roster.length + ')</div>';
  if (!roster.length) {
    html += '<div class="empty">No personnel checked in yet.</div>';
  } else {
    var sectorOpts = '<option value="">Unassigned</option>' + sectors.map(function(s){return '<option value="'+htmlEscape(s.name)+'">'+htmlEscape(s.name)+'</option>';}).join('');
    roster.forEach(function(m) {
      var stCls = { staged:'rst-staged', deployed:'rst-deployed', returned:'rst-returned' }[m.status];
      var posInfo = '';
      if (m.callsign) {
        if (m.lastLat != null) {
          var age = positionAgeLabel(m.lastTime);
          posInfo = '<div style="font-size:11px;color:var(--cyan);margin-top:3px">&#128205; ' + m.lastLat.toFixed(5) + ', ' + m.lastLon.toFixed(5) + (age ? ' &middot; ' + age : '') + '</div>';
        } else {
          posInfo = '<div style="font-size:11px;color:var(--muted);margin-top:3px">No position data yet</div>';
        }
      }
      html += '<div class="roster-card">'
        + '<div class="roster-head"><span class="roster-name">' + htmlEscape(m.name) + '</span><span class="subj-status ' + stCls + '">' + m.status.toUpperCase() + '</span></div>'
        + (m.role ? '<div style="font-size:12px;color:var(--muted)">' + htmlEscape(m.role) + (m.callsign?' &middot; '+htmlEscape(m.callsign):'') + '</div>' : (m.callsign?'<div style="font-size:12px;color:var(--muted)">'+htmlEscape(m.callsign)+'</div>':''))
        + posInfo
        + '<select class="fselect" style="margin-top:6px;font-size:12px;padding:5px 8px" onchange="assignRosterSector(\'' + m.id + '\',this.value)">' + sectorOpts.replace('value="'+htmlEscape(m.sector)+'"','value="'+htmlEscape(m.sector)+'" selected') + '</select>'
        + '<div class="subj-actions">'
        + (m.callsign && m.lastLat != null ? '<button class="sbtn sbtn-cyan" style="font-size:11px;padding:5px 8px" onclick="focusRosterMember(\'' + m.id + '\')">View</button>' : '')
        + (m.callsign ? '<button class="sbtn" style="font-size:11px;padding:5px 8px" onclick="refreshRosterPosition(\'' + m.id + '\')">&#8635;</button>' : '')
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

function clearLog() {
  if (!incidentLog.length) return;
  if (!confirm('Clear all ' + incidentLog.length + ' log entries? This cannot be undone. (Consider exporting first.)')) return;
  incidentLog = [];
  saveCurrentOperation();
  renderTabInto('log','tcont');
  toast('Log cleared');
}

function exportLog() {
  var lines = ['APRS TRACKER — INCIDENT LOG', 'Exported: ' + new Date().toString(), 'Robert W Donze - W7CTY / 914 Communications', ''];
  incidentLog.slice().reverse().forEach(function(e) {
    lines.push('[' + (e.date||'') + ' ' + e.time + '] ' + (e.type==='manual'?'(manual) ':'') + e.text);
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
    + '<button class="sbtn sbtn-red" onclick="clearLog()">&#x1F5D1; Clear</button>'
    + '</div>';
  html += '<div class="sec-h" style="margin-top:18px">History (' + incidentLog.length + ' entries, saved on this device)</div>';
  if (!incidentLog.length) {
    html += '<div class="empty">No log entries yet.<br>Events are logged automatically and saved permanently.</div>';
  } else {
    // Group entries by date for a real history view
    var lastDate = null;
    incidentLog.forEach(function(e) {
      var d = e.date || '';
      if (d !== lastDate) {
        var label = d;
        var today = new Date().toISOString().slice(0,10);
        var yest = new Date(Date.now() - 86400000).toISOString().slice(0,10);
        if (d === today) label = 'Today \u2014 ' + d;
        else if (d === yest) label = 'Yesterday \u2014 ' + d;
        html += '<div class="sec-h" style="margin-top:14px;color:var(--orange)">' + (label || 'Earlier') + '</div>';
        lastDate = d;
      }
      html += '<div class="log-entry ' + e.type + '"><div class="log-time">' + htmlEscape(e.time) + (e.type==='manual'?' &middot; MANUAL':'') + '</div><div class="log-text">' + htmlEscape(e.text) + '</div></div>';
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

  html += '<button class="sbtn sbtn-cyan sbtn-full" style="margin-top:10px" onclick="weatherData=null;loadWeather()">&#8635; Refresh weather</button>';

  return html;
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
    + (waypoints.length ? '<div style="font-size:11px;color:var(--muted);margin-top:8px">' + waypoints.length + ' waypoint(s) placed</div>' : '')
    + '<div class="tool-divider"></div>'
    + '<div class="sec-h">Import / Export (GPX / KML)</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">Share sectors and points with CalTopo, SARTopo, Garmin units, or ATAK.</div>'
    + '<div class="frow">'
    + '<button class="sbtn sbtn-cyan" onclick="exportGpx()">&#11015; Export GPX</button>'
    + '<button class="sbtn sbtn-cyan" onclick="exportKml()">&#11015; Export KML</button>'
    + '</div>'
    + '<button class="sbtn sbtn-full" style="margin-top:6px" onclick="triggerImportFile()">&#11014; Import GPX/KML File</button>'
    + '<input type="file" id="import-file-input" accept=".gpx,.kml" style="display:none" onchange="handleImportFile(this)"/>';
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
  } else if (drawMode === 'sarmarker') {
    var info = sarMarkerTypes[pendingSarMarkerType] || { name: 'marker' };
    el.innerHTML = '<button class="draw-btn on">Tap map to place ' + info.name + '</button>'
      + '<button class="draw-btn" onclick="cancelDraw()">Cancel</button>';
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
  if (drawMode === 'sarmarker' && pendingSarMarkerType) {
    placeSarMarkerAt(pendingSarMarkerType, e.latlng.lat, e.latlng.lng);
    drawMode = null;
    pendingSarMarkerType = null;
    updateDrawToolbar();
    if (curTab === 'sarops') renderTabInto('sarops','tcont');
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
    stopMeshPollingIfIdle();
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
    stopMeshPollingIfIdle();
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

    if (curTab !== 'mesh') return;
    // Targeted update only -- never rebuild the whole tab on a timer,
    // since that would wipe out broker host/port/username/password/
    // topic/BLE-address fields mid-typing.
    if (!updateMeshStatusOnly()) {
      renderTabInto('mesh','tcont'); // tab DOM wasn't mounted as expected, fall back
    }
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

// ════════════════════════════════════════════════════════
//  OFFLINE MAP TILES
// ════════════════════════════════════════════════════════
// Passive caching happens automatically (every tile viewed is cached
// by tile_cache.py as it's requested). This section adds the explicit
// "download this area before heading out" flow, plus cache stats and
// a way to clear the cache if disk space matters.

var TILE_CACHE_API = 'http://127.0.0.1:8732';
var offlineDownloadJobId = null;
var offlineDownloadPoll = null;
var offlineCacheStats = null;

async function tileCacheApiCall(path) {
  var r = await fetch(TILE_CACHE_API + path);
  return r.json();
}

async function refreshCacheStats() {
  try {
    offlineCacheStats = await tileCacheApiCall('/tilecache/stats');
  } catch(e) {
    offlineCacheStats = null;
  }
  if (curTab === 'offline') renderTabInto('offline','tcont');
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  var mb = bytes / (1024*1024);
  if (mb < 1) return (bytes/1024).toFixed(0) + ' KB';
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  return (mb/1024).toFixed(2) + ' GB';
}

async function startOfflineDownload() {
  if (currentBaseLayerName && currentBaseLayerName !== 'street') {
    toast('Offline download only caches the Street layer \u2014 switch to Street first (map layers button, top-left)');
    return;
  }
  var bounds = map.getBounds();
  var minZoom = parseInt(document.getElementById('od-minzoom').value) || 8;
  var maxZoom = parseInt(document.getElementById('od-maxzoom').value) || 14;
  if (maxZoom - minZoom > 8) {
    toast('Zoom range too wide \u2014 keep it to 8 levels or fewer to avoid downloading an enormous number of tiles');
    return;
  }
  var source = darkMode ? 'base_dark' : 'base_light';
  var qs = new URLSearchParams({
    source: source,
    north: bounds.getNorth(), south: bounds.getSouth(),
    east: bounds.getEast(), west: bounds.getWest(),
    minZoom: minZoom, maxZoom: maxZoom
  });
  try {
    var res = await tileCacheApiCall('/tilecache/download/start?' + qs.toString());
    if (res.result !== 'ok') { toast('Could not start download: ' + (res.description||'')); return; }
    offlineDownloadJobId = res.jobId;
    toast('Downloading current map view for offline use\u2026');
    if (offlineDownloadPoll) clearInterval(offlineDownloadPoll);
    offlineDownloadPoll = setInterval(pollOfflineDownload, 800);
    renderTabInto('offline','tcont');
  } catch(e) {
    toast('Tile cache backend unreachable. Is the app fully started?');
  }
}

var lastOfflineDownloadStatus = null;

async function pollOfflineDownload() {
  if (!offlineDownloadJobId) return;
  try {
    var status = await tileCacheApiCall('/tilecache/download/status?jobId=' + offlineDownloadJobId);
    lastOfflineDownloadStatus = status;
    if (status.status === 'complete') {
      clearInterval(offlineDownloadPoll);
      offlineDownloadPoll = null;
      logEvent('Offline area download complete: ' + status.total + ' tiles cached');
      toast('Offline download complete: ' + status.total + ' tiles cached');
      offlineDownloadJobId = null;
      lastOfflineDownloadStatus = null;
      refreshCacheStats();
    } else if (status.status === 'error' || status.status === 'not_found') {
      clearInterval(offlineDownloadPoll);
      offlineDownloadPoll = null;
      var errMsg = status.error || 'Download job lost track of its progress';
      logEvent('Offline area download failed: ' + errMsg);
      toast('Offline download failed: ' + errMsg);
      offlineDownloadJobId = null;
      lastOfflineDownloadStatus = null;
    }
    if (curTab === 'offline') renderTabInto('offline','tcont');
  } catch(e) {}
}

function cancelOfflineDownload() {
  if (!offlineDownloadJobId) return;
  tileCacheApiCall('/tilecache/download/cancel?jobId=' + offlineDownloadJobId).catch(function(){});
  if (offlineDownloadPoll) { clearInterval(offlineDownloadPoll); offlineDownloadPoll = null; }
  offlineDownloadJobId = null;
  lastOfflineDownloadStatus = null;
  toast('Download cancelled');
  renderTabInto('offline','tcont');
}

function clearTileCache() {
  if (!confirm('Clear all cached offline map tiles? You\'ll need internet (or a re-download) to view the map again until new tiles are cached.')) return;
  tileCacheApiCall('/tilecache/clear').then(function() {
    toast('Offline tile cache cleared');
    refreshCacheStats();
  }).catch(function(){ toast('Could not clear cache'); });
}

function offlineHTML() {
  var html = '<div class="sec-h">Offline Map Tiles</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Downloads street-map tiles (the CartoCDN base layer) for the current map view so they\u2019re available with no signal. Topo/Satellite/Nat Geo layers are not cached for offline use \u2014 switch to Street before downloading an area.</div>';

  if (offlineDownloadJobId) {
    var pct = 0, doneCount = 0, totalCount = 0;
    if (lastOfflineDownloadStatus && lastOfflineDownloadStatus.total) {
      doneCount = lastOfflineDownloadStatus.done || 0;
      totalCount = lastOfflineDownloadStatus.total || 0;
      pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
    }
    html += '<div class="result-box" style="text-align:center;padding:14px">'
      + '<div class="rk">DOWNLOADING\u2026</div>'
      + '<div class="rv" style="font-size:20px">' + (totalCount ? (doneCount.toLocaleString() + ' / ' + totalCount.toLocaleString() + ' tiles') : 'Starting\u2026') + '</div>'
      + (totalCount ? '<div style="background:var(--border);border-radius:4px;height:8px;margin-top:10px;overflow:hidden"><div style="background:var(--orange);height:100%;width:' + pct + '%;transition:width .3s"></div></div><div style="font-size:11px;color:var(--muted);margin-top:4px">' + pct + '%</div>' : '')
      + '</div>'
      + '<button class="sbtn sbtn-red sbtn-full" onclick="cancelOfflineDownload()">Cancel Download</button>';
  } else {
    html += '<div style="font-size:12px;color:var(--text);margin-bottom:6px">Downloads the area currently visible on the map.</div>'
      + '<div class="frow field">'
      + '<div style="flex:1"><label class="flabel">Min zoom</label><input class="finput" id="od-minzoom" type="number" value="' + Math.max(0, map.getZoom()-3) + '" min="0" max="19"/></div>'
      + '<div style="flex:1"><label class="flabel">Max zoom</label><input class="finput" id="od-maxzoom" type="number" value="' + Math.min(19, map.getZoom()+3) + '" min="0" max="19"/></div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Wider zoom ranges and larger map areas mean more tiles \u2014 keep the range tight for a fast download.</div>'
      + '<button class="sbtn sbtn-primary sbtn-full" onclick="startOfflineDownload()">&#11015; Download Current View</button>';
  }

  html += '<div class="tool-divider"></div>'
    + '<div class="sec-h">Cache Status</div>';

  if (offlineCacheStats) {
    html += '<div class="result-box"><div class="rk">TILES CACHED</div><div class="rv">' + offlineCacheStats.total_count.toLocaleString() + '</div></div>'
      + '<div class="result-box"><div class="rk">DISK USAGE</div><div class="rv">' + formatBytes(offlineCacheStats.total_bytes) + '</div></div>';
  } else {
    html += '<div class="empty">Loading cache stats\u2026</div>';
  }

  html += '<button class="sbtn sbtn-cyan sbtn-full" style="margin-top:8px" onclick="refreshCacheStats()">&#8635; Refresh Stats</button>'
    + '<button class="sbtn sbtn-red sbtn-full" style="margin-top:6px" onclick="clearTileCache()">&#x1F5D1; Clear Offline Cache</button>';

  if (!offlineCacheStats) refreshCacheStats();

  return html;
}

// ════════════════════════════════════════════════════════
//  APRS-IS TWO-WAY MESSAGING
// ════════════════════════════════════════════════════════
// aprs.fi's API is read-only. Real APRS text messaging requires a
// connection to APRS-IS itself, bridged through aprs_messaging.py the
// same way Meshtastic MQTT is bridged through mesh_backend.py.

var MSG_API = 'http://127.0.0.1:8733';
var msgConnected = false;
var msgCallsign = '';
var msgError = null;
var msgList = [];
var msgPollTimer = null;
var msgComposeTo = '';

async function msgApiCall(path) {
  var r = await fetch(MSG_API + path);
  return r.json();
}

async function toggleMessaging() {
  if (msgConnected) {
    try { await msgApiCall('/msg/stop'); } catch(e) {}
    msgConnected = false;
    if (msgPollTimer) { clearInterval(msgPollTimer); msgPollTimer = null; }
    toast('APRS messaging disconnected');
  } else {
    var callsign = document.getElementById('msg-callsign').value.trim().toUpperCase();
    if (!callsign) { toast('Enter your callsign (with SSID if applicable, e.g. W7CTY-9)'); return; }
    var qs = new URLSearchParams({ callsign: callsign });
    try {
      var res = await msgApiCall('/msg/start?' + qs.toString());
      if (res.result !== 'ok') { toast('Could not start: ' + (res.description||'')); return; }
      toast('Connecting to APRS-IS as ' + callsign + '\u2026');
      if (msgPollTimer) clearInterval(msgPollTimer);
      msgPollTimer = setInterval(pollMessages, 4000);
      pollMessages();
    } catch(e) {
      toast('Messaging backend unreachable. Is the app fully started?');
    }
  }
  if (curTab === 'msg') renderTabInto('msg','tcont');
}

async function pollMessages() {
  try {
    var status = await msgApiCall('/msg/status');
    var wasConnected = msgConnected;
    msgConnected = status.connected;
    msgCallsign = status.callsign;
    msgError = status.error;
    msgList = status.messages || [];

    if (curTab !== 'msg') return;

    // Connection state flipping changes which whole sections are shown
    // (callsign field vs. To/Message fields) -- that genuinely needs a
    // full rebuild. Otherwise, only touch the message list/badge/error
    // so the To/Message inputs are never wiped out from under someone
    // who's mid-typing.
    if (wasConnected !== msgConnected) {
      renderTabInto('msg','tcont');
    } else if (!updateMsgListOnly()) {
      renderTabInto('msg','tcont'); // tab DOM wasn't mounted as expected, fall back
    }
  } catch(e) {}
}

async function sendAprsMessage() {
  var to = document.getElementById('msg-to').value.trim().toUpperCase();
  var text = document.getElementById('msg-text').value.trim();
  if (!to || !text) { toast('Enter a recipient callsign and a message'); return; }
  if (text.length > 67) { toast('Message too long (max 67 chars for APRS)'); return; }
  try {
    var res = await msgApiCall('/msg/send?to=' + encodeURIComponent(to) + '&text=' + encodeURIComponent(text));
    if (res.result === 'ok') {
      document.getElementById('msg-text').value = '';
      logEvent('APRS message sent to ' + to + ': ' + text);
      toast('Message sent to ' + to);
      pollMessages();
    } else {
      toast('Send failed: ' + (res.description||''));
    }
  } catch(e) {
    toast('Could not send \u2014 messaging backend unreachable');
  }
}

function msgHTML() {
  var badge = msgConnected
    ? '<span class="badge" style="background:#1f3a2e;color:#3fb950">CONNECTED' + (msgCallsign ? ' AS ' + msgCallsign : '') + '</span>'
    : '<span class="badge" style="background:#1e2430;color:#8b949e">OFF</span>';

  var html = '<div class="sec-h">APRS Text Messaging <span id="msg-badge-slot">' + badge + '</span></div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Real two-way APRS messaging over APRS-IS \u2014 separate from aprs.fi position lookups. Requires your callsign to derive a sending passcode automatically.</div>';

  if (!msgConnected) {
    html += '<div class="field"><label class="flabel">Your callsign (with SSID)</label><input class="finput" id="msg-callsign" placeholder="e.g. W7CTY-9" value="' + (msgCallsign||'') + '"/></div>'
      + '<button class="sbtn sbtn-primary sbtn-full" onclick="toggleMessaging()">Connect to APRS-IS</button>';
  } else {
    html += '<button class="sbtn sbtn-red sbtn-full" onclick="toggleMessaging()">Disconnect</button>';
  }

  html += '<div id="msg-error-slot">' + (msgError ? '<div style="font-size:11px;color:var(--red);margin-top:6px">Error: ' + msgError + '</div>' : '') + '</div>';

  if (msgConnected) {
    html += '<div class="tool-divider"></div>'
      + '<div class="sec-h">Send Message</div>'
      + '<div class="field"><label class="flabel">To callsign</label><input class="finput" id="msg-to" placeholder="e.g. KD4ABC-9"/></div>'
      + '<div class="field"><label class="flabel">Message (max 67 chars)</label><textarea class="ftextarea" id="msg-text" maxlength="67" placeholder="Message text..."></textarea></div>'
      + '<button class="sbtn sbtn-primary sbtn-full" onclick="sendAprsMessage()">Send</button>';
  }

  html += '<div class="tool-divider"></div>'
    + '<div class="sec-h" id="msg-count-slot">Messages (' + msgList.length + ')</div>'
    + '<div id="msg-list-slot">' + msgListInnerHTML() + '</div>';

  return html;
}

function msgListInnerHTML() {
  if (!msgList.length) {
    return '<div class="empty">No messages yet.' + (msgConnected ? '' : '<br>Connect to APRS-IS to send and receive.') + '</div>';
  }
  var html = '';
  msgList.forEach(function(m) {
    var isOut = m.direction === 'out';
    html += '<div class="card" style="cursor:default">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<span class="cc" style="font-size:12px">' + (isOut ? '\u2192 ' + htmlEscape(m.to) : '\u2190 ' + htmlEscape(m.from)) + '</span>'
      + (isOut ? '<span class="badge" style="background:' + (m.acked?'#1f3a2e':'#3a2f1f') + ';color:' + (m.acked?'#3fb950':'#e3b341') + '">' + (m.acked?'ACKED':'SENT') + '</span>' : '')
      + '</div>'
      + '<div class="cn">' + htmlEscape(m.text) + '</div>'
      + '<div class="cm"><span>' + htmlEscape(m.time) + '</span></div>'
      + '</div>';
  });
  return html;
}

// Updates only the message list, badge, and error slot inside the MSG
// tab without touching the rest of the DOM -- critical so the To/
// Message input fields are never destroyed mid-typing by the 4s poll.
// A full renderTabInto('msg', ...) is only used for state changes that
// actually need to show/hide whole sections (connect/disconnect).
function updateMsgListOnly() {
  var listSlot = document.getElementById('msg-list-slot');
  var countSlot = document.getElementById('msg-count-slot');
  var badgeSlot = document.getElementById('msg-badge-slot');
  var errorSlot = document.getElementById('msg-error-slot');
  if (!listSlot) return false; // tab isn't mounted (different tab active) -- caller should fall back
  listSlot.innerHTML = msgListInnerHTML();
  if (countSlot) countSlot.textContent = 'Messages (' + msgList.length + ')';
  if (badgeSlot) {
    badgeSlot.innerHTML = msgConnected
      ? '<span class="badge" style="background:#1f3a2e;color:#3fb950">CONNECTED' + (msgCallsign ? ' AS ' + msgCallsign : '') + '</span>'
      : '<span class="badge" style="background:#1e2430;color:#8b949e">OFF</span>';
  }
  if (errorSlot) {
    errorSlot.innerHTML = msgError ? '<div style="font-size:11px;color:var(--red);margin-top:6px">Error: ' + msgError + '</div>' : '';
  }
  return true;
}

function meshHTML() {
  var mtCount = Object.keys(meshNodeIds.meshtastic).length;
  var mcCount = Object.keys(meshNodeIds.meshcore).length;

  var html = '';

  // ── Meshtastic section ──────────────────────────────────
  html += '<div class="sec-h">Meshtastic <span id="mt-badge-slot">' + meshBadgeHTML(meshtasticOn) + '</span></div>';
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

  html += '<div id="mt-error-slot">' + (meshLastError.meshtastic ? '<div style="font-size:11px;color:var(--red);margin-top:6px">Error: ' + meshLastError.meshtastic + '</div>' : '') + '</div>';
  html += '<div id="mt-count-slot">' + (meshtasticOn ? '<div style="font-size:12px;color:var(--text);margin-top:8px">' + mtCount + ' node(s) with position on map</div>' : '') + '</div>';

  html += '<div class="tool-divider"></div>';

  // ── MeshCore section ─────────────────────────────────────
  html += '<div class="sec-h">MeshCore <span id="mc-badge-slot">' + meshBadgeHTML(meshcoreOn) + '</span></div>';
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

  html += '<div id="mc-error-slot">' + (meshLastError.meshcore ? '<div style="font-size:11px;color:var(--red);margin-top:6px">Error: ' + meshLastError.meshcore + '</div>' : '') + '</div>';
  html += '<div id="mc-count-slot">' + (meshcoreOn ? '<div style="font-size:12px;color:var(--text);margin-top:8px">' + mcCount + ' node(s) with position on map</div>' : '') + '</div>';

  html += '<div class="tool-divider"></div>'
    + '<div style="font-size:11px;color:var(--muted)">Mesh nodes appear on the map with pink markers and a MESH badge in the station list, mixed in alongside APRS stations.</div>';

  return html;
}

function meshBadgeHTML(isOn) {
  return isOn
    ? '<span class="badge" style="background:#1f3a2e;color:#3fb950">CONNECTING/LIVE</span>'
    : '<span class="badge" style="background:#1e2430;color:#8b949e">OFF</span>';
}

// Updates only the badges/errors/node-counts inside the MESH tab without
// touching the rest of the DOM -- same reasoning as updateMsgListOnly:
// the broker host/port/username/password/topic/BLE-address fields must
// never be rebuilt out from under someone mid-typing by the 5s poll.
function updateMeshStatusOnly() {
  var mtBadge = document.getElementById('mt-badge-slot');
  var mcBadge = document.getElementById('mc-badge-slot');
  if (!mtBadge && !mcBadge) return false; // tab isn't mounted, caller falls back

  if (mtBadge) mtBadge.innerHTML = meshBadgeHTML(meshtasticOn);
  if (mcBadge) mcBadge.innerHTML = meshBadgeHTML(meshcoreOn);

  var mtErr = document.getElementById('mt-error-slot');
  if (mtErr) mtErr.innerHTML = meshLastError.meshtastic ? '<div style="font-size:11px;color:var(--red);margin-top:6px">Error: ' + meshLastError.meshtastic + '</div>' : '';
  var mcErr = document.getElementById('mc-error-slot');
  if (mcErr) mcErr.innerHTML = meshLastError.meshcore ? '<div style="font-size:11px;color:var(--red);margin-top:6px">Error: ' + meshLastError.meshcore + '</div>' : '';

  var mtCount = Object.keys(meshNodeIds.meshtastic).length;
  var mcCount = Object.keys(meshNodeIds.meshcore).length;
  var mtCountEl = document.getElementById('mt-count-slot');
  if (mtCountEl) mtCountEl.innerHTML = meshtasticOn ? '<div style="font-size:12px;color:var(--text);margin-top:8px">' + mtCount + ' node(s) with position on map</div>' : '';
  var mcCountEl = document.getElementById('mc-count-slot');
  if (mcCountEl) mcCountEl.innerHTML = meshcoreOn ? '<div style="font-size:12px;color:var(--text);margin-top:8px">' + mcCount + ' node(s) with position on map</div>' : '';

  return true;
}

// ════════════════════════════════════════════════════════
//  GPX / KML IMPORT-EXPORT
// ════════════════════════════════════════════════════════
// Interop with CalTopo, SARTopo, Garmin units, ATAK, and other SAR
// software, which standardize on GPX and KML for sharing search areas
// and points of interest.

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function downloadTextFile(filename, mimeType, content) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

function buildGpxDocument() {
  var wpts = [];
  var trks = [];

  // Subjects with known position
  subjects.forEach(function(s) {
    if (s.lastLat != null) {
      wpts.push('<wpt lat="' + s.lastLat + '" lon="' + s.lastLon + '"><name>' + xmlEscape(s.name) + '</name><desc>' + xmlEscape('Subject' + (s.callsign?' ('+s.callsign+')':'') + ' - ' + s.status) + '</desc><sym>Flag, Blue</sym></wpt>');
    }
  });

  // Generic waypoints
  waypoints.forEach(function(wp) {
    wpts.push('<wpt lat="' + wp.lat + '" lon="' + wp.lon + '"><name>' + xmlEscape(wp.label) + '</name><desc>Waypoint placed ' + xmlEscape(wp.time) + '</desc></wpt>');
  });

  // Roster members with known position (tracked via callsign)
  roster.forEach(function(m) {
    if (m.lastLat != null) {
      wpts.push('<wpt lat="' + m.lastLat + '" lon="' + m.lastLon + '"><name>' + xmlEscape(m.name) + '</name><desc>' + xmlEscape((m.role||'Team member') + ' (' + m.callsign + ') - ' + m.status) + '</desc><sym>Flag, Green</sym></wpt>');
    }
  });

  // SAR singleton markers (LKP/PLS/IPP)
  ['lkp','pls','ipp'].forEach(function(type) {
    var e = sarMarkers2[type];
    if (e) {
      var info = sarMarkerTypes[type];
      wpts.push('<wpt lat="' + e.lat + '" lon="' + e.lon + '"><name>' + xmlEscape(info.label) + '</name><desc>' + xmlEscape(info.name) + ' - ' + xmlEscape(e.time) + '</desc><sym>Flag, Red</sym></wpt>');
    }
  });

  // Clue markers
  clueMarkers.forEach(function(c, i) {
    wpts.push('<wpt lat="' + c.lat + '" lon="' + c.lon + '"><name>' + xmlEscape('CLUE ' + (i+1)) + '</name><desc>Clue/evidence - ' + xmlEscape(c.time) + '</desc><sym>Flag, Yellow</sym></wpt>');
  });

  // Sectors as closed tracks (GPX has no native polygon, tracks are the
  // standard workaround used by CalTopo/SARTopo exports too)
  sectors.forEach(function(sec) {
    var pts = sec.points.map(function(p) {
      return '<trkpt lat="' + p[0] + '" lon="' + p[1] + '"></trkpt>';
    }).join('');
    // close the loop
    if (sec.points.length) {
      var first = sec.points[0];
      pts += '<trkpt lat="' + first[0] + '" lon="' + first[1] + '"></trkpt>';
    }
    trks.push('<trk><name>' + xmlEscape(sec.name) + ' (' + sec.status + ')</name><trkseg>' + pts + '</trkseg></trk>');
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<gpx version="1.1" creator="APRS Tracker - Robert W Donze - W7CTY" xmlns="http://www.topografix.com/GPX/1/1">\n'
    + '<metadata><name>' + xmlEscape(currentOpName) + '</name><time>' + new Date().toISOString() + '</time></metadata>\n'
    + wpts.join('\n') + '\n'
    + trks.join('\n') + '\n'
    + '</gpx>';
}

function buildKmlDocument() {
  var placemarks = [];

  subjects.forEach(function(s) {
    if (s.lastLat != null) {
      placemarks.push('<Placemark><name>' + xmlEscape(s.name) + '</name><description>' + xmlEscape('Subject' + (s.callsign?' ('+s.callsign+')':'') + ' - ' + s.status) + '</description><Point><coordinates>' + s.lastLon + ',' + s.lastLat + ',0</coordinates></Point></Placemark>');
    }
  });

  waypoints.forEach(function(wp) {
    placemarks.push('<Placemark><name>' + xmlEscape(wp.label) + '</name><description>Waypoint placed ' + xmlEscape(wp.time) + '</description><Point><coordinates>' + wp.lon + ',' + wp.lat + ',0</coordinates></Point></Placemark>');
  });

  roster.forEach(function(m) {
    if (m.lastLat != null) {
      placemarks.push('<Placemark><name>' + xmlEscape(m.name) + '</name><description>' + xmlEscape((m.role||'Team member') + ' (' + m.callsign + ') - ' + m.status) + '</description><Point><coordinates>' + m.lastLon + ',' + m.lastLat + ',0</coordinates></Point></Placemark>');
    }
  });

  ['lkp','pls','ipp'].forEach(function(type) {
    var e = sarMarkers2[type];
    if (e) {
      var info = sarMarkerTypes[type];
      placemarks.push('<Placemark><name>' + xmlEscape(info.label) + '</name><description>' + xmlEscape(info.name) + '</description><Point><coordinates>' + e.lon + ',' + e.lat + ',0</coordinates></Point></Placemark>');
    }
  });

  clueMarkers.forEach(function(c, i) {
    placemarks.push('<Placemark><name>' + xmlEscape('CLUE ' + (i+1)) + '</name><description>Clue/evidence - ' + xmlEscape(c.time) + '</description><Point><coordinates>' + c.lon + ',' + c.lat + ',0</coordinates></Point></Placemark>');
  });

  sectors.forEach(function(sec) {
    var coords = sec.points.map(function(p) { return p[1] + ',' + p[0] + ',0'; }).join(' ');
    if (sec.points.length) {
      var first = sec.points[0];
      coords += ' ' + first[1] + ',' + first[0] + ',0';
    }
    placemarks.push('<Placemark><name>' + xmlEscape(sec.name) + '</name><description>Status: ' + xmlEscape(sec.status) + '</description>'
      + '<Style><LineStyle><color>ff1e82f0</color><width>2</width></LineStyle><PolyStyle><color>4d1e82f0</color></PolyStyle></Style>'
      + '<Polygon><outerBoundaryIs><LinearRing><coordinates>' + coords + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>');
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + xmlEscape(currentOpName) + '</name>\n'
    + placemarks.join('\n') + '\n'
    + '</Document></kml>';
}

// ════════════════════════════════════════════════════════
//  PRINTABLE BRIEFING SHEETS
// ════════════════════════════════════════════════════════
// Builds a hidden print-only DOM section, then calls window.print().
// WebKitGTK shows its native print dialog automatically on
// window.print() with no Python-side wiring needed.

function ensurePrintContainer() {
  var el = document.getElementById('print-sheet');
  if (!el) {
    el = document.createElement('div');
    el.id = 'print-sheet';
    document.body.appendChild(el);
  }
  return el;
}

function printBriefing(sectorId) {
  var s = sectors.find(function(x){ return x.id === sectorId; });
  if (!s) { toast('Sector not found'); return; }

  var areaKm2 = sectorAreaKm2(s.points);
  var areaMi2 = (areaKm2 * 0.386102).toFixed(2);
  var assignedMembers = roster.filter(function(m){ return m.sector === s.name; });
  var center = s.points.length ? L.latLngBounds(s.points).getCenter() : null;

  var html = '<div class="print-page">'
    + '<div class="print-header">'
    + '<div class="print-title">SECTOR ASSIGNMENT BRIEFING</div>'
    + '<div class="print-sub">' + xmlEscape(currentOpName) + ' &middot; Generated ' + new Date().toLocaleString() + '</div>'
    + '</div>'
    + '<table class="print-table">'
    + '<tr><th>Sector</th><td>' + xmlEscape(s.name) + '</td></tr>'
    + '<tr><th>Status</th><td>' + s.status.toUpperCase() + '</td></tr>'
    + '<tr><th>Area</th><td>~' + areaMi2 + ' sq mi</td></tr>'
    + '<tr><th>Center</th><td>' + (center ? center.lat.toFixed(5) + ', ' + center.lng.toFixed(5) : '\u2014') + '</td></tr>'
    + '<tr><th>Assigned Team</th><td>' + (assignedMembers.length ? assignedMembers.map(function(m){return xmlEscape(m.name) + (m.callsign?' ('+m.callsign+')':'');}).join(', ') : (s.assignedTo ? xmlEscape(s.assignedTo) : '\u2014')) + '</td></tr>'
    + '</table>'
    + '<div class="print-section-title">Sector Boundary Points</div>'
    + '<table class="print-table">'
    + s.points.map(function(p, i) {
        return '<tr><th>Point ' + (i+1) + '</th><td>' + p[0].toFixed(5) + ', ' + p[1].toFixed(5) + '</td></tr>';
      }).join('')
    + '</table>'
    + (s.notes ? '<div class="print-section-title">Notes</div><div class="print-notes">' + xmlEscape(s.notes) + '</div>' : '')
    + '<div class="print-section-title">Search Notes / Findings (fill in)</div>'
    + '<div class="print-blank-lines"></div><div class="print-blank-lines"></div><div class="print-blank-lines"></div><div class="print-blank-lines"></div>'
    + '<div class="print-footer">Robert W Donze - W7CTY &middot; 914 Communications &middot; APRS Tracker</div>'
    + '</div>';

  ensurePrintContainer().innerHTML = html;
  document.body.classList.add('printing');
  window.print();
  setTimeout(function(){ document.body.classList.remove('printing'); }, 500);
  logEvent('Printed briefing sheet for ' + s.name);
}

function printOperationSummary() {
  var elapsedStr = searchStartTime ? formatElapsed(Date.now() - searchStartTime) : 'Not started';

  var subjRows = subjects.map(function(s) {
    return '<tr><td>' + xmlEscape(s.name) + '</td><td>' + xmlEscape(s.callsign||'\u2014') + '</td><td>' + s.status.toUpperCase() + '</td><td>' + (s.lastLat!=null ? s.lastLat.toFixed(5)+', '+s.lastLon.toFixed(5) : '\u2014') + '</td></tr>';
  }).join('');

  var sectorRows = sectors.map(function(s) {
    var areaMi2 = (sectorAreaKm2(s.points) * 0.386102).toFixed(2);
    return '<tr><td>' + xmlEscape(s.name) + '</td><td>' + s.status.toUpperCase() + '</td><td>~' + areaMi2 + ' mi&sup2;</td><td>' + xmlEscape(s.assignedTo||'\u2014') + '</td></tr>';
  }).join('');

  var rosterRows = roster.map(function(m) {
    return '<tr><td>' + xmlEscape(m.name) + '</td><td>' + xmlEscape(m.role||'\u2014') + '</td><td>' + xmlEscape(m.callsign||'\u2014') + '</td><td>' + m.status.toUpperCase() + '</td><td>' + xmlEscape(m.sector||'\u2014') + '</td></tr>';
  }).join('');

  var markerRows = '';
  ['lkp','pls','ipp'].forEach(function(type) {
    var e = sarMarkers2[type];
    if (e) markerRows += '<tr><td>' + sarMarkerTypes[type].label + '</td><td>' + e.lat.toFixed(5) + ', ' + e.lon.toFixed(5) + '</td><td>' + e.time + '</td></tr>';
  });
  clueMarkers.forEach(function(c, i) {
    markerRows += '<tr><td>CLUE ' + (i+1) + '</td><td>' + c.lat.toFixed(5) + ', ' + c.lon.toFixed(5) + '</td><td>' + c.time + '</td></tr>';
  });

  var html = '<div class="print-page">'
    + '<div class="print-header">'
    + '<div class="print-title">SEARCH OPERATION SUMMARY</div>'
    + '<div class="print-sub">' + xmlEscape(currentOpName) + ' &middot; Generated ' + new Date().toLocaleString() + ' &middot; Elapsed: ' + elapsedStr + '</div>'
    + '</div>'

    + '<div class="print-section-title">Subjects (' + subjects.length + ')</div>'
    + (subjects.length ? '<table class="print-table"><tr><th>Name</th><th>Callsign</th><th>Status</th><th>Last Position</th></tr>' + subjRows + '</table>' : '<div class="print-notes">None</div>')

    + '<div class="print-section-title">Search Sectors (' + sectors.length + ')</div>'
    + (sectors.length ? '<table class="print-table"><tr><th>Sector</th><th>Status</th><th>Area</th><th>Assigned</th></tr>' + sectorRows + '</table>' : '<div class="print-notes">None</div>')

    + '<div class="print-section-title">Personnel (' + roster.length + ')</div>'
    + (roster.length ? '<table class="print-table"><tr><th>Name</th><th>Role</th><th>Callsign</th><th>Status</th><th>Sector</th></tr>' + rosterRows + '</table>' : '<div class="print-notes">None</div>')

    + '<div class="print-section-title">Reference Points</div>'
    + (markerRows ? '<table class="print-table"><tr><th>Type</th><th>Position</th><th>Time</th></tr>' + markerRows + '</table>' : '<div class="print-notes">None marked</div>')

    + '<div class="print-footer">Robert W Donze - W7CTY &middot; 914 Communications &middot; APRS Tracker</div>'
    + '</div>';

  ensurePrintContainer().innerHTML = html;
  document.body.classList.add('printing');
  window.print();
  setTimeout(function(){ document.body.classList.remove('printing'); }, 500);
  logEvent('Printed operation summary');
}

function exportGpx() {
  var fname = 'aprs-tracker-' + currentOpName.replace(/[^a-z0-9]+/gi,'-') + '-' + new Date().toISOString().slice(0,10) + '.gpx';
  downloadTextFile(fname, 'application/gpx+xml', buildGpxDocument());
  logEvent('Exported operation to GPX: ' + fname);
  toast('GPX exported');
}

function exportKml() {
  var fname = 'aprs-tracker-' + currentOpName.replace(/[^a-z0-9]+/gi,'-') + '-' + new Date().toISOString().slice(0,10) + '.kml';
  downloadTextFile(fname, 'application/vnd.google-earth.kml+xml', buildKmlDocument());
  logEvent('Exported operation to KML: ' + fname);
  toast('KML exported');
}

function triggerImportFile() {
  document.getElementById('import-file-input').click();
}

function handleImportFile(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var text = e.target.result;
      var isKml = /\.kml$/i.test(file.name) || text.indexOf('<kml') >= 0;
      var imported = isKml ? parseKmlText(text) : parseGpxText(text);
      applyImportedData(imported, file.name);
    } catch(err) {
      toast('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  input.value = ''; // reset so the same file can be re-imported if needed
}

function parseGpxText(text) {
  var xml = new DOMParser().parseFromString(text, 'text/xml');
  var waypointsOut = [];
  var sectorsOut = [];

  Array.from(xml.getElementsByTagName('wpt')).forEach(function(el) {
    var lat = parseFloat(el.getAttribute('lat'));
    var lon = parseFloat(el.getAttribute('lon'));
    var nameEl = el.getElementsByTagName('name')[0];
    var name = nameEl ? nameEl.textContent : 'Imported WPT';
    if (!isNaN(lat) && !isNaN(lon)) waypointsOut.push({ lat: lat, lon: lon, label: name });
  });

  Array.from(xml.getElementsByTagName('trk')).forEach(function(el) {
    var nameEl = el.getElementsByTagName('name')[0];
    var name = nameEl ? nameEl.textContent : 'Imported Sector';
    var pts = Array.from(el.getElementsByTagName('trkpt')).map(function(pt) {
      return [parseFloat(pt.getAttribute('lat')), parseFloat(pt.getAttribute('lon'))];
    }).filter(function(p){ return !isNaN(p[0]) && !isNaN(p[1]); });
    if (pts.length >= 3) sectorsOut.push({ name: name, points: pts });
  });

  return { waypoints: waypointsOut, sectors: sectorsOut };
}

function parseKmlText(text) {
  var xml = new DOMParser().parseFromString(text, 'text/xml');
  var waypointsOut = [];
  var sectorsOut = [];

  Array.from(xml.getElementsByTagName('Placemark')).forEach(function(pm) {
    var nameEl = pm.getElementsByTagName('name')[0];
    var name = nameEl ? nameEl.textContent : 'Imported';

    var point = pm.getElementsByTagName('Point')[0];
    if (point) {
      var coordEl = point.getElementsByTagName('coordinates')[0];
      if (coordEl) {
        var parts = coordEl.textContent.trim().split(',');
        var lon = parseFloat(parts[0]), lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) waypointsOut.push({ lat: lat, lon: lon, label: name });
      }
      return;
    }

    var poly = pm.getElementsByTagName('Polygon')[0];
    if (poly) {
      var coordEl2 = poly.getElementsByTagName('coordinates')[0];
      if (coordEl2) {
        var pts = coordEl2.textContent.trim().split(/\s+/).map(function(triplet) {
          var parts = triplet.split(',');
          return [parseFloat(parts[1]), parseFloat(parts[0])];
        }).filter(function(p){ return !isNaN(p[0]) && !isNaN(p[1]); });
        if (pts.length >= 3) sectorsOut.push({ name: name, points: pts });
      }
    }
  });

  return { waypoints: waypointsOut, sectors: sectorsOut };
}

function applyImportedData(imported, sourceFilename) {
  var wpCount = 0, secCount = 0;

  imported.waypoints.forEach(function(wp) {
    var label = wp.label || ('WP' + (waypoints.length + 1));
    var entry = { id: uid(), label: label, lat: wp.lat, lon: wp.lon, time: nowStr() };
    waypoints.push(entry);
    var icon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;background:#39d0d8;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#000;font-family:monospace">IMP</div>',
      iconSize:[22,22], iconAnchor:[11,11]
    });
    var m = L.marker([wp.lat, wp.lon], { icon: icon }).addTo(map);
    m.bindTooltip(htmlEscape(label), { className:'aprs-label' });
    waypointLayers[entry.id] = m;
    wpCount++;
  });

  imported.sectors.forEach(function(sec) {
    var sector = { id: uid(), name: sec.name, status: 'unsearched', points: sec.points, assignedTo: '', notes: 'Imported from ' + sourceFilename };
    sectors.push(sector);
    drawSectorLayer(sector);
    secCount++;
  });

  if (wpCount || secCount) {
    var allPts = imported.waypoints.map(function(w){return [w.lat,w.lon];})
      .concat(imported.sectors.reduce(function(acc,s){return acc.concat(s.points);},[]));
    if (allPts.length) map.fitBounds(L.latLngBounds(allPts).pad(0.15));
  }

  logEvent('Imported ' + sourceFilename + ': ' + wpCount + ' point(s), ' + secCount + ' sector(s)');
  toast('Imported ' + wpCount + ' point(s) and ' + secCount + ' sector(s)');
  if (curTab === 'search') renderTabInto('search','tcont');
  if (curTab === 'tools') renderTabInto('tools','tcont');
}

function aboutHTML() {
  var version = (typeof window !== 'undefined' && window.APP_VERSION) ? window.APP_VERSION : 'dev (unpackaged)';
  var repoUrl = (typeof window !== 'undefined' && window.APP_REPO_URL) ? window.APP_REPO_URL : 'https://github.com/W7CTY/aprs-tracker';
  return '<div style="text-align:center;padding:8px 4px 16px">'
    + '<div style="font-family:monospace;font-size:22px;font-weight:700;color:var(--orange);letter-spacing:.04em">APRS<span style="color:var(--cyan)">TRACK</span></div>'
    + '<div style="font-size:12px;color:var(--muted);margin-top:2px">Ham Radio &amp; SAR Toolkit</div>'
    + '</div>'
    + '<div class="result-box" style="text-align:center;padding:14px">'
    + '<div class="rk">VERSION</div>'
    + '<div class="rv" style="font-size:18px">' + version + '</div>'
    + '</div>'
    + '<div class="sec-h" style="margin-top:16px">Developer</div>'
    + '<div style="font-size:13px;color:var(--text);line-height:1.8">'
    + 'Robert W Donze - W7CTY &middot; 914 Communications<br>'
    + '2531 Harts Mill Rd, Mineral VA 23117'
    + '</div>'
    + '<div class="sec-h" style="margin-top:16px">Links</div>'
    + '<div style="font-size:13px;line-height:2">'
    + '<a href="' + repoUrl + '" target="_blank" style="color:var(--cyan);text-decoration:none">&#128279; GitHub Repository</a><br>'
    + '<a href="' + repoUrl + '/releases" target="_blank" style="color:var(--cyan);text-decoration:none">&#128230; Release Notes</a><br>'
    + '<a href="' + repoUrl + '/issues" target="_blank" style="color:var(--cyan);text-decoration:none">&#128030; Report a Bug</a>'
    + '</div>'
    + '<div class="sec-h" style="margin-top:16px">Data Sources</div>'
    + '<div style="font-size:12px;color:var(--muted);line-height:1.9">'
    + 'Position data: aprs.fi<br>'
    + 'Street map: CartoCDN (OpenStreetMap data)<br>'
    + 'Topo map: OpenTopoMap<br>'
    + 'Satellite &amp; Nat Geo map: Esri<br>'
    + 'Weather: Open-Meteo<br>'
    + 'Mesh networks: Meshtastic (MQTT), MeshCore (companion radio)'
    + '</div>'
    + '<div class="sec-h" style="margin-top:16px">Updates</div>'
    + '<div style="font-size:12px;color:var(--muted)">Checked automatically on launch. Look for an orange Update button in the title bar.</div>';
}

function sarTabHTML2(t) {
  if (t === 'operations') return operationsHTML();
  if (t === 'subjects') return subjectsHTML();
  if (t === 'search')   return searchHTML();
  if (t === 'tools')    return toolsHTML();
  if (t === 'sarops')   return sarOpsHTML();
  if (t === 'roster')   return rosterHTML();
  if (t === 'log')      return logHTML();
  if (t === 'weather')  return weatherHTML();
  if (t === 'mesh')     return meshHTML();
  if (t === 'msg')      return msgHTML();
  if (t === 'offline')  return offlineHTML();
  if (t === 'about')    return aboutHTML();
  return tabHTML(t); // fall back to original stations/trail/sar/info
}
