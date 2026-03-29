// ============ Types (BigQueryカラム名に完全一致) ============

// unified_performance: date, funnel_type, media_code, cost, impressions, clicks, linead_count, settlement_count, total_amount
export interface FunnelDailyRow {
  date: string
  media_code: string
  funnel_type: string
  impressions: number
  clicks: number
  cost: number
  linead_count: number
  settlement_count: number
  total_amount: number
}

// creative_performance_integrated: date, funnel_type, media_code, creative_code, impressions, clicks, cost, ad_conversions, booking_count, seating_count, negotiation_count, settlement_count, total_amount
export interface CreativeRow {
  date: string
  creative_code: string
  media_code: string
  funnel_type: string
  impressions: number
  clicks: number
  cost: number
  ad_conversions: number
  booking_count: number
  seating_count: number
  negotiation_count: number
  settlement_count: number
  total_amount: number
}

// counselor_date.monthly_stats: SELECT * (カラム名は実テーブル依存)
export interface CounselorMonthlyRow {
  [key: string]: unknown
  month?: string
  staff_name?: string
  business_date?: string
}

// aggregate_acquisition: date, media_code, creative_code, cost, impressions, clicks, ad_conversions
export interface AcquisitionRow {
  date: string
  media_code: string
  creative_code: string
  cost: number
  impressions: number
  clicks: number
  ad_conversions: number
}

// marketing_connect_tb: date, media, route, cost, ... (生データ - フロントで集計)
export interface MarketingKpiRawRow {
  date: string
  media: string
  route: string
  cost: number
  [key: string]: unknown
}

// v_sales_and_loss_full_summary_wide: SELECT * (カラム名は実テーブル依存)
export interface SalesSummaryRow {
  [key: string]: unknown
}

// v_loss_reason_analysis: SELECT * (カラム名は実テーブル依存)
export interface LossReasonRow {
  [key: string]: unknown
}

export interface HealthResponse {
  status: string
  project: string
  tables: Record<string, { rowCount: number | null }>
}

export interface ApiParams {
  start_date?: string
  end_date?: string
  media_code?: string
  funnel_type?: string
  media?: string
  start_month?: string
  end_month?: string
}

// ============ API Response Envelope ============

interface ApiEnvelope<T> {
  data: T[]
  totalRows: number
  lastUpdated: string
}

// ============ API Client ============

const BASE = '/api'

async function fetchApi<T>(endpoint: string, params?: ApiParams): Promise<{ data: T[]; totalRows: number; lastUpdated: string }> {
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
  const json: ApiEnvelope<T> = await res.json()
  return json
}

export async function fetchFunnelDaily(params?: ApiParams) {
  const res = await fetchApi<FunnelDailyRow>(`${BASE}/funnel-daily`, params)
  return res.data
}

export async function fetchCreative(params?: ApiParams) {
  const res = await fetchApi<CreativeRow>(`${BASE}/creative`, params)
  return res.data
}

export async function fetchCounselorMonthly(params?: ApiParams) {
  const res = await fetchApi<CounselorMonthlyRow>(`${BASE}/counselor-monthly`, params)
  return res.data
}

export async function fetchAcquisition(params?: ApiParams) {
  const res = await fetchApi<AcquisitionRow>(`${BASE}/acquisition`, params)
  return res.data
}

export async function fetchMarketingKpi(params?: ApiParams) {
  const res = await fetchApi<MarketingKpiRawRow>(`${BASE}/marketing-kpi`, params)
  return res.data
}

export async function fetchSalesSummary(params?: ApiParams) {
  const res = await fetchApi<SalesSummaryRow>(`${BASE}/sales-summary`, params)
  return res.data
}

export async function fetchLossReason(params?: ApiParams) {
  const res = await fetchApi<LossReasonRow>(`${BASE}/loss-reason`, params)
  return res.data
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`)
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
  return res.json()
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
