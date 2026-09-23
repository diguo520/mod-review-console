# 发布到 Cloudflare Pages

从零上线 EveJS Mod 收录审核控制台（人工审核 + 无人值守），以及回答「GitHub 令牌、
管理员账号、管理员密码到底配在哪」。

## 0. 架构：全部跑在 Cloudflare 上

| 部分 | 位置 | 说明 |
| --- | --- | --- |
| 前端(React SPA, `dist/`) | Cloudflare Pages | 静态站点 |
| 登录 / 会话 | `functions/api/session.ts` | Pages Function，签发 HttpOnly Cookie |
| 业务后端 | `functions/api/pb/[[path]].ts` | Pages Function |
| 本地留档表 | Cloudflare **D1** | `schema.sql` 建表，绑定名 `DB` |
| SPA 深链回退 | `functions/_middleware.ts` | Pages Function |

```
浏览器
  └─ https://mods.example.com               (Cloudflare Pages)
       ├─ /                    → dist/index.html (React SPA)
       ├─ /api/session         → Function: 管理员账号密码登录, 签发 HttpOnly Cookie
       └─ /api/pb/api/**       → Function: 校验会话 → 业务逻辑
            ├─ 只读 → api.github.com / cdn.jsdelivr.net
            │        · sources.json         收录来源清单
            │        · docs/mod-index.json  已签名发布的索引(含 moderation)
            └─ 读写 → D1 (review_records / delete_records / repo_checks / mod_decisions)

维护者本机: 导出 moderation.json / sources.json → 重建并签名索引仓库 → 提交
```

> **队列数据永远来自仓库**：`docs/mod-index.json` 与 `sources.json` 才是事实来源，
> Function 只读它们；D1 里存的只是「还没导出生效」的暂存流水。
> 索引签名私钥始终只在维护者本机，不会进 Cloudflare。

> ⚠️ 早期版本把业务后端放在维护者本机的 PocketBase 上（经 Cloudflare Tunnel 暴露），
> 于是「电脑关机 = 后台没数据」。现在后端已整体迁到 Pages Functions + D1：
> **不需要 VPS、不需要常开电脑、不再需要隧道**。

## 1. 部署后端: Cloudflare D1

后端不再是常驻进程，而是「一个 Pages Function + 一个 D1 数据库」。

### 1.1 建库

控制台 → **Workers & Pages** → **D1** → **Create database**，名字随意（本文用
`mod-review-console-db`）。建完把 **Database ID** 记下来。

或者用 wrangler：

```bash
npx wrangler d1 create mod-review-console-db
```

把输出的 `database_id` 填进仓库根的 `wrangler.toml`。

### 1.2 建表

`schema.sql` 就是全部表结构（四张留档表 + 索引），本地与线上各执行一次：

```bash
npx wrangler d1 execute mod-review-console-db --local  --file=schema.sql   # 本地预演
npx wrangler d1 execute mod-review-console-db --remote --file=schema.sql   # 线上
```

改了表结构就重跑一次；脚本里全是 `CREATE TABLE IF NOT EXISTS`，可以反复执行。

### 1.3 把库绑到 Pages 项目

绑定写在仓库根的 `wrangler.toml` 里（`binding = "DB"`），本地 `wrangler pages dev` 直接生效。
线上再在控制台配一份、两边指向同一个库，最不容易出错：

Pages 项目 → **Settings** → **Functions** → **D1 database bindings**，变量名填 **`DB`**，
库选上面那个。

> 变量名必须是 `DB` —— 代码里读的是 `env.DB`。
> 绑定名写错/没绑定时的表现是接口返回 500 `d1_missing`（配置类错误，不静默）。

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

> ⚠️ **踩坑记录：项目已经用 `wrangler pages deploy` 直传过，再想接 Git 会「拉取仓库失败」。**
> Pages 项目的 `source` 分 *Direct Upload* 与 *Connect to Git* 两种，**创建后不可互改** ——
> 直传项目调 API 改源会直接回 `You cannot update the source object in a Direct Uploads project`，
> 控制台里也没有这个入口。唯一的办法是：删掉直传项目 → 用**同名** + Connect to Git 重建 →
> 重配环境变量 → 重新挂自定义域。同名重建后 `xxx.pages.dev` 子域不变，DNS 里指向它的 CNAME
> 不用动，所以中断时间就是一次构建（约 1~2 分钟）。
>
> 另：Git 集成项目创建后不会自动跑第一次构建，要在 Deployments 里触发一次，或随便推一次提交。

