import {
  AlertTriangle,
  Database,
  Download,
  GitBranch,
  Loader2,
  Radar,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import type { useHome } from "./useHome"
import { WorkbenchTopBar } from "@/components/home/WorkbenchTopBar"
import { StatStrip } from "@/components/home/StatStrip"
import { ReviewQueuePanel } from "@/components/home/ReviewQueuePanel"
import { ModDetailPanel } from "@/components/home/ModDetailPanel"
import { ReviewActionPanel } from "@/components/home/ReviewActionPanel"
import { BulkActionPanel } from "@/components/home/BulkActionPanel"
import { RecordsDialog } from "@/components/home/RecordsDialog"
import { ExportDialog } from "@/components/home/ExportDialog"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "./useHome"
import { cn } from "@/lib/utils"

export function HomePage(p: ReturnType<typeof useHome>) {
  const busy = p.busyKey !== null && p.selected !== null && p.busyKey === p.selected.key
  const sourceLabel = p.repo ? `${p.repo}${p.branch ? ` @ ${p.branch}` : ""}` : "尚未取到索引仓库"

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

      <WorkbenchTopBar
        mode={p.mode}
        setMode={p.setMode}
        lastInspectAt={p.lastInspectAt}
        inspecting={p.inspecting}
        runInspection={() => void p.runInspection()}
        offlineCount={p.stats.offline}
        purging={p.purging}
        purgeOfflineMods={() => void p.purgeOfflineMods()}
        openRecords={p.openRecords}
      />

      <main className="relative mx-auto w-full max-w-[1600px] space-y-8 px-6 py-8">
        <section className="grid gap-6 rounded-lg border border-border bg-card p-6 shadow-md lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              EveJS Mod Registry · 维护者控制台
            </p>
            <h2 className="mt-2 text-4xl font-bold text-card-foreground">模组收录审核工作台</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              队列里的条目全部来自维护者索引仓库：核对资料与逐项自动检查后，决定收录通过、拒绝收录、
              下架、恢复上架或删除，拒绝、下架与删除都要写明理由。条目可以勾选后批量处理，
              已上架的必须先下架才能删除。审核结论导出成两个文件带回本机重建索引，改动才会真正生效。
            </p>
          </div>
          <div className="flex flex-col justify-between gap-4 rounded-md border border-border bg-background/60 p-4">
            <div>
              <p className="text-xs text-muted-foreground">当前审核模式</p>
              <p
                className={cn(
                  "mt-1 text-2xl font-bold",
                  p.mode === "auto" ? "text-primary" : "text-card-foreground",
                )}
              >
                {p.mode === "auto" ? "无人值守" : "人工审核"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.mode === "auto"
                  ? "检查全部通过且无警告的待收录条目会自动收录并留痕；未通过的不自动放行"
                  : "每条来源都需要你确认后才会收录"}
              </p>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-2">
                <Radar className="h-3.5 w-3.5 text-primary" />
                上次巡检：{p.lastInspectAt ? formatDateTime(p.lastInspectAt) : "尚未巡检"}
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                仓库失联：{p.stats.offline} 条
              </p>
              <p className="flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5 text-destructive" />
                检查不通过：{p.stats.fail} 条
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
                <Database className="h-3.5 w-3.5" />
                数据来源
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-card-foreground">
                <GitBranch className="h-4 w-4 text-primary" />
                <span className="break-all font-mono text-xs">{sourceLabel}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                数据截至 {p.publishedAt ? formatDateTime(p.publishedAt) : "—"} · 本次拉取{" "}
                {p.fetchedAt ? formatDateTime(p.fetchedAt) : "—"} · 收录来源 {p.sourceCount} 条
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void p.refreshData()}
                disabled={p.refreshing}
                className="gap-2 border-primary/40 text-primary focus-visible:shadow-focus"
              >
                {p.refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {p.refreshing ? "拉取中" : "刷新数据"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={p.openExport}
                className="gap-2 bg-primary text-primary-foreground focus-visible:shadow-focus"
              >
                <Download className="h-4 w-4" />
                导出审核结果
              </Button>
            </div>
          </div>

          {p.syncFromCache ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              当前显示的是本地缓存（两分钟内不重复拉取索引仓库），点「刷新数据」可以立刻取最新。
            </p>
          ) : null}

          {p.syncError ? (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {p.syncError}
            </p>
          ) : null}

          {p.warnings.length > 0 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                索引仓库拉取过程有 {p.warnings.length} 条告警，队列可能不完整
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-destructive">
                {p.warnings.map((w, index) => (
                  <li key={`${index}-${w}`} className="break-all">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <StatStrip stats={p.stats} mode={p.mode} autoPromotedCount={p.autoPromotedCount} />

        <section className="grid items-start gap-5 lg:grid-cols-4">
          <div className="lg:col-span-1 lg:sticky lg:top-24">
            <ReviewQueuePanel
              items={p.items}
              selectedId={p.selected?.key ?? null}
              onSelect={p.selectItem}
              filterStatus={p.filterStatus}
              onFilterChange={p.setFilterStatus}
              filterCounts={p.filterCounts}
              keyword={p.keyword}
              onKeywordChange={p.setKeyword}
              loading={p.loading}
              busyKey={p.busyKey}
              total={p.queueTotal}
              page={p.queuePage}
              pageCount={p.queuePageCount}
              pageSize={p.queuePageSize}
              onPageChange={p.setQueuePage}
              selectedKeys={p.selectedKeys}
              onToggleSelect={p.toggleSelect}
              onSelectMany={p.selectMany}
              onSelectAllFiltered={p.selectAllFiltered}
              onClearSelection={p.clearSelection}
              bulkRunning={p.bulkRunning}
            />
          </div>
          <div className="lg:col-span-2">
            <ModDetailPanel
              mod={p.selected}
              loading={p.loading}
              onReinspect={p.reinspectSource}
            />
          </div>
          <div className="space-y-5 lg:col-span-1 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto">
            {p.selectedItems.length > 0 ? (
              <BulkActionPanel
                items={p.selectedItems}
                reason={p.reason}
                onReasonChange={p.setReason}
                quickReasons={p.quickReasons}
                onApplyQuickReason={p.applyQuickReason}
                onRun={(action, reason) => void p.runBulkAction(action, reason)}
                onClear={p.clearSelection}
                running={p.bulkRunning}
                progress={p.bulkProgress}
              />
            ) : null}
            <ReviewActionPanel
              item={p.selected}
              actionKind={p.actionKind}
              onActionKindChange={p.setActionKind}
              reason={p.reason}
              onReasonChange={p.setReason}
              quickReasons={p.quickReasons}
              onApplyQuickReason={p.applyQuickReason}
              onApprove={(item) => void p.approveItem(item)}
              onReject={p.rejectItem}
              onDelist={p.delistItem}
              onRestore={(item) => void p.restoreItem(item)}
              onDelete={p.deleteItem}
              busy={busy}
            />
          </div>
        </section>
      </main>

      <footer className="relative mx-auto w-full max-w-[1600px] px-6 pb-10">
        <div className="rounded-lg border border-dashed border-border px-4 py-4 text-xs text-muted-foreground">
          每条审核结论都会写入审核记录，拒绝收录、下架与删除另外写入处置记录，作者可据此修正后重新提交。
          筛选按钮覆盖待收录、有警告、检查不通过、仓库失联、已上架、未通过、已下架与已删除，
          按钮上的数字与筛选结果一致；勾选条目即可批量处理，不符合前置条件的会被跳过并如实报数。
          队列里只有仓库地址的待收录 / 未通过条目会自动去来源仓库体检，拉到的清单资料只作参考，
          收不收仍由你判断；体检取不到资料时会原样显示原因，也可以随时重新体检。
          仓库巡检默认每 10 分钟自动跑一轮，也可以随时手动触发；失联的条目会在队列里标红。
          做完一轮审核后记得导出两个结论文件，回本机重建索引才会对所有人生效。
        </div>
      </footer>

      <RecordsDialog
        open={p.recordsOpen}
        onOpenChange={p.setRecordsOpen}
        tab={p.recordsTab}
        onTabChange={p.setRecordsTab}
        reviewRecords={p.reviewRecords}
        deleteRecords={p.deleteRecords}
      />

      <ExportDialog
        open={p.exportOpen}
        onOpenChange={p.setExportOpen}
        entries={p.exportEntries}
        sources={p.exportSources}
        moderationJson={p.moderationJson}
        sourcesJson={p.sourcesJson}
        onCopy={(text, label) => void p.copyText(text, label)}
        onDownload={p.downloadJson}
      />

      {p.toast ? (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-md border px-4 py-3 text-sm shadow-md",
            p.toast.kind === "ok"
              ? "border-primary/30 bg-card text-foreground"
              : "border-destructive/40 bg-card text-destructive",
          )}
        >
          {p.toast.text}
        </div>
      ) : null}
    </div>
  )
}
