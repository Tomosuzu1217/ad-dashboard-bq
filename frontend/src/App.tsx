import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ScatterChart, Scatter, ZAxis,
} from 'recharts'
import * as XLSX from 'xlsx'
import './App.css'
import {
  fetchFunnelDaily, fetchCreative, fetchHealth,
  useApiData,
} from './services/api'
import type {
  FunnelDailyRow, CreativeRow, ApiParams, HealthResponse,
} from './services/api'
import * as analytics from './services/analytics'
import type {
  OverallKpi, MediaSummary, CreativeSummary, PeriodComparison,
  AdAlert, DailyCostPoint,
} from './services/analytics'

// ============ Constants ============

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16']
const MEDIA_OPTIONS = ['', 'meta', 'tiktok', 'google', 'x', 'yts', 'organic', 'other']
const MEDIA_LABELS: Record<string, string> = { '': '全媒体', meta: 'Meta', tiktok: 'TikTok', google: 'Google', x: 'X', yts: 'YouTube', organic: 'Organic', other: 'Other' }

type TabId = 'overview' | 'media' | 'creative' | 'period_compare' | 'ranking_alerts' | 'datalist'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: '概要・ROI' },
  { id: 'media', label: '媒体別' },
  { id: 'creative', label: 'クリエイティブ別' },
  { id: 'period_compare', label: '期間比較' },
  { id: 'ranking_alerts', label: 'ランキング・アラート' },
  { id: 'datalist', label: 'データ一覧' },
]

// ============ Formatters ============

const fmt = (n: number) => n.toLocaleString('ja-JP')
const fmtPct = (n: number) => `${Math.round(n * 10) / 10}%`
const fmtYen = (n: number) => `\u00a5${Math.round(n).toLocaleString('ja-JP')}`

// ============ Helper Components ============

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

function SkeletonKpi({ count = 6 }: { count?: number }) {
  return (
    <div className="kpi-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-kpi" />
      ))}
    </div>
  )
}

function SkeletonChart() {
  return <div className="skeleton skeleton-chart" style={{ marginBottom: '1rem' }} />
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-panel">
      <div>Error: {message}</div>
      {onRetry && <button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  )
}

function HeatmapCell({ value, isPercent }: { value: number; isPercent?: boolean }) {
  let bg = '#f9fafb'
  let color = '#374151'
  if (value > 50) { bg = '#fecaca'; color = '#991b1b' }
  else if (value > 20) { bg = '#fef3c7'; color = '#92400e' }
  else if (value < -20) { bg = '#d1fae5'; color = '#065f46' }
  else if (value < -5) { bg = '#ccfbf1'; color = '#0f766e' }
  return (
    <span className="heatmap-cell" style={{ background: bg, color }}>
      {isPercent ? fmtPct(value) : fmt(Math.round(value))}
    </span>
  )
}

function alertBadge(level: string) {
  switch (level) {
    case 'CRITICAL_UP': return <span className="badge badge-critical">CRITICAL</span>
    case 'WARNING_UP': return <span className="badge badge-warning">WARNING</span>
    case 'GOOD_DOWN': return <span className="badge badge-good">GOOD</span>
    case 'CPM_SPIKE': return <span className="badge badge-info">CPM SPIKE</span>
    default: return null
  }
}

function getMediaDecision(cpo: number, roi: number, settlements: number): { label: string; color: string; bg: string } {
  if (settlements > 3 && roi > 0) return { label: '増額候補', color: '#16a34a', bg: '#f0fdf4' }
  if (roi < -30) return { label: '予算見直し', color: '#dc2626', bg: '#fef2f2' }
  if (cpo > 120000) return { label: '訴求/LP改善', color: '#ea580c', bg: '#fff7ed' }
  return { label: '現状維持', color: '#6b7280', bg: '#f9fafb' }
}

// ============ Excel Export ============

function exportToExcel(sheets: { name: string; rows: Record<string, unknown>[] }[], filename: string) {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename)
}

// ============ Main App ============

