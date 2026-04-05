// ── TypeScript interfaces matching the local SQLite schema ──

export interface VehicleProfile {
  id: number;
  current_mileage: number;
  total_km_range: number;
  has_completed_setup: number; // 0 or 1
  created_at: string;
  daily_average_km: number;
  last_odometer_update_timestamp: string | null;
}

export interface VehicleVitals {
  id: number;
  oil_life_pct: number;
  tire_pressure_psi: number;
  battery_health_pct: number;
  coolant_temp_c: number;
  brake_pad_pct: number;
  updated_at: string;
}

export interface GasLog {
  id: number;
  liters: number;
  cost: number;
  odometer_km: number;
  station: string | null;
  logged_at: string;
}

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  status: 'In Stock' | 'Low' | 'Out';
  quantity: number;
  last_replaced_at: string | null;
}

export interface DocumentItem {
  id: number;
  title: string;
  image_uri: string;
  expiry_date: string;
  added_at: string;
}

export interface PreRideState {
  id: number;
  brakes_checked: number;
  tires_checked: number;
  lights_checked: number;
  oil_checked: number;
  last_run_at: string | null;
}

export interface ServiceLog {
  id: number;
  title: string;
  date: string;
  mileage: number;
  category: string;
  notes: string;
  cost: number | null;
  service_type: string | null; // Links to service_intervals.name for Smart-Link
}

export interface ServiceInterval {
  id: number;
  name: string;
  interval_km: number | null;
  last_service_odometer_km: number;
  type: string;
}
