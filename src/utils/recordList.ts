export const RECORD_LIST_PAGE_SIZE = 100;
const MAX_RECORD_LIST_LIMIT = 1000;

export type RecordListOptions = {
  limit: number;
  offset?: number;
};

export function getRecordListBounds(options?: RecordListOptions): { clause: string; values: number[] } {
  if (!options) return { clause: '', values: [] };

  const requestedLimit = Number.isFinite(options.limit) ? Math.trunc(options.limit) : RECORD_LIST_PAGE_SIZE;
  const requestedOffset = Number.isFinite(options.offset) ? Math.trunc(options.offset ?? 0) : 0;
  const limit = Math.min(MAX_RECORD_LIST_LIMIT, Math.max(1, requestedLimit));
  const offset = Math.max(0, requestedOffset);
  return { clause: ' LIMIT ? OFFSET ?', values: [limit, offset] };
}

export const GAS_LOG_METRICS_QUERY = `WITH ordered AS (
  SELECT id, liters, cost, odometer_km, is_full_tank,
         ROW_NUMBER() OVER (ORDER BY logged_on ASC, odometer_km ASC, id ASC) AS row_number
  FROM gas_logs
  WHERE vehicle_id = ?
),
full_tanks AS (
  SELECT row_number, odometer_km,
         LAG(row_number) OVER (ORDER BY row_number) AS previous_row_number,
         LAG(odometer_km) OVER (ORDER BY row_number) AS previous_odometer_km
  FROM ordered
  WHERE is_full_tank = 1
),
segments AS (
  SELECT current.row_number,
         current.odometer_km - current.previous_odometer_km AS distance_km,
         (SELECT SUM(entry.liters)
          FROM ordered entry
          WHERE entry.row_number > current.previous_row_number
            AND entry.row_number <= current.row_number) AS segment_liters
  FROM full_tanks current
  WHERE current.previous_row_number IS NOT NULL
),
valid_segments AS (
  SELECT row_number, distance_km, segment_liters
  FROM segments
  WHERE distance_km > 0 AND segment_liters > 0
)
SELECT
  COALESCE((SELECT SUM(liters) FROM ordered), 0) AS total_liters,
  COALESCE((SELECT SUM(cost) FROM ordered), 0) AS total_cost,
  (SELECT COUNT(*) FROM ordered) AS record_count,
  (SELECT COUNT(*) FROM valid_segments) AS segment_count,
  CASE WHEN COALESCE((SELECT SUM(segment_liters) FROM valid_segments), 0) > 0
       THEN (SELECT SUM(distance_km) FROM valid_segments) * 1.0
            / (SELECT SUM(segment_liters) FROM valid_segments)
       ELSE NULL END AS average_km_per_liter,
  (SELECT distance_km * 1.0 / segment_liters
   FROM valid_segments
   ORDER BY row_number DESC
   LIMIT 1) AS latest_km_per_liter`;
