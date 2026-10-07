"""Behaviour tests for authenticated downloads and resumable uploads."""
import importlib.util
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path

spec = importlib.util.spec_from_file_location("selt_import", Path(__file__).with_name("import-reports.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BulkImportTests(unittest.TestCase):
    def test_refuses_redirects_and_unsafe_destinations(self):
        self.assertIsNone(module.NoRedirect().redirect_request(None, None, 302, "", {}, "https://elsewhere.example"))
        for value in ("http://coursemap.example", "https://user:password@coursemap.example", "https://coursemap.example/path"):
            with self.assertRaises(module.ImportFailure):
                module.site_origin(value)
        self.assertEqual(module.site_origin("http://127.0.0.1:3000"), "http://127.0.0.1:3000")

    def test_authentication_stops_without_retry(self):
        class Refused:
            calls = 0
            def open(self, request, timeout):
                self.calls += 1
                raise urllib.error.HTTPError(request.full_url, 401, "Private", {}, None)
        opener = Refused()
        with self.assertRaises(module.AuthenticationFailure):
            module.request_bytes("https://example.test/report", "Basic synthetic", opener=opener)
        self.assertEqual(opener.calls, 1)

    def test_retries_transient_failures(self):
        class Retry:
            calls = 0
            def open(self, request, timeout):
                self.calls += 1
                raise urllib.error.HTTPError(request.full_url, 503, "Unavailable", {}, None)
        opener = Retry()
        delays = []
        with self.assertRaises(module.ImportFailure):
            module.request_bytes("https://example.test/report", "Basic synthetic", opener=opener, sleep=delays.append)
        self.assertEqual(opener.calls, 4)
        self.assertEqual(delays, [2, 4, 8])

    def test_resume_avoids_download_and_duplicate_upload(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            calls = []
            def request(url, authorization, payload=None):
                calls.append((url, payload is not None))
                return b'%PDF-synthetic' if payload is None else json.dumps({"outcome": "imported"}).encode()
            def extract(pdf):
                return {"report": {"course_code": "TEST1234"}, "source": {"sha256": module.hashlib.sha256(pdf.read_bytes()).hexdigest()}, "surveys": [{}], "extraction": {"parser_version": "0.1.0", "warnings": []}}
            state = {}
            def run(site="https://coursemap.test"):
                return module.process_course("TEST1234", folder, state, site, "Basic synthetic", "synthetic-token", extract, "0.1.0", request=request)
            self.assertEqual(run(), "imported")
            self.assertEqual(run(), "already uploaded")
            self.assertEqual(len(calls), 2)
            self.assertEqual(run("https://other-coursemap.test"), "imported")
            self.assertEqual(len(calls), 3)
            text = json.dumps(state)
            self.assertNotIn("synthetic-token", text)
            self.assertNotIn("Basic", text)

    def test_login_html_never_reaches_parser_or_upload(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(module.AuthenticationFailure):
                module.process_course("TEST1234", Path(temporary), {}, "https://coursemap.test", "Basic synthetic", "token", lambda pdf: self.fail("Parser must not run"), "0.1.0", request=lambda *args: b'<html>Sign in</html>')

    def test_missing_reports_are_recorded_and_can_be_retried(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = {}
            calls = []
            def missing(*args):
                calls.append(True)
                return None
            for retry in (False, False, True):
                outcome = module.process_course("TEST1234", Path(temporary), state, "https://coursemap.test", "Basic synthetic", "token", None, "0.1.0", retry_missing=retry, request=missing)
                self.assertEqual(outcome, "missing")
            self.assertEqual(len(calls), 2)

if __name__ == "__main__":
    unittest.main()
