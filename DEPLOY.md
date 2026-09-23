# 发布到 Cloudflare Pages

从零上线 EveJS Mod 收录审核控制台（人工审核 + 无人值守），以及回答「GitHub 令牌、
管理员账号、管理员密码到底配在哪」。

## 0. 先看架构：哪些能上 Pages，哪些不能

| 部分 | 位置 | 能否上 Cloudflare Pages |
| --- | --- | --- |
| 前端(React SPA, `dist/`) | 浏览器 | ✅ 正是 Pages 的职责 |
| 登录 / 会话 | `functions/api/session.ts` | ✅ Pages Functions |
| PocketBase 同源代理 | `functions/api/pb/[[path]].ts` | ✅ Pages Functions |
| SPA 深链回退 | `functions/_middleware.ts` | ✅ Pages Functions |
| 业务后端(`pb_hooks/*.pb.js`) | PocketBase | ❌ **不能** |

PocketBase 是一个常驻进程 + 本地 SQLite 文件 + 启动时加载的 JS 钩子。Cloudflare Pages
只提供「静态资源 + 无状态 Functions」，没有常驻进程、没有可写本地磁盘，所以后端必须另找
一台机器。本文用「一台小 VPS + Cloudflare Tunnel」。

```
浏览器
  └─ https://mods.example.com  (Cloudflare Pages)
       ├─ /                  → dist/index.html
       ├─ /api/session       → Function: 账号密码登录, 签发 HttpOnly Cookie
       └─ /api/pb/**         → Function: 校验会话 → 注入 x-rh-user-id → 转发
            └─ https://pb.example.com  (Cloudflare Tunnel → 127.0.0.1:8090)
                 └─ PocketBase + pb_hooks/*.pb.js → api.github.com (带 GITHUB_TOKEN)

维护者本机: 导出 moderation.json / sources.json → 重建并签名索引仓库 → 提交
```

## 1. 部署后端: PocketBase

### 1.1 准备目录

```bash
mkdir -p /opt/evejs-mod-review && cd /opt/evejs-mod-review
# 到 https://github.com/pocketbase/pocketbase/releases 下载对应平台压缩包, 解压到当前目录
git clone <你的仓库地址> repo && cp -r repo/pb_hooks ./pb_hooks
```

```
/opt/evejs-mod-review/
  pocketbase      ← 可执行文件
  pb_hooks/       ← 仓库里的 9 个 .pb.js
  pb_data/        ← 首次启动自动生成(SQLite), 记得备份
```

钩子会自己建表(`mod_submissions` / `mod_decisions` / `review_records` / `delete_records` /
`repo_checks`)，不需要手动迁移。

### 1.2 启动

```bash
./pocketbase serve --http=127.0.0.1:8090
```

**只监听 127.0.0.1**。别用 `0.0.0.0`，也别直接开防火墙端口 —— `pb_hooks` 里用 `routerAdd`
注册的接口默认是**公开**的(没有鉴权中间件)，裸奔等于把「删除审核记录」「清空数据库」交给
全网。外网入口只走 1.4 的隧道。

### 1.3 环境变量(systemd)

`/etc/systemd/system/evejs-mod-review.service`:

```ini
[Unit]
Description=EveJS Mod Review PocketBase
After=network-online.target

[Service]
Type=simple
User=evejs
WorkingDirectory=/opt/evejs-mod-review
Environment=GITHUB_TOKEN=github_pat_xxxxxxxx
Environment=PB_PROXY_SECRET=<和 Cloudflare 侧同一个随机串>
ExecStart=/opt/evejs-mod-review/pocketbase serve --http=127.0.0.1:8090
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now evejs-mod-review
journalctl -u evejs-mod-review -f
```

| 变量 | 作用 | 不配的后果 |
| --- | --- | --- |
| `GITHUB_TOKEN` | `mod_source` / `mod_inspect` / `mod_sync` 调 GitHub API | 退回匿名请求: 额度 5000 次/小时 → 60 次/小时，巡检频繁撞限流 |
| `PB_PROXY_SECRET` | 要求清空接口必须来自 Pages 代理 | 只要 PB 没暴露公网影响不大；暴露了就必须配 |

