# In-game Cloudflare usage

Pause → Multiplayer shows account-wide usage to the world owner. Other roles see the hosting
configuration but cannot retrieve account analytics. `/w/:worldId/usage` requires the owner's
invite; the Durable Object checks the token before the Worker reads its analytics cache.
The browser never receives the Cloudflare API credential.

The Worker queries Cloudflare's GraphQL API using an account-owned token with only **Account
Analytics Read**, restricted to this account. The token expires on 18 October 2027. It is installed
as `CLOUDFLARE_ANALYTICS_TOKEN`, with its local recovery copy outside Git at
`~/.config/forest-drift/analytics-secret.json` (0600). `CLOUDFLARE_ACCOUNT_ID` is a non-secret var.
Use `wrangler secret bulk` with that private file to replace the token after renewal.

## What the bars mean

The query includes every Worker and Durable Object in the account, since free quotas are shared.
Daily totals start at midnight UTC; reset time is displayed in the player's local timezone.

| Metric | Free allowance | Reporting caveat |
| --- | --- | --- |
| Worker requests | 100,000/day | Adaptive analytics may be sampled |
| Room events (conservative) | Compared against 100,000/day | Counts raw invocations and incoming messages without a discount. Cloudflare documents a 20:1 WebSocket billing ratio, but it is billing-only, so this bar may warn early rather than assume the discount matches free quota enforcement |
| Room duration | 13,000 GB·s/day | Cloudflare periodic duration, not client uptime |
| SQLite rows read | 5 million/day | Cloudflare periodic counters |
| SQLite rows written | 100,000/day | Includes writes from all account rooms, not just the current world |
| SQLite stored data | 5 GB/account | Sum of namespace peaks reported over the last 24 hours; does not reset daily |

Storage that has not been reported is unknown, not zero. API errors or incomplete data do not
produce a green zero reading. Last good daily values can be shown as stale when refresh fails;
yesterday's daily values are discarded at UTC rollover.

Warnings begin at 75%; critical warnings at 90%. These are information only and do not enforce
a spending cap. Telemetry may lag, and the figures are not a bill. The “Free hosting configuration”
message is conditional on keeping the account on Workers Free, not an automatic subscription
check. The owner's £10 budget and £15 ceiling still require the free-only account setup.

The Worker coalesces concurrent queries and caches successful readings for five minutes per
isolate; failures are cached for one minute. The panel loads only when opened by an owner and
refreshes every five minutes while visible. No cron, new storage binding or paid service is added.

## Validation

- GraphQL dataset fields and units verified through Cloudflare introspection and live account queries.
- Live endpoint rejects missing, visitor and builder invites with 403, before querying analytics.
- Unit coverage: UTC reset, conservative event counting, storage aggregation, missing readings,
  malformed/partial data, caching, concurrent requests, stale reads and midnight rollover.
- Browser coverage: the Multiplayer tab renders the usage bars and a 95% critical warning.

References checked 18 October 2026:
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/
- https://developers.cloudflare.com/billing/manage/budget-alerts/