export default function App() {
  // ---- Filter State ----
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [mediaFilter, setMediaFilter] = useState('')
  const [funnelTypeFilter, setFunnelTypeFilter] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [displayLimit, setDisplayLimit] = useState(50)
  const [dataListSearch, setDataListSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [alertMinSpend, setAlertMinSpend] = useState(1000)
  const [alertCriticalPct, setAlertCriticalPct] = useState(50)
  const [alertWarningPct, setAlertWarningPct] = useState(20)

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ---- Build API params ----
  const apiParams: ApiParams = useMemo(() => ({
    start_date: dateStart || undefined,
    end_date: dateEnd || undefined,
    media_code: mediaFilter || undefined,
    funnel_type: funnelTypeFilter || undefined,
  }), [dateStart, dateEnd, mediaFilter, funnelTypeFilter])

  // ---- Health check ----
  const health = useApiData<HealthResponse>(() => fetchHealth(), [])
  const isHealthy = health.data?.status === 'ok' || health.data?.bigquery === 'connected'

  // ---- API Data ----
  const funnelResult = useApiData<FunnelDailyRow[]>(
    () => fetchFunnelDaily(apiParams),
    [apiParams],
  )
  const creativeResult = useApiData<CreativeRow[]>(
    () => fetchCreative(apiParams),
    [apiParams],
  )

  // ---- Track last updated ----
  useEffect(() => {
    if (funnelResult.data) setLastUpdated(new Date())
  }, [funnelResult.data])

  // ---- Debounce search ----
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(dataListSearch), 200)
    return () => clearTimeout(t)
  }, [dataListSearch])

  // ---- Auto-refresh ----
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => {
        funnelResult.refetch()
        creativeResult.refetch()
      }, 30000)
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    }
  }, [autoRefresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualRefresh = useCallback(() => {
    funnelResult.refetch()
    creativeResult.refetch()
    health.refetch()
  }, [funnelResult, creativeResult, health])

  // ---- Computed data ----
  const funnelData = funnelResult.data ?? []
  const creativeData = creativeResult.data ?? []
  const hasData = funnelData.length > 0

  const kpi: OverallKpi | null = useMemo(
    () => hasData ? analytics.computeOverallKpi(funnelData) : null,
    [funnelData, hasData],
  )

  const mediaSummary: MediaSummary[] = useMemo(
    () => hasData ? analytics.aggregateByMedia(funnelData) : [],
    [funnelData, hasData],
  )

  const creativeSummary: CreativeSummary[] = useMemo(
    () => creativeData.length > 0 ? analytics.aggregateByCreative(creativeData) : [],
    [creativeData],
  )

  const costTrend: DailyCostPoint[] = useMemo(
    () => hasData ? analytics.dailyCostTrend(funnelData) : [],
    [funnelData, hasData],
  )

  const monthlyCpo = useMemo(
    () => (hasData && activeTab === 'overview') ? analytics.monthlyCpoTrend(funnelData) : [],
    [funnelData, hasData, activeTab],
  )

  const periodComparisons: PeriodComparison[] = useMemo(
    () => (hasData && activeTab === 'period_compare') ? analytics.computePeriodComparison(funnelData, periodType) : [],
    [funnelData, periodType, hasData, activeTab],
  )

  const alerts: AdAlert[] = useMemo(
    () => (activeTab === 'ranking_alerts' || activeTab === 'period_compare')
      ? analytics.detectAlerts(periodComparisons.length > 0 ? periodComparisons : analytics.computePeriodComparison(funnelData, 'weekly'), { minSpend: alertMinSpend, criticalPct: alertCriticalPct, warningPct: alertWarningPct })
      : [],
    [periodComparisons, funnelData, alertMinSpend, alertCriticalPct, alertWarningPct, activeTab],
  )

  const ranking = useMemo(
    () => (creativeData.length > 0 && activeTab === 'ranking_alerts') ? analytics.computeCreativeRanking(creativeData) : { top: [], worst: [] },
    [creativeData, activeTab],
  )

  // ---- Pie data ----
  const mediaPieData = useMemo(
    () => mediaSummary.map(m => ({ name: m.media_code, value: Math.round(m.totalCost) })),
    [mediaSummary],
  )

  // ---- Investment gap ----
  const investmentGap = useMemo(() => {
    if (mediaSummary.length === 0) return []
    const totalCost = mediaSummary.reduce((s, m) => s + m.totalCost, 0)
    const totalRevenue = mediaSummary.reduce((s, m) => s + m.totalRevenue, 0)
    return mediaSummary.map(m => ({
      media: m.media_code,
      costShare: totalCost > 0 ? Math.round((m.totalCost / totalCost) * 1000) / 10 : 0,
      revenueShare: totalRevenue > 0 ? Math.round((m.totalRevenue / totalRevenue) * 1000) / 10 : 0,
    })).filter(m => m.costShare > 0 || m.revenueShare > 0)
  }, [mediaSummary])

  // ---- Scatter data ----
  const scatterData = useMemo(
    () => creativeSummary.map(c => ({
      creative_code: c.creative_code,
      media_code: c.media_code,
      cost: Math.round(c.totalCost),
      settlements: c.totalSettlements,
      impressions: c.totalImpressions,
    })).filter(c => c.cost > 0),
    [creativeSummary],
  )

  // ---- Monthly CPO chart data ----
  const monthlyCpoChartData = useMemo(() => {
    if (monthlyCpo.length === 0) return []
    const months = [...new Set(monthlyCpo.map(r => r.month))].sort()
    const medias = [...new Set(monthlyCpo.map(r => r.media_code))]
    return months.map(month => {
      const row: Record<string, unknown> = { month }
      for (const media of medias) {
        const entry = monthlyCpo.find(r => r.month === month && r.media_code === media)
        row[media] = entry ? Math.round(entry.cpo) : 0
      }
      return row
    })
  }, [monthlyCpo])

  const monthlyCpoMedias = useMemo(
    () => [...new Set(monthlyCpo.map(r => r.media_code))],
    [monthlyCpo],
  )

  // ---- Data list rows ----
  const dataListRows = useMemo(() => {
    if (activeTab !== 'datalist') return []
    let rows = funnelData
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      rows = rows.filter(r =>
        r.report_date.toLowerCase().includes(q) ||
        r.media_code.toLowerCase().includes(q) ||
        r.creative_code.toLowerCase().includes(q),
      )
    }
    return rows
  }, [funnelData, debouncedSearch, activeTab])

  // ---- Sort helpers ----
  const handleSort = useCallback((col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }, [sortCol])

  const sortIndicator = useCallback((col: string) => {
    if (sortCol !== col) return ' \u25BD'
    return sortDir === 'asc' ? ' \u25B3' : ' \u25BC'
  }, [sortCol, sortDir])

  function sortRows<T extends Record<string, unknown>>(rows: T[]): T[] {
    if (!sortCol) return rows
    return [...rows].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol]
      const na = Number(va), nb = Number(vb)
      if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }

  // ---- Loading state ----
  const isLoading = funnelResult.loading || creativeResult.loading
  const hasError = funnelResult.error || creativeResult.error

  // ============ RENDER ============
  return (
    <div className="app">
      {/* ======== Header ======== */}
      <div className="header">
        <h1>広告分析ダッシュボード (BigQuery)</h1>
        <div className="header-right">
          <span>
            <span className={`status-dot ${isHealthy ? 'green' : 'red'}`} />
            {isHealthy ? 'BigQuery接続' : '接続エラー'}
          </span>
          {autoRefresh && <span className="status-dot green pulsing" title="自動更新中" />}
          {lastUpdated && (
            <span>最終更新: {lastUpdated.toLocaleTimeString('ja-JP')}</span>
          )}
          {hasData && (
            <span>({fmt(funnelData.length)}行)</span>
          )}
        </div>
      </div>

      {/* ======== Filters Bar ======== */}
      <div className="filters-bar">
        <label>開始:</label>
        <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
        <label>終了:</label>
        <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
        <label>媒体:</label>
        <select value={mediaFilter} onChange={e => setMediaFilter(e.target.value)}>
          {MEDIA_OPTIONS.map(m => <option key={m} value={m}>{MEDIA_LABELS[m] || m}</option>)}
        </select>
        <label>ファネル:</label>
        <select value={funnelTypeFilter} onChange={e => setFunnelTypeFilter(e.target.value)}>
          <option value="">全て</option>
          <option value="Free">Free</option>
          <option value="Webinar">Webinar</option>
        </select>
        <label className="auto-refresh-toggle">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
          自動更新(30s)
        </label>
        <button className="btn btn-primary btn-sm" onClick={handleManualRefresh}>
          更新
        </button>
      </div>

      {/* ======== Error Display ======== */}
      {hasError && (
        <ErrorPanel
          message={funnelResult.error || creativeResult.error || 'Unknown error'}
          onRetry={handleManualRefresh}
        />
      )}

      {/* ======== Tabs ======== */}
      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(t.id); setSortCol(''); setDisplayLimit(50) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ======================================================================
          TAB: 概要・ROI
      ====================================================================== */}
      {activeTab === 'overview' && (
        <>
          {isLoading && !hasData ? (
            <>
              <SkeletonKpi count={12} />
              <SkeletonChart />
            </>
          ) : !hasData ? (
            <div className="empty">
              <div className="empty-icon">--</div>
              <div>データを取得中...フィルタを確認してください</div>
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="kpi-grid">
                <KpiCard label="総コスト" value={fmtYen(kpi!.totalCost)} />
                <KpiCard label="総売上" value={fmtYen(kpi!.totalRevenue)} />
                <KpiCard label="ROI" value={fmtPct(kpi!.roi)} sub={kpi!.roi > 0 ? '黒字' : '赤字'} />
                <KpiCard label="CPO (成約単価)" value={fmtYen(kpi!.cpo)} />
                <KpiCard label="CPA (CV単価)" value={fmtYen(kpi!.cpa)} />
                <KpiCard label="ARPU (客単価)" value={fmtYen(kpi!.arpu)} />
                <KpiCard label="成約数" value={fmt(kpi!.totalSettlements)} />
                <KpiCard label="LINE追加" value={fmt(kpi!.totalLineAdds)} />
                <KpiCard label="広告CV" value={fmt(kpi!.totalAdConversions)} />
                <KpiCard label="CTR" value={fmtPct(kpi!.ctr)} />
                <KpiCard label="CPC" value={fmtYen(kpi!.cpc)} />
                <KpiCard label="CPM" value={fmtYen(kpi!.cpm)} />
              </div>

              {/* Media Pie + Daily Cost Trend */}
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">媒体別コスト配分</div>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={mediaPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {mediaPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmtYen(Number(v) || 0)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <div className="card-title">日次コスト推移</div>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={costTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => fmtYen(Number(v) || 0)} />
                      <Line type="monotone" dataKey="cost" stroke="#0d9488" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monthly CPO Trend */}
              {monthlyCpoChartData.length > 0 && (
                <div className="card">
                  <div className="card-title">月次CPO推移 (媒体別)</div>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={monthlyCpoChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => fmtYen(Number(v) || 0)} />
                      <Legend />
                      {monthlyCpoMedias.map((media, i) => (
                        <Line key={media} type="monotone" dataKey={media} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Investment Gap */}
              {investmentGap.length > 0 && (
                <div className="card">
                  <div className="card-title">投資対効果ギャップ (コスト配分 vs 売上配分)</div>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={investmentGap} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                      <YAxis type="category" dataKey="media" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip formatter={(v: any) => `${v}%`} />
                      <Legend />
                      <Bar dataKey="costShare" name="コスト配分" fill="#ef4444" />
                      <Bar dataKey="revenueShare" name="売上配分" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ======================================================================
          TAB: 媒体別
      ====================================================================== */}
      {activeTab === 'media' && (
        <>
          {isLoading && !hasData ? (
            <>
              <SkeletonKpi count={4} />
              <div className="skeleton skeleton-chart" />
            </>
          ) : !hasData ? (
            <div className="empty"><div>データなし</div></div>
          ) : (
            <>
              {/* Media KPI Table */}
              <div className="card">
                <div className="card-title">媒体別KPI</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th onClick={() => handleSort('media_code')}>媒体{sortIndicator('media_code')}</th>
                        <th onClick={() => handleSort('totalCost')}>コスト{sortIndicator('totalCost')}</th>
                        <th onClick={() => handleSort('totalRevenue')}>売上{sortIndicator('totalRevenue')}</th>
                        <th onClick={() => handleSort('totalSettlements')}>成約{sortIndicator('totalSettlements')}</th>
                        <th onClick={() => handleSort('totalAdConversions')}>広告CV{sortIndicator('totalAdConversions')}</th>
                        <th onClick={() => handleSort('totalLineAdds')}>LINE追加{sortIndicator('totalLineAdds')}</th>
                        <th onClick={() => handleSort('cpo')}>CPO{sortIndicator('cpo')}</th>
                        <th onClick={() => handleSort('roi')}>ROI{sortIndicator('roi')}</th>
                        <th onClick={() => handleSort('ctr')}>CTR{sortIndicator('ctr')}</th>
                        <th>ROAS</th>
                        <th>判定</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortRows(mediaSummary as unknown as Record<string, unknown>[]).map((r) => {
                        const row = r as unknown as MediaSummary
                        const roas = row.totalCost > 0 ? (row.totalRevenue / row.totalCost) * 100 : 0
                        const decision = getMediaDecision(row.cpo, row.roi, row.totalSettlements)
                        return (
                          <tr key={row.media_code}>
                            <td><strong>{row.media_code}</strong></td>
                            <td>{fmtYen(row.totalCost)}</td>
                            <td>{fmtYen(row.totalRevenue)}</td>
                            <td>{fmt(row.totalSettlements)}</td>
                            <td>{fmt(row.totalAdConversions)}</td>
                            <td>{fmt(row.totalLineAdds)}</td>
                            <td>{fmtYen(row.cpo)}</td>
                            <td style={{ color: row.roi >= 0 ? '#16a34a' : '#dc2626' }}>{fmtPct(row.roi)}</td>
                            <td>{fmtPct(row.ctr)}</td>
                            <td>{fmtPct(roas)}</td>
                            <td><span style={{ background: decision.bg, color: decision.color, padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600 }}>{decision.label}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Media Bar Chart */}
              <div className="card">
                <div className="card-title">媒体別コスト比較</div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={mediaSummary.map(m => ({ name: m.media_code, cost: Math.round(m.totalCost), revenue: Math.round(m.totalRevenue) }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmtYen(Number(v) || 0)} />
                    <Legend />
                    <Bar dataKey="cost" name="コスト" fill="#ef4444" />
                    <Bar dataKey="revenue" name="売上" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {/* ======================================================================
          TAB: クリエイティブ別
      ====================================================================== */}
      {activeTab === 'creative' && (
        <>
          {isLoading && creativeData.length === 0 ? (
            <>
              <SkeletonKpi count={4} />
              <SkeletonChart />
            </>
          ) : creativeData.length === 0 ? (
            <div className="empty"><div>クリエイティブデータなし</div></div>
          ) : (
            <>
              {/* Creative KPI Table */}
              <div className="card">
                <div className="card-title">クリエイティブ別KPI (上位{Math.min(displayLimit, creativeSummary.length)}件)</div>
                <div className="table-wrap" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th onClick={() => handleSort('creative_code')}>クリエイティブ{sortIndicator('creative_code')}</th>
                        <th onClick={() => handleSort('media_code')}>媒体{sortIndicator('media_code')}</th>
                        <th onClick={() => handleSort('totalCost')}>コスト{sortIndicator('totalCost')}</th>
                        <th onClick={() => handleSort('totalSettlements')}>成約{sortIndicator('totalSettlements')}</th>
                        <th onClick={() => handleSort('totalAdConversions')}>広告CV{sortIndicator('totalAdConversions')}</th>
                        <th onClick={() => handleSort('totalLineAdds')}>LINE追加{sortIndicator('totalLineAdds')}</th>
                        <th onClick={() => handleSort('cpo')}>CPO{sortIndicator('cpo')}</th>
                        <th onClick={() => handleSort('roi')}>ROI{sortIndicator('roi')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortRows(creativeSummary.slice(0, displayLimit) as unknown as Record<string, unknown>[]).map((r) => {
                        const row = r as unknown as CreativeSummary
                        return (
                          <tr key={`${row.creative_code}__${row.media_code}`}>
                            <td title={row.creative_code}>{row.creative_code.length > 30 ? row.creative_code.slice(0, 30) + '...' : row.creative_code}</td>
                            <td>{row.media_code}</td>
                            <td>{fmtYen(row.totalCost)}</td>
                            <td>{fmt(row.totalSettlements)}</td>
                            <td>{fmt(row.totalAdConversions)}</td>
                            <td>{fmt(row.totalLineAdds)}</td>
                            <td>{row.totalSettlements > 0 ? fmtYen(row.cpo) : '-'}</td>
                            <td style={{ color: row.roi >= 0 ? '#16a34a' : '#dc2626' }}>{fmtPct(row.roi)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {creativeSummary.length > displayLimit && (
                  <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setDisplayLimit(l => l + 50)}>
                      もっと見る (+50)
                    </button>
                  </div>
                )}
              </div>

              {/* Scatter Plot: Cost vs Settlements */}
              <div className="card">
                <div className="card-title">コスト vs 成約数 (バブル = インプレッション)</div>
                <ResponsiveContainer width="100%" height={350}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="cost" name="コスト" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                    <YAxis type="number" dataKey="settlements" name="成約数" tick={{ fontSize: 11 }} />
                    <ZAxis type="number" dataKey="impressions" name="imp" range={[20, 400]} />
                    <Tooltip formatter={(v: any, name: any) => name === 'コスト' ? fmtYen(Number(v) || 0) : fmt(Number(v) || 0)} />
                    <Scatter data={scatterData} fill="#0d9488" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* Video Ranking (shindan creatives) */}
              {(() => {
                const videoCreatives = creativeSummary.filter(c => /^shindan/i.test(c.creative_code))
                if (videoCreatives.length === 0) return null
                const totalSettlements = videoCreatives.reduce((s, c) => s + c.totalSettlements, 0)
                const totalCost = videoCreatives.reduce((s, c) => s + c.totalCost, 0)
                const ranked = videoCreatives.map(c => {
                  const settlementShare = totalSettlements > 0 ? (c.totalSettlements / totalSettlements) * 100 : 0
                  const costShare = totalCost > 0 ? (c.totalCost / totalCost) * 100 : 0
                  const score = Math.round(settlementShare * 60 - costShare * 40)
                  return { ...c, score }
                }).sort((a, b) => b.score - a.score)

                return (
                  <div className="card">
                    <div className="card-title">動画(shindan)ランキング</div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>クリエイティブ</th>
                            <th>媒体</th>
                            <th>コスト</th>
                            <th>成約</th>
                            <th>スコア</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranked.slice(0, 10).map((c, i) => (
                            <tr key={c.creative_code}>
                              <td>{i + 1}</td>
                              <td title={c.creative_code}>{c.creative_code.length > 25 ? c.creative_code.slice(0, 25) + '...' : c.creative_code}</td>
                              <td>{c.media_code}</td>
                              <td>{fmtYen(c.totalCost)}</td>
                              <td>{fmt(c.totalSettlements)}</td>
                              <td style={{ fontWeight: 700, color: c.score > 0 ? '#16a34a' : '#dc2626' }}>{c.score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </>
      )}

      {/* ======================================================================
          TAB: 期間比較
      ====================================================================== */}
      {activeTab === 'period_compare' && (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.82rem', marginRight: '0.5rem' }}>期間粒度:</label>
            <select value={periodType} onChange={e => setPeriodType(e.target.value as 'daily' | 'weekly' | 'monthly')}>
              <option value="daily">日次</option>
              <option value="weekly">週次</option>
              <option value="monthly">月次</option>
            </select>
          </div>

          {isLoading && !hasData ? (
            <SkeletonChart />
          ) : periodComparisons.length === 0 ? (
            <div className="empty"><div>比較データなし</div></div>
          ) : (
            <div className="card">
              <div className="card-title">期間比較ヒートマップ ({periodType === 'daily' ? '日次' : periodType === 'weekly' ? '週次' : '月次'})</div>
              <div className="table-wrap" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>期間</th>
                      <th>媒体</th>
                      <th>コスト</th>
                      <th>コスト変化</th>
                      <th>成約数</th>
                      <th>成約変化</th>
                      <th>CPO</th>
                      <th>CPO変化</th>
                      <th>広告CV</th>
                      <th>CV変化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodComparisons.slice(0, displayLimit).map((c, i) => (
                      <tr key={`${c.period}-${c.media_code}-${i}`}>
                        <td>{c.period}</td>
                        <td>{c.media_code}</td>
                        <td>{fmtYen(c.cost)}</td>
                        <td><HeatmapCell value={c.costChange} isPercent /></td>
                        <td>{fmt(c.settlement_count)}</td>
                        <td><HeatmapCell value={c.settlementChange} isPercent /></td>
                        <td>{c.settlement_count > 0 ? fmtYen(c.cpo) : '-'}</td>
                        <td><HeatmapCell value={c.cpoChange} isPercent /></td>
                        <td>{fmt(c.ad_conversions)}</td>
                        <td><HeatmapCell value={c.adConvChange} isPercent /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {periodComparisons.length > displayLimit && (
                <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setDisplayLimit(l => l + 50)}>
                    もっと見る (+50)
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ======================================================================
          TAB: ランキング・アラート
      ====================================================================== */}
      {activeTab === 'ranking_alerts' && (
        <>
          {/* Threshold Settings */}
          <div className="filters-bar" style={{ marginBottom: '1rem' }}>
            <label>最低コスト:</label>
            <input type="number" value={alertMinSpend} onChange={e => setAlertMinSpend(Number(e.target.value))} style={{ width: 90 }} />
            <label>CRITICAL閾値(%):</label>
            <input type="number" value={alertCriticalPct} onChange={e => setAlertCriticalPct(Number(e.target.value))} style={{ width: 60 }} />
            <label>WARNING閾値(%):</label>
            <input type="number" value={alertWarningPct} onChange={e => setAlertWarningPct(Number(e.target.value))} style={{ width: 60 }} />
          </div>

          {/* Top 5 */}
          <div className="grid-2">
            <div className="card">
              <div className="card-title">Top 5 (CPO最良)</div>
              {ranking.top.length === 0 ? (
                <div className="empty"><div>データなし</div></div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>#</th><th>クリエイティブ</th><th>媒体</th><th>CPO</th><th>成約</th><th>ROI</th></tr>
                    </thead>
                    <tbody>
                      {ranking.top.map((r, i) => (
                        <tr key={r.creative_code}>
                          <td>{i + 1}</td>
                          <td title={r.creative_code}>{r.creative_code.length > 20 ? r.creative_code.slice(0, 20) + '...' : r.creative_code}</td>
                          <td>{r.media_code}</td>
                          <td>{fmtYen(r.cpo)}</td>
                          <td>{fmt(r.settlement_count)}</td>
                          <td style={{ color: r.roi >= 0 ? '#16a34a' : '#dc2626' }}>{fmtPct(r.roi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">Worst 5 (CPO最悪)</div>
              {ranking.worst.length === 0 ? (
                <div className="empty"><div>データなし</div></div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>#</th><th>クリエイティブ</th><th>媒体</th><th>CPO</th><th>成約</th><th>ROI</th></tr>
                    </thead>
                    <tbody>
                      {ranking.worst.map((r, i) => (
                        <tr key={r.creative_code}>
                          <td>{i + 1}</td>
                          <td title={r.creative_code}>{r.creative_code.length > 20 ? r.creative_code.slice(0, 20) + '...' : r.creative_code}</td>
                          <td>{r.media_code}</td>
                          <td>{fmtYen(r.cpo)}</td>
                          <td>{fmt(r.settlement_count)}</td>
                          <td style={{ color: r.roi >= 0 ? '#16a34a' : '#dc2626' }}>{fmtPct(r.roi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Alert Table */}
          <div className="card">
            <div className="card-title">アラート ({alerts.length}件)</div>
            {alerts.length === 0 ? (
              <div className="empty"><div>アラートなし</div></div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>レベル</th>
                      <th>媒体</th>
                      <th>期間</th>
                      <th>指標</th>
                      <th>変化率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.slice(0, displayLimit).map((a, i) => (
                      <tr key={`${a.media_code}-${a.period}-${a.metric}-${i}`}>
                        <td>{alertBadge(a.level)}</td>
                        <td>{a.media_code}</td>
                        <td>{a.period}</td>
                        <td>{a.metric}</td>
                        <td><HeatmapCell value={a.changeRate} isPercent /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ======================================================================
          TAB: データ一覧
      ====================================================================== */}
      {activeTab === 'datalist' && (
        <>
          <div className="filters-bar" style={{ marginBottom: '0.75rem' }}>
            <input
              type="search"
              placeholder="検索 (日付, 媒体, クリエイティブ...)"
              value={dataListSearch}
              onChange={e => setDataListSearch(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const rows = dataListRows.map(r => ({
                  report_date: r.report_date,
                  media_code: r.media_code,
                  creative_code: r.creative_code,
                  funnel_type: r.funnel_type,
                  impressions: r.impressions,
                  clicks: r.clicks,
                  cost: r.cost,
                  ad_conversions: r.ad_conversions,
                  linead_count: r.linead_count,
                  settlement_count: r.settlement_count,
                  total_amount: r.total_amount,
                }))
                exportToExcel([{ name: 'FunnelDaily', rows }], `bq-funnel-${new Date().toISOString().slice(0, 10)}.xlsx`)
              }}
            >
              Excel出力
            </button>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {fmt(dataListRows.length)}件
            </span>
          </div>

          <div className="card">
            <div className="table-wrap" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th onClick={() => handleSort('report_date')}>日付{sortIndicator('report_date')}</th>
                    <th onClick={() => handleSort('media_code')}>媒体{sortIndicator('media_code')}</th>
                    <th onClick={() => handleSort('creative_code')}>クリエイティブ{sortIndicator('creative_code')}</th>
                    <th onClick={() => handleSort('funnel_type')}>ファネル{sortIndicator('funnel_type')}</th>
                    <th onClick={() => handleSort('impressions')}>imp{sortIndicator('impressions')}</th>
                    <th onClick={() => handleSort('clicks')}>clicks{sortIndicator('clicks')}</th>
                    <th onClick={() => handleSort('cost')}>コスト{sortIndicator('cost')}</th>
                    <th onClick={() => handleSort('ad_conversions')}>広告CV{sortIndicator('ad_conversions')}</th>
                    <th onClick={() => handleSort('linead_count')}>LINE追加{sortIndicator('linead_count')}</th>
                    <th onClick={() => handleSort('settlement_count')}>成約{sortIndicator('settlement_count')}</th>
                    <th onClick={() => handleSort('total_amount')}>売上{sortIndicator('total_amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortRows(dataListRows.slice(0, displayLimit) as unknown as Record<string, unknown>[]).map((r, i) => {
                    const row = r as unknown as FunnelDailyRow
                    return (
                      <tr key={`${row.report_date}-${row.media_code}-${row.creative_code}-${i}`}>
                        <td>{row.report_date}</td>
                        <td>{row.media_code}</td>
                        <td title={row.creative_code}>{row.creative_code.length > 25 ? row.creative_code.slice(0, 25) + '...' : row.creative_code}</td>
                        <td>{row.funnel_type}</td>
                        <td>{fmt(row.impressions)}</td>
                        <td>{fmt(row.clicks)}</td>
                        <td>{fmtYen(row.cost)}</td>
                        <td>{fmt(row.ad_conversions)}</td>
                        <td>{fmt(row.linead_count)}</td>
                        <td>{fmt(row.settlement_count)}</td>
                        <td>{fmtYen(row.total_amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {dataListRows.length > displayLimit && (
              <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setDisplayLimit(l => l + 50)}>
                  もっと見る (+50)
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
