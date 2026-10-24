import React from 'react';
import { ROLES, STATUS, STATUS_LABELS } from '../../utils/constants';
import { initials } from '../../utils/format';
import styles from './ui.module.css';

const ROLE_TONE = {
  [ROLES.SUPERVISOR]: 'plum',
  [ROLES.LEADER]: 'primary',
  [ROLES.STUDENT]: 'neutral',
};

const STATUS_TONE = {
  [STATUS.IN_PROGRESS]: 'neutral',
  [STATUS.SUBMITTED]: 'amber',
  [STATUS.APPROVED]: 'green',
};

export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`${styles.badge} ${styles[`tone-${tone}`]} ${className}`}>{children}</span>;
}

export function RoleBadge({ role }) {
  return <Badge tone={ROLE_TONE[role] || 'neutral'}>{role}</Badge>;
}

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABELS[status] || status}</Badge>;
}

const AVATAR_TONES = ['primary', 'plum', 'amber', 'green', 'rose'];

export function Avatar({ name, size = 'md' }) {
  let hash = 0;
  for (const ch of name || '') hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const tone = AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
  return (
    <span className={`${styles.avatar} ${styles[`avatar-${size}`]} ${styles[`tone-${tone}`]}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function ProgressBar({ value, label }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div
      className={styles.progress}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span className={styles.progressFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className={styles.spinnerWrap} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {children && <p className={styles.emptyText}>{children}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', title, children, action }) {
  return (
    <div className={`${styles.notice} ${styles[`notice-${tone}`]}`}>
      <div>
        {title && <p className={styles.noticeTitle}>{title}</p>}
        {children && <div className={styles.noticeText}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