> 这两个读取入口是本次改造新增的。原先 `GITHUB_TOKEN` 只从 VibeX 沙箱的
> `/workspace/app/project/vibex-capability-keys.json` 读，自建机器上该路径不存在会**静默**
> 降级成匿名。现在改成优先读环境变量、读不到才回落该文件，老部署不受影响。

### 1.4 给它一个 HTTPS 入口

```bash
cloudflared tunnel login
cloudflared tunnel create evejs-mod-review
cloudflared tunnel route dns evejs-mod-review pb.example.com
cloudflared tunnel run --url http://127.0.0.1:8090 evejs-mod-review
```

⚠️ 隧道一开，`pb.example.com` 就是公网可访问的，等于把 1.2 说的公开接口送出去了。必须再上
一道闸，二选一：

- **推荐: Cloudflare Access(Zero Trust)**。给 `pb.example.com` 建 Access 应用，策略只允许
  Service Token；然后在 Pages 配 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`(见 2.3)，
  代理会自动带服务令牌过闸，匿名请求一律被挡住。
- 或者: 隧道指向本机 Caddy/nginx，由它校验 `X-Proxy-Secret` 请求头(值同 `PB_PROXY_SECRET`)，
  不带该头一律 403。

## 2. 部署前端: Cloudflare Pages

### 2.1 推代码

```bash
git init && git add -A && git commit -m "mod review console"
git remote add origin <你的仓库地址> && git push -u origin main
```

### 2.2 建 Pages 项目

控制台 → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → 选仓库。

| 配置项 | 填什么 |
| --- | --- |
| Framework preset | `None`(别选 Vite, 会覆盖输出目录) |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | 留空(仓库根) |
| Node 版本 | 环境变量 `NODE_VERSION=22`(Vite 8 要求 Node ≥ 20.19 / ≥ 22.12) |

`functions/` 会被自动识别成 Pages Functions，不需要额外配置。

> 仓库 `.npmrc` 里的 `dangerously-allow-all-builds=true` **不是可选项**。本项目的依赖里有 5 个
> 包带可选 install 脚本(`@parcel/watcher`、`@swc/core`、`core-js`、`less`、`protobufjs`)，
> pnpm 默认忽略它们的脚本并以 `ERR_PNPM_IGNORED_BUILDS` **退出码 1** 结束 install。Cloudflare
> 的 install 步骤不由构建命令控制，只能靠 `.npmrc` 放行，否则部署会在安装阶段直接失败
> (本地已实测复现，见文末「已实测验证」)。

### 2.3 环境变量与密钥(「管理员账号/密码」就配在这)

Pages 项目 → **Settings** → **Variables and secrets**(旧版叫 Environment variables) →
Production(建议 Preview 也加一份)。

| 名称 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `PB_ORIGIN` | 变量 | ✅ | `https://pb.example.com` | PocketBase 地址，结尾不要斜杠 |
| `ADMIN_USER` | 变量 | ✅ | `admin` | 管理员账号 |
| `ADMIN_PASSWORD` | 密钥 | 二选一 | `正确的马儿电池订书钉` | 明文密码 |
| `ADMIN_PASSWORD_HASH` | 密钥 | 二选一(推荐) | 64 位小写十六进制 | 密码的 SHA-256，控制台不留明文 |
| `SESSION_SECRET` | 密钥 | ✅ | 随机 32 字节以上 | 会话 Cookie 的 HMAC 签名密钥 |
| `SESSION_TTL_HOURS` | 变量 | ❌ | `12` | 登录有效期(小时)，默认 12 |
| `PB_PROXY_SECRET` | 密钥 | 建议 | 同 PocketBase 那份 | 随代理请求带给 PB，PB 侧校验 |
| `CF_ACCESS_CLIENT_ID` | 变量 | 可选 | `xxxx.access` | PB 挂了 Cloudflare Access 时用 |
| `CF_ACCESS_CLIENT_SECRET` | 密钥 | 可选 | `xxxx` | 同上，两个一起配 |
| `NODE_VERSION` | 变量 | 建议 | `22` | 构建用 Node 版本 |

