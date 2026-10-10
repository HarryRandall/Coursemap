# Production deployment

Production releases run through `.github/workflows/ci.yml`: all gates pass,
`Apply production migrations` succeeds, then `Deploy production application`
requests a Vercel build through a Deploy Hook. An unchanged database still leads
to a deployment. A failed or skipped migration job prevents the deploy request.
Both production jobs use the protected GitHub `Production` environment.

## One-time owner setup

1. In the Coursemap Vercel project, confirm the production branch is `main`.
   Open **Settings → Git → Deploy Hooks**, create a hook named
   `GitHub production after migrations` and select branch `main`.
2. Copy its URL into the GitHub Actions secret
   `VERCEL_PRODUCTION_DEPLOY_HOOK`, either in the repository or its `Production`
   environment. Keep the URL private: possession authorises a deployment without
   another token. Never put it in Git, an application environment file or logs.
3. Confirm the project can create and invoke the hook on its Hobby plan without
   upgrading before enabling this release flow. Check
   [Vercel's Deploy Hooks documentation](https://vercel.com/docs/deploy-hooks)
   and the project's settings as part of setup.
4. Validate `apps/web/vercel.json` against its
   [Vercel schema](https://openapi.vercel.sh/vercel.json). Its
   `git.deploymentEnabled` branch map sets `main` to `false` and `*` to `true`
   for previews. Confirm a push to `main` causes no immediate Git deployment
   and that the hook still starts a production build
   after migrations succeed. Confirm another branch still gets a preview.
5. Check GitHub's deploy job and Vercel's deployment separately. A successful
   hook request only confirms acceptance, not build completion or a healthy
   production site. Verify the deployed Git revision and exercise an affected
   production route after Vercel reports success.

The hook builds the latest commit on `main`, rather than pinning the workflow's
Git SHA. Keep releases serial: do not advance `main` between the migration job
and the hook build selecting its revision. Check the selected revision against
the successful migration run before treating the release as complete.

## Emergency manual deployment

If only the deploy request failed, confirm all gates and `Apply production
migrations` succeeded for the current `main` revision, correct the secret if
needed, then re-run the failed deploy job in GitHub Actions. Do not bypass a
failed migration job or deploy a newer revision whose migrations have not run.

If GitHub Actions cannot make the request, an owner can invoke the same hook
from a private terminal after the same checks. Read the URL without echoing it
or storing it in shell history; in Bash:

```bash
read -r -s -p 'Production deploy hook URL: ' VERCEL_PRODUCTION_DEPLOY_HOOK
printf '\n'
if ! curl -fsS -X POST "$VERCEL_PRODUCTION_DEPLOY_HOOK" --output /dev/null 2>/dev/null; then
  printf 'The Vercel production deploy hook request failed.\n' >&2
fi
unset VERCEL_PRODUCTION_DEPLOY_HOOK
```

Keep shell tracing disabled. If the hook is unavailable, create a deployment
for the verified `main` revision from the Vercel dashboard and select the
Production target. Confirm the revision, build result and site health. Follow
the [schema compatibility policy](../architecture.md#delivery), including
[draining old queue consumers](../catalogue-operations.md#drain-old-queue-consumers),
before any destructive follow-up migration or rollback to older application code.
