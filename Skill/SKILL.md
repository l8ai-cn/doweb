---
name: doweb-agent
description: DoWeb 网站发布与运维助手。用于通过 doagent 管理 Nginx 站点发布、TLS、反向代理、静态资源部署、站点健康检查、日志巡检和回滚。
---

# DoWeb Agent

DoWeb follows the DoOps interaction model: connect to gateway, select a target,
then ask doagent to publish or operate a website.

DoWeb's MVP deploys a customer-built dist directory. It does not build source
code on the server. The user compiles locally or in CI, then DoWeb publishes the
finished static artifact into an Nginx-backed web container.

## Atomic Tooling

Use `scripts/doweb.mjs` for all changes. Do not edit live Nginx files by hand.

```bash
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

Supported commands:

- `render`: render a candidate Nginx server block from a SiteSpec.
- `install-nginx`: bootstrap Nginx on a remote host. The default mode is Docker:
  install/start Docker when missing, run the `doweb-nginx` container, and create
  `/usr/local/bin/doweb-nginx` for later `nginx -t` validation. Use
  `--mode host` explicitly when a host already runs Nginx on 80/443 and DoWeb
  should only prepare managed config directories.
- `domain-set`: register a usable base domain such as `aihub.org.cn` with its
  host IP and provider metadata.
- `domain-list`: list registered base domains.
- `deploy`: copy a customer-built dist release, activate `current`, write Nginx
  config, run `nginx -t`, reload, and optionally run health checks.
- `config-get`: read the current managed Nginx config.
- `config-set`: replace a managed Nginx config through the same validation and
  reload path. This is the direct Nginx config editing path.
- `snippet-set`: write a site-level snippet included inside the server block.
- `check`: run `nginx -t` and optional HTTP checks.
- `rollback`: restore the previous release and its rendered config.

## Intended Capabilities

- Create or update Nginx server blocks from a SiteSpec.
- Publish customer-built dist artifacts.
- Configure static SPA fallback.
- Configure reverse proxy routes such as `/api/`.
- Configure named upstreams for load balancing.
- Configure TLS certificate paths when provided.
- Bootstrap Nginx from username/password access through `install-nginx`, with
  passwords supplied by `--password-env` or `--password-file`.
- Maintain domain resources with `domain-set` and allocate subdomains from
  `--domain-base` while checking for site conflicts.
- Support controlled Nginx edits through `config-set` and `snippet-set`.
- Validate `nginx -t`, reload Nginx and verify HTTP/HTTPS.
- Inspect access/error logs and site health.
- Run rollback when a release or config change fails.

Default mode is cautious: validate before reload, back up config before writing,
and return evidence instead of assuming success.

## Required Safety Rule

DoWeb has no silent fallback. If `nginx -t`, reload, health check, artifact copy,
or rollback fails, report the real failure and stop. Do not mask a broken change
by silently switching to a different path or skipping validation.

## Local Resource Bootstrap

- Before planning site work, read `config/resources.json` for known sites,
  domain registry metadata, expected ingress IPs and the default doops target.
- The resource file is operational context, not proof of success. Validate DNS,
  Ingress/Nginx, TLS and HTTP health before reporting a site as ready.

## References

- `../docs/README.md`
- `../docs/cli-reference.md`
- `../docs/site-lifecycle.md`
- `../docs/dns-and-routing.md`
- `../docs/troubleshooting.md`
- `../docs/remote-operations.md`
- `references/nginx-site-model.md`
- `references/change-safety.md`

## Operating Notes

- When a browser or user reports an unreachable site, separate DNS from Nginx
  with `curl --resolve <domain>:80:<gateway-ip> http://<domain>/`.
- Watch for wildcard or multi-A DNS records. Every returned address must serve
  the same hostname, or users may see intermittent failures.
- HTTPS is only supported by the current CLI when explicit `--tls-cert` and
  `--tls-key` paths are provided and the target Nginx owns the matching 443
  server block. Existing stream listeners on 443 can intercept HTTPS before a
  DoWeb server block sees it.
- The current CLI has no first-class `delete` command. For removal tests, use
  the reversible disable procedure in `../docs/site-lifecycle.md`.
