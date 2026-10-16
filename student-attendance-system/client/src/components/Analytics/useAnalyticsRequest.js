import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';

// Cancel obsolete requests and ignore results after a filter change or unmount.
export function useAnalyticsRequest(path) {
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: ''
  });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setState({
      loading: true,
      data: null,
      error: ''
    });
    api.get(path, {
      signal: controller.signal
    }).then(r => {
      if (current) setState({
        loading: false,
        data: r.data,
        error: ''
      });
    }).catch(error => {
      if (current && !controller.signal.aborted) setState({
        loading: false,
        data: null,
        error: error.response?.data?.message || 'Could not load analytics. Please retry.'
      });
    });
    return () => {
      current = false;
      controller.abort();
    };
  }, [path, version]);
  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);
  return {
    ...state,
    refresh
  };
}
