import type { PreRideState } from '../types/database.types';
import { isSameLocalDay } from './dates';

export function resetPreRideStateForNewLocalDay(
  state: PreRideState,
  now = new Date()
): PreRideState {
  if (isSameLocalDay(state.last_run_at, now)) return state;

  return {
    ...state,
    brakes_checked: 0,
    tires_checked: 0,
    lights_checked: 0,
    oil_checked: 0,
    last_run_at: null,
  };
}
