export type ResourceStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "pending"
  | "approved"
  | "review"
  | "blocked"
  | "failed"
  | "success"

export type ProductResource = {
  id: string
  name: string
  kind: string
  endpoint: string
  owner: string
  status: ResourceStatus
  risk: string
  lastRun: string
  tags: string[]
  note: string
}

export const product = {
  name: "DoWeb",
  title: "网站发布与 Nginx 运维控制台",
  description:
    "围绕站点、域名、证书、Nginx 配置、发布批次和回滚记录组织工作。Agent 把自然语言需求转成站点模型、dry-run、发布计划和验证报告。",
  resourceLabel: "站点资源",
  runLabel: "发布流水",
  changeLabel: "站点变更",
  agentName: "DoWeb Agent",
  agentHint: "用于 Nginx 站点创建、证书绑定、静态站点发布、反向代理、健康检查和回滚。",
  sessionPrefix: "doweb",
  agentInstruction: `你是 DoWeb Agent。必须通过 DoSuite/DoWeb/Skill 和 DoSuite/DoWeb/Server 的原子能力完成网站站点发布与运维。
核心规则：
1. DNS 只做域名解析，站点路径、TLS、反向代理和重定向必须由 Nginx/Ingress 配置完成。
2. 发布前必须生成站点模型、Nginx 配置计划、证书需求、资源路径、健康检查和回滚方式。
3. 修改远端 Nginx 前必须先 dry-run/nginx -t，再 reload，不允许直接覆盖不可追踪配置。
4. 每次发布必须记录站点、域名、版本、操作人、验证结果和回滚入口。
5. 缺少目标机器、域名解析、证书或仓库权限时必须明确阻塞项。`,
}

export const metrics = [
  { label: "站点", value: 12, hint: "静态站点与反向代理" },
  { label: "证书", value: 9, hint: "自动续期与到期复查" },
  { label: "待发布", value: 4, hint: "等待 dry-run 或确认" },
  { label: "健康率", value: "91%", hint: "入口与内容检查" },
]

export const resources: ProductResource[] = [
  {
    id: "site-home",
    name: "l8ai.cn",
    kind: "Static Site",
    endpoint: "https://l8ai.cn",
    owner: "brand",
    status: "healthy",
    risk: "无阻塞",
    lastRun: "20 分钟前",
    tags: ["static", "tls", "ingress"],
    note: "品牌主页。发布需要保留构建产物、入口验证和回滚版本。",
  },
  {
    id: "site-doops",
    name: "doops.l8ai.cn",
    kind: "Console",
    endpoint: "https://doops.l8ai.cn",
    owner: "platform",
    status: "warning",
    risk: "DNS 指向旧入口",
    lastRun: "12 分钟前",
    tags: ["next", "olandingress", "dns-blocked"],
    note: "DoOps 控制台。OLAND Ingress 已就绪，但公网 DNS 仍指向旧网关。",
  },
  {
    id: "site-security",
    name: "dosecurity.l8ai.cn",
    kind: "Console",
    endpoint: "https://dosecurity.l8ai.cn",
    owner: "security",
    status: "healthy",
    risk: "无阻塞",
    lastRun: "刚刚",
    tags: ["next", "tls", "agent"],
    note: "安全控制台。公网解析、TLS、Ingress 和控制台渲染已对齐。",
  },
  {
    id: "site-api",
    name: "api.l8ai.cn",
    kind: "Reverse Proxy",
    endpoint: "https://api.l8ai.cn",
    owner: "platform",
    status: "review",
    risk: "上游健康复核",
    lastRun: "昨天 21:00",
    tags: ["proxy", "upstream", "headers"],
    note: "API 反向代理入口。发布前需要验证上游、超时、header 和日志采样。",
  },
]

export const runs = [
  {
    id: "WEB-8121",
    title: "dosecurity 控制台发布验证",
    scope: "OLAND Ingress + TLS + browser",
    status: "success" as ResourceStatus,
    time: "12:20",
    operator: "doweb.agent",
  },
  {
    id: "WEB-8117",
    title: "doops 控制台入口排障",
    scope: "DNS old gateway -> OLAND forced ok",
    status: "warning" as ResourceStatus,
    time: "12:10",
    operator: "codex",
  },
  {
    id: "WEB-8102",
    title: "api.l8ai.cn upstream 健康检查",
    scope: "proxy headers and timeout",
    status: "review" as ResourceStatus,
    time: "昨天 21:04",
    operator: "ops",
  },
]

export const changes = [
  {
    id: "WEBCHG-5018",
    title: "新增 DoSql/DoDNS/DoWeb 控制台入口",
    summary: "为三个产品补齐 Next 管理页面、镜像和 Ingress，域名分别为 dosql/dodns/doweb.l8ai.cn。",
    status: "pending" as ResourceStatus,
  },
  {
    id: "WEBCHG-5011",
    title: "DoSecurity favicon 与 standalone public 修复",
    summary: "修复 Next standalone public 目录路径，浏览器 console 不再出现 favicon 404。",
    status: "approved" as ResourceStatus,
  },
  {
    id: "WEBCHG-5002",
    title: "DoOps metadata 图标声明",
    summary: "新增 favicon.svg 显式声明，强制解析到 OLAND 时验证 200。",
    status: "approved" as ResourceStatus,
  },
]

export const auditEvents = [
  {
    id: "AUD-7101",
    actor: "doweb.agent",
    action: "执行 dosecurity 入口浏览器验证",
    target: "dosecurity.l8ai.cn",
    status: "success" as ResourceStatus,
    time: "12:20",
  },
  {
    id: "AUD-7094",
    actor: "codex",
    action: "定位 doops 公网入口 DNS 偏差",
    target: "doops.l8ai.cn",
    status: "warning" as ResourceStatus,
    time: "12:12",
  },
  {
    id: "AUD-7088",
    actor: "ops",
    action: "生成 api.l8ai.cn upstream 检查单",
    target: "api.l8ai.cn",
    status: "review" as ResourceStatus,
    time: "昨天 21:08",
  },
]

export const prompts = [
  {
    label: "发布新站点",
    text: "我要发布一个新的 Next 控制台站点。请先生成站点模型、域名、Nginx/Ingress 计划、证书要求、dry-run、发布步骤、验证路径和回滚方式。",
  },
  {
    label: "检查入口",
    text: "请检查 doops.l8ai.cn 为什么公网访问不是 OLAND 新版本。区分 DNS、Ingress、Nginx、TLS、浏览器缓存和上游服务问题。",
  },
  {
    label: "站点健康巡检",
    text: "请对 dosecurity.l8ai.cn 做站点健康巡检，覆盖 DNS、TLS、HTTP 状态、静态资源、console 错误和页面首屏。",
  },
]