> 仓库 `pnpm-workspace.yaml` 里的放行清单 **不是可选项**。本项目的依赖里有 5 个包带可选
> install 脚本(`@parcel/watcher`、`@swc/core`、`core-js`、`less`、`protobufjs`)，pnpm 默认
> 忽略它们的脚本并以 `ERR_PNPM_IGNORED_BUILDS` **退出码 1** 结束 install。Cloudflare 的 install
> 步骤不由构建命令控制，只能在仓库里放行，否则部署会在安装阶段直接失败。
>
> 放行写在 `pnpm-workspace.yaml` 的 `allowBuilds`(pnpm 11+)与 `onlyBuiltDependencies`
> (pnpm 9/10)两个键上 —— 同一件事的新旧写法，两个都保留以兼容不同 pnpm 大版本。
>
> ⚠️ **不要用 `.npmrc` 的 `dangerously-allow-all-builds`**：pnpm 11 已不识别它(实测
> `pnpm config get dangerously-allow-all-builds` 返回 `undefined`)，写了等于没写。

### 2.3 环境变量与密钥(「管理员账号/密码」就配在这)

**先说一个实测踩到的坑：仓库里一旦有 `wrangler.toml`，它就是这个项目的配置事实来源 ——
普通变量以文件里的 `[vars]` 为准，控制台/API 手写的同名普通变量会在下一次构建时被覆盖。**
所以本项目把普通变量写进 `wrangler.toml`，密钥仍然只能在控制台 / `wrangler` 里配
（密钥不进仓库）。

普通变量，改 `wrangler.toml`：

```toml
[vars]
ADMIN_USER = "diguo520"
SESSION_TTL_HOURS = "12"
```

密钥，二选一：

- 控制台：Pages 项目 → **Settings** → **Variables and secrets**(旧版叫 Environment variables)
  → 新增，类型选**密钥**；
- 命令行：`npx wrangler pages secret put SESSION_SECRET --project-name=mod-review-console`
  （从 stdin 读值，行尾别带多余换行）。

| 名称 | 在哪配 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `ADMIN_USER` | `wrangler.toml [vars]` | ✅ | `diguo520` | 管理员账号 |
| `SESSION_TTL_HOURS` | `wrangler.toml [vars]` | ❌ | `12` | 登录有效期(小时)，默认 12 |
| `ADMIN_PASSWORD` | 密钥 | 二选一 | `正确的马儿电池订书钉` | 明文密码 |
| `ADMIN_PASSWORD_HASH` | 密钥 | 二选一(推荐) | 64 位小写十六进制 | 密码的 SHA-256，控制台不留明文 |
| `SESSION_SECRET` | 密钥 | ✅ | 随机 32 字节以上 | 会话 Cookie 的 HMAC 签名密钥 |
| `GITHUB_TOKEN` | 密钥 | 建议 | `github_pat_...` | 服务端调 GitHub 用；不配也能跑，但额度只有 60 次/小时 |
| `NODE_VERSION` | 密钥/变量 | ❌ | `22` | 构建用 Node 版本；不配就用 Cloudflare 默认(实测能构建) |

> 早期版本用过的 `PB_ORIGIN` / `PB_PROXY_SECRET` / `CF_ACCESS_CLIENT_ID` /
> `CF_ACCESS_CLIENT_SECRET` 已经**不再需要**（那是 PocketBase + Cloudflare Tunnel 时代的
> 配置）。留着不影响运行，代码不会读它们；想清干净就在控制台逐条删掉。

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

**结论: 配在 Cloudflare Pages 的环境变量里(`GITHUB_TOKEN`)，由服务端 Function 使用。**

队列同步、来源体检、仓库巡检都是 Pages Function 出站调 `api.github.com`；令牌放服务端，
浏览器永远拿不到它 —— 放前端就是直接泄漏。

