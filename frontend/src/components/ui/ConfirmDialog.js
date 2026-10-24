import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { errorMessage } from '../../api/client';
import { FormError } from './Form';

/**
 * Confirmation for destructive or significant actions. `onConfirm` may return
 * a promise; the dialog stays open and shows the error if it rejects.
 */
export default function ConfirmDialog({ title, children, confirmLabel, tone = 'danger', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} loading={busy} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {children}
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}
