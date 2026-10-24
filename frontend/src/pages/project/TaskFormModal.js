import React, { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { Avatar, Button, Field, FormError, Input, Modal, Select, Textarea } from '../../components/ui';
import { PRIORITIES, ROLES } from '../../utils/constants';
import { formatDate, todayKey } from '../../utils/format';
import styles from './Workspace.module.css';

/** Create a task, or edit one when `task` is given. */
export default function TaskFormModal({ data, task, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(task);
  const [form, setForm] = useState({
    name: task?.name || '',
    description: task?.description || '',
    due_date: task?.due_date || '',
    priority: task?.priority || 'Medium',
  });
  const [assignees, setAssignees] = useState(() => new Set(task?.assignees.map((a) => a.email) || []));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const people = data.members.filter((m) => m.role !== ROLES.SUPERVISOR || assignees.has(m.email));
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const toggle = (email) =>
    setAssignees((current) => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  const afterProjectDue = form.due_date && form.due_date > data.project.due_date;

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    const payload = { ...form, assignees: [...assignees] };
    try {
      if (editing) await api.patch(`/tasks/${task.id}/`, payload);
      else await api.post(`/projects/${data.project.id}/tasks/`, payload);
      toast.success(editing ? 'Task saved.' : `Created "${form.name.trim()}".`);
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit task' : 'New task'}
      description={editing ? undefined : 'Assigned members are notified straight away.'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="task-form" loading={saving} disabled={!form.name.trim() || !form.due_date}>
            {editing ? 'Save task' : 'Create task'}
          </Button>
        </>
      }
    >
      <form id="task-form" className={styles.form} onSubmit={save}>
        <Field label="Task name">
          <Input value={form.name} onChange={set('name')} maxLength={100} placeholder="Write the literature review" autoFocus required />
        </Field>
        <Field label="What needs to be done?" optional>
          <Textarea value={form.description} onChange={set('description')} rows={3} />
        </Field>
        <div className={styles.formRow}>
          <Field
            label="Due date"
            hint={afterProjectDue ? undefined : `Project is due ${formatDate(data.project.due_date)}.`}
            error={afterProjectDue ? 'This is after the project deadline.' : ''}
          >
            <Input type="date" value={form.due_date} min={editing ? undefined : todayKey()} onChange={set('due_date')} required />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset className={styles.checkGroup}>
          <legend>Assign to</legend>
          {people.length === 0 ? (
            <p className={styles.muted}>Add students to the project first.</p>
          ) : (
            people.map((m) => (
              <label key={m.email} className={styles.checkRow}>
                <input type="checkbox" checked={assignees.has(m.email)} onChange={() => toggle(m.email)} />
                <Avatar name={m.name} size="sm" />
                <span>
                  {m.name}
                  {m.email === data.me && <span className={styles.muted}> (you)</span>}
                </span>
                <span className={styles.muted}>{m.role}</span>
              </label>
            ))
          )}
        </fieldset>
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