**不配也能跑**：GitHub 未认证请求按出口 IP 限流约 60 次/小时，只是巡检更容易撞限流
（表现为「官方接口本小时调用次数已用完」，稍后自动重试，**不会**误判成仓库失联）。
配上以后是 5000 次/小时。

### 3.1 建令牌

GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token：

- Repository access：只勾需要的（读公开来源仓库选 `Public Repositories` 即可）
- Permissions：`Contents: Read-only`（`Metadata: Read-only` 细粒度令牌默认自带）
- 想省事也可以用经典令牌，勾 `public_repo`

### 3.2 配上去

Pages 项目 → **Settings** → **Variables and secrets** → 新增 `GITHUB_TOKEN`（类型选**密钥**）→
**重新部署一次才生效**（Deployments → 最新一次 → Retry deployment，或推一次提交）。

### 3.3 确认生效

站点 → 工作台 → 点一次「仓库巡检」→ 不再出现额度不足提示。
命令行也可以验：`curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/rate_limit`
（`rate.limit` 应是 5000 而不是 60）。

## 4. 本地预演(建议上线前跑一次)

```bash
pnpm build
npx wrangler d1 execute mod-review-console-db --local --file=schema.sql
npx wrangler pages dev dist
```

项目根建 `.dev.vars`(**已在 `.gitignore`，别提交**)。本地跑只需要会话相关的三个变量：

```
ADMIN_USER="diguo520"
ADMIN_PASSWORD="dev-only-password"
SESSION_SECRET="dev-only-secret-at-least-32-chars-long"
```

`wrangler.toml` 里的 D1 绑定在本地指向**本地库**(`.wrangler/state/...`)，不会碰到线上数据。
想直连别的后端调试，可以设 `VITE_PB_URL`（如 `http://127.0.0.1:8090`）再 `pnpm dev`。

## 5. 上线验收清单

- [ ] 打开站点 → 出现「审核后台 · 仅管理员可用」的**账号 / 密码表单**(不是一直转圈)
- [ ] 故意输错 → 提示「账号或密码不正确」
- [ ] 输对 → 进入工作台，右上角显示当前管理员
- [ ] 直接访问 `/records` 并刷新 → 正常出页面而不是 404(SPA 回退生效)
- [ ] 工作台能拉到索引仓库条目(`/api/pb/api/mod-sync/state` 200，`sources` / `mods` 非空)
- [ ] 点一次「仓库巡检」→ 不报额度不足(`GITHUB_TOKEN` 生效)
- [ ] 记录中心「清空本机记录」→ 成功，且回报的删除条数与实际相符
- [ ] 未登录直接请求 `/api/pb/api/mod_decisions` → 401
- [ ] 退出登录 → 回到登录表单
- [ ] 换一台机器/关掉本机一切进程后再访问 → 数据照常(D1 生效的证明)

## 6. 安全清单

- 所有 `/api/pb/**` 一律**先校验管理员会话**，未登录 401；没有会话就拿不到任何数据。
- Worker 只认自己签发的会话 Cookie —— 没有「伪造身份头」这条路
  (老 PocketBase 方案要靠 `PB_PROXY_SECRET` + `x-rh-user-id` 互相确认，现在整条链路都不需要了)。
- `SESSION_SECRET` 用真随机，别用一串有意义的字符；换掉它等于立刻踢掉所有会话。
- 优先用 `ADMIN_PASSWORD_HASH` 而不是 `ADMIN_PASSWORD`。
- 给 Pages 站点也开一段 **Cloudflare Access** 当第二道门 —— 登录页之外再加一层更省心。
- 令牌/密钥只写在 Cloudflare 控制台与本地 `.dev.vars`，`.dev.vars` 不进仓库。
- D1 里只是暂存流水；定期导出并重建索引，才是把审核结论沉淀进仓库的正路。
- 轮换在聊天/文档里出现过的凭据（例如账号级 Global API Key），改用作用域令牌。

## 7. 已知边界(本次没做的)

- **AI 无人审核**: `src/lib/aigc.ts`、`src/lib/llm.ts` 调的是平台(RunningHub VibeX)的
  `/api/aigc/*`、`/api/llm/*` 网关，这些路由不在本仓库，本项目也没有这套路由。这两个模块
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

