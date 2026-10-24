import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import styles from './ui.module.css';

/**
 * variant: primary | secondary | ghost | danger | quiet-danger
 * size: md | sm
 */
const Button = React.forwardRef(function Button(
  { variant = 'secondary', size = 'md', icon, loading = false, children, className = '', type = 'button', disabled, ...rest },
  ref,
) {
  const classes = [styles.button, styles[`button-${variant}`], size === 'sm' ? styles.buttonSm : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading ? <span className={styles.buttonSpinner} aria-hidden="true" /> : icon && <FontAwesomeIcon icon={icon} />}
      {children && <span>{children}</span>}
    </button>
  );
});

export default Button;

export function IconButton({ icon, label, className = '', ...rest }) {
  return (
    <button type="button" className={`${styles.iconButton} ${className}`} aria-label={label} title={label} {...rest}>
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}
