# DoWeb Server

Future UI/API runtime for Nginx-backed website publishing and operations.

For now this directory remains a skeleton. The first working implementation is
the Skill-side deploy engine in `../Skill/scripts/doweb.mjs`.

Read the companion docs before designing Server behavior:

- `../docs/overview.md`
- `../docs/cli-reference.md`
- `../docs/site-lifecycle.md`
- `../docs/dns-and-routing.md`
- `../docs/troubleshooting.md`
- `../docs/remote-operations.md`
- `../docs/resource-control-roadmap.md`

The first Server UI should reuse the DoOps-style flow:

1. connect to gateway;
2. select Nginx target;
3. chat with doagent;
4. upload or select a customer-built dist artifact;
5. ask `DoWeb/Skill` to publish, verify and report.

The Server surface should show the SiteSpec, domain, reverse proxy routes, load
balancing upstreams, `nginx -t` output, reload result, health evidence and
rollback action. Direct Nginx editing should call `config-set` or `snippet-set`
instead of writing live files directly. DoWeb has no silent fallback.

When the user provides username/password access for a fresh host, the Server
should call `install-nginx` first. The default installation is Docker-based:
start a `doweb-nginx` container, mount DoWeb release/config directories, and use
`/usr/local/bin/doweb-nginx` plus `docker exec doweb-nginx nginx -s reload` for
later validation and reload. Passwords should be passed as a one-time secret
through `password-env` or an equivalent secret channel, never stored in product
state.

The Server should also expose DNS and routing evidence separately from Nginx
evidence. A public hostname can fail even when DoWeb's Nginx config is correct
if wildcard or multi-A DNS sends the browser to another gateway. The UI should
show both resolver answers and forced-gateway checks.
