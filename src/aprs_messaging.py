#!/usr/bin/env python3
"""
APRS-IS Messaging Backend — APRS Tracker / SAR Toolkit
W7CTY / 914 Communications

aprs.fi's HTTP API is read-only (position lookup only). Real two-way
APRS text messaging requires a connection to APRS-IS itself (the actual
packet network), which is a raw TCP socket protocol -- not something a
browser/WebKitGTK page can speak directly. This module bridges that
the same way mesh_backend.py bridges Meshtastic MQTT: a Python backend
holds the real connection, and the WebView talks to it over a small
local HTTP API.

Sending requires a valid APRS-IS passcode for the callsign in use
(derived from the callsign itself via a public, non-secret algorithm --
see aprslib.passcode()). A passcode of -1 is valid for receive-only.
"""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

MSG_HTTP_PORT = 8733  # local-only, loopback bound, separate from mesh_backend (8731) and tile_cache (8732)

_lock = threading.Lock()
_state = {
    'connected': False,
    'callsign': None,
    'error': None,
    'messages': [],   # {id, from, to, text, time, direction:'in'|'out', acked}
}
_is_conn = None
_enabled = False
_pending_acks = {}  # msgno -> message id, for matching ack responses


def _add_message(frm, to, text, direction, acked=False):
    with _lock:
        msg = {
            'id': str(time.time()) + '-' + str(len(_state['messages'])),
            'from': frm, 'to': to, 'text': text,
            'time': time.strftime('%H:%M:%S'),
            'epoch': time.time(),
            'direction': direction,
            'acked': acked,
        }
        _state['messages'].insert(0, msg)
        _state['messages'] = _state['messages'][:500]
    return msg


def get_snapshot():
    with _lock:
        return json.loads(json.dumps(_state))


def _parse_message_packet(raw_line, my_callsign):
    """
    Uses aprslib's own packet parser (the same library handling the
    connection) rather than a hand-rolled regex, since it already
    correctly handles the addressee/message/msgNo/ack split, UTF-8,
    and the real-world inconsistencies in how senders pad the
    addressee field.
    """
    import aprslib
    try:
        parsed = aprslib.parse(raw_line)
    except Exception:
        return None

    if parsed.get('format') != 'message':
        return None

    addressee = (parsed.get('addresse') or '').strip().upper()
    my_base = my_callsign.upper().split('-')[0]
    if addressee != my_base and addressee != my_callsign.upper():
        return None  # not addressed to us

    msgno = parsed.get('msgNo')

    if parsed.get('response') == 'ack':
        if msgno:
            with _lock:
                if msgno in _pending_acks:
                    msg_id = _pending_acks[msgno]
                    for m in _state['messages']:
                        if m['id'] == msg_id:
                            m['acked'] = True
                            break
        return None  # acks aren't shown as new messages

    return {
        'from': parsed.get('from', ''),
        'text': parsed.get('message_text', ''),
        'msgno': msgno,
    }


def _send_ack(my_callsign, to_call, msgno):
    if not _is_conn or not msgno:
        return
    # Defense in depth: to_call/msgno originate from aprslib's own parser
    # (which shouldn't produce embedded newlines for these fields), but
    # stripping here costs nothing and removes any reliance on that
    # holding true forever. See send_message for why this matters.
    to_call_clean = str(to_call).replace('\r', '').replace('\n', '')
    msgno_clean = str(msgno).replace('\r', '').replace('\n', '')
    addressee = to_call_clean.ljust(9)[:9]
    packet = '{0}>APRS,TCPIP*::{1}:ack{2}'.format(my_callsign, addressee, msgno_clean)
    try:
        _is_conn.sendall(packet)
    except Exception:
        pass


