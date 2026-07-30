import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

type FocusedLoadTask = (isCurrent: () => boolean) => Promise<void>;

type FocusedLoaderState = {
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
};

/**
 * Runs a screen's data load whenever it gains focus and invalidates stale work
 * when a newer load starts or the screen loses focus.
 */
export default function useFocusedLoader(
  task: FocusedLoadTask,
  errorMessage: string,
  logLabel: string
): FocusedLoaderState {
  const attemptRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const attempt = ++attemptRef.current;
    const isCurrent = () => attemptRef.current === attempt;

    setLoading(true);
    setError(null);

    try {
      await task(isCurrent);
    } catch (loadError) {
      if (isCurrent()) {
        console.error(logLabel, loadError);
        setError(errorMessage);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [errorMessage, logLabel, task]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => {
        attemptRef.current += 1;
      };
    }, [reload])
  );

  return { error, loading, reload };
}
