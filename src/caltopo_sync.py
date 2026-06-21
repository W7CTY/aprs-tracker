#!/usr/bin/env python3
"""
CalTopo Sync — APRS Tracker / SAR Toolkit
W7CTY / 914 Communications

Pushes sectors (as Shapes/Polygons), waypoints and SAR markers (as
Markers) to a CalTopo Team map, and pulls CalTopo map objects back in
as importable waypoints/sectors -- the same shape the GPX/KML importer
already produces, so the frontend can reuse that code path.

Requires a CalTopo TEAM account with an admin-created Service Account
(credential ID + base64 secret). This is NOT the same as a personal
CalTopo login -- there is no username/password auth here. See:
https://training.caltopo.com/all_users/team-accounts/teamapi

All requests are signed per CalTopo's documented HMAC-SHA256 scheme.
Credentials are kept only in memory for the life of this process; nothing
is written to disk. As with the other local backends in this app, this
exposes a small loopback-only HTTP API that the WebView talks to.
"""

import base64
import hmac
import hashlib
import json
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs, urlencode

CALTOPO_HTTP_PORT = 8733  # local-only, loopback bound, distinct from other backends
CALTOPO_BASE = 'https://caltopo.com'
DEFAULT_TIMEOUT_MS = 2 * 60 * 1000

_lock = threading.Lock()
_state = {
    'configured': False,
    'credential_id': None,
    'credential_secret': None,
    'team_id': None,
    'map_id': None,
    'error': None,
    'last_sync': None,
}


def _sign(method, url, expires, payload_string, credential_secret):
    message = f'{method} {url}\n{expires}\n{payload_string}'
    secret = base64.b64decode(credential_secret)
    signature = hmac.new(secret, message.encode(), hashlib.sha256).digest()
    return base64.b64encode(signature).decode()


def _caltopo_request(method, endpoint, credential_id, credential_secret, payload=None, timeout=15):
    payload_string = json.dumps(payload) if payload else ''
    expires = int(time.time() * 1000) + DEFAULT_TIMEOUT_MS
    signature = _sign(method, endpoint, expires, payload_string, credential_secret)

    parameters = {'id': credential_id, 'expires': expires, 'signature': signature}
    if method.upper() == 'POST' and payload is not None:
        parameters['json'] = payload_string
        query_string = ''
    else:
        query_string = '?' + urlencode(parameters)

    url = f'{CALTOPO_BASE}{endpoint}{query_string}'
    body = urlencode(parameters).encode() if (method.upper() == 'POST' and payload) else None

    req = urllib.request.Request(url, data=body, method=method.upper())
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    req.add_header('User-Agent', 'aprs-tracker-caltopo-sync')
    if body is not None:
        req.add_header('Content-Length', str(len(body)))

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        response_data = resp.read().decode('utf-8')
        if response_data:
            parsed = json.loads(response_data)
            return parsed.get('result')
    return None


def configure(credential_id, credential_secret, team_id, map_id=None):
    with _lock:
        _state['credential_id'] = credential_id
        _state['credential_secret'] = credential_secret
        _state['team_id'] = team_id
        _state['map_id'] = map_id or None
        _state['configured'] = True
        _state['error'] = None
    return {'result': 'ok'}


def get_status():
    with _lock:
        return {
            'configured': _state['configured'],
            'team_id': _state['team_id'],
            'map_id': _state['map_id'],
            'error': _state['error'],
            'last_sync': _state['last_sync'],
        }


def _require_configured():
    if not _state['configured']:
        raise RuntimeError('CalTopo is not configured. Enter credential ID, secret, and team ID first.')


def list_team_maps():
    """Returns the team's CollaborativeMap objects (id + title) so the
    user can pick which map to sync to, without leaving this app."""
    _require_configured()
    data = _caltopo_request(
        'GET', f'/api/v1/acct/{_state["team_id"]}/since/0',
        _state['credential_id'], _state['credential_secret']
    )
    maps = []
    for feature in (data or {}).get('features', []):
        props = feature.get('properties', {})
        if props.get('class') == 'CollaborativeMap':
            maps.append({'id': feature['id'], 'title': props.get('title', '(untitled)')})
    return maps


