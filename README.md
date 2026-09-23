# EveJS Mod 收录审核控制台

面向 **EveJS MOD 索引仓库**（默认 `diguo520/EVEjs-mods`）的收录审核后台，支持
**人工审核** 与 **无人值守** 两种模式。前端是 React SPA，部署在 **Cloudflare Pages**；
业务后端是 PocketBase；两者之间由 Pages Functions 做同源代理与登录校验。

> 完整的部署、环境变量、GitHub 令牌与安全说明在 **[`DEPLOY.md`](./DEPLOY.md)**。
> 本文只做总览与快速上手。

## 能做什么

- **双审核模式**：`人工审核`（每条来源都要维护者确认）/ `无人值守`（检查全部通过且无警告的
  待收录条目自动收录；**检查不通过或已拒绝的绝不自动放行**）。
- **逐项自动检查**：基于索引仓库的真实字段核对清单、sha256、分类、下载地址、
  作者密钥与 `author.id` 是否一致等，逐项给出 通过 / 警告 / 不通过 与原因。
- **9 类筛选**，每类带实时计数：待收录、有警告、检查不通过、仓库失联、已上架、未通过、
  已下架、已删除、全部。计数与筛选结果同源，不会出现「数量对不上列表」。
- **单个处置**：收录通过 / 拒绝收录 / 下架 / 恢复上架 / 删除。
- **删除规则**：未上架（待收录、未通过、已下架）可直接删除；**已上架必须先下架才能删除**。
  删除会留档（`delete_records` + `review_records` 各一条），理由永久可查，条目转入「已删除」。
- **批量操作**：勾选多条后批量收录 / 拒绝 / 下架 / 恢复 / 删除，支持「全选本页」「全选筛选结果」
  「清空已选」。批量按**串行**执行以避免撞 GitHub 限流，不合规的条目会被**跳过并如实回报**
  成功 / 失败 / 跳过数量，不会静默丢弃。
- **审核记录 / 处置记录**：完整流水，含操作人与理由，可清空本机记录。
- **自动上架（零机器依赖）**：审核结论（含无人值守自动收录）会自动同步进索引仓库的
  `sources.json` / `moderation.json`，仓库自带的 GitHub Actions 随即**重建 + Ed25519 签名**并发布
  `docs/mod-index.json` —— 整条「审核 → 上架」链路都不需要维护者本机参与。

## 线上部署

- **生产站点**：<https://mod.5318.cm>（Cloudflare Pages 项目 `mod-review-console`）
- **来源**：GitHub `diguo520/mod-review-console` 的 `main` 分支，Cloudflare 侧执行
  `pnpm build` → 产物目录 `dist`，`functions/` 自动打包成 Pages Functions。
- **推送到 `main` 即自动构建上线**，不需要手动跑 `wrangler pages deploy`。
- **管理员账号密码不写在仓库里**，放在 Pages 项目 → Settings → Variables and secrets；
  改完必须重新部署才生效。
- **零机器依赖**：业务后端是 Pages Functions、数据存 Cloudflare D1 —— 不需要 VPS、
  不需要常开电脑、不需要 Cloudflare Tunnel。

## 架构

```
浏览器
  └─ https://<你的域名>            (Cloudflare Pages: 静态站点 + Functions)
       ├─ /                        → dist/index.html (React SPA)
       ├─ /api/session             → Function: 管理员账号密码登录, 签发 HttpOnly Cookie
       └─ /api/pb/api/**           → Function: 校验会话 → 业务逻辑
            ├─ 只读 → api.github.com / cdn.jsdelivr.net
            │        · sources.json         收录来源清单
            │        · docs/mod-index.json  已签名发布的索引(含 moderation)
            └─ 读写 → D1 (review_records / delete_records / repo_checks / mod_decisions)
                 └─ 审核结论回写索引仓库 → 仓库自己的 Actions 重建+签名 → docs/mod-index.json

Cloudflare 定时任务 (cron/ 目录, 每 10 分钟)
  └─ 调 POST /api/pb/api/index/sync → 同上；没人开页面也会同步
```

- **前端** `src/`：React + TypeScript + Vite + Tailwind。
- **Pages Functions** `functions/`：`api/session.ts`（登录）、`api/pb/[[path]].ts`（业务后端）、
  `_middleware.ts`（SPA 深链回退）、`_routes.json`。
- **数据库** Cloudflare **D1**：`schema.sql` 建表，`wrangler.toml` 里绑定为 `DB`。

