# Unified Runtime Boundary

Effective October 7, 2026, the end-user DoWeb path is the DoOps runtime:

- CLI: `doops web --target <target> --mode <check|plan|apply> --request <request>`
- Web: DoOps Console's `网站` workbench
- Authentication: DoOps Gateway user login/token
- Target selection: Gateway `cluster/instance`
- Credentials: Gateway managed credential resource and exact scope
- Website execution: bundled DoWeb skill on the selected Agent target

The canonical runtime source is in the `doops.sh` repository at:

```text
backend/agent/skills/doweb/
```

The independent repository remains useful for Nginx rendering, SiteSpec and
offline validation. Its direct SSH/password bootstrap commands are not the
normal production user path after integration.
