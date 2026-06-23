#!/usr/bin/env python3
"""
Mesh Network Backend — APRS Tracker / SAR Toolkit
W7CTY / 914 Communications

Provides live node positions from two mesh networking protocols:

  MESHTASTIC — connects to an MQTT broker (public mqtt.meshtastic.org by
  default, or a private/team broker) and decodes ServiceEnvelope protobuf
  packets. Position packets on the public broker's default channel are
  intentionally low-precision (privacy feature of the network); a private
  broker/channel gives full precision.

  MESHCORE — connects to a local companion radio device over USB/Serial
  or BLE. Unlike Meshtastic, MeshCore has no public internet broker; it's
  inherently local-radio-first. Requires actual MeshCore hardware attached
  to this machine.

Both run as background threads and expose results via a tiny local HTTP
server that the WebKitGTK view polls, same pattern as the aprs.fi/tile
proxies already used elsewhere in this app.
"""

import json
import threading
import time
import base64
import struct
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

MESH_HTTP_PORT = 8731  # local-only, loopback bound

# ── Shared state ──────────────────────────────────────────────
_lock = threading.Lock()
_state = {
    'meshtastic': {'enabled': False, 'connected': False, 'error': None, 'nodes': {}},
    'meshcore':   {'enabled': False, 'connected': False, 'error': None, 'nodes': {}},
}


def _update_node(protocol, node_id, **fields):
    with _lock:
        nodes = _state[protocol]['nodes']
        n = nodes.get(node_id, {'id': node_id})
        n.update(fields)
        n['last_update'] = time.time()
        nodes[node_id] = n


def get_snapshot():
    with _lock:
        return json.loads(json.dumps(_state))  # deep copy


# ════════════════════════════════════════════════════════════
#  MESHTASTIC — MQTT client + protobuf decode
# ════════════════════════════════════════════════════════════

def _meshtastic_decrypt(encrypted_bytes, packet_id, from_node, psk_b64='1PG7OiApB1nwvP+rz05pAQ=='):
    """
    Decrypt a Meshtastic MeshPacket payload using AES-CTR.
    Default channel PSK ('AQ==' expands to this well-known default key)
    is publicly known by design — see Meshtastic docs on channel encryption.
    """
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    key = base64.b64decode(psk_b64)
    # Nonce: packet_id (8 bytes LE) + from_node (8 bytes LE), per Meshtastic spec
    nonce = struct.pack('<Q', packet_id) + struct.pack('<Q', from_node)
    cipher = Cipher(algorithms.AES(key), modes.CTR(nonce))
    decryptor = cipher.decryptor()
    return decryptor.update(encrypted_bytes) + decryptor.finalize()


def _meshtastic_worker(broker_host, broker_port, use_tls, username, password, root_topic):
    import paho.mqtt.client as mqtt
    from meshtastic.protobuf import mqtt_pb2, mesh_pb2, portnums_pb2

    def on_connect(client, userdata, flags, reason_code, properties=None):
        with _lock:
            _state['meshtastic']['connected'] = (reason_code == 0)
            _state['meshtastic']['error'] = None if reason_code == 0 else f'Connect failed: {reason_code}'
        if reason_code == 0:
            topic = f'{root_topic}/+/+/#'
            client.subscribe(topic)

    def on_disconnect(client, userdata, *args):
        with _lock:
            _state['meshtastic']['connected'] = False

    def on_message(client, userdata, msg):
        try:
            envelope = mqtt_pb2.ServiceEnvelope()
            envelope.ParseFromString(msg.payload)
            pkt = envelope.packet

            if pkt.HasField('decoded'):
                portnum = pkt.decoded.portnum
                payload = pkt.decoded.payload
            elif pkt.encrypted:
                try:
                    plain = _meshtastic_decrypt(pkt.encrypted, pkt.id, getattr(pkt, 'from'))
                    data = mesh_pb2.Data()
                    data.ParseFromString(plain)
                    portnum = data.portnum
                    payload = data.payload
                except Exception:
                    return
            else:
                return

            node_id = f'!{getattr(pkt, "from"):08x}'

            if portnum == portnums_pb2.PortNum.POSITION_APP:
                pos = mesh_pb2.Position()
                pos.ParseFromString(payload)
                if pos.latitude_i and pos.longitude_i:
                    _update_node('meshtastic', node_id,
                        lat=pos.latitude_i * 1e-7,
                        lon=pos.longitude_i * 1e-7,
                        altitude=pos.altitude if pos.altitude else None,
                        via_mqtt=True)

            elif portnum == portnums_pb2.PortNum.NODEINFO_APP:
                info = mesh_pb2.User()
                info.ParseFromString(payload)
                _update_node('meshtastic', node_id,
                    short_name=info.short_name or node_id[-4:],
                    long_name=info.long_name or node_id,
                    hw_model=info.hw_model)

            elif portnum == portnums_pb2.PortNum.TELEMETRY_APP:
                # battery / device metrics — not position, but useful context
                pass

        except Exception:
            pass  # malformed/undecryptable packet — skip silently

    client_id = f'aprs-tracker-{int(time.time())}'
    client = mqtt.Client(client_id=client_id, callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    if username:
        client.username_pw_set(username, password or '')
    if use_tls:
        client.tls_set()
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    while _state['meshtastic']['enabled']:
        try:
            client.connect(broker_host, broker_port, keepalive=60)
            client.loop_forever(retry_first_connection=True)
        except Exception as e:
            with _lock:
                _state['meshtastic']['connected'] = False
                _state['meshtastic']['error'] = str(e)
            time.sleep(10)
        if not _state['meshtastic']['enabled']:
            break


def start_meshtastic(broker_host='mqtt.meshtastic.org', broker_port=1883, use_tls=False,
                      username='meshdev', password='large4cats', root_topic='msh/US/2/json'):
    """
    Default credentials (meshdev/large4cats) are Meshtastic's well-known
    public default for the public broker — same ones shipped in the
    official app, not a secret.
    """
    with _lock:
        if _state['meshtastic']['enabled']:
            return  # already running
        _state['meshtastic']['enabled'] = True
        _state['meshtastic']['error'] = None
    t = threading.Thread(
        target=_meshtastic_worker,
        args=(broker_host, broker_port, use_tls, username, password, root_topic),
        daemon=True
    )
    t.start()


def stop_meshtastic():
    with _lock:
        _state['meshtastic']['enabled'] = False
        _state['meshtastic']['connected'] = False


# ════════════════════════════════════════════════════════════
#  MESHCORE — companion radio over Serial/BLE/TCP
# ════════════════════════════════════════════════════════════

def _meshcore_worker(transport, address, port):
    import asyncio

    async def run():
        from meshcore import MeshCore, EventType

        try:
            if transport == 'serial':
                mc = await MeshCore.create_serial(address, 115200)
            elif transport == 'ble':
                mc = await MeshCore.create_ble(address)
            elif transport == 'tcp':
                mc = await MeshCore.create_tcp(address, port or 4000)
            else:
                raise ValueError(f'Unknown transport: {transport}')

            with _lock:
                _state['meshcore']['connected'] = True
                _state['meshcore']['error'] = None

            def on_contacts(event):
                try:
                    contacts = event.payload if hasattr(event, 'payload') else event
                    for c in (contacts if isinstance(contacts, list) else contacts.values()):
                        node_id = c.get('public_key', c.get('id', str(id(c))))[:16] if isinstance(c, dict) else str(c)
                        lat = c.get('adv_lat') if isinstance(c, dict) else None
                        lon = c.get('adv_lon') if isinstance(c, dict) else None
                        name = c.get('adv_name', node_id) if isinstance(c, dict) else node_id
                        if lat and lon:
                            _update_node('meshcore', node_id,
                                lat=lat, lon=lon, name=name,
                                node_type=c.get('type') if isinstance(c, dict) else None)
                except Exception:
                    pass

            mc.subscribe(EventType.CONTACTS, on_contacts)
            mc.subscribe(EventType.CONTACTS_FULL, on_contacts)

            # Initial pull
            await mc.commands.get_contacts()

            # Periodic refresh
            while _state['meshcore']['enabled']:
                await asyncio.sleep(30)
                try:
                    await mc.commands.get_contacts()
                except Exception:
                    pass

        except Exception as e:
            with _lock:
                _state['meshcore']['connected'] = False
                _state['meshcore']['error'] = str(e)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run())
    except Exception as e:
        with _lock:
            _state['meshcore']['connected'] = False
            _state['meshcore']['error'] = str(e)


