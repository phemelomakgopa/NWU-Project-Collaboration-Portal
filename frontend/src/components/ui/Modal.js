import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { IconButton } from './Button';
import styles from './ui.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: traps focus, closes on Escape or a click on the backdrop,
 * and returns focus to whatever opened it.
 * variant "drawer" slides in from the right for detail views.
 */
export default function Modal({ title, description, onClose, children, footer, size = 'md', variant = 'dialog', busy = false }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;
    const first = panel.querySelector('[data-autofocus]') || panel.querySelector(FOCUSABLE);
    (first || panel).focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    };
    panel.addEventListener('keydown', onKey);
    return () => {
      panel.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous && previous.focus) previous.focus();
    };
  }, []);

  return createPortal(
    <div
      className={variant === 'drawer' ? styles.drawerBackdrop : styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`${variant === 'drawer' ? styles.drawer : styles.modal} ${styles[`modal-${size}`] || ''}`}
      >
        <header className={styles.modalHeader}>
          <div>
            <h2 id={titleId} className={styles.modalTitle}>
              {title}
            </h2>
            {description && (
              <p id={descId} className={styles.modalDescription}>
                {description}
              </p>
            )}
          </div>
          <IconButton icon={faXmark} label="Close" onClick={onClose} disabled={busy} />
        </header>
        <div className={styles.modalBody}>{children}</div>
        {footer && <footer className={styles.modalFooter}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
