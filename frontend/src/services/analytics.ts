import type { FunnelDailyRow, CreativeRow } from './api'

// ============ Types ============

export interface OverallKpi {
  totalCost: number
  totalRevenue: number
  totalSettlements: number
  totalLineAdds: number
  totalAdConversions: number
  totalImpressions: number
  totalClicks: number
  roi: number
  cpo: number
  cpa: number
  ctr: number
  cpc: number
  cpm: number
  arpu: number
}

export interface MediaSummary {
  media_code: string
  totalCost: number
  totalRevenue: number
  totalSettlements: number
  totalLineAdds: number
  totalAdConversions: number
  totalImpressions: number
  totalClicks: number
  roi: number
  cpo: number
  cpa: number
  ctr: number
  cpc: number
}

export interface CreativeSummary {
  creative_code: string
  media_code: string
  totalCost: number
  totalRevenue: number
  totalSettlements: number
  totalLineAdds: number
  totalAdConversions: number
  totalImpressions: number
  totalClicks: number
  cpo: number
  cpa: number
  roi: number
}

export interface PeriodComparison {
  period: string
  media_code: string
  cost: number
  costChange: number
  settlement_count: number
  settlementChange: number
  cpo: number
  cpoChange: number
  ad_conversions: number
  adConvChange: number
}

export interface CreativeRanking {
  creative_code: string
  media_code: string
  totalCost: number
  settlement_count: number
  cpo: number
  roi: number
}

export interface AdAlert {
  type: string
  media_code: string
  period: string
  metric: string
  changeRate: number
  level: 'CRITICAL_UP' | 'WARNING_UP' | 'GOOD_DOWN' | 'CPM_SPIKE'
}

// ============ Computation Functions ============

export function computeOverallKpi(data: FunnelDailyRow[]): OverallKpi {
  const totalCost = data.reduce((s, r) => s + (r.cost || 0), 0)
  const totalRevenue = data.reduce((s, r) => s + (r.total_amount || 0), 0)
  const totalSettlements = data.reduce((s, r) => s + (r.settlement_count || 0), 0)
  const totalLineAdds = data.reduce((s, r) => s + (r.linead_count || 0), 0)
  const totalAdConversions = data.reduce((s, r) => s + (r.ad_conversions || 0), 0)
  const totalImpressions = data.reduce((s, r) => s + (r.impressions || 0), 0)
  const totalClicks = data.reduce((s, r) => s + (r.clicks || 0), 0)

  return {
    totalCost,
    totalRevenue,
    totalSettlements,
    totalLineAdds,
    totalAdConversions,
    totalImpressions,
    totalClicks,
    roi: totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0,
    cpo: totalSettlements > 0 ? totalCost / totalSettlements : 0,
    cpa: totalAdConversions > 0 ? totalCost / totalAdConversions : 0,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    cpc: totalClicks > 0 ? totalCost / totalClicks : 0,
    cpm: totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : 0,
    arpu: totalSettlements > 0 ? totalRevenue / totalSettlements : 0,
  }
}

export function aggregateByMedia(data: FunnelDailyRow[]): MediaSummary[] {
  const map = new Map<string, FunnelDailyRow[]>()
  for (const r of data) {
    const key = r.media_code || 'unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.entries()).map(([media_code, rows]) => {
    const totalCost = rows.reduce((s, r) => s + (r.cost || 0), 0)
    const totalRevenue = rows.reduce((s, r) => s + (r.total_amount || 0), 0)
    const totalSettlements = rows.reduce((s, r) => s + (r.settlement_count || 0), 0)
    const totalLineAdds = rows.reduce((s, r) => s + (r.linead_count || 0), 0)
    const totalAdConversions = rows.reduce((s, r) => s + (r.ad_conversions || 0), 0)
    const totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0)
    const totalClicks = rows.reduce((s, r) => s + (r.clicks || 0), 0)
    return {
      media_code,
      totalCost,
      totalRevenue,
      totalSettlements,
      totalLineAdds,
      totalAdConversions,
      totalImpressions,
      totalClicks,
      roi: totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0,
      cpo: totalSettlements > 0 ? totalCost / totalSettlements : 0,
      cpa: totalAdConversions > 0 ? totalCost / totalAdConversions : 0,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      cpc: totalClicks > 0 ? totalCost / totalClicks : 0,
    }
  }).sort((a, b) => b.totalCost - a.totalCost)
}

