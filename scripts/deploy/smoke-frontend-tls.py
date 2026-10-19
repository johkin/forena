#!/usr/bin/env python3
"""Test the built standalone server's TLS trust through its real entrypoint."""
import http.server
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]


class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if self.path == "/actuator/health" else 404)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"UP"}')

    def log_message(self, *_args):
        pass


def check(server, ca_file, trusted, hostname, expected):
    with socket.socket() as available:
        available.bind(("127.0.0.1", 0))
        port = available.getsockname()[1]
    environment = os.environ | {
        "PORT": str(port), "SITE_URL": "https://forena-kotlin.vercel.app",
        "NEXT_PUBLIC_SUPABASE_URL": "https://ckzrtxqjskosqzoitymc.supabase.co",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_synthetic",
        "FORENA_KOTLIN_SERVICE_URL": f"https://{hostname}:{server.server_port}/",
        "NODE_EXTRA_CA_CERTS": str(ca_file) if trusted else "",
        # The entrypoint must discard both, even if inherited from the project.
        "NODE_TLS_REJECT_UNAUTHORIZED": "0", "NODE_OPTIONS": "--invalid-poison-option",
    }
    with tempfile.TemporaryFile(mode="w+") as log:
        child = subprocess.Popen(["sh", str(ROOT / "deploy/frontend/entrypoint.sh")],
                                 cwd=ROOT / ".next/standalone", env=environment,
                                 stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 20
            while True:
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/migration/health", timeout=5) as response:
                        status, body = response.status, json.load(response)
                    break
                except urllib.error.HTTPError as error:
                    status, body = error.code, json.load(error)
                    break
                except urllib.error.URLError:
                    if child.poll() is not None or time.monotonic() >= deadline:
                        raise RuntimeError("Standalone server did not start") from None
                    time.sleep(0.15)
            assert status == expected, (trusted, hostname, status)
            if status == 200:
                version = json.loads((ROOT / "public/app-version.json").read_text())["version"]
                assert body == {"status": "ok", "version": version}
            else:
                assert body == {"status": "unavailable"}
                log.seek(0)
                reason = "SELF_SIGNED_CERT_IN_CHAIN" if not trusted else "ERR_TLS_CERT_ALTNAME_INVALID"
                assert reason in log.read(), "Expected TLS failure was not logged"
            print(f"PASS: trusted_ca={trusted}, hostname={hostname}, HTTP {status}")
        finally:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


def main():
    with tempfile.TemporaryDirectory(prefix="forena-tls-") as directory:
        work = Path(directory)

        def openssl(*args):
            subprocess.run(["openssl", *args], cwd=work, check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                "-subj", "/CN=Forena synthetic test CA", "-keyout", "ca.key", "-out", "ca.crt")
        openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=synthetic-backend.invalid",
                "-keyout", "server.key", "-out", "server.csr")
        (work / "extensions").write_text("subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n")
        openssl("x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key",
                "-CAcreateserial", "-days", "1", "-extfile", "extensions", "-out", "server.crt")
        (work / "chain.crt").write_text((work / "server.crt").read_text() + (work / "ca.crt").read_text())
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(work / "chain.crt", work / "server.key")
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), HealthHandler)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            check(server, work / "ca.crt", False, "127.0.0.1", 503)
            check(server, work / "ca.crt", True, "127.0.0.1", 200)
            check(server, work / "ca.crt", True, "localhost", 503)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
