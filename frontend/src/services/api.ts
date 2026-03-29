// ============ Types ============

export interface FunnelDailyRow {
  report_date: string
  media_code: string
  creative_code: string
  funnel_type: string
  impressions: number
  clicks: number
  cost: number
  ad_conversions: number
  linead_count: number
  settlement_count: number
  total_amount: number
}

export interface CreativeRow {
  creative_code: string
  media_code: string
  funnel_type: string
  impressions: number
  clicks: number
  cost: number
  ad_conversions: number
  linead_count: number
  settlement_count: number
  total_amount: number
  ctr: number
  cpc: number
  cpa: number
  cpo: number
  roi: number
}

export interface CounselorMonthlyRow {
  month: string
  counselor_name: string
  media_code: string
  settlement_count: number
  total_amount: number
  lead_count: number
  conversion_rate: number
}

export interface AcquisitionRow {
  report_date: string
  media_code: string
  funnel_type: string
  linead_count: number
  settlement_count: number
  total_amount: number
  cost: number
}

export interface MarketingKpiRow {
  month: string
  total_cost: number
  total_revenue: number
  total_settlements: number
  total_leads: number
  roi: number
  cpo: number
  cpa: number
  arpu: number
}

export interface SalesSummaryRow {
  month: string
  counselor_name: string
  settlement_count: number
  total_amount: number
  average_amount: number
  lead_count: number
  conversion_rate: number
}

export interface LossReasonRow {
  month: string
  loss_reason: string
  count: number
  percentage: number
}

export interface HealthResponse {
  status: string
  bigquery: string
  timestamp: string
}

export interface ApiParams {
  start_date?: string
  end_date?: string
  media_code?: string
  funnel_type?: string
}

// ============ API Client ============

const BASE = '/api'

async function fetchJson<T>(endpoint: string, params?: ApiParams): Promise<T> {
  const url = new URL(endpoint, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v)
    }
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API Error ${res.status}: ${text}`)
  }
  return res.json()
}

export function fetchFunnelDaily(params?: ApiParams) {
  return fetchJson<FunnelDailyRow[]>(`${BASE}/funnel-daily`, params)
}

export function fetchCreative(params?: ApiParams) {
  return fetchJson<CreativeRow[]>(`${BASE}/creative`, params)
}

export function fetchCounselorMonthly(params?: ApiParams) {
  return fetchJson<CounselorMonthlyRow[]>(`${BASE}/counselor-monthly`, params)
}

export function fetchAcquisition(params?: ApiParams) {
  return fetchJson<AcquisitionRow[]>(`${BASE}/acquisition`, params)
}

export function fetchMarketingKpi(params?: ApiParams) {
  return fetchJson<MarketingKpiRow[]>(`${BASE}/marketing-kpi`, params)
}

export function fetchSalesSummary(params?: ApiParams) {
  return fetchJson<SalesSummaryRow[]>(`${BASE}/sales-summary`, params)
}

export function fetchLossReason(params?: ApiParams) {
  return fetchJson<LossReasonRow[]>(`${BASE}/loss-reason`, params)
}

export function fetchHealth() {
  return fetchJson<HealthResponse>(`${BASE}/health`)
}

// ============ useApiData Hook ============

import { useState, useEffect, useRef, useCallback } from 'react'

export interface UseApiDataResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useApiData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseApiDataResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const doFetch = useCallback(() => {
    setLoading(true)
    setError(null)
    fetcher()
      .then(result => {
        if (mountedRef.current) {
          setData(result)
          setLoading(false)
        }
      })
      .catch(err => {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced fetch on deps change
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(doFetch, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [doFetch])

  // Cleanup
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  return { data, loading, error, refetch: doFetch }
}
