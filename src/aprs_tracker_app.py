#!/usr/bin/env python3
"""
APRSaR Tracker — Fedora Desktop App
W7CTY / 914 Communications

Native GTK4 + WebKitGTK shell around the APRSaR Tracker web app.
Renders the bundled self-contained HTML (Leaflet map + aprs.fi API)
in a native window with proper geolocation permission handling,
a system-appropriate title bar, and desktop integration.
"""

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('WebKit', '6.0')
gi.require_version('Adw', '1')

from gi.repository import Gtk, WebKit, Adw, Gio, GLib
import os
import sys
import subprocess
import shutil
import threading

# Mesh networking backend (Meshtastic MQTT + MeshCore companion radio)
# is optional — app still works fine for APRS-only use if deps are missing.
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import mesh_backend
    MESH_AVAILABLE = True
except ImportError as e:
    MESH_AVAILABLE = False
    print(f'Mesh backend unavailable (optional): {e}', file=sys.stderr)

# Offline tile cache — stdlib only (sqlite3, urllib), always available.
try:
    import tile_cache
    TILE_CACHE_AVAILABLE = True
except ImportError as e:
    TILE_CACHE_AVAILABLE = False
    print(f'Tile cache unavailable: {e}', file=sys.stderr)

# APRS-IS two-way messaging — optional, requires aprslib (pip).
try:
    import aprs_messaging
    APRS_MESSAGING_AVAILABLE = True
except ImportError as e:
    APRS_MESSAGING_AVAILABLE = False
    print(f'APRS messaging unavailable (optional): {e}', file=sys.stderr)

# Self-update checker (GitHub Releases) — also optional; app works fine
# without it, just without the auto-update prompt.
try:
    import update_checker
    UPDATE_CHECKER_AVAILABLE = True
except ImportError as e:
    UPDATE_CHECKER_AVAILABLE = False
    print(f'Update checker unavailable (optional): {e}', file=sys.stderr)

APP_ID = 'co.communications.aprs.tracker'
APP_TITLE = 'APRSaR Tracker'

# Resolve the bundled HTML path — installed location first, then dev fallback
SEARCH_PATHS = [
    '/usr/share/aprs-tracker/aprs-tracker.html',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'aprs-tracker.html'),
]


def find_html():
    for p in SEARCH_PATHS:
        if os.path.isfile(p):
            return p
    print('ERROR: aprs-tracker.html not found in any known location:', file=sys.stderr)
    for p in SEARCH_PATHS:
        print('  -', p, file=sys.stderr)
    sys.exit(1)