- **干净克隆验证**(`git clone` 到空目录后跑真实 CI 流程)：修复前 `pnpm install
  --frozen-lockfile` 退出 **1**(`ERR_PNPM_IGNORED_BUILDS`)—— 根因是 `pnpm-workspace.yaml` 的
  `allowBuilds` 值还留着脚手架占位字符串 `set this to true or false`，且 `.npmrc` 的
  `dangerously-allow-all-builds` 在 pnpm 11 上不生效。改成布尔值并补上
  `onlyBuiltDependencies` 后：`pnpm install --frozen-lockfile` → **退出码 0**，
  `pnpm build` → **退出码 0**，`dist/` 产出正确
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

## 10. D1 化改造(2026-09-24)

把后端从「维护者本机 PocketBase + Cloudflare Tunnel」整体搬到「Pages Functions + D1」，
目的：站点不再依赖任何一台常开机器。

改动:

- 新增 `schema.sql`(四张留档表 + 索引)与 `wrangler.toml`(D1 绑定名 `DB`)。
- `functions/api/pb/[[path]].ts` 从「转发代理」改写成真正的后端：`mod-sync/state`、
  `mod-source/inspect`、`mod-inspect/tick`、`mod-records/clear`，以及四个 collection 的
  CRUD。请求/响应格式与 pb_hooks 版逐字段对齐，**前端零改动**。
- 不再需要 `PB_ORIGIN` / `PB_PROXY_SECRET` / `CF_ACCESS_*` / Cloudflare Tunnel；
  `pb_hooks/*.pb.js` 保留在仓库外(本机 PocketBase 目录)仅供回滚参考。

已实测(本地 `wrangler pages dev` + 本地 D1，出站打真实 GitHub):

- 匿名请求 `/api/pb/api/*` → **401**；登录后 → 200
- `mod-sync/state` 真实拉到 `sources=4` / `mods=4`，`warnings` 为空
- 四张表 CRUD：创建(15 位 id) / 读 / 改 / 删 / 删后 404 / 重复删 404 全部正确
- 过滤(`action`、`mod_id`、`target`、`kind`)与排序(`-created`、`-decided_at`、`-checked_at`)正确
- 布尔字段 `alive` / `applied` 前后端都是真布尔，不是 0/1
- `sort` 注入尝试(`sort=id;DROP TABLE repo_checks`)被白名单丢弃，表完好
- `mod-source/inspect` 真调 GitHub：存在仓库 → `repoAlive=true` 且带 manifest；
  不存在仓库 → `repoAlive=false` + 「仓库返回 404，来源已失联」；非法输入(`../etc/passwd`、
  `bad`)被正则挡掉
- `mod-inspect/tick` → `checked=2 offline=1 undetermined=0`，且只写确定结果
- `mod-records/clear` 分范围计数正确；`scopes=[]` → 400；`scopes=["../x"]` → 400
- TypeScript 单文件 `tsc --strict` → 0 错误
- **变量管理踩坑（重要）**：仓库里加入 `wrangler.toml` 之后，这个项目就以文件为准 ——
  控制台/API 写进去的**普通变量会在下一次构建时被清掉**（症状：登录返回 500
  `session_secret_missing`）。现已改成：普通变量进 `[vars]`，密钥用
  `wrangler pages secret put`（可在控制台核对类型是「密钥」）。

线上实测(部署完成、**本机 PocketBase 与 cloudflared 全部停掉之后**再打一遍):

- 登录 200；`mod-sync/state` 200 且 `sources=4` / `mods=4`；四张表全部 200
- 写入 / 列出 / 删除自检数据正常，验证完已清空
- `mod-inspect/tick` 真调 GitHub；撞到未认证限流时如实回报 `rateLimited=true` /
  `undetermined=1`，**没有**把限流误写成「仓库失联」
- 浏览器端到端(无头 Chromium + CDP，**21 条断言全过**)：登录门、9 类筛选计数、
  批量操作台、已上架条目删除被拦住且给出原因、页面零 JS 运行时错误
- 旧链路已死：本机进程停掉后 `pb.5318.cm` 变 403，而站点数据照常 —— 机器依赖确实去掉