def _aprsis_worker(callsign, passcode, host, port):
    global _is_conn, _enabled
    import aprslib

    while _enabled:
        try:
            _is_conn = aprslib.IS(callsign, passwd=str(passcode), host=host, port=port)
            _is_conn.connect(blocking=True, retry=15)
            with _lock:
                _state['connected'] = True
                _state['error'] = None
                _state['callsign'] = callsign

            def on_packet(raw):
                if not isinstance(raw, str):
                    try:
                        raw = raw.decode('utf-8', errors='replace')
                    except Exception:
                        return
                parsed = _parse_message_packet(raw, callsign)
                if parsed:
                    _add_message(parsed['from'], callsign, parsed['text'], 'in')
                    if parsed['msgno']:
                        _send_ack(callsign, parsed['from'], parsed['msgno'])

            _is_conn.consumer(on_packet, raw=True, immortal=False)

        except Exception as e:
            with _lock:
                _state['connected'] = False
                _state['error'] = str(e)
            time.sleep(10)
        finally:
            with _lock:
                _state['connected'] = False
            if _is_conn:
                try:
                    _is_conn.close()
                except Exception:
                    pass
                _is_conn = None
        if not _enabled:
            break


def start_messaging(callsign, passcode=None, host='rotate.aprs2.net', port=14580):
    global _enabled
    import aprslib

    # Strip embedded CR/LF before anything else -- this callsign value
    # ends up in the APRS-IS login command itself (aprslib's own login
    # string builder doesn't sanitize it either) and in every outbound
    # packet's source field, so an unsanitized value here is a packet/
    # command injection vector at the earliest possible point.
    callsign = callsign.replace('\r', '').replace('\n', '').strip().upper()
    if not passcode:
        try:
            passcode = aprslib.passcode(callsign)
        except Exception:
            passcode = -1

    with _lock:
        if _enabled:
            return
        _enabled = True
        _state['error'] = None
        _state['callsign'] = callsign

    t = threading.Thread(target=_aprsis_worker, args=(callsign, passcode, host, port), daemon=True)
    t.start()


def stop_messaging():
    global _enabled, _is_conn
    with _lock:
        _enabled = False
        _state['connected'] = False
    if _is_conn:
        try:
            _is_conn.close()
        except Exception:
            pass


def send_message(to_call, text):
    if not _is_conn or not _state['connected']:
        return {'result': 'error', 'description': 'Not connected to APRS-IS'}

    my_call = _state['callsign']
    msgno = str(int(time.time()) % 100000)

    # Strip embedded CR/LF before anything else. APRS-IS is a
    # newline-delimited text protocol (aprslib.sendall only strips
    # *trailing* \r\n); an embedded newline in either field would let
    # a crafted message smuggle a second, attacker-controlled packet
    # onto the network under this session's authenticated callsign.
    to_call_clean = to_call.replace('\r', '').replace('\n', '')
    text_clean = text.replace('\r', '').replace('\n', '')

    addressee = to_call_clean.strip().upper().ljust(9)[:9]
    # APRS message text is limited to 67 chars per the spec
    safe_text = text_clean[:67]
    packet = '{0}>APRS,TCPIP*::{1}:{2}{{{3}'.format(my_call, addressee, safe_text, msgno)

    try:
        _is_conn.sendall(packet)
        msg = _add_message(my_call, to_call_clean.strip().upper(), safe_text, 'out')
        with _lock:
            _pending_acks[msgno] = msg['id']
        return {'result': 'ok', 'message_id': msg['id']}
    except Exception as e:
        return {'result': 'error', 'description': str(e)}


# ════════════════════════════════════════════════════════════
#  Local HTTP server
# ════════════════════════════════════════════════════════════

class _MsgHTTPHandler(BaseHTTPRequestHandler):
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

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == '/msg/status':
            self._send_json(get_snapshot())

        elif parsed.path == '/msg/start':
            callsign = qs.get('callsign', [''])[0]
            passcode = qs.get('passcode', [None])[0]
            host = qs.get('host', ['rotate.aprs2.net'])[0]
            port = int(qs.get('port', ['14580'])[0])
            if not callsign:
                self._send_json({'result': 'error', 'description': 'callsign required'}, status=400)
                return
            start_messaging(callsign, passcode, host, port)
            self._send_json({'result': 'ok', 'message': 'Connecting to APRS-IS...'})

        elif parsed.path == '/msg/stop':
            stop_messaging()
            self._send_json({'result': 'ok'})

        elif parsed.path == '/msg/send':
            to_call = qs.get('to', [''])[0]
            text = qs.get('text', [''])[0]
            if not to_call or not text:
                self._send_json({'result': 'error', 'description': 'to and text required'}, status=400)
                return
            result = send_message(to_call, text)
            self._send_json(result)

        elif parsed.path == '/aprs/area':
            try:
                lat = float(qs.get('lat', ['0'])[0])
                lon = float(qs.get('lon', ['0'])[0])
                km  = float(qs.get('km',  ['30'])[0])
            except (ValueError, IndexError):
                self._send_json({'result': 'error', 'description': 'lat/lon required'}, status=400)
                return
            self._send_json(start_area_scan(lat, lon, km))

        else:
            self._send_json({'result': 'error', 'description': 'unknown endpoint'}, status=404)