> 队列数据永远**只读自索引仓库**（`sources.json` 与 `docs/mod-index.json`）—— 仓库才是事实来源；
> D1 里存的是审核流水、处置留档与仓库巡检结果；其中**尚未同步**的决定会由 Worker 回写进索引仓库，
> 再由索引仓库的 Actions 用存在 Actions Secret 里的私钥签名发布。私钥从不出现在浏览器或本站点。
>
> ⚠️ 早期版本把后端放在维护者本机的 PocketBase（经 Cloudflare Tunnel 暴露），必须电脑开着才有数据；
> 现已整体迁到 Pages Functions + D1，**不再依赖任何常开机器**，详见 `DEPLOY.md` 第 1 节。

## 零机器依赖（无人值守发布）

审核结论从「点一下」到「启动器可见」，全链路都不需要维护者的电脑：

| 环节 | 跑在哪 | 依赖谁的机器 |
| --- | --- | --- |
| 队列数据（sources.json / mod-index.json） | 索引仓库，站点只读拉取 | 无 |
| 审核流水 / 处置留档 / 巡检结果 | Cloudflare D1 | 无 |
| 审核结论回写索引仓库 | Pages Function `POST /api/pb/api/index/sync` | 无 |
| 索引重建 + 签名 | 索引仓库 GitHub Actions（私钥只在 Actions Secret 里） | 无 |
| **定期触发上面那步** | **`cron/` 里的 Cloudflare 定时任务，每 10 分钟** | 无 |

```
前端动作（或定时任务）
  → POST /api/pb/api/index/sync
      · 取 mod_decisions 里 applied = 0 的决定，重放出 sources.json / moderation.json
      · 一次提交同时写多个文件（blob → tree → commit → 移分支），不会出现
        「来源删了但审核理由还没发布」的中间态
      · 提交成功才把决定标成 applied = 1；失败就保持 0，下次重放（重放幂等）
  → 索引仓库 Actions（sources.json / moderation.json 变更触发）
      · 用 INDEX_SIGNING_KEY 签名 → 提交 docs/mod-index.json
  → 启动器读取
```

定时任务 Worker 只需部署一次：

```bash
# 1. 部署（独立 Worker，不是 Pages 项目）
npx wrangler deploy --config cron/wrangler.toml

# 2. 把站点那把共享令牌写进去（值与 Pages 的 INDEX_SYNC_TOKEN 相同）
npx wrangler secret put INDEX_SYNC_TOKEN --config cron/wrangler.toml
```

换域名记得同步改 `cron/wrangler.toml` 里的 `SYNC_URL`。验证方法见 `DEPLOY.md` 第 11 节。

## 本地开发

要求 **Node ≥ 22.12**（Vite 8）与 **pnpm**。

```bash
pnpm install
pnpm dev          # 纯前端 dev server
pnpm build        # tsc -b + vite build → dist/
pnpm lint
```

> 注意：登录门（`src/components/common/LoginGate.tsx`）已挂在应用最外层，
> 而纯 `pnpm dev` 没有 `/api/session`，所以会停在登录页。
> 本地要真正登录，用 `DEPLOY.md` 第 4 节的 `wrangler pages dev dist` + `.dev.vars`。

## 部署到 Cloudflare Pages

1. 推代码到 GitHub（本仓库）。
2. Cloudflare 控制台 → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → 选本仓库。
3. 构建配置：

   | 配置项 | 值 |
   | --- | --- |
   | Framework preset | `None`（别选 Vite，会覆盖输出目录） |
   | Build command | `pnpm build` |
   | Build output directory | `dist` |
   | Root directory | 留空 |

4. 环境变量（**管理员账号/密码就配在这里**）见 `DEPLOY.md` 2.3 节；最少要配
   `ADMIN_USER`、`ADMIN_PASSWORD`（或 `ADMIN_PASSWORD_HASH`）、`SESSION_SECRET`，
   再加 `NODE_VERSION=22`。
5. `functions/` 会被自动识别成 Pages Functions，无需额外配置。

改密码 = 改环境变量后**重新部署**才生效；想立刻踢掉所有已登录会话，换 `SESSION_SECRET`。

## 管理员登录

站点只对管理员开放：未登录时不渲染任何业务页面，只显示账号/密码表单。
会话是 HMAC 签名的 **HttpOnly Cookie**（`mrc_admin`），前端 JS 读不到令牌。

