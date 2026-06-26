#!/usr/bin/env python3
"""
Tile Cache Backend — APRS Tracker / SAR Toolkit
W7CTY / 914 Communications

Disk-backed cache for map tiles (base map + radar), so the app stays
usable when a search area loses cell/internet signal -- exactly the
situation a SAR tool needs to handle well.

Two modes, both always active:
  - PASSIVE: every tile the map requests gets cached automatically as
    it's viewed, building up coverage over normal use.
  - ACTIVE: an explicit "Download this area" call pre-fetches every tile
    in a bounding box across a zoom range, for deliberate pre-staging
    before heading into a dead zone.

Tiles are served to the WebView through a local HTTP proxy (same pattern
as mesh_backend.py's tile/API proxies) so the browser-side code doesn't
need to know whether a tile came from disk or the network.
"""

import os
import re
import time
import json
import sqlite3
import threading
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

TILE_CACHE_HTTP_PORT = 8732  # local-only, loopback bound

CACHE_DIR = os.path.expanduser('~/.cache/aprs-tracker/tiles')
DB_PATH = os.path.join(CACHE_DIR, 'tiles.db')

# Tile sources this app uses. Each gets its own cache namespace.
TILE_SOURCES = {
    'base': {
        'url_template': 'https://{s}.basemaps.cartocdn.com/{theme}/{z}/{x}/{y}{r}.png',
        'subdomains': ['a', 'b', 'c', 'd'],
    },
    'base_dark': {
        'url_template': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        'subdomains': ['a', 'b', 'c', 'd'],
    },
    'base_light': {
        'url_template': 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        'subdomains': ['a', 'b', 'c', 'd'],
    },
}

_lock = threading.Lock()
_download_jobs = {}  # job_id -> {status, total, done, error}