生成 `ADMIN_PASSWORD_HASH`(两条等价，任选):

```powershell
# Windows PowerShell
$p = "你的密码"
[BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($p))) -replace "-",""
```

```bash
# Linux / macOS: 用 printf 而不是 echo, 否则会把换行也算进哈希
printf '%s' '你的密码' | sha256sum
```

生成 `SESSION_SECRET`:

```bash
openssl rand -base64 48
```

要点:

- `ADMIN_PASSWORD` 与 `ADMIN_PASSWORD_HASH` 同时配时以 **HASH 为准**。
- 两个都没配 → 登录接口只会回「账号或密码不正确」，不会静默放行。
- 改密码 = 改这里的变量 → **必须重新部署**(Deployments → 最新一次 → Retry deployment，或推一次提交)才生效。
- 改密码后，旧 `SESSION_TTL_HOURS` 内已登录的浏览器 Cookie 仍有效；想立刻踢掉所有会话，就换 `SESSION_SECRET`。
- 这些变量只对 Functions 有意义，**不会**进前端 bundle。
- 这几个字段就是首页那道**管理员登录表单**在用的。表单实现在
  `src/components/common/LoginGate.tsx`(账号框 id 为 `admin-username`)，由 `src/App.tsx`
  套在整个应用最外层 —— 未登录时连业务页面都不渲染，因此也不会把索引拉取 / 巡检的额度
  浪费在未登录访客身上。

### 2.4 自定义域(可选)

Pages 项目 → **Custom domains** → 加 `mods.example.com`，按提示加 DNS 记录。

## 3. GitHub 令牌配在哪

**结论: 配在 PocketBase 那台机器上，不要配在 Cloudflare Pages。**

看调用方在哪: 读 `EVEjs-mods` 索引仓库、拉 `sources.json` / `docs/mod-index.json`、探
`evejs-mod.json` 清单的代码全在 `pb_hooks/*.pb.js` 里，是 **PocketBase 服务端**发起的出站
请求。Pages 只是静态站点 + 三个薄 Function，全程不碰 GitHub。

三个坑:

1. **绝不要用 `VITE_GITHUB_TOKEN` 这类名字。** Vite 会把 `VITE_` 前缀的变量在构建时**内联进
   `dist/assets/*.js`**，等于把令牌明文发到公网。本项目没有任何 `VITE_*` 密钥，唯一的
   `VITE_PB_URL` 只是地址，且默认不需要配。
2. **别让前端拿令牌去调 GitHub。** 那必然要把令牌下发到浏览器，属于直接泄漏。
3. **也别配成 Pages 的普通环境变量。** 它不会出现在浏览器里(这点对)，但 PocketBase 读不到，
   等于白配一个没用上的变量。

### 3.1 建令牌

GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token:

- Repository access: 只勾 `diguo520/EVEjs-mods`(以及需要体检的来源仓库；若都是公开仓库，
  也可选 `Public repositories (read-only)`)
- Permissions: **Repository permissions → Contents: Read-only**(其余全留 No access)
- Expiration: 按轮换习惯，建议 90 天

公开仓库不带令牌也能读；令牌的唯一作用是**把额度从 60 次/小时提到 5000 次/小时**(`mod_source`
/ `mod_inspect` / `mod_sync` 三个钩子里都有这句注释)。所以给到 Contents 只读就够，别给写权限。

### 3.2 配上去

按 1.3 写进 `Environment=GITHUB_TOKEN=...`，然后:

```bash
systemctl daemon-reload && systemctl restart evejs-mod-review
```

Docker 部署就是 `-e GITHUB_TOKEN=...` 或 `env_file`。

### 3.3 确认生效

- 工作台点一次「仓库巡检」，若返回里出现「官方接口本小时调用次数已用完」，说明令牌没被读到
  (还在匿名 60 次/小时的档位)。
- 也可在 PB 机器上直接验: `curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/rate_limit`，
  看 `rate.limit` 是不是 5000。

