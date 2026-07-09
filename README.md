# DoWeb

DoWeb is the AI-first frontend deployment and Nginx operations product in DoSuite. It
wraps Nginx publishing, reverse proxying, validation and rollback behind a
doagent-friendly workflow.

## Project Introduction

DoWeb lets users publish and operate websites by describing the desired site,
domain, proxy route or rollback in natural language. The product converts that
intent into a SiteSpec, renders Nginx configuration, validates the change,
reloads or rolls back through doagent, and returns operational evidence.

Its AI-first design keeps Nginx as the deterministic execution layer while the
assistant handles intent clarification, site naming, domain context, deployment
planning, validation interpretation and recovery guidance.

The first implementation focuses on deployment and Nginx operations only. The
customer builds the frontend on their own computer or in CI, then DoWeb receives
the customer-built `dist/` artifact and publishes it into an Nginx-backed Web
container. DoWeb does not run `npm install`, `npm run build`, or application
process management in the MVP.

Target scope:

- connect to an Nginx or Nginx-managed gateway target;
- publish a new static frontend website from `dist/`;
- configure server blocks, custom domains, reverse proxy routes, load balancing,
  TLS certificate paths and static artifact deployment;
- support managed Nginx edits through `config-set` and `snippet-set`;
- validate every change with `nginx -t`;
- inspect site availability, certificate status and access/error logs;
- rollback site configuration and deployments through doagent.

Current status: Skill-side MVP script and knowledge base.

Resource-control design:

- `../../docs/superpowers/specs/2026-07-05-doweb-agent-nginx-resource-control-design.md`

Companion docs:

- `docs/README.md`: DoWeb documentation index.
- `docs/overview.md`: product model, current scope and architecture.
- `docs/cli-reference.md`: command reference for `doweb.mjs`.
- `docs/site-lifecycle.md`: publish, update, check, rollback, disable and
  restore flows.
- `docs/dns-and-routing.md`: domain, wildcard, multi-A, HTTP/HTTPS and gateway
  routing rules.
- `docs/troubleshooting.md`: practical failure triage for common DoWeb/Nginx
  issues.
- `docs/remote-operations.md`: target access, Docker/host install modes and
  evidence handling.
- `docs/resource-control-roadmap.md`: how the mature gateway-style resource
  control model maps to future DoWeb work.

```text
DoWeb/
├─ Server/   Future UI/API/runtime for website operations.
└─ Skill/    Nginx/site publishing skill, scripts, references and runbooks.
```

## MVP Command Flow

```bash
export DOWEB_SSH_PASSWORD='...'
node DoSuite/DoWeb/Skill/scripts/doweb.mjs install-nginx \
  --ssh-host 114.55.61.32 \
  --ssh-user root \
  --password-env DOWEB_SSH_PASSWORD

node DoSuite/DoWeb/Skill/scripts/doweb.mjs domain-set \
  --domain aihub.org.cn \
  --host-ip 114.55.61.32 \
  --provider aliyun

node DoSuite/DoWeb/Skill/scripts/doweb.mjs deploy \
  --site-id demo \
  --domain-base aihub.org.cn \
  --dist /path/to/dist \
  --proxy /api/=https://api.example.com
```

DoWeb converts natural-language publishing requests into a SiteSpec, renders a
candidate Nginx config, runs `nginx -t`, reloads Nginx, records state, and
returns evidence. There is no silent fallback: failed validation, reload or
health check stops the change and surfaces the root cause.

`install-nginx` supports username/password bootstrap without storing the
password in the repository. The default mode is Docker: DoWeb installs or starts
Docker when needed, runs the `doweb-nginx` container, and returns the deploy
flags needed for later `nginx -t` and reload calls.

`domain-set` maintains base-domain metadata. After `aihub.org.cn` is registered,
`deploy --domain-base aihub.org.cn --site-id demo` automatically publishes
`demo.aihub.org.cn` and rejects conflicts before changing Nginx.

## Current Limits

- Build is out of scope. Build locally or in CI and provide a completed `dist/`.
- HTTPS works only when explicit certificate and key paths are supplied to the
  current CLI. Certificate registry, upload, ACME and rotation are planned in
  the resource-control design.
- `deploy` creates and updates a site, but the current CLI does not yet expose a
  first-class `delete` command. Use the disable procedure in
  `docs/site-lifecycle.md` when testing removal.
- DNS automation is not implemented in the current CLI. `domain-set` records
  metadata for DoWeb decisions; it does not call AliDNS or another DNS provider.
- Nginx open-source active health checks are not available without extra
  modules. Current load balancing uses standard upstream rendering; active
  probes are planned as DoWeb-side checks.