def _ensure_db():
    os.makedirs(CACHE_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS tiles (
            source TEXT NOT NULL,
            z INTEGER NOT NULL,
            x INTEGER NOT NULL,
            y INTEGER NOT NULL,
            data BLOB NOT NULL,
            content_type TEXT NOT NULL,
            cached_at REAL NOT NULL,
            PRIMARY KEY (source, z, x, y)
        )
    ''')
    conn.commit()
    conn.close()


def _get_cached_tile(source, z, x, y):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        'SELECT data, content_type FROM tiles WHERE source=? AND z=? AND x=? AND y=?',
        (source, z, x, y)
    )
    row = cur.fetchone()
    conn.close()
    return row  # (data, content_type) or None


def _store_tile(source, z, x, y, data, content_type):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT OR REPLACE INTO tiles (source, z, x, y, data, content_type, cached_at) VALUES (?,?,?,?,?,?,?)',
        (source, z, x, y, data, content_type, time.time())
    )
    conn.commit()
    conn.close()


def get_cache_stats():
    _ensure_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute('SELECT source, COUNT(*), SUM(LENGTH(data)) FROM tiles GROUP BY source')
    rows = cur.fetchall()
    conn.close()
    stats = {}
    total_count = 0
    total_bytes = 0
    for source, count, size in rows:
        stats[source] = {'count': count, 'bytes': size or 0}
        total_count += count
        total_bytes += (size or 0)
    return {'sources': stats, 'total_count': total_count, 'total_bytes': total_bytes}


def clear_cache():
    _ensure_db()
    conn = sqlite3.connect(DB_PATH)
    conn.execute('DELETE FROM tiles')
    conn.commit()
    conn.close()


def _build_tile_url(source, z, x, y):
    spec = TILE_SOURCES.get(source)
    if not spec:
        return None
    subdomain = spec['subdomains'][(x + y) % len(spec['subdomains'])]
    theme = 'dark_all' if source == 'base_dark' else 'light_all' if source == 'base_light' else 'dark_all'
    return spec['url_template'].format(s=subdomain, z=z, x=x, y=y, r='', theme=theme)


def fetch_and_cache_tile(source, z, x, y, timeout=8):
    """Fetch one tile from the network and cache it. Returns (data, content_type) or None."""
    url = _build_tile_url(source, z, x, y)
    if not url:
        return None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'aprs-tracker-tile-cache'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            content_type = resp.headers.get('Content-Type', 'image/png')
            _store_tile(source, z, x, y, data, content_type)
            return (data, content_type)
    except Exception:
        return None


def get_tile(source, z, x, y):
    """
    Serve a tile: cache hit returns immediately (works offline).
    Cache miss fetches from network and caches it (passive caching).
    Returns (data, content_type, from_cache: bool) or None if both fail.
    """
    _ensure_db()
    cached = _get_cached_tile(source, z, x, y)
    if cached:
        return (cached[0], cached[1], True)
    fetched = fetch_and_cache_tile(source, z, x, y)
    if fetched:
        return (fetched[0], fetched[1], False)
    return None


# ════════════════════════════════════════════════════════════
#  ACTIVE PRE-DOWNLOAD (explicit "Download this area" jobs)
# ════════════════════════════════════════════════════════════

def _deg2tile(lat, lon, zoom):
    import math
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1/math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def start_area_download(job_id, source, north, south, east, west, min_zoom, max_zoom):
    def worker():
        tiles_to_fetch = []
        for z in range(min_zoom, max_zoom + 1):
            x_min, y_max = _deg2tile(south, west, z)
            x_max, y_min = _deg2tile(north, east, z)
            x_min, x_max = min(x_min, x_max), max(x_min, x_max)
            y_min, y_max = min(y_min, y_max), max(y_min, y_max)
            for x in range(x_min, x_max + 1):
                for y in range(y_min, y_max + 1):
                    tiles_to_fetch.append((z, x, y))

        with _lock:
            _download_jobs[job_id] = {'status': 'running', 'total': len(tiles_to_fetch), 'done': 0, 'error': None}

        try:
            for (z, x, y) in tiles_to_fetch:
                if _download_jobs.get(job_id, {}).get('status') == 'cancelled':
                    break
                cached = _get_cached_tile(source, z, x, y)
                if not cached:
                    fetch_and_cache_tile(source, z, x, y)
                with _lock:
                    if job_id in _download_jobs:
                        _download_jobs[job_id]['done'] += 1

            with _lock:
                if job_id in _download_jobs and _download_jobs[job_id]['status'] != 'cancelled':
                    _download_jobs[job_id]['status'] = 'complete'
        except Exception as e:
            # Without this, an unexpected error anywhere in the loop
            # (e.g. a SQLite locking error under concurrent access)
            # silently kills this daemon thread and leaves the job
            # stuck at 'running' forever -- the frontend's progress
            # poll only checks for 'complete', so the UI would hang
            # indefinitely with no error shown.
            with _lock:
                if job_id in _download_jobs:
                    _download_jobs[job_id]['status'] = 'error'
                    _download_jobs[job_id]['error'] = str(e)

    t = threading.Thread(target=worker, daemon=True)
    t.start()


def cancel_area_download(job_id):
    with _lock:
        if job_id in _download_jobs:
            _download_jobs[job_id]['status'] = 'cancelled'


def get_download_job_status(job_id):
    with _lock:
        return dict(_download_jobs.get(job_id, {'status': 'not_found'}))


# ════════════════════════════════════════════════════════════
#  Local HTTP server
# ════════════════════════════════════════════════════════════

class _TileCacheHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', 'null')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_tile(self, data, content_type, from_cache):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', 'null')
        self.send_header('X-Tile-Cache', 'HIT' if from_cache else 'MISS')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'public, max-age=86400')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        # /tile/<source>/<z>/<x>/<y>.png
        m = re.match(r'^/tile/(\w+)/(\d+)/(\d+)/(\d+)\.png$', parsed.path)
        if m:
            source, z, x, y = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
            # Validate source against known allowlist to prevent path traversal
            if source not in TILE_SOURCES:
                self.send_response(400)
                self.end_headers()
                return
            result = get_tile(source, z, x, y)
            if result:
                self._send_tile(result[0], result[1], result[2])
            else:
                self.send_response(404)
                self.end_headers()
            return

        if parsed.path == '/tilecache/stats':
            self._send_json(get_cache_stats())
            return

        if parsed.path == '/tilecache/clear':
            clear_cache()
            self._send_json({'result': 'ok'})
            return

        if parsed.path == '/tilecache/download/start':
            try:
                source = qs.get('source', ['base_dark'])[0]
                # Validate source against allowlist
                if source not in TILE_SOURCES:
                    self._send_json({'result': 'error', 'description': 'unknown source'}, status=400)
                    return
                north = float(qs['north'][0])
                south = float(qs['south'][0])
                east = float(qs['east'][0])
                west = float(qs['west'][0])
                min_zoom = int(qs.get('minZoom', ['8'])[0])
                max_zoom = int(qs.get('maxZoom', ['14'])[0])
                job_id = str(int(time.time() * 1000))
                start_area_download(job_id, source, north, south, east, west, min_zoom, max_zoom)
                self._send_json({'result': 'ok', 'jobId': job_id})
            except Exception as e:
                self._send_json({'result': 'error', 'description': str(e)}, status=400)
            return

        if parsed.path == '/tilecache/download/status':
            job_id = qs.get('jobId', [''])[0]
            self._send_json(get_download_job_status(job_id))
            return

        if parsed.path == '/tilecache/download/cancel':
            job_id = qs.get('jobId', [''])[0]
            cancel_area_download(job_id)
            self._send_json({'result': 'ok'})
            return

        self._send_json({'result': 'error', 'description': 'unknown endpoint'}, status=404)


def start_http_server():
    _ensure_db()
    server = HTTPServer(('127.0.0.1', TILE_CACHE_HTTP_PORT), _TileCacheHTTPHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


if __name__ == '__main__':
    start_http_server()
    print(f'Tile cache HTTP server running on http://127.0.0.1:{TILE_CACHE_HTTP_PORT}')
    print(f'Cache directory: {CACHE_DIR}')
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