## 4. 本地预演(建议上线前跑一次)

```bash
pnpm build
npx wrangler pages dev dist
```

项目根建 `.dev.vars`(**已在 `.gitignore`，别提交**):

```
PB_ORIGIN="http://127.0.0.1:8090"
ADMIN_USER="admin"
ADMIN_PASSWORD="dev-only-password"
SESSION_SECRET="dev-only-secret-at-least-32-chars-long"
PB_PROXY_SECRET="dev-only-proxy-secret"
```

本机也起一个 PocketBase(`./pocketbase serve --http=127.0.0.1:8090`，`pb_hooks` 放同目录)。
想直接连别的 PocketBase 而不走代理，就设 `VITE_PB_URL`(如 `http://127.0.0.1:8090`)再 `pnpm dev`。

## 5. 上线验收清单

- [ ] 打开站点 → 出现「审核后台 · 仅管理员可用」的**账号 / 密码表单**(不是一直转圈)
- [ ] 故意输错 → 提示「账号或密码不正确」
- [ ] 输对 → 进入工作台，右上角显示当前管理员
- [ ] 直接访问 `/records` 并刷新 → 正常出页面而不是 404(SPA 回退生效)
- [ ] 工作台能拉到索引仓库条目(`/api/pb` 代理 + PB 通了)
- [ ] 点一次「仓库巡检」→ 不报额度不足(`GITHUB_TOKEN` 生效)
- [ ] 记录中心「清空本机记录」→ 成功(`x-rh-user-id` 注入生效)
- [ ] 未登录直接请求 `/api/pb/api/mod_decisions` → 401(代理没放行匿名请求)
- [ ] 退出登录 → 回到登录表单

## 6. 安全清单

- PocketBase **只监听 127.0.0.1**；公网入口必须挂 Cloudflare Access 或反代校验 `X-Proxy-Secret`。
- `SESSION_SECRET` 用真随机，别用一串有意义的字符。
- 优先用 `ADMIN_PASSWORD_HASH` 而不是 `ADMIN_PASSWORD`。
- 给 Pages 站点也开一段 **Cloudflare Access** 当第二道门 —— 登录页之外再加一层更省心。
- `pb_data/` 定时备份(那是全部审核记录)。
- 令牌/密钥只写在 Cloudflare 控制台与 systemd 里，不进仓库。

## 7. 已知边界(本次没做的)

- **AI 无人审核**: `src/lib/aigc.ts`、`src/lib/llm.ts` 调的是平台(RunningHub VibeX)的
  `/api/aigc/*`、`/api/llm/*` 网关，这些路由不在本仓库，自建 PocketBase 上不存在。这两个模块
  以及 `CostConfirmDialog`、`RhAccountMenu`、`useCostConfirm` 目前**没有被任何页面引用**，
  所以不影响现有功能；以后要接入得自己补一套 `/api/llm/*`(换任意一家 LLM API)。
- `src/lib/rhLogin.ts`(RunningHub SSO) **保留未删**。要部署回 RunningHub 平台时，把
  `src/lib/auth.ts` 的导出换回 `vibexAuthHeaders` / `redirectToRhLogin` 即可，其余代码不用动。
- `visitorPaysForAi` 仍是 `true`(原样保留；它只影响计费弹窗，而弹窗组件当前未被引用)。
- `pnpm build` 会提示主 chunk 超过 500 kB —— 体积告警，不是错误；要消掉就做路由级 `React.lazy` 拆包。
  另外说明: 工作台里的「无人值守」(`auto`)模式是**本地规则驱动**的 —— 全部检查项通过且无警告
  就自动收录，判断逻辑在 `src/pages/Home/useHome.ts`，不依赖上面提到的 AI 网关，所以自建后
  照常可用。

## 8. 已实测验证

在本机对本次改动做过这些验证(2026-09-24):

