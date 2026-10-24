import React, { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { Button, Field, FormError, Input, Modal } from '../../components/ui';
import styles from './Workspace.module.css';

export default function LinkModal({ projectId, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/links/`, { name, url });
      toast.success('Link added.');
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add a link"
      size="sm"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="link-form" loading={saving} disabled={!name.trim() || !url.trim()}>
            Add link
          </Button>
        </>
      }
    >
      <form id="link-form" className={styles.form} onSubmit={save}>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project brief" maxLength={100} required />
        </Field>
        <Field label="Web address" hint="For example drive.google.com/... or https://example.com">
          <Input inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required />
        </Field>
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
