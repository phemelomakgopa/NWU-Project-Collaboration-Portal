import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleExclamation, faCircleInfo, faXmark } from '@fortawesome/free-solid-svg-icons';
import styles from './Toast.module.css';

const ToastContext = createContext(null);

const ICONS = { success: faCircleCheck, error: faCircleExclamation, info: faCircleInfo };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind, message) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`${styles.toast} ${styles[toast.kind]}`}>
            <FontAwesomeIcon icon={ICONS[toast.kind]} className={styles.icon} />
            <span className={styles.message}>{toast.message}</span>
            <button className={styles.close} onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
