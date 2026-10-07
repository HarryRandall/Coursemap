#!/usr/bin/env python3
"""Extract a quantitative SELT course time-series PDF into JSON.

This parser reads the visible report content only. It deliberately does not
execute PDF JavaScript or expose embedded Cognos drill-through configuration.

Usage:
    python3 apps/web/scripts/selt/extract_report.py input.pdf --output output.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    import pdfplumber
except ImportError as error:  # pragma: no cover - environment-specific
    raise SystemExit(
        "pdfplumber is required. Install it with: python3 -m pip install pdfplumber"
    ) from error


SCHEMA_VERSION = "selt-course-time-series.v1"
PARSER_VERSION = "0.1.0"
PERIOD_PATTERN = re.compile(r"\b(Sem\s+[12])\s+((?:19|20)\d{2})\b")
THEME_PATTERN = re.compile(r"^(.+?)\s+\((\d{4})-\)\s*$")
PERCENT_PATTERN = re.compile(r"(?<!\d)(\d{1,3})%")
INTEGER_PATTERN = re.compile(r"(?<![A-Za-z])\d+(?![A-Za-z])")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract visible data from a quantitative SELT time-series PDF."
    )
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        help="JSON output path. Defaults to the input filename with a .json suffix.",
    )
    return parser.parse_args()


def require_command(command: str) -> None:
    if shutil.which(command) is None:
        raise RuntimeError(
            f"{command} was not found. Install Poppler so pdftotext is available."
        )


def extract_text(pdf_path: Path) -> str:
    require_command("pdftotext")
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        capture_output=True,
        check=True,
        text=True,
    )
    return result.stdout.replace("\r\n", "\n")


def first_line_value(text: str, label: str) -> str | None:
    match = re.search(rf"^\s*{re.escape(label)}\s*:\s*(.+?)\s*$", text, re.MULTILINE)
    return match.group(1).strip() if match else None


def parse_run_at(raw_value: str | None) -> str | None:
    if not raw_value:
        return None
    try:
        return datetime.strptime(raw_value, "%I:%M:%S %p %d/%m/%Y").isoformat()
    except ValueError:
        return None


def slugify(value: str) -> str:
    value = value.lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "_", value).strip("_")


def extract_periods(text: str) -> list[dict[str, Any]]:
    periods: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for session, year_text in PERIOD_PATTERN.findall(text):
        year = int(year_text)
        key = (session, year)
        if key in seen:
            continue
        seen.add(key)
        periods.append(
            {
                "label": f"{session} {year}",
                "year": year,
                "session": slugify(session),
            }
        )
    return periods


def extract_themes(text: str) -> list[dict[str, Any]]:
    start = text.find("Question theme")
    end = text.find("% agreement", start)
    if start == -1 or end == -1:
        return []

    themes: list[dict[str, Any]] = []
    for line in text[start:end].splitlines():
        match = THEME_PATTERN.match(line.strip())
        if not match:
            continue
        label, introduced_year = match.groups()
        label = re.sub(r"^\d{1,3}%\s+", "", label).strip()
        themes.append(
            {
                "key": slugify(label),
                "label": label.strip(),
                "introduced_year": int(introduced_year),
            }
        )
    return themes


def extract_row_values(
    text: str, label: str, value_pattern: re.Pattern[str]
) -> list[int]:
    for line in text.splitlines():
        if not line.strip().startswith(label):
            continue
        return [int(value) for value in value_pattern.findall(line)]
    return []


def extract_notes(text: str) -> list[str]:
    notes: list[str] = []
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if not line.strip().startswith("Note:"):
            continue
        note_lines = [line.strip()]
        for continuation in lines[index + 1 :]:
            stripped = continuation.strip()
            if not stripped or stripped.startswith(("Report run at", "Source:")):
                break
            note_lines.append(stripped)
        notes.append(re.sub(r"\s+", " ", " ".join(note_lines)))
    return notes


def extract_chart_values(
    pdf_path: Path, period_count: int, themes: list[dict[str, Any]]
) -> tuple[dict[str, list[int | None]], list[str]]:
    """Recover chart values from the vector line geometry.

    This report renders each series as twelve coloured line segments. The
    segments are ordered by series, and their endpoint coordinates map to the
    chart's 0-100% horizontal grid. This avoids guessing values from a raster
    screenshot while keeping a warning if another report format differs.
    """

    warnings: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        if not pdf.pages:
            return {}, ["The PDF contains no pages."]
        page = pdf.pages[0]

        grid_lines = [
            line
            for line in page.lines
            if line.get("x0", 0) < 80
            and line.get("x1", 0) > 420
            and abs(line.get("top", 0) - line.get("bottom", 0)) < 0.01
            and line.get("stroking_color") == (0.8, 0.8, 0.8)
        ]
        if len(grid_lines) < 2:
            return {}, ["Could not identify the chart percentage grid."]

        y_for_zero = max(line["top"] for line in grid_lines)
        y_for_hundred = min(line["top"] for line in grid_lines)
        chart_lines = [
            line
            for line in page.lines
            if line.get("linewidth", 0) > 0.6
            and line.get("x0", 0) > 80
            and line.get("x1", 0) < 430
            and line.get("non_stroking_color") == (0.0, 0.0, 0.0)
            and isinstance(line.get("stroking_color"), tuple)
            and len(set(line["stroking_color"])) > 1
        ]

    groups: list[list[dict[str, Any]]] = []
    for line in chart_lines:
        if not groups or line["x0"] < groups[-1][-1]["x0"] - 1:
            groups.append([])
        groups[-1].append(line)

    if len(groups) != len(themes):
        warnings.append(
            f"Expected {len(themes)} chart series but found {len(groups)} vector series."
        )

    values: dict[str, list[int | None]] = {}
    scale = y_for_zero - y_for_hundred
    for index, theme in enumerate(themes):
        if index >= len(groups):
            values[theme["key"]] = [None] * period_count
            continue

        points: list[float] = []
        points.append(float(groups[index][0]["pts"][0][1]))
        points.extend(float(line["pts"][1][1]) for line in groups[index])

        series: list[int | None] = []
        for y_coordinate in points:
            percentage = (y_for_zero - y_coordinate) / scale * 100
            if percentage < -1 or percentage > 101:
                series.append(None)
                warnings.append(
                    f"Chart value for {theme['label']} fell outside the 0-100% range."
                )
            else:
                series.append(max(0, min(100, int(round(percentage)))))

        if len(series) != period_count:
            warnings.append(
                f"Expected {period_count} points for {theme['label']} but found {len(series)}."
            )
            series = (series + [None] * period_count)[:period_count]
        values[theme["key"]] = series

    return values, warnings


def build_report(pdf_path: Path) -> dict[str, Any]:
    text = extract_text(pdf_path)
    periods = extract_periods(text)
    themes = extract_themes(text)
    warnings: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
    if page_count != 1:
        warnings.append(
            f"Expected a one-page report but found {page_count}; chart extraction uses page 1."
        )

    enrolments = extract_row_values(text, "Enrolments", INTEGER_PATTERN)
    respondents = extract_row_values(text, "Respondents", INTEGER_PATTERN)
    response_rates = extract_row_values(text, "Response rate", PERCENT_PATTERN)
    table_overall_agreement = extract_row_values(
        text, "Overall learning", PERCENT_PATTERN
    )
    chart_values, chart_warnings = extract_chart_values(pdf_path, len(periods), themes)
    warnings.extend(chart_warnings)

    if not periods:
        warnings.append("No survey periods were found.")
    for label, values in (
        ("Enrolments", enrolments),
        ("Respondents", respondents),
        ("Response rate", response_rates),
    ):
        if len(values) != len(periods):
            warnings.append(
                f"Expected {len(periods)} values for {label} but found {len(values)}."
            )

    for index, period in enumerate(periods):
        period["enrolments"] = enrolments[index] if index < len(enrolments) else None
        period["respondents"] = respondents[index] if index < len(respondents) else None
        period["response_rate_percent"] = (
            response_rates[index] if index < len(response_rates) else None
        )
        period["agreement_percent"] = {
            theme["key"]: chart_values.get(theme["key"], [None] * len(periods))[index]
            for theme in themes
        }
        overall_key = "overall_learning_experience"
        chart_overall = period["agreement_percent"].get(overall_key)
        table_overall = (
            table_overall_agreement[index]
            if index < len(table_overall_agreement)
            else None
        )
        if chart_overall is None and table_overall is not None:
            period["agreement_percent"][overall_key] = table_overall
        elif (
            chart_overall is not None
            and table_overall is not None
            and chart_overall != table_overall
        ):
            warnings.append(
                f"Chart and table overall agreement differ for {period['label']}."
            )

    run_at_match = re.search(r"^\s*Report run at\s+(.+?)\s*$", text, re.MULTILINE)
    run_at_raw = run_at_match.group(1).strip() if run_at_match else None
    source_value = first_line_value(text, "Source")
    source_name, _, contact = (source_value or "").partition(" / Contact: ")

    return {
        "schema_version": SCHEMA_VERSION,
        "report": {
            "type": "course_survey_quantitative_results",
            "course_code": first_line_value(text, "Course subject/catalogue code"),
            "course_name": first_line_value(text, "Course name"),
            "subject_owner": first_line_value(text, "Subject owner"),
            "report_run_at": parse_run_at(run_at_raw),
            "report_run_at_raw": run_at_raw,
            "source_name": source_name or None,
            "source_contact": contact or None,
        },
        "question_themes": themes,
        "surveys": periods,
        "notes": extract_notes(text),
        "source": {
            "filename": pdf_path.name,
            "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
            "file_size_bytes": pdf_path.stat().st_size,
            "page_count": page_count,
        },
        "extraction": {
            "parser": "apps/web/scripts/selt/extract_report.py",
            "parser_version": PARSER_VERSION,
            "text_extractor": "pdftotext -layout",
            "chart_extractor": "pdfplumber vector line geometry",
            "warnings": warnings,
        },
    }


def main() -> int:
    arguments = parse_args()
    input_pdf = arguments.input_pdf.expanduser().resolve()
    if not input_pdf.is_file():
        raise SystemExit(f"Input PDF does not exist: {input_pdf}")

    output_path = (
        arguments.output.expanduser().resolve()
        if arguments.output
        else input_pdf.with_suffix(".json")
    )
    report = build_report(input_pdf)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        print(error.stderr or str(error), file=sys.stderr)
        raise SystemExit(error.returncode) from error