| 变量 | 说明 |
| --- | --- |
| `ADMIN_USER` | 管理员账号（必填） |
| `ADMIN_PASSWORD` | 明文密码，与下面二选一 |
| `ADMIN_PASSWORD_HASH` | 密码的 SHA-256 十六进制（**推荐**，控制台不落明文；两者都配时以它为准） |
| `SESSION_SECRET` | 会话签名密钥，随机 32 字节以上（必填） |
| `SESSION_TTL_HOURS` | 登录有效期小时数，默认 12 |

## GitHub 令牌

**配在 Cloudflare Pages 的环境变量里（`GITHUB_TOKEN`），由服务端 Function 使用。**
读索引仓库、探 `evejs-mod.json` 清单的代码都在 `functions/api/pb/[[path]].ts`，
是 Pages Function 发起的出站请求 —— 浏览器全程拿不到令牌。

- 用 **Fine-grained token**，权限只要 **Contents: Read-only**，作用是**把额度从 60 次/小时提到
  5000 次/小时**；不配也能跑，只是更容易撞限流。
- **绝不要**命名成 `VITE_GITHUB_TOKEN` —— Vite 会把 `VITE_` 前缀变量在构建时**内联进
  `dist/assets/*.js`**，等于把令牌明文发到公网。
- **回写索引仓库要写权限**。Fine-grained token 必须同时满足：

  | 项目 | 值 |
  | --- | --- |
  | Repository access | 勾上 `diguo520/EVEjs-mods`（只选 Public repositories 读得到、写不了） |
  | Contents | **Read and write**（核心：不加就报 403 Resource not accessible） |
  | Workflows | **Read and write**（只有要改 `.github/workflows/*` 时才需要） |
  | Metadata | Read-only（GitHub 默认带着） |

  改权限**不用换令牌**：在 GitHub 令牌设置里直接编辑权限，令牌字符串不变，
  Cloudflare 上的 `secret` / `.dev.vars` 都不用重配。
- 同步失败时接口回 **4xx 而不是 5xx**：Cloudflare 会把 Pages Functions 的 5xx 响应体换成
  它自己的错误页（线上实测只剩空的 `text/plain`），失败原因会被整个吞掉。所以
  `index_commit_failed` 按上游状态码回 403 / 404 / 409 / 424，响应体里带
  `stage`（卡在哪一步）、`detail`（GitHub 原话）、`trace`（每一步的 HTTP 结果）。
- `INDEX_SYNC_TOKEN`（密钥，可选）：给外部定时任务用的共享令牌，请求头 `x-index-sync-token`，
  且**只对** `POST /api/pb/api/index/sync` 生效；不配则该端点只认管理员会话。

## 安全要点

- 所有 `/api/pb/**` 一律**先校验管理员会话**，未登录 401；Worker 只认自己签发的 Cookie，
  不存在「伪造身份头」这条路。
- 建议给 Pages 站点再挂一段 **Cloudflare Access** 当第二道门。
- 审核结论会自动回写索引仓库并触发重建签名；`applied = 0` 表示还没同步成功，会自动重试（重放幂等）。
- 令牌与密钥只写在 Cloudflare 控制台和本地 `.dev.vars`（已在 `.gitignore`），**不进仓库**。

## 状态

- `tsc -b --force`、`pnpm build` 均 0 错误通过。
- 登录门（真实 `functions/api/session.ts`）26 条断言全过；登录流程真实浏览器验收 23 条断言全过；
  筛选 / 单删 / 批量操作同样做过真实浏览器验收。详见 `DEPLOY.md` 第 8 节。
- `eslint` 仍有 12 个**改动前就存在**的问题（清单见 `DEPLOY.md` 8 节），本次未新增。
- 索引回写链路用本地假 GitHub 验过整套（blob→tree→commit→ref、409 抢分支自动重试、
  403 时的 4xx 回传），8 条断言全过；线上实测返回 `403 令牌缺少 Contents: Read and write 权限`。
- Cloudflare 定时任务（`cron/`）已部署，实测无人操作也能把待同步决定标记完成。
- **已知边界**：`src/lib/aigc.ts`、`src/lib/llm.ts` 依赖平台（RunningHub VibeX）的 AI 网关，
  自建部署上不存在，这两个模块及 `RhAccountMenu` / `CostConfirmDialog` 当前未被任何页面引用；
  `src/lib/rhLogin.ts`（RH SSO）保留未删，要切回平台版只需改 `src/lib/auth.ts` 的导出。
