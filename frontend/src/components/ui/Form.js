import React, { useId, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import styles from './ui.module.css';

/** Label + control + optional hint/error, wired up for screen readers. */
export function Field({ label, hint, error, children, optional = false, className = '' }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  const control = React.Children.only(children);
  return (
    <div className={`${styles.field} ${className}`}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> (optional)</span>}
      </label>
      {React.cloneElement(control, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = React.forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`${styles.input} ${className}`} {...props} />;
});

export function Textarea({ className = '', ...props }) {
  return <textarea className={`${styles.input} ${styles.textarea} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${styles.input} ${styles.select} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function PasswordInput({ id, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.passwordWrap}>
      <Input id={id} type={visible ? 'text' : 'password'} {...props} />
      <button
        type="button"
        className={styles.passwordToggle}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        <FontAwesomeIcon icon={visible ? faEyeSlash : faEye} />
      </button>
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <p className={styles.formError} role="alert">
      {children}
    </p>
  );
}
