#!/usr/bin/env python3
"""Download SELT reports locally and upload extracted drafts to Coursemap.

Credentials are prompted for, retained in memory and never written to the workspace.
"""
from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SOURCE = "https://unistats.anu.edu.au/internal/surveys/selt/learning/time-series/"
CODE = re.compile(r"^[A-Z]{4}[0-9]{4}$")
MAX_PDF_BYTES = 10_000_000


class ImportFailure(Exception):
    pass


class AuthenticationFailure(ImportFailure):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Never forward either ANU credentials or Coursemap tokens through redirects.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def site_origin(value):
    parsed = urllib.parse.urlsplit(value)
    local = parsed.hostname in ("localhost", "127.0.0.1", "::1")
    if (parsed.scheme != "https" and not (local and parsed.scheme == "http")) or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ImportFailure("Use an HTTPS Coursemap origin, or HTTP on localhost.")
    return value.rstrip("/")


def request_bytes(url, authorization, payload=None, opener=None, sleep=time.sleep):
    opener = opener or urllib.request.build_opener(NoRedirect())
    headers = {"Authorization": authorization, "Accept": "application/json" if payload is not None else "*/*"}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, data=body, headers=headers)
            with opener.open(request, timeout=60) as response:
                result = response.read(MAX_PDF_BYTES + 1)
                if len(result) > MAX_PDF_BYTES:
                    raise ImportFailure("The response exceeds the download limit.")
                return result
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise AuthenticationFailure("Access was refused. Refresh the relevant credentials or import token, then resume.") from None
            if error.code == 404:
                return None
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise ImportFailure(f"The server returned HTTP {error.code}.") from None
            retry = error.headers.get("Retry-After", "")
            sleep(min(120, max(2 ** (attempt + 1), int(retry) if retry.isdigit() else 0)))
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == 3:
                raise ImportFailure("The network request failed after four attempts.") from None
            sleep(2 ** (attempt + 1))
    raise ImportFailure("The request failed.")


def save_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)


def process_course(code, folder, state, site, anu_auth, token, extractor, parser_version, refresh=False, retry_missing=False, request=request_bytes):
    entry = state.setdefault(code, {})
    pdf = folder / f"{code}_Time_Series_LRN.pdf"
    output = pdf.with_suffix(".json")
    if entry.get("status") == "missing" and not retry_missing and not refresh:
        return "missing"
    if refresh or not pdf.exists():
        content = request(SOURCE + pdf.name, anu_auth)
        if content is None:
            entry.update(status="missing")
            return "missing"
        if not content.startswith(b"%PDF-"):
            raise AuthenticationFailure("ANU returned a page instead of a PDF. Check ANU access before resuming.")
        pdf.write_bytes(content)
        pdf.chmod(0o600)
    digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
    report = None
    if output.exists():
        try:
            cached = json.loads(output.read_text())
            if cached["source"]["sha256"] == digest and cached["extraction"]["parser_version"] == parser_version:
                report = cached
        except (ValueError, KeyError, TypeError):
            pass
    if report is None:
        report = extractor(pdf)
        save_json(output, report)
    if report["report"]["course_code"] != code:
        raise ImportFailure("The extracted course code does not match the requested PDF.")
    if not report["surveys"]:
        raise ImportFailure("No survey periods were extracted. Review the local PDF.")
    # Bind resume state to both the PDF/parser and destination; a new server must receive it.
    upload_key = f"{site}/{digest}/{parser_version}"
    if not refresh and entry.get("uploaded_key") == upload_key:
        return "already uploaded"
    response = request(site + "/api/selt/import", "Bearer " + token, report)
    if response is None:
        raise ImportFailure("The Coursemap upload endpoint was not found.")
    result = json.loads(response)
    if result.get("outcome") not in ("imported", "unchanged"):
        raise ImportFailure("Coursemap did not confirm this upload.")
    entry.update(status="uploaded", uploaded_key=upload_key, warnings=report["extraction"]["warnings"])
    return result["outcome"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", required=True, help="Coursemap origin, for example https://coursemap.example")
    parser.add_argument("--output", type=Path, default=Path.home() / "Coursemap-SELT")
    parser.add_argument("--codes", type=Path, help="Optional text file of course codes separated by whitespace or commas.")
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--limit", type=int, default=10, help="Pilot size; defaults to ten courses.")
    selection.add_argument("--all", action="store_true", help="Process the entire course list.")
    parser.add_argument("--refresh", action="store_true", help="Fetch new PDFs and recheck uploads.")
    parser.add_argument("--retry-missing", action="store_true", help="Retry reports previously returning 404.")
    args = parser.parse_args()
    site = site_origin(args.site)
    if args.limit < 1:
        raise ImportFailure("The course limit must be positive.")
    if not sys.stdin.isatty():
        raise ImportFailure("Run this script in a terminal for hidden credential prompts.")
    # The existing vector parser depends on pdfplumber and Poppler, never OCR or AI.
    from importlib.util import spec_from_file_location, module_from_spec
    spec = spec_from_file_location("selt_extractor", Path(__file__).with_name("extract_report.py"))
    extractor = module_from_spec(spec)
    spec.loader.exec_module(extractor)
    extractor.require_command("pdftotext")
    token = getpass.getpass("Coursemap import token: ").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        raise ImportFailure("Paste the token from Coursemap admin > SELT imports.")
    # Validate the Coursemap token before asking for ANU credentials.
    manifest = request_bytes(site + "/api/selt/import", "Bearer " + token)
    if manifest is None:
        raise ImportFailure("The Coursemap import endpoint was not found.")
    known_codes = set(json.loads(manifest)["codes"])
    if args.codes:
        codes = sorted(set(re.split(r"[\s,]+", args.codes.read_text().strip().upper())) - {""})
        if any(not CODE.fullmatch(code) or code not in known_codes for code in codes):
            raise ImportFailure("Every selected code must be a course in the Coursemap catalogue.")
    else:
        codes = sorted(known_codes)
    if not args.all:
        codes = codes[:args.limit]
    if not codes:
        raise ImportFailure("There are no courses to process.")
    username = input("ANU username: ").strip()
    if not username or ":" in username:
        raise ImportFailure("Enter a valid ANU username.")
    password = getpass.getpass("ANU password (kept in memory): ")
    anu_auth = "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()
    del password
    os.umask(0o077)
    folder = args.output.expanduser().resolve()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    state_path = folder / "progress.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    failures = 0
    print(f"Processing {len(codes)} courses. Local reports: {folder}")
    for index, code in enumerate(codes, 1):
        try:
            outcome = process_course(code, folder, state, site, anu_auth, token, extractor.build_report, extractor.PARSER_VERSION, args.refresh, args.retry_missing)
            print(f"[{index}/{len(codes)}] {code}: {outcome}")
        except AuthenticationFailure:
            save_json(state_path, state)
            raise
        except Exception:
            # Parser/network exceptions can include remote content. Keep logs credential-free.
            failures += 1
            state.setdefault(code, {}).update(status="failed")
            print(f"[{index}/{len(codes)}] {code}: failed; retained local files for review and retry.")
        save_json(state_path, state)
        time.sleep(0.5)
    print(f"Finished with {failures} failures. Review uploaded drafts at {site}/admin/selt.")
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ImportFailure as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
    except KeyboardInterrupt:
        print("Stopped. Run the same command to resume.", file=sys.stderr)
        raise SystemExit(130)
