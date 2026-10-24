import React, { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { Button, Field, FormError, Input, Modal } from '../../components/ui';
import { todayKey } from '../../utils/format';
import styles from './Workspace.module.css';

export default function MeetingModal({ projectId, onClose, onSaved }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/meetings/`, { title, date_time: `${date}T${time}` });
      toast.success('Meeting scheduled. Members have been notified.');
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Schedule a meeting"
      description="Everyone in the project gets a notification and sees it on their planner."
      size="sm"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="meeting-form" loading={saving} disabled={!title.trim() || !date || !time}>
            Schedule meeting
          </Button>
        </>
      }
    >
      <form id="meeting-form" className={styles.form} onSubmit={save}>
        <Field label="What's it about?">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Progress check-in" maxLength={200} required />
        </Field>
        <div className={styles.formRow}>
          <Field label="Date">
            <Input type="date" value={date} min={todayKey()} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
