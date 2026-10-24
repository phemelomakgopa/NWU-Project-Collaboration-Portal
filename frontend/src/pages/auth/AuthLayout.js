import React from 'react';
import { BrandMark } from '../../components/layout/AppShell';
import styles from './Auth.module.css';

const POINTS = [
  ['Know what is due', 'Tasks, meetings and deadlines from every project on one planner.'],
  ['Hand work in properly', 'Upload to a task, get it reviewed, and see when it is approved.'],
  ['Fair credit', 'Supervisors see who worked on what before they grade.'],
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className={styles.page}>
      <aside className={styles.intro}>
        <div className={styles.introBrand}>
          <BrandMark />
          <span>Project Collaboration Portal</span>
        </div>
        <div className={styles.introBody}>
          <p className={styles.introHeadline}>Group projects without the scattered chats.</p>
          <ul className={styles.points}>
            {POINTS.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className={styles.introFoot}>North-West University</p>
      </aside>
      <main className={styles.formSide}>
        <div className={styles.formCard}>
          <div className={styles.mobileBrand}>
            <BrandMark />
            <span>Project Collaboration Portal</span>
          </div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {children}
          {footer && <div className={styles.footer}>{footer}</div>}
        </div>
      </main>
    </div>
  );
}