def create_map(title):
    """Creates a new Team map and returns its ID, for a one-click 'start
    a fresh CalTopo map for this operation' action."""
    _require_configured()
    payload = {
        'properties': {'title': title, 'mode': 'sar', 'sharing': 'SECRET'},
        'state': {'type': 'FeatureCollection', 'features': []}
    }
    result = _caltopo_request(
        'POST', f'/api/v1/acct/{_state["team_id"]}/CollaborativeMap',
        _state['credential_id'], _state['credential_secret'], payload
    )
    map_id = result.get('id') if isinstance(result, dict) else None
    if map_id:
        with _lock:
            _state['map_id'] = map_id
    return {'id': map_id}


# ── Pushing local data to CalTopo ──────────────────────────────────

def _marker_payload(lat, lon, title, description='', color='FF0000', symbol='point'):
    return {
        'type': 'Feature',
        'id': None,
        'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
        'properties': {
            'title': title, 'description': description, 'folderId': None,
            'marker-size': '1', 'marker-symbol': symbol,
            'marker-color': color, 'marker-rotation': None,
        }
    }


def _polygon_payload(points, title, status='unsearched'):
    # points are [lat, lon] pairs (this app's convention); GeoJSON wants [lon, lat]
    coords = [[p[1], p[0]] for p in points]
    if coords and coords[0] != coords[-1]:
        coords.append(coords[0])
    status_colors = {'unsearched': '#FF0000', 'progress': '#FFA500', 'cleared': '#00AA00'}
    color = status_colors.get(status, '#FF0000')
    return {
        'properties': {
            'title': title, 'description': f'Status: {status}', 'folderId': None,
            'stroke-width': 2, 'stroke-opacity': 1, 'stroke': color,
            'fill-opacity': 0.15, 'fill': color,
        },
        'geometry': {'type': 'Polygon', 'coordinates': [coords]}
    }


def push_sector(sector):
    _require_configured()
    if not _state['map_id']:
        raise RuntimeError('No CalTopo map selected. Pick or create a map first.')
    payload = _polygon_payload(sector['points'], sector['name'], sector.get('status', 'unsearched'))
    return _caltopo_request(
        'POST', f'/api/v1/map/{_state["map_id"]}/Shape',
        _state['credential_id'], _state['credential_secret'], payload
    )


def push_marker(lat, lon, title, description='', color='FF0000', symbol='point'):
    _require_configured()
    if not _state['map_id']:
        raise RuntimeError('No CalTopo map selected. Pick or create a map first.')
    payload = _marker_payload(lat, lon, title, description, color, symbol)
    return _caltopo_request(
        'POST', f'/api/v1/map/{_state["map_id"]}/Marker',
        _state['credential_id'], _state['credential_secret'], payload
    )


def sync_operation(sectors, waypoints, sar_markers, clue_markers):
    """
    Pushes a full snapshot of the current operation's sectors and points
    to the configured CalTopo map. This is a one-shot push (creates new
    objects each time) rather than a true bidirectional diff sync --
    CalTopo's API has no batch/upsert endpoint (confirmed in their own
    docs: objects are added/edited individually), so re-running this
    after the first sync will create duplicates rather than update
    existing objects. Good for an initial push or an end-of-op archive;
    not a substitute for live two-way sync.
    """
    _require_configured()
    if not _state['map_id']:
        raise RuntimeError('No CalTopo map selected. Pick or create a map first.')

    results = {'sectors': 0, 'waypoints': 0, 'markers': 0, 'errors': []}

    for sector in sectors:
        try:
            push_sector(sector)
            results['sectors'] += 1
        except Exception as e:
            results['errors'].append(f'Sector {sector.get("name","?")}: {e}')

    for wp in waypoints:
        try:
            push_marker(wp['lat'], wp['lon'], wp['label'], color='FF7800', symbol='point')
            results['waypoints'] += 1
        except Exception as e:
            results['errors'].append(f'Waypoint {wp.get("label","?")}: {e}')

    marker_colors = {'lkp': 'FF0000', 'pls': 'FFA500', 'ipp': '00AAFF'}
    marker_names = {'lkp': 'LKP', 'pls': 'PLS', 'ipp': 'IPP'}
    for mtype, entry in (sar_markers or {}).items():
        if not entry:
            continue
        try:
            push_marker(entry['lat'], entry['lon'], marker_names.get(mtype, mtype.upper()),
                        color=marker_colors.get(mtype, 'FF0000'), symbol='triangle')
            results['markers'] += 1
        except Exception as e:
            results['errors'].append(f'{mtype}: {e}')

    for i, clue in enumerate(clue_markers or []):
        try:
            push_marker(clue['lat'], clue['lon'], f'CLUE {i+1}', color='FFFF00', symbol='star')
            results['markers'] += 1
        except Exception as e:
            results['errors'].append(f'Clue {i+1}: {e}')

    with _lock:
        _state['last_sync'] = time.time()
        _state['error'] = '; '.join(results['errors'][:3]) if results['errors'] else None

    return results


