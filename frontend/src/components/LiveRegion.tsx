import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Announce = (message: string) => void;

const LiveRegionContext = createContext<Announce>(() => {});

/** Access the app-wide announcer (single polite live region). */
export function useAnnounce(): Announce {
  return useContext(LiveRegionContext);
}

/**
 * Renders the app's ONLY live region (role="status"). Announcements are short
 * and replace each other, so screen readers do not queue a burst of updates.
 */
export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number | null>(null);

  const announce = useCallback<Announce>((text) => {
    setMessage('');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(text), 40);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <LiveRegionContext.Provider value={announce}>
      {children}
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
    </LiveRegionContext.Provider>
  );
}