- `pnpm install --frozen-lockfile` → **退出码 0**(`.npmrc` 放行前是 1，即为 Cloudflare 构建失败根因)
- `pnpm build`(tsc -b + vite build) → **退出码 0**，产出 `dist/index.html` + `dist/assets/*`
- `tsc -b --force` → 0 错误
- `eslint .` → 12 个既有告警，**本次新增文件 0 新增问题**(既有问题清单见下)
- `node --check` 校验改过的 `pb_hooks/*.pb.js` → 语法通过
- 管理员登录门(把 `LoginGate` 挂到 `src/App.tsx` 之后)：直接调用**真实的**
  `functions/api/session.ts`(用 tsc 编到 Node 里跑)过了 **26 条断言** —— 含缺 `SESSION_SECRET`
  / 缺 `ADMIN_USER` 时回 500、错账号与错密码 401、`ADMIN_PASSWORD_HASH` 优先于明文、
  改一位签名或换个账号沿用旧签名一律 401、换 `SESSION_SECRET` 后旧 Cookie 立刻失效、
  登出下发 `Max-Age=0`、http 下不带 `Secure` 而 https 下必带
- 登录流程真实浏览器验收(无头 Chromium + CDP，**23 条断言全过**)：未登录出账号/密码表单
  且**完全不渲染工作台** → 空提交被前端拦住 → 错密码提示「账号或密码不正确」且不放行 →
  正确密码进工作台并拉到鉴权后的真实数据 → 刷新保持登录(Cookie 而非内存) → 退出登录
  立刻回到表单 → 退出后直连 `/records` 仍被挡住，且是表单而不是 404 白页

既有 lint 问题(改动前就存在，未处理):

| 文件 | 规则 |
| --- | --- |
| `src/components/records/ClearRecordsDialog.tsx:34` | `react-hooks/set-state-in-effect` |
| `src/components/rh/RhAccountMenu.tsx:47` | `react-hooks/set-state-in-effect` |
| `src/pages/Home/useHome.ts:1327` | `react-hooks/set-state-in-effect` |
| `src/components/ui/badge.tsx:36`、`src/components/ui/button.tsx:56` | `react-refresh/only-export-components` |
| `src/lib/aigc.ts:380,720`、`src/lib/llm.ts:120` | `no-useless-assignment` |
| `vite.config.ts:16,29,44,49` | `@typescript-eslint/no-explicit-any` |

## 9. 本次改动清单

新增:

- `functions/api/session.ts` —— 管理员登录/登出/会话查询，HMAC 签名 HttpOnly Cookie
- `functions/api/pb/[[path]].ts` —— 同源 PocketBase 反向代理，校验会话后注入身份头
- `functions/_middleware.ts` —— SPA 深链回退(只对「没命中静态资源 + 要 HTML」的 GET/HEAD)
- `functions/_routes.json` —— 让 `/assets/*` 等静态文件不经过 Functions
- `src/lib/session.ts` —— 前端会话客户端(登录表单、静默确认、登出)
- `DEPLOY.md` —— 本文

修改:

- `src/lib/auth.ts` —— 把登录能力从 RunningHub SSO 切到自建管理员会话
- `src/components/common/LoginGate.tsx` —— 未登录时渲染账号/密码表单
- `src/App.tsx` —— 把 `LoginGate` 套到全部路由最外层(此前该组件写好了但**没被挂载**,
  所以那道表单实际不会出现，`/` 和 `/records` 都是敞开渲染的)
- `src/components/common/AdminBadge.tsx`、`src/_rh_session_bootstrap.ts` —— 改读新会话模块
- `src/lib/pb.ts` —— 后端地址默认 `/api/pb`，可用 `VITE_PB_URL` 覆盖
- `pb_hooks/mod_source.pb.js`、`mod_inspect.pb.js`、`mod_sync.pb.js` —— 优先从 `GITHUB_TOKEN` 环境变量取令牌
- `pb_hooks/mod_records_clear.pb.js` —— 支持 `PB_PROXY_SECRET` 二次确认
- `.npmrc` —— 放行可选 install 脚本，避免 CI install 退出码 1
- `.gitignore` —— 忽略 `.dev.vars` / `.wrangler`
- `index.html` —— 补上页面标题
