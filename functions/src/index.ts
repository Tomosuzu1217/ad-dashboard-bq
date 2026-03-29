import { onRequest } from "firebase-functions/v2/https";
import { BigQuery } from "@google-cloud/bigquery";
import cors from "cors";
import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = "cosmic-micron-478603-j7";
const MAX_ROWS = 50_000;

const bq = new BigQuery({ projectId: PROJECT_ID });
const corsMiddleware = cors({ origin: true });

/** Wrap handler with CORS. */
function withCors(
  handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    corsMiddleware(req, res, () => {
      handler(req, res).catch((err) => {
        console.error("Unhandled error", err);
        res.status(500).json({ error: "Internal server error" });
      });
    });
  };
}

/** Build a JSON envelope for query results. */
function envelope(rows: unknown[], totalRows: number) {
  return {
    data: rows,
    totalRows,
    lastUpdated: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleHealth(_req: Request, res: Response) {
  try {
    const tables = [
      "master_data.unified_performance",
      "master_data.creative_performance_integrated",
      "counselor_date.monthly_stats",
      "master_data.aggregate_acquisition",
      "master_data.marketing_connect_tb",
      "master_data.v_sales_and_loss_full_summary_wide",
      "master_data.v_loss_reason_analysis",
    ];

    const metadata: Record<string, { rowCount: number | null }> = {};

    await Promise.all(
      tables.map(async (fqn) => {
        try {
          const [dataset, table] = fqn.split(".");
          const [meta] = await bq
            .dataset(dataset)
            .table(table)
            .getMetadata();
          metadata[fqn] = {
            rowCount: Number(meta.numRows ?? 0),
          };
        } catch {
          metadata[fqn] = { rowCount: null };
        }
      })
    );

    res.json({ status: "ok", project: PROJECT_ID, tables: metadata });
  } catch (err) {
    console.error("Health check error", err);
    res.status(500).json({ error: "Health check failed" });
  }
}

// ---- /api/funnel-daily ----

async function handleFunnelDaily(req: Request, res: Response) {
  const { start_date, end_date, media_code, funnel_type } = req.query;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (start_date) {
    conditions.push("date >= @start_date");
    params.start_date = start_date as string;
  }
  if (end_date) {
    conditions.push("date <= @end_date");
    params.end_date = end_date as string;
  }
  if (media_code) {
    conditions.push("media_code = @media_code");
    params.media_code = media_code as string;
  }
  if (funnel_type) {
    conditions.push("funnel_type = @funnel_type");
    params.funnel_type = funnel_type as string;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      date, funnel_type, media_code,
      cost, impressions, clicks,
      linead_count, settlement_count, total_amount
    FROM \`${PROJECT_ID}.master_data.unified_performance\`
    ${where}
    ORDER BY date DESC
    LIMIT ${MAX_ROWS}
  `;

  const [rows] = await bq.query({
    query,
    params,
    location: "asia-northeast1",
  });

  res.json(envelope(rows, rows.length));
}

// ---- /api/creative ----

async function handleCreative(req: Request, res: Response) {
  const { start_date, end_date, media_code, funnel_type } = req.query;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (start_date) {
    conditions.push("date >= @start_date");
    params.start_date = start_date as string;
  }
  if (end_date) {
    conditions.push("date <= @end_date");
    params.end_date = end_date as string;
  }
  if (media_code) {
    conditions.push("media_code = @media_code");
    params.media_code = media_code as string;
  }
  if (funnel_type) {
    conditions.push("funnel_type = @funnel_type");
    params.funnel_type = funnel_type as string;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      date, funnel_type, media_code, creative_code,
      impressions, clicks, cost,
      ad_conversions, booking_count, seating_count,
      negotiation_count, settlement_count, total_amount
    FROM \`${PROJECT_ID}.master_data.creative_performance_integrated\`
    ${where}
    ORDER BY date DESC
    LIMIT ${MAX_ROWS}
  `;

  const [rows] = await bq.query({
    query,
    params,
    location: "asia-northeast1",
  });

  res.json(envelope(rows, rows.length));
}

// ---- /api/counselor-monthly ----

async function handleCounselorMonthly(req: Request, res: Response) {
  const { start_month, end_month } = req.query;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (start_month) {
    conditions.push("month >= @start_month");
    params.start_month = start_month as string;
  }
  if (end_month) {
    conditions.push("month <= @end_month");
    params.end_month = end_month as string;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT *
    FROM \`${PROJECT_ID}.counselor_date.monthly_stats\`
    ${where}
    ORDER BY month DESC
    LIMIT ${MAX_ROWS}
  `;

  const [rows] = await bq.query({
    query,
    params,
    location: "asia-northeast1",
  });

  res.json(envelope(rows, rows.length));
}

// ---- /api/acquisition ----

async function handleAcquisition(req: Request, res: Response) {
  const { start_date, end_date, media_code } = req.query;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (start_date) {
    conditions.push("date >= @start_date");
    params.start_date = start_date as string;
  }
  if (end_date) {
    conditions.push("date <= @end_date");
    params.end_date = end_date as string;
  }
  if (media_code) {
    conditions.push("media_code = @media_code");
    params.media_code = media_code as string;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      date, media_code, creative_code,
      cost, impressions, clicks, ad_conversions
    FROM \`${PROJECT_ID}.master_data.aggregate_acquisition\`
    ${where}
    ORDER BY date DESC
    LIMIT ${MAX_ROWS}
  `;

  const [rows] = await bq.query({
    query,
    params,
    location: "asia-northeast1",
  });

  res.json(envelope(rows, rows.length));
}

// ---- /api/marketing-kpi ----

async function handleMarketingKpi(req: Request, res: Response) {
  const { start_date, end_date, media } = req.query;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (start_date) {
    conditions.push("date >= @start_date");
    params.start_date = start_date as string;
  }
  if (end_date) {
    conditions.push("date <= @end_date");
    params.end_date = end_date as string;
  }
  if (media) {
    conditions.push("media = @media");
    params.media = media as string;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT *
    FROM \`${PROJECT_ID}.master_data.marketing_connect_tb\`
    ${where}
    ORDER BY date DESC
    LIMIT ${MAX_ROWS}
  `;

  const [rows] = await bq.query({
    query,
    params,
    location: "asia-northeast1",
  });

  res.json(envelope(rows, rows.length));
}

// ---- /api/sales-summary ----

async function handleSalesSummary(req: Request, res: Response) {
  const { start_month, end_month } = req.query;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (start_month) {
    conditions.push("month >= @start_month");
    params.start_month = start_month as string;
  }
  if (end_month) {
    conditions.push("month <= @end_month");
    params.end_month = end_month as string;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT *
    FROM \`${PROJECT_ID}.master_data.v_sales_and_loss_full_summary_wide\`
    ${where}
    ORDER BY month DESC
    LIMIT ${MAX_ROWS}
  `;

  const [rows] = await bq.query({
    query,
    params,
    location: "asia-northeast1",
  });

  res.json(envelope(rows, rows.length));
}

// ---- /api/loss-reason ----

async function handleLossReason(req: Request, res: Response) {
  const { start_month, end_month } = req.query;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (start_month) {
    conditions.push("month >= @start_month");
    params.start_month = start_month as string;
  }
  if (end_month) {
    conditions.push("month <= @end_month");
    params.end_month = end_month as string;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT *
    FROM \`${PROJECT_ID}.master_data.v_loss_reason_analysis\`
    ${where}
    ORDER BY month DESC
    LIMIT ${MAX_ROWS}
  `;

  const [rows] = await bq.query({
    query,
    params,
    location: "asia-northeast1",
  });

  res.json(envelope(rows, rows.length));
}

// ---------------------------------------------------------------------------
// Single Cloud Function with path-based routing
// ---------------------------------------------------------------------------

const routes: Record<
  string,
  (req: Request, res: Response) => Promise<void>
> = {
  "/api/health": handleHealth,
  "/api/funnel-daily": handleFunnelDaily,
  "/api/creative": handleCreative,
  "/api/counselor-monthly": handleCounselorMonthly,
  "/api/acquisition": handleAcquisition,
  "/api/marketing-kpi": handleMarketingKpi,
  "/api/sales-summary": handleSalesSummary,
  "/api/loss-reason": handleLossReason,
};

exports.api = onRequest(
  { region: "asia-northeast1", memory: "512MiB", timeoutSeconds: 120 },
  withCors(async (req: Request, res: Response) => {
    // Only allow GET
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const handler = routes[req.path];

    if (!handler) {
      res.status(404).json({
        error: "Not found",
        availableEndpoints: Object.keys(routes),
      });
      return;
    }

    await handler(req, res);
  })
);
