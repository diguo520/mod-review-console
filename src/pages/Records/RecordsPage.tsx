import { ArrowLeft, GitBranch, History, ListChecks } from "lucide-react"
import { Link } from "react-router-dom"
import type { useRecords } from "./useRecords"
import { ACTION_HINTS, ACTION_LABELS, ACTION_ORDER, ORIGIN_HINTS } from "./useRecords"
import { RecordsTopBar } from "@/components/records/RecordsTopBar"
import { RecordsStatStrip } from "@/components/records/RecordsStatStrip"
import { RecordsFilterBar } from "@/components/records/RecordsFilterBar"
import { TimelineList } from "@/components/records/TimelineList"
import { RecordDetailPanel } from "@/components/records/RecordDetailPanel"
import { ClearRecordsDialog } from "@/components/records/ClearRecordsDialog"
import { Button } from "@/components/ui/button"

export function RecordsPage(p: ReturnType<typeof useRecords>) {
  return (
    <div className="relative min-h-screen bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-secondary/40 to-card"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />

      <RecordsTopBar
        totalCount={p.totalCount}
        clearableCount={p.localClearableCount + p.checkClearableCount}
        onOpenClear={() => p.setClearOpen(true)}
      />

      <main className="relative mx-auto w-full max-w-[1600px] space-y-8 px-6 py-8">
        <section className="grid gap-6 rounded-lg border border-border bg-card p-6 shadow-md lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              EveJS Mod Registry · 维护者控制台
            </p>
            <h2 className="mt-2 text-4xl font-bold text-card-foreground">审核动作记录中心</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              收录通过、拒绝收录、自动放行、下架、恢复上架与仓库巡检汇成一条按时间倒序的时间线，
              索引仓库里已经生效的审核结果也一并列出。用不同颜色区分动作类型、用来源徽标区分
              已生效与待应用，点开任意一条可以看到完整理由与 MOD 快照。
            </p>
          </div>
          <div className="flex flex-col justify-between gap-4 rounded-md border border-border bg-background/60 p-4">
            <div>
              <p className="text-xs text-muted-foreground">时间线范围</p>
              <p className="mt-1 text-2xl font-bold text-primary">
                {p.stats.total} / {p.totalCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                当前筛选命中条数 / 全部记录条数
              </p>
            </div>
            <Link to="/" className="block">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 border-primary/40 text-primary focus-visible:shadow-focus"
              >
                <ArrowLeft className="h-4 w-4" />
                回到审核工作台
              </Button>
            </Link>
          </div>
        </section>

        {p.syncNote ? (
          <section className="rounded-lg border border-dashed border-border bg-card px-4 py-3 text-xs text-muted-foreground shadow-sm">
            {p.syncNote}
          </section>
        ) : null}

        {p.clearNote ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-xs text-muted-foreground shadow-sm">
            <span>{p.clearNote}</span>
            <button
              type="button"
              onClick={() => p.setClearNote("")}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
            >
              知道了
            </button>
          </section>
        ) : null}

        <RecordsStatStrip
          stats={p.stats}
          actionTypes={p.actionTypes}
          onToggle={p.toggleAction}
        />

        <section className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-5">
            <RecordsFilterBar
              actionTypes={p.actionTypes}
              onToggleAction={p.toggleAction}
              originFilter={p.originFilter}
              onOriginChange={p.setOriginFilter}
              modKeyword={p.modKeyword}
              onKeywordChange={p.setModKeyword}
              operators={p.operators}
              operatorFilter={p.operatorFilter}
              onOperatorChange={p.setOperatorFilter}
              timeRange={p.timeRange}
              onTimeRangeChange={p.setTimeRange}
              onClear={p.clearFilters}
              hasActiveFilter={p.hasActiveFilter}
            />
            <TimelineList
              items={p.items}
              selectedId={p.selected?.id ?? null}
              onSelect={p.selectItem}
              loading={p.loading}
              errorText={p.errorText}
              total={p.filteredCount}
              page={p.timelinePage}
              pageCount={p.timelinePageCount}
              pageSize={p.timelinePageSize}
              onPageChange={p.setTimelinePage}
            />
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24">
            <section className="rounded-lg border border-border bg-card p-5 shadow-md">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-card-foreground">动作类型说明</h2>
              </div>
              <ul className="mt-3 space-y-3">
                {ACTION_ORDER.map((action) => (
                  <li
                    key={action}
                    className="rounded-md border border-border bg-background/60 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {ACTION_LABELS[action]}
                      </span>
                      <span className="font-mono text-sm text-primary">{p.stats[action]}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{ACTION_HINTS[action]}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 shadow-md">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-card-foreground">记录来源</h2>
              </div>
              <ul className="mt-3 space-y-2">
                <li className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <p className="text-sm font-medium text-primary">已生效</p>
                  <p className="mt-1 text-xs text-muted-foreground">{ORIGIN_HINTS.repo}</p>
                </li>
                <li className="rounded-md border border-border bg-background/60 px-3 py-2">
                  <p className="text-sm font-medium text-foreground">待应用</p>
                  <p className="mt-1 text-xs text-muted-foreground">{ORIGIN_HINTS.local}</p>
                </li>
              </ul>
            </section>

            <section className="rounded-lg border border-dashed border-border bg-card p-5 shadow-md">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-base font-semibold text-card-foreground">留痕说明</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                拒绝与下架必须写明理由，理由原文会完整保留在处置留档里。巡检记录只反映仓库是否仍可访问，
                不会改动 MOD 的上架状态。
              </p>
            </section>
          </aside>
        </section>
      </main>

      <footer className="relative mx-auto w-full max-w-[1600px] px-6 pb-10">
        <div className="rounded-lg border border-dashed border-border px-4 py-4 text-xs text-muted-foreground">
          时间线由索引仓库里已生效的审核结果、本机审核流水、处置留档与仓库巡检合并而成，筛选条件会同时收敛时间线与顶部统计。
        </div>
      </footer>

      <RecordDetailPanel
        item={p.selected}
        onClose={p.closeDetail}
        onGoToWorkbench={p.goToWorkbench}
      />

      <ClearRecordsDialog
        open={p.clearOpen}
        onOpenChange={p.setClearOpen}
        localCount={p.localClearableCount}
        checkCount={p.checkClearableCount}
        clearing={p.clearing}
        onConfirm={p.clearRecords}
      />
    </div>
  )
}
