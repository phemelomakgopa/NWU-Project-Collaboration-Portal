import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { relativeTime } from '../../utils/format';
import { Spinner } from '../ui';
import styles from './AppShell.module.css';

const POLL_MS = 60 * 1000;

export default function NotificationsMenu() {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/');
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      /* the badge simply stays as it was */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
      if (unread > 0) {
        // Opening the panel counts as reading; the dots stay until it closes.
        api.post('/notifications/read-all/').then(() => setUnread(0)).catch(() => {});
      }
    } else {
      setItems((list) => list?.map((n) => ({ ...n, is_read: true })));
    }
  };

  const remove = async (id) => {
    setItems((list) => list.filter((n) => n.id !== id));
    try {
      await api.delete(`/notifications/${id}/`);
    } catch (err) {
      toast.error(errorMessage(err));
      load();
    }
  };

  const clearAll = async () => {
    try {
      await api.delete('/notifications/');
      setItems([]);
      setUnread(0);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const openItem = (item) => {
    if (!item.project_id) return;
    setOpen(false);
    navigate(`/projects/${item.project_id}`);
  };

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button
        className={styles.iconAction}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
      >
        <FontAwesomeIcon icon={faBell} />
        {unread > 0 && <span className={styles.badgeCount}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className={`${styles.menu} ${styles.notifications}`} role="dialog" aria-label="Notifications">
          <div className={styles.notifHeader}>
            <h2>Notifications</h2>
            {items?.length > 0 && (
              <button className={styles.textButton} onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>
          {items === null ? (
            <Spinner />
          ) : items.length === 0 ? (
            <p className={styles.notifEmpty}>You're all caught up. New tasks, reviews and grades will show up here.</p>
          ) : (
            <ul className={styles.notifList}>
              {items.map((item) => (
                <li key={item.id} className={`${styles.notifItem} ${item.is_read ? '' : styles.notifUnread}`}>
                  <button
                    className={styles.notifBody}
                    onClick={() => openItem(item)}
                    disabled={!item.project_id}
                  >
                    <span className={styles.notifTitle}>{item.title}</span>
                    <span className={styles.notifMessage}>{item.message}</span>
                    <span className={styles.notifTime}>{relativeTime(item.time_sent)}</span>
                  </button>
                  <button className={styles.notifRemove} onClick={() => remove(item.id)} aria-label="Remove notification">
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
