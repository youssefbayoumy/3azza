import { useCallback, useState } from 'react';
import { RECORD_LIST_PAGE_SIZE } from '../utils/recordList';

/** Shared cumulative pagination state for local record lists. */
export default function useIncrementalRecordLimit(loadedCount: number) {
  const [limit, setLimit] = useState(RECORD_LIST_PAGE_SIZE);
  const canLoadOlder = loadedCount >= limit;
  const loadOlder = useCallback(() => {
    setLimit((current) => current + RECORD_LIST_PAGE_SIZE);
  }, []);

  return { canLoadOlder, limit, loadOlder };
}
