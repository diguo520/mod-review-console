-- 审核控制台的本地留档表（原先住在 PocketBase 的 pb_data，现在放进 D1）。
--
-- 说明：队列数据不在这里 —— 队列每次都只读自维护者的索引仓库
-- (diguo520/EVEjs-mods 的 sources.json 与 docs/mod-index.json)。
-- 这四张表只是**暂存**：审核结论导出并重建索引之后就该清空，
-- 真正生效的审核结果住在仓库的 docs/mod-index.json 里。
--
-- 字段与原来的 pb_hooks/*.pb.js 一一对应，名称保持 snake_case 不变，
-- 前端 useHome.ts / useRecords.ts 的读取代码不需要改动。

CREATE TABLE IF NOT EXISTS review_records (
  id        TEXT PRIMARY KEY NOT NULL,
  mod_id    TEXT NOT NULL DEFAULT '',
  mod_name  TEXT NOT NULL DEFAULT '',
  action    TEXT NOT NULL DEFAULT '',
  reason    TEXT NOT NULL DEFAULT '',
  mode      TEXT NOT NULL DEFAULT '',
  operator  TEXT NOT NULL DEFAULT '',
  acted_at  TEXT NOT NULL DEFAULT '',
  created   TEXT NOT NULL,
  updated   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_records_mod_id ON review_records (mod_id);
CREATE INDEX IF NOT EXISTS idx_review_records_action ON review_records (action);

CREATE TABLE IF NOT EXISTS delete_records (
  id          TEXT PRIMARY KEY NOT NULL,
  mod_id      TEXT NOT NULL DEFAULT '',
  mod_name    TEXT NOT NULL DEFAULT '',
  reason      TEXT NOT NULL DEFAULT '',
  operator    TEXT NOT NULL DEFAULT '',
  deleted_at  TEXT NOT NULL DEFAULT '',
  action_kind TEXT NOT NULL DEFAULT '',
  created     TEXT NOT NULL,
  updated     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delete_records_mod_id ON delete_records (mod_id);

CREATE TABLE IF NOT EXISTS repo_checks (
  id         TEXT PRIMARY KEY NOT NULL,
  mod_id     TEXT NOT NULL DEFAULT '',
  mod_name   TEXT NOT NULL DEFAULT '',
  repo_url   TEXT NOT NULL DEFAULT '',
  alive      INTEGER NOT NULL DEFAULT 0,
  detail     TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT '',
  created    TEXT NOT NULL,
  updated    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_repo_checks_mod_id ON repo_checks (mod_id);
CREATE INDEX IF NOT EXISTS idx_repo_checks_checked_at ON repo_checks (checked_at);

CREATE TABLE IF NOT EXISTS mod_decisions (
  id         TEXT PRIMARY KEY NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL DEFAULT '',
  reason_zh  TEXT NOT NULL DEFAULT '',
  reason_en  TEXT NOT NULL DEFAULT '',
  operator   TEXT NOT NULL DEFAULT '',
  decided_at TEXT NOT NULL DEFAULT '',
  applied    INTEGER NOT NULL DEFAULT 0,
  created    TEXT NOT NULL,
  updated    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mod_decisions_target ON mod_decisions (target);
CREATE INDEX IF NOT EXISTS idx_mod_decisions_action ON mod_decisions (action);
CREATE INDEX IF NOT EXISTS idx_mod_decisions_kind ON mod_decisions (kind);