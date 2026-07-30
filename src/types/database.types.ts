export interface VehicleProfile {
  id: number;
  name: string;
  current_mileage: number;
  total_km_range: number;
  has_completed_setup: number;
  service_history_setup_completed: number;
  created_at: string;
  daily_average_km: number;
  last_odometer_update_timestamp: string | null;
  tank_capacity_liters: number | null;
  scooter_brand_id: string | null;
  scooter_model_id: string | null;
  scooter_version_id: string | null;
}

export interface VehicleVitals {
  id: number;
  vehicle_id: number;
  oil_life_pct: number;
  tire_pressure_psi: number;
  battery_health_pct: number;
  coolant_temp_c: number;
  brake_pad_pct: number;
  updated_at: string;
}

export interface GasLog {
  id: number;
  vehicle_id: number;
  liters: number;
  cost: number;
  odometer_km: number;
  station: string | null;
  logged_at: string;
  logged_on: string;
  is_full_tank: number;
}

export interface InventoryItem {
  id: number;
  vehicle_id: number;
  name: string;
  category: string;
  status: 'In Stock' | 'Low' | 'Out';
  quantity: number;
  last_replaced_at: string | null;
}

export interface DocumentItem {
  id: number;
  vehicle_id: number;
  title: string;
  image_uri: string;
  expiry_date: string | null;
  added_at: string;
}

export interface PreRideState {
  id: number;
  vehicle_id: number;
  brakes_checked: number;
  tires_checked: number;
  lights_checked: number;
  oil_checked: number;
  last_run_at: string | null;
}

export interface ServiceLog {
  id: number;
  vehicle_id: number;
  title: string;
  date: string;
  mileage: number;
  category: string;
  notes: string;
  cost: number | null;
  service_type: string | null;
  sets_odometer_baseline: number;
}

export interface ServiceInterval {
  id: number;
  vehicle_id: number;
  name: string;
  interval_km: number | null;
  last_service_odometer_km: number;
  has_known_odometer_baseline: number;
  type: string;
}