export function aggregateByCreative(data: CreativeRow[]): CreativeSummary[] {
  const map = new Map<string, CreativeRow[]>()
  for (const r of data) {
    const key = `${r.creative_code}__${r.media_code}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.entries()).map(([, rows]) => {
    const totalCost = rows.reduce((s, r) => s + (r.cost || 0), 0)
    const totalRevenue = rows.reduce((s, r) => s + (r.total_amount || 0), 0)
    const totalSettlements = rows.reduce((s, r) => s + (r.settlement_count || 0), 0)
    const totalLineAdds = rows.reduce((s, r) => s + (r.linead_count || 0), 0)
    const totalAdConversions = rows.reduce((s, r) => s + (r.ad_conversions || 0), 0)
    const totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0)
    const totalClicks = rows.reduce((s, r) => s + (r.clicks || 0), 0)
    return {
      creative_code: rows[0].creative_code,
      media_code: rows[0].media_code,
      totalCost,
      totalRevenue,
      totalSettlements,
      totalLineAdds,
      totalAdConversions,
      totalImpressions,
      totalClicks,
      cpo: totalSettlements > 0 ? totalCost / totalSettlements : 0,
      cpa: totalAdConversions > 0 ? totalCost / totalAdConversions : 0,
      roi: totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0,
    }
  }).sort((a, b) => b.totalCost - a.totalCost)
}

export function computePeriodComparison(
  data: FunnelDailyRow[],
  periodType: 'daily' | 'weekly' | 'monthly',
): PeriodComparison[] {
  // Group data by period + media
  const getPeriodKey = (dateStr: string): string => {
    const d = new Date(dateStr)
    if (periodType === 'daily') return dateStr
    if (periodType === 'monthly') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    // weekly: ISO week start (Monday)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d.setDate(diff))
    return monday.toISOString().slice(0, 10)
  }

  const grouped = new Map<string, Map<string, FunnelDailyRow[]>>()
  for (const r of data) {
    const pk = getPeriodKey(r.report_date)
    if (!grouped.has(pk)) grouped.set(pk, new Map())
    const mediaMap = grouped.get(pk)!
    const mk = r.media_code || 'unknown'
    if (!mediaMap.has(mk)) mediaMap.set(mk, [])
    mediaMap.get(mk)!.push(r)
  }

  const periods = Array.from(grouped.keys()).sort()
  const results: PeriodComparison[] = []

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i]
    const mediaMap = grouped.get(period)!
    for (const [media_code, rows] of mediaMap) {
      const cost = rows.reduce((s, r) => s + (r.cost || 0), 0)
      const settlements = rows.reduce((s, r) => s + (r.settlement_count || 0), 0)
      const adConv = rows.reduce((s, r) => s + (r.ad_conversions || 0), 0)
      const cpo = settlements > 0 ? cost / settlements : 0

      // Previous period comparison
      let costChange = 0, settlementChange = 0, cpoChange = 0, adConvChange = 0
      if (i > 0) {
        const prevMediaMap = grouped.get(periods[i - 1])
        const prevRows = prevMediaMap?.get(media_code)
        if (prevRows) {
          const prevCost = prevRows.reduce((s, r) => s + (r.cost || 0), 0)
          const prevSettlements = prevRows.reduce((s, r) => s + (r.settlement_count || 0), 0)
          const prevAdConv = prevRows.reduce((s, r) => s + (r.ad_conversions || 0), 0)
          const prevCpo = prevSettlements > 0 ? prevCost / prevSettlements : 0
          costChange = prevCost > 0 ? ((cost - prevCost) / prevCost) * 100 : 0
          settlementChange = prevSettlements > 0 ? ((settlements - prevSettlements) / prevSettlements) * 100 : 0
          cpoChange = prevCpo > 0 ? ((cpo - prevCpo) / prevCpo) * 100 : 0
          adConvChange = prevAdConv > 0 ? ((adConv - prevAdConv) / prevAdConv) * 100 : 0
        }
      }

      results.push({
        period,
        media_code,
        cost,
        costChange,
        settlement_count: settlements,
        settlementChange,
        cpo,
        cpoChange,
        ad_conversions: adConv,
        adConvChange,
      })
    }
  }

  return results
}

export function computeCreativeRanking(data: CreativeRow[]): {
  top: CreativeRanking[]
  worst: CreativeRanking[]
} {
  const agg = aggregateByCreative(data)

  const withSettlements = agg
    .filter(c => c.totalCost >= 10000 && c.totalSettlements > 0)
    .map(c => ({
      creative_code: c.creative_code,
      media_code: c.media_code,
      totalCost: c.totalCost,
      settlement_count: c.totalSettlements,
      cpo: c.cpo,
      roi: c.roi,
    }))

  const top = [...withSettlements].sort((a, b) => a.cpo - b.cpo).slice(0, 5)

  const worst = agg
    .filter(c => c.totalCost >= 30000)
    .map(c => ({
      creative_code: c.creative_code,
      media_code: c.media_code,
      totalCost: c.totalCost,
      settlement_count: c.totalSettlements,
      cpo: c.cpo,
      roi: c.roi,
    }))
    .sort((a, b) => b.cpo - a.cpo)
    .slice(0, 5)

  return { top, worst }
}

export function detectAlerts(
  comparisons: PeriodComparison[],
  thresholds: { minSpend: number; criticalPct: number; warningPct: number },
): AdAlert[] {
  const alerts: AdAlert[] = []
  for (const c of comparisons) {
    if (c.cost < thresholds.minSpend) continue

    if (c.cpoChange > thresholds.criticalPct) {
      alerts.push({
        type: 'CPO',
        media_code: c.media_code,
        period: c.period,
        metric: 'CPO',
        changeRate: c.cpoChange,
        level: 'CRITICAL_UP',
      })
    } else if (c.cpoChange > thresholds.warningPct) {
      alerts.push({
        type: 'CPO',
        media_code: c.media_code,
        period: c.period,
        metric: 'CPO',
        changeRate: c.cpoChange,
        level: 'WARNING_UP',
      })
    } else if (c.cpoChange < -thresholds.warningPct) {
      alerts.push({
        type: 'CPO',
        media_code: c.media_code,
        period: c.period,
        metric: 'CPO',
        changeRate: c.cpoChange,
        level: 'GOOD_DOWN',
      })
    }

    if (c.costChange > thresholds.criticalPct && c.settlementChange < 0) {
      alerts.push({
        type: 'CPM_SPIKE',
        media_code: c.media_code,
        period: c.period,
        metric: 'Cost/Settlement',
        changeRate: c.costChange,
        level: 'CPM_SPIKE',
      })
    }
  }
  return alerts.sort((a, b) => Math.abs(b.changeRate) - Math.abs(a.changeRate))
}

// ============ Utility: Daily cost trend from funnel data ============

export interface DailyCostPoint {
  date: string
  cost: number
  settlements: number
  ad_conversions: number
}

export function dailyCostTrend(data: FunnelDailyRow[]): DailyCostPoint[] {
  const map = new Map<string, { cost: number; settlements: number; adConv: number }>()
  for (const r of data) {
    const d = r.report_date
    if (!map.has(d)) map.set(d, { cost: 0, settlements: 0, adConv: 0 })
    const entry = map.get(d)!
    entry.cost += r.cost || 0
    entry.settlements += r.settlement_count || 0
    entry.adConv += r.ad_conversions || 0
  }
  return Array.from(map.entries())
    .map(([date, v]) => ({
      date,
      cost: Math.round(v.cost),
      settlements: v.settlements,
      ad_conversions: v.adConv,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ============ Monthly CPO Trend ============

export interface MonthlyCpoPoint {
  month: string
  media_code: string
  cpo: number
  cost: number
  settlements: number
}

export function monthlyCpoTrend(data: FunnelDailyRow[]): MonthlyCpoPoint[] {
  const map = new Map<string, { cost: number; settlements: number }>()
  for (const r of data) {
    const month = r.report_date.slice(0, 7)
    const key = `${month}__${r.media_code}`
    if (!map.has(key)) map.set(key, { cost: 0, settlements: 0 })
    const entry = map.get(key)!
    entry.cost += r.cost || 0
    entry.settlements += r.settlement_count || 0
  }
  return Array.from(map.entries())
    .map(([key, v]) => {
      const [month, media_code] = key.split('__')
      return {
        month,
        media_code,
        cpo: v.settlements > 0 ? v.cost / v.settlements : 0,
        cost: v.cost,
        settlements: v.settlements,
      }
    })
    .sort((a, b) => a.month.localeCompare(b.month))
}
