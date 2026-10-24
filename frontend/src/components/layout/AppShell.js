import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightFromBracket, faMoon, faSun, faUserPen } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthProvider';
import { Avatar } from '../ui';
import NotificationsMenu from './NotificationsMenu';
import ProfileModal from './ProfileModal';
import useTheme from './useTheme';
import styles from './AppShell.module.css';

export function BrandMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      <svg viewBox="0 0 32 32" width="32" height="32">
        <rect x="3" y="7" width="17" height="21" rx="3" fill="currentColor" opacity="0.35" />
        <rect x="10" y="3" width="19" height="22" rx="3" fill="currentColor" />
        <path d="M14.5 13.5l3 3 6-6.5" fill="none" stroke="var(--paper)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function UserMenu({ onEditProfile }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button
        className={styles.userButton}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar name={user.name} size="sm" />
        <span className={styles.userName}>{user.first_name || user.name}</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHeader}>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              setOpen(false);
              onEditProfile();
            }}
          >
            <FontAwesomeIcon icon={faUserPen} /> Profile and password
          </button>
          <button role="menuitem" className={styles.menuItem} onClick={() => signOut()}>
            <FontAwesomeIcon icon={faArrowRightFromBracket} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }) {
  const [theme, toggleTheme] = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link to="/dashboard" className={styles.brand}>
            <BrandMark />
            <span className={styles.brandName}>
              Project <span className={styles.brandWide}>Collaboration </span>Portal
            </span>
          </Link>
          <nav className={styles.nav} aria-label="Main">
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? styles.navActive : styles.navLink)}>
              My work
            </NavLink>
          </nav>
          <div className={styles.actions}>
            <button
              className={styles.iconAction}
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
            >
              <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
            </button>
            <NotificationsMenu />
            <UserMenu onEditProfile={() => setProfileOpen(true)} />
          </div>
        </div>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
