#!/usr/bin/env python3
"""
Self-Update Checker — APRS Tracker / SAR Toolkit
W7CTY / 914 Communications

Checks GitHub Releases for newer versions of the RPM package, downloads
the asset, and installs it via pkexec (graphical polkit auth prompt,
no terminal needed).

Repo: https://github.com/W7CTY/aprs-tracker
Release assets are expected to be named: aprs-tracker-<version>-1.fc*.noarch.rpm
"""

import json
import os
import re
import subprocess
import tempfile
import threading
import urllib.request
import urllib.error

GITHUB_REPO = "W7CTY/aprs-tracker"
GITHUB_API_LATEST = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
USER_AGENT = "aprs-tracker-update-checker"


def get_current_version():
    """Read the version baked into this install from the RPM database,
    falling back to a bundled VERSION file if not installed via RPM
    (e.g. running from source during development)."""
    try:
        out = subprocess.run(
            ["rpm", "-q", "--qf", "%{VERSION}", "aprs-tracker"],
            capture_output=True, text=True, timeout=5
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except Exception:
        pass

    # Fallback for dev/source runs: read VERSION file next to this script
    version_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "VERSION")
    if os.path.isfile(version_file):
        with open(version_file) as f:
            return f.read().strip()

    return "0.0.0"


def _parse_version(v):
    """Parse 'X.Y.Z' into a tuple of ints for comparison."""
    parts = re.findall(r'\d+', v)
    return tuple(int(p) for p in parts) if parts else (0,)


def version_is_newer(remote, local):
    return _parse_version(remote) > _parse_version(local)


def check_for_update(timeout=10):
    """
    Returns a dict:
      {
        'update_available': bool,
        'current_version': str,
        'latest_version': str or None,
        'download_url': str or None,
        'release_notes': str or None,
        'error': str or None,
      }
    Never raises -- network failures are reported via 'error', not exceptions,
    since this runs on every app startup and must not crash the app.
    """
    current = get_current_version()
    result = {
        'update_available': False,
        'current_version': current,
        'latest_version': None,
        'download_url': None,
        'release_notes': None,
        'error': None,
    }

    try:
        req = urllib.request.Request(GITHUB_API_LATEST, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            result['error'] = 'No releases published yet'
        elif e.code == 403:
            result['error'] = 'GitHub API rate limit reached, try again later'
        else:
            result['error'] = f'GitHub API error: {e.code}'
        return result
    except Exception as e:
        result['error'] = f'Update check failed: {e}'
        return result

    tag = data.get('tag_name', '')
    latest_version = tag.lstrip('v')
    result['latest_version'] = latest_version
    result['release_notes'] = data.get('body', '')[:2000]

    # Find the RPM asset
    rpm_asset = None
    for asset in data.get('assets', []):
        name = asset.get('name', '')
        if name.endswith('.rpm') and 'noarch' in name:
            rpm_asset = asset
            break
    if not rpm_asset and data.get('assets'):
        # Fall back to first .rpm asset if naming doesn't match exactly
        for asset in data.get('assets', []):
            if asset.get('name', '').endswith('.rpm'):
                rpm_asset = asset
                break

    if not rpm_asset:
        result['error'] = 'Latest release has no RPM asset attached'
        return result

    result['download_url'] = rpm_asset.get('browser_download_url')

    if version_is_newer(latest_version, current):
        result['update_available'] = True

    return result


def download_rpm(url, progress_cb=None, timeout=60):
    """
    Downloads the RPM to a temp file. Returns the local path.
    progress_cb(bytes_downloaded, total_bytes) is called periodically if given.
    Raises on failure -- caller should catch and report to the UI.

    Note: this verifies the download is structurally a valid RPM package
    (see verify_rpm_file below) before returning, but does not verify
    cryptographic authenticity beyond the HTTPS transport itself -- there
    is no GPG signature check. This protects against corrupted/truncated
    downloads and unexpected non-RPM responses (e.g. an HTML error page
    served instead of the asset), not against a compromised release.
    """
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    fd, path = tempfile.mkstemp(suffix='.rpm', prefix='aprs-tracker-update-')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get('Content-Type', '')
            if 'text/html' in content_type.lower():
                # GitHub serving an HTML page instead of the binary asset
                # usually means a redirect to a login/error page rather
                # than the actual release file -- fail fast and clearly
                # instead of handing a bogus file to pkexec later.
                raise ValueError(f'Server returned HTML instead of a file (Content-Type: {content_type})')

            total = int(resp.headers.get('Content-Length', 0))
            downloaded = 0
            with os.fdopen(fd, 'wb') as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if progress_cb:
                        progress_cb(downloaded, total)

        if not verify_rpm_file(path):
            raise ValueError('Downloaded file is not a valid RPM package (failed structural check)')
    except Exception:
        try:
            os.unlink(path)
        except OSError:
            pass
        raise
    return path


def verify_rpm_file(path):
    """
    Structural sanity check: confirms the file is actually a parseable
    RPM package before it's ever handed to pkexec for installation.
    Catches truncated downloads, HTML error pages saved with a .rpm
    extension, and similar corruption -- this is NOT a cryptographic
    signature check (no GPG verification is performed).
    """
    # RPM files start with a fixed 4-byte magic number: 0xEDABEEDB
    try:
        with open(path, 'rb') as f:
            magic = f.read(4)
        if magic != b'\xed\xab\xee\xdb':
            return False
    except OSError:
        return False

    # Belt-and-suspenders: also ask rpm itself to parse the package
    # metadata, if the rpm command is available.
    try:
        proc = subprocess.run(
            ["rpm", "-qp", "--qf", "%{NAME}", path],
            capture_output=True, text=True, timeout=10
        )
        if proc.returncode != 0:
            return False
    except FileNotFoundError:
        pass  # rpm command not available -- fall back to the magic-number check alone
    except Exception:
        return False

    return True


def install_rpm_with_pkexec(rpm_path, done_cb=None):
    """
    Runs `pkexec dnf install -y <rpm_path>` in a background thread.
    pkexec shows a native graphical polkit authentication dialog --
    no terminal needed. done_cb(success: bool, message: str) is called
    on completion, from the background thread (caller should marshal
    back to the GTK main thread with GLib.idle_add if touching widgets).
    """
    def run():
        try:
            proc = subprocess.run(
                ["pkexec", "dnf", "install", "-y", rpm_path],
                capture_output=True, text=True, timeout=300
            )
            try:
                os.unlink(rpm_path)
            except OSError:
                pass
            if proc.returncode == 0:
                if done_cb:
                    done_cb(True, "Update installed successfully. Restart the app to use the new version.")
            else:
                if done_cb:
                    done_cb(False, f"Install failed: {proc.stderr.strip()[:300]}")
        except subprocess.TimeoutExpired:
            if done_cb:
                done_cb(False, "Install timed out.")
        except FileNotFoundError:
            if done_cb:
                done_cb(False, "pkexec not found -- install polkit, or run manually: sudo dnf install " + rpm_path)
        except Exception as e:
            if done_cb:
                done_cb(False, f"Install error: {e}")

    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t


def check_async(done_cb):
    """Run check_for_update() in a background thread; done_cb(result_dict)
    is called on completion from that thread."""
    def run():
        result = check_for_update()
        done_cb(result)
    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t


if __name__ == '__main__':
    print(f"Current version: {get_current_version()}")
    print("Checking for updates...")
    result = check_for_update()
    print(json.dumps(result, indent=2))