def start_http_server():
    server = HTTPServer(('127.0.0.1', MSG_HTTP_PORT), _MsgHTTPHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


if __name__ == '__main__':
    start_http_server()
    print('APRS messaging backend running on http://127.0.0.1:{0}'.format(MSG_HTTP_PORT))
    print('Endpoints: /msg/status, /msg/start, /msg/stop, /msg/send')
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass


# ── APRS-IS area station scanner ──────────────────────────────────────────────
# Connects with a range filter r/lat/lon/km, listens for N seconds, returns
# all unique stations heard with their last position. No auth needed for
# receive-only (passcode -1). Runs in a background thread; result cached.

import time as _time

_area_cache = {'stations': {}, 'ts': 0, 'lat': None, 'lon': None, 'busy': False}
_AREA_CACHE_TTL = 120  # seconds before a new scan is allowed


def _area_scan_worker(lat, lon, km, listen_secs):
    """Connect to APRS-IS with a range filter and collect position reports."""
    try:
        import aprslib
        import aprslib.parsing
    except ImportError:
        _area_cache['busy'] = False
        return

    stations = {}
    deadline = _time.time() + listen_secs

    def _on_packet(pkt):
        try:
            if not isinstance(pkt, dict):
                return
            if pkt.get('format') not in ('uncompressed', 'compressed', 'mice', 'nmea'):
                return
            lat_p = pkt.get('latitude')
            lon_p = pkt.get('longitude')
            if lat_p is None or lon_p is None:
                return
            call = pkt.get('from', '')
            if not call:
                return
            stations[call] = {
                'name': call,
                'lat': str(round(float(lat_p), 6)),
                'lng': str(round(float(lon_p), 6)),
                'comment': pkt.get('comment', ''),
                'symbol': (pkt.get('symbol_table', '/') or '/') + (pkt.get('symbol', '-') or '-'),
                'speed': str(round(float(pkt.get('speed', 0) or 0) * 0.539957, 1)),  # kph→kt… actually leave as-is
                'course': str(pkt.get('course') or ''),
                'lasttime': str(int(_time.time())),
                'source': 'area',
            }
        except Exception:
            pass

    conn = None
    try:
        filt = 'r/{}/{}/{}'.format(round(lat, 4), round(lon, 4), int(km))
        conn = aprslib.IS('APRSTRACK', passwd='-1', host='rotate.aprs2.net', port=14580)
        conn.set_filter(filt)
        conn.connect(blocking=False)
        conn.consumer(_on_packet, raw=False, blocking=False)
        while _time.time() < deadline:
            _time.sleep(0.5)
    except Exception:
        pass
    finally:
        try:
            if conn:
                conn.close()
        except Exception:
            pass

    _area_cache['stations'].update(stations)
    _area_cache['ts'] = _time.time()
    _area_cache['busy'] = False


def start_area_scan(lat, lon, km=30, listen_secs=12):
    """Start a background area scan if not already busy and cache is stale."""
    now = _time.time()
    stale = (now - _area_cache['ts']) > _AREA_CACHE_TTL
    loc_changed = (_area_cache['lat'] != round(lat, 2) or _area_cache['lon'] != round(lon, 2))
    if _area_cache['busy']:
        return {'result': 'scanning', 'stations': list(_area_cache['stations'].values())}
    if not stale and not loc_changed:
        return {'result': 'cached', 'stations': list(_area_cache['stations'].values())}
    _area_cache['busy'] = True
    _area_cache['lat'] = round(lat, 2)
    _area_cache['lon'] = round(lon, 2)
    _area_cache['stations'] = {}
    t = threading.Thread(target=_area_scan_worker, args=(lat, lon, km, listen_secs), daemon=True)
    t.start()
    return {'result': 'scanning', 'stations': []}

