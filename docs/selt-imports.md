# Local SELT imports

SELT report downloads run on your Mac using your authorised ANU access. Only
extracted quantitative JSON is uploaded to Coursemap. ANU passwords and Basic
headers never reach Coursemap. Replace any password previously shared in chat.

## Setup

Use the checkout containing this feature. Install Poppler (`brew install poppler`)
and create a Python virtual environment outside the repository:

```sh
python3 -m venv ~/.venvs/coursemap-selt
~/.venvs/coursemap-selt/bin/python -m pip install -r apps/web/scripts/selt/requirements.txt
```

Apply migrations `039_selt_imports.sql` and `040_selt_published_reads.sql` through the normal reviewed database rollout.
The upload routes use the existing server-only `COURSEMAP_SYNC_DATABASE_URL`.
The local CLI needs neither a database password nor a Supabase service key.

## Ten-course pilot

1. Sign into Coursemap as an administrator with `imports.manage`.
2. Open `/admin/selt` (also linked from the admin overview).
3. Create an import token. It expires after 12 hours and can be revoked immediately.
4. Run the command below, substituting the origin of that Coursemap deployment.
5. Paste the Coursemap token at the hidden prompt, then enter your ANU credentials.

```sh
~/.venvs/coursemap-selt/bin/python apps/web/scripts/selt/import-reports.py --site https://YOUR-COURSEMAP-HOST --limit 10
```

The script fetches all known stable course codes from Coursemap, including historical
codes. To choose particular pilot courses, supply `--codes /path/to/codes.txt`.
The file accepts whitespace or comma-separated codes. Unknown codes are rejected.
No course records are created implicitly.

Reports and extracted JSON stay in `~/Coursemap-SELT` with a resumable `progress.json`.
Use `--output` to choose another private folder. Do not commit these files.
The uploader sends one report per request, saves progress after each course and
checks Coursemap's acceptance before marking it uploaded. Repeated uploads of the
same PDF and parser version are idempotent. Different destinations receive their
own uploads. Keep the source PDFs until review is complete.

## Full run and refresh

Inspect the pilot PDFs against the admin survey table, including response counts
and chart values. Then run the same command with `--all` instead of `--limit 10`.
Use another token if the first expires. Tokens only permit reading the course
manifest and uploading drafts, never publication or reading survey data.
The server rechecks the issuing user's import permission on every upload.

Missing PDFs (404) are recorded separately. `--retry-missing` tries those again;
`--refresh` fetches current PDFs and rechecks every upload. Other failures are retried
on the next run. Transient network errors retry up to four times with backoff.
Authentication failures stop the whole run. Redirects are refused so credentials
cannot be forwarded to another origin. Downloads are sequential with a half-second
pause between courses. No paid model requests are made.

## Review and publication

Refresh `/admin/selt` to see recent imports and paginated reports. Review opens
all survey periods, notes and the original ANU URL. Missing metrics display as
unavailable, never zero. Extraction warnings prevent publication. Fix the parser,
bump its version and re-extract the retained PDFs before attempting publication.
Publication also requires `courses.write` and selects one report per stable course.

This delivery stores reviewed reports and survey metrics in dedicated relational
SELT tables. Drafts remain admin-only. Signed-in users can view the published report in the
course Student review tab. Courses without published reports do not show that tab. The table includes all periods; charts include only periods
with complete counts and theme values. Missing and suppressed values remain
unavailable. Approximate intervals use rounded percentages and total respondents,
which can differ from question-level counts. The catalogue
and student plans are not rewritten by a SELT import. Raw PDFs remain local.

The current parser supports semester time-series reports with the five standard
question themes. Other layouts must be reviewed and supported explicitly. There is
no assumption that every course has a report or that every historical format works.