def pull_map_data():
    """
    Pulls all current objects from the configured CalTopo map and
    converts them into the same {waypoints, sectors} shape the GPX/KML
    importer produces, so the frontend's existing applyImportedData()
    can consume it unchanged.
    """
    _require_configured()
    if not _state['map_id']:
        raise RuntimeError('No CalTopo map selected.')

    data = _caltopo_request(
        'GET', f'/api/v1/map/{_state["map_id"]}/since/0',
        _state['credential_id'], _state['credential_secret']
    )

    waypoints = []
    sectors = []
    for feature in (data or {}).get('state', {}).get('features', []):
        props = feature.get('properties', {})
        geom = feature.get('geometry', {})
        gtype = geom.get('type')
        if gtype == 'Point':
            lon, lat = geom['coordinates'][0], geom['coordinates'][1]
            waypoints.append({'lat': lat, 'lon': lon, 'label': props.get('title', 'CalTopo Point')})
        elif gtype == 'Polygon':
            ring = geom['coordinates'][0]
            points = [[c[1], c[0]] for c in ring]
            sectors.append({'name': props.get('title', 'CalTopo Sector'), 'points': points})

    return {'waypoints': waypoints, 'sectors': sectors}


# ════════════════════════════════════════════════════════
#  Local HTTP server
# ════════════════════════════════════════════════════════

class _CalTopoHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
        except (TypeError, ValueError):
            return {}
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == '/caltopo/status':
            self._send_json(get_status())
        elif parsed.path == '/caltopo/maps':
            try:
                self._send_json({'result': 'ok', 'maps': list_team_maps()})
            except Exception as e:
                self._send_json({'result': 'error', 'description': str(e)}, status=400)
        elif parsed.path == '/caltopo/pull':
            try:
                self._send_json({'result': 'ok', 'data': pull_map_data()})
            except Exception as e:
                self._send_json({'result': 'error', 'description': str(e)}, status=400)
        else:
            self._send_json({'result': 'error', 'description': 'unknown endpoint'}, status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        body = self._read_json_body()

        if parsed.path == '/caltopo/configure':
            try:
                configure(
                    body.get('credentialId', ''), body.get('credentialSecret', ''),
                    body.get('teamId', ''), body.get('mapId')
                )
                self._send_json({'result': 'ok'})
            except Exception as e:
                self._send_json({'result': 'error', 'description': str(e)}, status=400)
        elif parsed.path == '/caltopo/create_map':
            try:
                self._send_json({'result': 'ok', **create_map(body.get('title', 'SAR Operation'))})
            except Exception as e:
                self._send_json({'result': 'error', 'description': str(e)}, status=400)
        elif parsed.path == '/caltopo/select_map':
            with _lock:
                _state['map_id'] = body.get('mapId')
            self._send_json({'result': 'ok'})
        elif parsed.path == '/caltopo/sync':
            try:
                results = sync_operation(
                    body.get('sectors', []), body.get('waypoints', []),
                    body.get('sarMarkers', {}), body.get('clueMarkers', [])
                )
                self._send_json({'result': 'ok', **results})
            except Exception as e:
                self._send_json({'result': 'error', 'description': str(e)}, status=400)
        else:
            self._send_json({'result': 'error', 'description': 'unknown endpoint'}, status=404)


def start_http_server():
    server = HTTPServer(('127.0.0.1', CALTOPO_HTTP_PORT), _CalTopoHTTPHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


if __name__ == '__main__':
    start_http_server()
    print(f'CalTopo sync backend running on http://127.0.0.1:{CALTOPO_HTTP_PORT}')
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