class APRSWindow(Adw.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app, title=APP_TITLE)
        self.set_default_size(1280, 860)

        # ── Header bar ──────────────────────────────────────
        header = Adw.HeaderBar()
        header.set_title_widget(Adw.WindowTitle(title=APP_TITLE, subtitle='Robert W Donze - W7CTY · 914 Communications'))

        # Update button — hidden until a newer version is found. Kept as
        # its own prominent button (not buried in the menu below) since
        # it's time-sensitive and should be hard to miss when active.
        self.update_btn = Gtk.Button()
        update_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        update_box.append(Gtk.Image.new_from_icon_name('software-update-available-symbolic'))
        self.update_btn_label = Gtk.Label(label='Update')
        update_box.append(self.update_btn_label)
        self.update_btn.set_child(update_box)
        self.update_btn.set_tooltip_text('A new version is available')
        self.update_btn.add_css_class('suggested-action')
        self.update_btn.set_visible(False)
        self.update_btn.connect('clicked', self.on_update_clicked)
        header.pack_start(self.update_btn)

        # ── Options dropdown menu ──────────────────────────────
        # Window-scoped actions (win.*) backing each menu item.
        self._add_simple_action('reload', self.on_reload_action)
        self._add_simple_action('fullscreen', self.on_fullscreen_action)
        self._add_simple_action('check_updates', self.on_check_updates_action)
        self._add_simple_action('help', self.on_help_action)
        self._add_simple_action('about', self.on_about_action)

        menu = Gio.Menu()
        menu.append('Reload', 'win.reload')
        menu.append('Toggle Fullscreen', 'win.fullscreen')
        menu.append('Check for Updates', 'win.check_updates')

        help_section = Gio.Menu()
        help_section.append('Help / Instructions', 'win.help')
        help_section.append('About', 'win.about')
        menu.append_section(None, help_section)

        menu_btn = Gtk.MenuButton()
        menu_btn.set_icon_name('open-menu-symbolic')
        menu_btn.set_tooltip_text('Menu')
        menu_btn.set_menu_model(menu)
        header.pack_end(menu_btn)

        # ── WebView setup ───────────────────────────────────
        manager = WebKit.NetworkSession.get_default()

        self.webview = WebKit.WebView()
        settings = self.webview.get_settings()
        # Developer extras (WebKit DevTools) only in dev mode to avoid exposing
        # them in production installs. Set APRS_TRACKER_DEV=1 while developing.
        settings.set_enable_developer_extras(os.environ.get('APRS_TRACKER_DEV') == '1')
        settings.set_javascript_can_access_clipboard(True)
        # file:// pages must NOT be allowed to XHR other file:// URLs — a
        # malicious HTML file opened from disk could otherwise read arbitrary
        # local files. The local HTTP backends (ports 8731-8733) are reached
        # via http://127.0.0.1, not file://, so this restriction doesn't
        # affect normal operation.
        settings.set_allow_universal_access_from_file_urls(False)
        settings.set_enable_smooth_scrolling(True)

        # Geolocation permission — auto-grant since this is a trusted local app
        self.webview.connect('permission-request', self.on_permission_request)
        self.webview.connect('decide-policy', self.on_decide_policy)
        self.webview.connect('load-changed', self.on_load_changed)

        html_path = find_html()

        # Start the local mesh-status HTTP server (Meshtastic + MeshCore)
        # before loading the page, so it's ready when JS polls it.
        if MESH_AVAILABLE:
            try:
                mesh_backend.start_http_server()
            except OSError:
                pass  # already running (e.g. window re-created)

        # Start the offline tile cache proxy the same way.
        if TILE_CACHE_AVAILABLE:
            try:
                tile_cache.start_http_server()
            except OSError:
                pass

        # Start the APRS-IS messaging backend the same way. This only
        # opens a local HTTP listener; it does NOT connect to APRS-IS
        # until the person explicitly enables messaging in the UI.
        if APRS_MESSAGING_AVAILABLE:
            try:
                aprs_messaging.start_http_server()
            except OSError:
                pass

        self.webview.load_uri('file://' + html_path)

        # ── Layout ──────────────────────────────────────────
        toolbar_view = Adw.ToolbarView()
        toolbar_view.add_top_bar(header)
        toolbar_view.set_content(self.webview)
        self.set_content(toolbar_view)

        # Keyboard shortcuts
        key_controller = Gtk.EventControllerKey()
        key_controller.connect('key-pressed', self.on_key_pressed)
        self.add_controller(key_controller)

        # Check for updates in the background, a few seconds after launch
        # so it doesn't compete with initial page load for resources.
        self._pending_update = None
        if UPDATE_CHECKER_AVAILABLE:
            GLib.timeout_add_seconds(4, self._start_update_check)

    def _start_update_check(self):
        update_checker.check_async(self._on_update_check_done)
        return False  # one-shot timeout

    def _on_update_check_done(self, result):
        # Called from a background thread — marshal back to the GTK main loop
        GLib.idle_add(self._apply_update_check_result, result)

    def _apply_update_check_result(self, result):
        if result.get('update_available'):
            self._pending_update = result
            latest = result.get('latest_version', '?')
            current = result.get('current_version', '?')
            self.update_btn_label.set_label(f'Update to {latest}')
            self.update_btn.set_visible(True)
            # Also inject a banner into the WebView so users see it inside the app
            import json
            js = f'if(typeof showUpdateBanner==="function") showUpdateBanner({json.dumps(latest)},{json.dumps(current)});'
            self.webview.evaluate_javascript(js, -1, None, None, None, None, None)
        return False

    def on_update_clicked(self, button):
        if not self._pending_update:
            return
        self._show_update_dialog(self._pending_update)

    def _show_update_dialog(self, update_info):
        current = update_info.get('current_version', '?')
        latest = update_info.get('latest_version', '?')
        notes = (update_info.get('release_notes') or '').strip()

        body = f'A new version of APRSaR Tracker is available.\n\nCurrent: {current}\nNew: {latest}'
        if notes:
            # Keep it short in the dialog; full notes are on the GitHub release page
            short_notes = notes[:400] + ('…' if len(notes) > 400 else '')
            body += f'\n\nWhat\u2019s new:\n{short_notes}'

        dialog = Adw.AlertDialog(
            heading='Update Available',
            body=body,
        )
        dialog.add_response('cancel', 'Not Now')
        dialog.add_response('update', 'Update')
        dialog.set_response_appearance('update', Adw.ResponseAppearance.SUGGESTED)
        dialog.set_default_response('update')
        dialog.set_close_response('cancel')
        dialog.connect('response', self._on_update_dialog_response, update_info)
        dialog.present(self)

    def _on_update_dialog_response(self, dialog, response, update_info):
        if response != 'update':
            return
        self._begin_download_and_install(update_info)

    def _begin_download_and_install(self, update_info):
        url = update_info.get('download_url')
        if not url:
            self._show_toast_dialog('Update Error', 'No download URL available for this release.')
            return

        self.update_btn.set_sensitive(False)
        self.update_btn_label.set_label('Downloading…')

        def progress(downloaded, total):
            if total:
                pct = int(downloaded / total * 100)
                GLib.idle_add(self.update_btn_label.set_label, f'Downloading… {pct}%')

        def worker():
            try:
                rpm_path = update_checker.download_rpm(url, progress_cb=progress)
            except Exception as e:
                GLib.idle_add(self._on_download_failed, str(e))
                return
            GLib.idle_add(self._on_download_complete, rpm_path)

        threading.Thread(target=worker, daemon=True).start()

    def _on_download_failed(self, error_msg):
        self.update_btn.set_sensitive(True)
        self.update_btn_label.set_label('Update')
        self._show_toast_dialog('Download Failed', f'Could not download the update:\n{error_msg}')
        return False

    def _on_download_complete(self, rpm_path):
        self.update_btn_label.set_label('Installing…')

        def done(success, message):
            GLib.idle_add(self._on_install_complete, success, message)

        update_checker.install_rpm_with_pkexec(rpm_path, done_cb=done)
        return False

    def _on_install_complete(self, success, message):
        self.update_btn.set_sensitive(True)
        if success:
            self.update_btn.set_visible(False)
            self._pending_update = None
            self._show_restart_dialog(message)
        else:
            self.update_btn_label.set_label('Update')
            self._show_toast_dialog('Update Failed', message)
        return False

    def _show_restart_dialog(self, message):
        dialog = Adw.AlertDialog(
            heading='Update Installed',
            body=message + '\n\nRestart now to use the new version? Any unsaved data in the current window will be lost \u2014 the app autosaves most state, but it\'s worth finishing anything you\'re mid-typing first.',
        )
        dialog.add_response('later', 'Later')
        dialog.add_response('restart', 'Restart Now')
        dialog.set_response_appearance('restart', Adw.ResponseAppearance.SUGGESTED)
        dialog.set_default_response('restart')
        dialog.set_close_response('later')
        dialog.connect('response', self._on_restart_dialog_response)
        dialog.present(self)

    def _on_restart_dialog_response(self, dialog, response):
        if response == 'restart':
            self._restart_app()

    def _restart_app(self):
        """
        Launches a fresh, fully detached copy of the app, then quits this
        one. Detachment (start_new_session) is essential -- without it the
        new process would be a child of this one and die when this process
        exits, which would just close the app instead of restarting it.
        """
        try:
            launcher = shutil.which('aprs-tracker')
            if launcher:
                subprocess.Popen(
                    [launcher],
                    start_new_session=True,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                # Dev/source fallback: re-exec this same script directly
                subprocess.Popen(
                    [sys.executable, os.path.abspath(__file__)],
                    start_new_session=True,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        except Exception as e:
            self._show_toast_dialog(
                'Restart Failed',
                f'Could not launch the new version automatically: {e}\n\nClose and reopen APRSaR Tracker manually.'
            )
            return
        # Give the new process a brief moment to start before this one exits
        GLib.timeout_add(400, self._quit_after_restart)

    def _quit_after_restart(self):
        self.get_application().quit()
        return False

    def _show_toast_dialog(self, heading, body):
        dialog = Adw.AlertDialog(heading=heading, body=body)
        dialog.add_response('ok', 'OK')
        dialog.set_default_response('ok')
        dialog.set_close_response('ok')
        dialog.present(self)

    def on_load_changed(self, webview, load_event):
        if load_event == WebKit.LoadEvent.FINISHED:
            version = '0.0.0'
            if UPDATE_CHECKER_AVAILABLE:
                try:
                    version = update_checker.get_current_version()
                except Exception:
                    pass
            js = (
                "window.APP_VERSION = " + repr(version) + ";"
                "window.APP_REPO_URL = 'https://github.com/W7CTY/aprs-tracker';"
                "if (typeof onAppVersionReady === 'function') onAppVersionReady();"
            )
            webview.evaluate_javascript(js, -1, None, None, None, None, None)

    def on_permission_request(self, webview, request):
        # Auto-grant geolocation — needed for the "Me" / GPS-locate button
        if isinstance(request, WebKit.GeolocationPermissionRequest):
            request.allow()
            return True
        if isinstance(request, WebKit.NotificationPermissionRequest):
            request.allow()
            return True
        if isinstance(request, WebKit.UserMediaPermissionRequest):
            # Needed for the T-Cards tab's camera-based QR check-in
            # scanner, which only ever requests video
            # (getUserMedia({video: {...}}) in the JS, no audio: true).
            # Explicitly check is_for_audio_device() here too rather than
            # relying on that always being true -- a future code change
            # to the JS shouldn't silently gain microphone access just
            # because this handler already blanket-allows UserMedia
            # requests for an unrelated reason. If this GI binding call
            # itself fails for any reason, fail safe by denying instead
            # of crashing the permission handler or silently allowing.
            try:
                if request.is_for_audio_device():
                    request.deny()
                    return True
            except Exception as e:
                print(f'UserMediaPermissionRequest audio check failed, denying to be safe: {e}', file=sys.stderr)
                request.deny()
                return True
            request.allow()
            return True
        return False

    def on_decide_policy(self, webview, decision, decision_type):
        if decision_type in (WebKit.PolicyDecisionType.NAVIGATION_ACTION,
                             WebKit.PolicyDecisionType.NEW_WINDOW_ACTION):
            nav_action = decision.get_navigation_action()
            uri = nav_action.get_request().get_uri()

            # Custom action URIs triggered from JS (e.g. the in-app update banner)
            if uri.startswith('aprs-tracker-action://'):
                action = uri.replace('aprs-tracker-action://', '')
                if action == 'trigger-update' and self._pending_update:
                    GLib.idle_add(self._show_update_dialog, self._pending_update)
                decision.ignore()
                return True

            # External links → system browser
            if decision_type == WebKit.PolicyDecisionType.NEW_WINDOW_ACTION:
                Gio.AppInfo.launch_default_for_uri(uri, None)
                decision.ignore()
                return True

        return False

    def on_reload(self, button):
        self.webview.reload()

    def on_fullscreen(self, button):
        if self.is_fullscreen():
            self.unfullscreen()
        else:
            self.fullscreen()

    def _add_simple_action(self, name, callback):
        """Registers a window-scoped Gio.SimpleAction (win.<name>) backing
        a menu item. GTK actions call back as (action, parameter)."""
        action = Gio.SimpleAction.new(name, None)
        action.connect('activate', callback)
        self.add_action(action)
        return action

    def on_reload_action(self, action, param):
        self.on_reload(None)

    def on_fullscreen_action(self, action, param):
        self.on_fullscreen(None)

    def on_check_updates_action(self, action, param):
        if not UPDATE_CHECKER_AVAILABLE:
            self._show_toast_dialog('Updates Unavailable', 'The update checker module is not available in this install.')
            return
        update_checker.check_async(self._on_manual_update_check_done)

    def _on_manual_update_check_done(self, result):
        GLib.idle_add(self._apply_manual_update_check_result, result)

    def _apply_manual_update_check_result(self, result):
        if result.get('error'):
            self._show_toast_dialog('Update Check Failed', result['error'])
        elif result.get('update_available'):
            self._pending_update = result
            latest = result.get('latest_version', '?')
            self.update_btn_label.set_label(f'Update to {latest}')
            self.update_btn.set_visible(True)
            self._show_update_dialog(result)
        else:
            current = result.get('current_version', '?')
            self._show_toast_dialog('Up to Date', f'You\u2019re running the latest version ({current}).')
        return False

    def on_help_action(self, action, param):
        self._show_help_dialog()

    def _show_help_dialog(self):
        body = (
            'Getting started\n'
            '\u2022 Enter a callsign and tap Track to follow a station on the map.\n'
            '\u2022 Tap Me to show your own GPS position, or Set to enter a position manually.\n'
            '\u2022 Use the layers button (top-left, on the map) to switch between Street, '
            'Topo, Satellite, and Nat Geo map styles.\n\n'
            'SAR tools\n'
            '\u2022 OPS \u2014 create and switch between separate search operations, so their '
            'data doesn\u2019t mix together.\n'
            '\u2022 SUBJ \u2014 add search subjects, with or without a tracked callsign.\n'
            '\u2022 SEARCH \u2014 draw search sectors on the map and track their status.\n'
            '\u2022 SAR OPS \u2014 the search timer, LKP/PLS/IPP/Clue markers, and the sweep-width '
            'effort estimator.\n'
            '\u2022 ROSTER \u2014 check in personnel; anyone with a callsign is tracked live, '
            'just like a Subject.\n'
            '\u2022 TOOLS \u2014 coordinate conversion, distance/bearing, waypoints, and GPX/KML '
            'import-export.\n'
            '\u2022 LOG \u2014 a permanent, dated history of everything that happens, with export.\n\n'
            'Optional features\n'
            '\u2022 MESH \u2014 Meshtastic (MQTT) and MeshCore (companion radio) node positions, '
            'merged onto the map.\n'
            '\u2022 MSG \u2014 two-way APRS-IS text messaging using your own callsign.\n'
            '\u2022 OFFLINE \u2014 pre-download Street-layer map tiles for an area before you '
            'lose signal.\n\n'
            'Both MESH and MSG need a few extra Python packages that aren\u2019t included by '
            'default \u2014 see the ABOUT tab or the project README for the install command.\n\n'
            'Full documentation: github.com/W7CTY/aprs-tracker'
        )
        dialog = Adw.AlertDialog(heading='Help & Instructions', body=body)
        dialog.add_response('ok', 'Got It')
        dialog.set_default_response('ok')
        dialog.set_close_response('ok')
        dialog.present(self)

    def on_about_action(self, action, param):
        # The web UI already has a full ABOUT tab (version, data sources,
        # links); jump straight to it rather than duplicating that
        # content in a second, native dialog.
        self.webview.evaluate_javascript(
            "if (typeof swTab === 'function') swTab('about');",
            -1, None, None, None, None, None
        )

    def on_key_pressed(self, controller, keyval, keycode, state):
        # F11 fullscreen, F5/Ctrl+R reload, Ctrl+Q quit
        from gi.repository import Gdk
        if keyval == Gdk.KEY_F11:
            self.on_fullscreen(None)
            return True
        if keyval == Gdk.KEY_F5:
            self.on_reload(None)
            return True
        if keyval == Gdk.KEY_q and (state & Gdk.ModifierType.CONTROL_MASK):
            self.close()
            return True
        return False


class APRSApp(Adw.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID,
                          flags=Gio.ApplicationFlags.DEFAULT_FLAGS)

    def do_activate(self):
        win = self.props.active_window
        if not win:
            win = APRSWindow(self)
        win.present()


def main():
    app = APRSApp()
    return app.run(sys.argv)


if __name__ == '__main__':
    sys.exit(main())
