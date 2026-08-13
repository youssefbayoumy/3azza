import type { RecordListOptions } from '../../utils/recordList';
import { getRecordListBounds } from '../../utils/recordList';

export type MaintenanceRecordQuery = {
  sql: string;
  params: (string | number)[];
};

/**
 * Builds the active-vehicle history read. A service package is one logical
 * record, so LIMIT/OFFSET are applied to package keys before all member rows
 * are joined back into the result.
 */
export function buildServiceLogListQuery(
  vehicleId: number,
  options?: RecordListOptions
): MaintenanceRecordQuery {
  const bounds = getRecordListBounds(options);
  if (!options) {
    return {
      sql: `SELECT * FROM service_logs
            WHERE vehicle_id = ?
            ORDER BY date DESC, mileage DESC, id DESC`,
      params: [vehicleId],
    };
  }

  return {
    sql: `WITH logical_records AS (
            SELECT
              CASE
                WHEN service_package_id IS NOT NULL THEN 'package:' || service_package_id
                ELSE 'record:' || id
              END AS logical_key,
              MAX(date) AS sort_date,
              MAX(mileage) AS sort_mileage,
              MAX(id) AS sort_id
            FROM service_logs
            WHERE vehicle_id = ?
            GROUP BY
              CASE
                WHEN service_package_id IS NOT NULL THEN 'package:' || service_package_id
                ELSE 'record:' || id
              END
            ORDER BY sort_date DESC, sort_mileage DESC, sort_id DESC
            LIMIT ? OFFSET ?
          )
          SELECT logs.*
          FROM service_logs AS logs
          INNER JOIN logical_records AS page
            ON page.logical_key = CASE
              WHEN logs.service_package_id IS NOT NULL THEN 'package:' || logs.service_package_id
              ELSE 'record:' || logs.id
            END
          WHERE logs.vehicle_id = ?
          ORDER BY page.sort_date DESC, page.sort_mileage DESC, page.sort_id DESC, logs.id DESC`,
    params: [vehicleId, ...bounds.values, vehicleId],
  };
}

/**
 * Package rows repeat package-level metadata such as cost. This aggregate
 * first reduces rows to logical records, preserving existing rows while
 * counting each package cost (and record) exactly once.
 */
export const MAINTENANCE_INSIGHTS_QUERY = `WITH logical_maintenance AS (
  SELECT
    CASE
      WHEN service_package_id IS NOT NULL THEN 'package:' || service_package_id
      ELSE 'record:' || id
    END AS logical_key,
    COALESCE(MAX(cost), 0) AS record_cost,
    MAX(date) AS record_date,
    MIN(CASE WHEN sets_odometer_baseline = 1 THEN mileage ELSE NULL END) AS first_mileage
  FROM service_logs
  WHERE vehicle_id = ?
  GROUP BY
    CASE
      WHEN service_package_id IS NOT NULL THEN 'package:' || service_package_id
      ELSE 'record:' || id
    END
)
SELECT COALESCE(SUM(record_cost), 0) AS total_cost,
       COUNT(*) AS record_count,
       COALESCE(SUM(
         CASE WHEN substr(record_date, 1, 7) = ? THEN record_cost ELSE 0 END
       ), 0) AS month_cost,
       MIN(first_mileage) AS first_mileage
FROM logical_maintenance`;