def start_meshcore(transport='serial', address='/dev/ttyUSB0', port=None):
    with _lock:
        if _state['meshcore']['enabled']:
            return
        _state['meshcore']['enabled'] = True
        _state['meshcore']['error'] = None
    t = threading.Thread(target=_meshcore_worker, args=(transport, address, port), daemon=True)
    t.start()


def stop_meshcore():
    with _lock:
        _state['meshcore']['enabled'] = False
        _state['meshcore']['connected'] = False


# ════════════════════════════════════════════════════════════
#  Local HTTP server — exposes mesh state to the WebView
# ════════════════════════════════════════════════════════════

class _MeshHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # silence default request logging

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', 'null')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == '/mesh/status':
            self._send_json(get_snapshot())

        elif parsed.path == '/mesh/meshtastic/start':
            host = qs.get('host', ['mqtt.meshtastic.org'])[0]
            port = int(qs.get('port', ['1883'])[0])
            tls = qs.get('tls', ['0'])[0] == '1'
            user = qs.get('user', ['meshdev'])[0]
            pw = qs.get('pass', ['large4cats'])[0]
            topic = qs.get('topic', ['msh/US/2/json'])[0]
            start_meshtastic(host, port, tls, user, pw, topic)
            self._send_json({'result': 'ok', 'message': 'Meshtastic connecting...'})

        elif parsed.path == '/mesh/meshtastic/stop':
            stop_meshtastic()
            self._send_json({'result': 'ok'})

        elif parsed.path == '/mesh/meshcore/start':
            transport = qs.get('transport', ['serial'])[0]
            address = qs.get('address', ['/dev/ttyUSB0'])[0]
            port = qs.get('port', [None])[0]
            start_meshcore(transport, address, int(port) if port else None)
            self._send_json({'result': 'ok', 'message': 'MeshCore connecting...'})

        elif parsed.path == '/mesh/meshcore/stop':
            stop_meshcore()
            self._send_json({'result': 'ok'})

        elif parsed.path == '/mesh/meshcore/ports':
            # List likely serial devices for the UI dropdown
            import glob
            candidates = sorted(glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*'))
            self._send_json({'result': 'ok', 'ports': candidates})

        else:
            self._send_json({'result': 'error', 'description': 'unknown endpoint'}, status=404)


def start_http_server():
    """Run the local mesh-status HTTP server in a background thread."""
    server = HTTPServer(('127.0.0.1', MESH_HTTP_PORT), _MeshHTTPHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


if __name__ == '__main__':
    # Standalone test mode
    start_http_server()
    print(f'Mesh backend HTTP server running on http://127.0.0.1:{MESH_HTTP_PORT}')
    print('Endpoints: /mesh/status, /mesh/meshtastic/start, /mesh/meshcore/start, /mesh/meshcore/ports')
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
