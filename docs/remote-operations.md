# DoWeb Remote Operations

This page documents how to operate DoWeb on remote Nginx targets.

## Preferred Access Path

Use doops when the target agent is online:

```bash
doops list
doops -session doweb_check exec --target gw-114-k8s --cmd "hostname"
```

Every doops remote call must include `-session <name>`.

SSH is reserved for first installation, credential bootstrap, or agent recovery.
Do not use SSH as the normal deployment path once doops and CI/GitOps are
available.

## Docker Mode

Docker mode is the default for `install-nginx`.

It creates:

```text
/var/lib/doweb/
/etc/doweb/nginx/sites-available/
/etc/doweb/nginx/conf.d/
/etc/doweb/nginx/snippets/
/usr/local/bin/doweb-nginx
```

It starts a container similar to:

```text
doweb-nginx -> nginx:1.27-alpine
host 80 -> container 80
host 443 -> container 443
```

Use the returned deploy flags:

```bash
--nginx-bin /usr/local/bin/doweb-nginx
--reload-cmd 'docker exec doweb-nginx nginx -s reload'
```

## Host Mode

Use host mode when an existing host Nginx already owns ports 80/443:

```bash
node DoSuite/DoWeb/Skill/scripts/doweb.mjs install-nginx \
  --mode host \
  --ssh-host <host> \
  --ssh-user <user> \
  --password-env DOWEB_SSH_PASSWORD
```

Host mode prepares DoWeb directories and uses:

```text
/etc/doweb/nginx/sites-available/
/etc/nginx/conf.d/
/etc/doweb/nginx/snippets/
nginx
nginx -s reload
```

Before deploying to a host-mode target, inspect existing 80/443 listeners:

```bash
ss -ltnp | grep -E ':(80|443) '
grep -R "listen 443\\|stream" -n /etc/nginx
```

Do not assume DoWeb can safely own HTTPS if another stream server already owns
port 443.

## Remote Evidence Checklist

For deploy or config changes, capture:

```bash
nginx -t
curl --resolve <domain>:80:<gateway-ip> http://<domain>/
curl -vk --resolve <domain>:443:<gateway-ip> https://<domain>/  # only for HTTPS sites
```

For reverse proxy:

```bash
curl -v <upstream-url>
curl --resolve <domain>:80:<gateway-ip> http://<domain>/
```

For DNS separation:

```bash
curl -sS 'https://dns.google/resolve?name=<domain>&type=A'
```

## Secret Handling

Use environment variables for one-time passwords:

```bash
export DOWEB_SSH_PASSWORD='...'
```

Do not write passwords into:

- SiteSpec;
- state JSON;
- Markdown docs;
- command history in shared terminals;
- Git commits.

## Recovery Notes

If a managed config needs to be disabled manually, use the reversible disable
procedure in `site-lifecycle.md`. Keep timestamped backups and run `nginx -t`
before reload.

If the doops target is offline but the host is reachable, fix or restart the
agent separately. DoWeb deployment state should not be inferred from agent
online/offline status alone.

