import React, { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { Button, Field, FormError, Input, Modal, Textarea } from '../../components/ui';
import styles from './Workspace.module.css';

export default function ProjectDetailsModal({ project, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: project.name, description: project.description, due_date: project.due_date });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.patch(`/projects/${project.id}/`, form);
      toast.success('Project details saved. Members have been notified.');
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit project details"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="project-details" loading={saving} disabled={!form.name.trim() || !form.due_date}>
            Save details
          </Button>
        </>
      }
    >
      <form id="project-details" className={styles.form} onSubmit={save}>
        <Field label="Project name">
          <Input value={form.name} onChange={set('name')} maxLength={100} required />
        </Field>
        <Field label="Description" optional>
          <Textarea value={form.description} onChange={set('description')} rows={5} />
        </Field>
        <Field label="Due date" hint="The final submission is due on this date too.">
          <Input type="date" value={form.due_date} onChange={set('due_date')} required />
        </Field>
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
