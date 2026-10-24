import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthProvider';
import { useToast } from '../../context/ToastProvider';
import { Avatar, Button, Field, FormError, IconButton, Input, Modal, Select, Textarea } from '../../components/ui';
import { ROLES, ROLE_HINTS, ROLE_OPTIONS } from '../../utils/constants';
import { todayKey } from '../../utils/format';
import styles from './Dashboard.module.css';

export default function NewProjectModal({ onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', description: '', due_date: '', my_role: ROLES.LEADER });
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(ROLES.STUDENT);
  const [memberError, setMemberError] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const roles = [form.my_role, ...members.map((m) => m.role)];
  const hasSupervisor = roles.includes(ROLES.SUPERVISOR);
  const hasLeader = roles.includes(ROLES.LEADER);

  const addMember = async (event) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    setMemberError('');
    if (!value) return;
    if (value === user.email.toLowerCase() || members.some((m) => m.email.toLowerCase() === value)) {
      setMemberError('This person is already on the list.');
      return;
    }
    setChecking(true);
    try {
      const { data } = await api.get('/users/lookup/', { params: { email: value } });
      setMembers((list) => [...list, { ...data, role }]);
      setEmail('');
    } catch (err) {
      setMemberError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const changeRole = (memberEmail, newRole) =>
    setMembers((list) => list.map((m) => (m.email === memberEmail ? { ...m, role: newRole } : m)));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/projects/', {
        ...form,
        members: members.map(({ email: memberEmail, role: memberRole }) => ({ email: memberEmail, role: memberRole })),
      });
      toast.success(`Created "${form.name.trim()}".`);
      navigate(`/projects/${data.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const ready = form.name.trim() && form.due_date && hasSupervisor && hasLeader;

  return (
    <Modal
      title="New project"
      description="Everyone you add gets a notification and can open the project straight away."
      size="lg"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-project" loading={saving} disabled={!ready}>
            Create project
          </Button>
        </>
      }
    >
      <form id="new-project" className={styles.modalForm} onSubmit={submit}>
        <Field label="Project name">
          <Input value={form.name} onChange={set('name')} maxLength={100} placeholder="CMPG323 Deliverable 2" autoFocus required />
        </Field>
        <Field label="Description" optional>
          <Textarea value={form.description} onChange={set('description')} rows={3} placeholder="What the group needs to deliver" />
        </Field>
        <div className={styles.formRow}>
          <Field label="Due date">
            <Input type="date" value={form.due_date} min={todayKey()} onChange={set('due_date')} required />
          </Field>
          <Field label="Your role" hint={ROLE_HINTS[form.my_role]}>
            <Select value={form.my_role} onChange={set('my_role')}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className={styles.membersBox}>
          <legend>Members</legend>
          <div className={styles.addMemberRow}>
            <Field label="Email address" error={memberError} className={styles.grow}>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setMemberError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && addMember(e)}
                placeholder="teammate@mynwu.ac.za"
              />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </Field>
            <Button onClick={addMember} loading={checking} disabled={!email.trim()} className={styles.addMemberButton}>
              Add
            </Button>
          </div>

          <ul className={styles.memberList}>
            <li className={styles.memberItem}>
              <Avatar name={user.name} size="sm" />
              <span className={styles.memberName}>
                {user.name} <span className={styles.muted}>(you)</span>
              </span>
              <span className={styles.memberRoleStatic}>{form.my_role}</span>
            </li>
            {members.map((m) => (
              <li key={m.email} className={styles.memberItem}>
                <Avatar name={m.name} size="sm" />
                <span className={styles.memberName}>
                  {m.name}
                  <span className={styles.memberEmail}>{m.email}</span>
                </span>
                <Select
                  value={m.role}
                  onChange={(e) => changeRole(m.email, e.target.value)}
                  aria-label={`Role for ${m.name}`}
                  className={styles.memberRoleSelect}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
                <IconButton
                  icon={faXmark}
                  label={`Remove ${m.name}`}
                  onClick={() => setMembers((list) => list.filter((x) => x.email !== m.email))}
                />
              </li>
            ))}
          </ul>

          <ul className={styles.requirements}>
            <li className={hasSupervisor ? styles.reqMet : ''}>
              <FontAwesomeIcon icon={hasSupervisor ? faCircleCheck : faCircleExclamation} /> A supervisor, to grade the project
            </li>
            <li className={hasLeader ? styles.reqMet : ''}>
              <FontAwesomeIcon icon={hasLeader ? faCircleCheck : faCircleExclamation} /> A group leader, to review tasks and hand in
            </li>
          </ul>
        </fieldset>
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
