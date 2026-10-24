import React, { useState } from 'react';
import { faUserMinus, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { Avatar, Button, ConfirmDialog, Field, FormError, Input, RoleBadge, Select } from '../../components/ui';
import { ROLE_HINTS, ROLE_OPTIONS, ROLES } from '../../utils/constants';
import styles from './Workspace.module.css';

function AddMember({ projectId, reload }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(ROLES.STUDENT);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/members/`, { email: email.trim(), role });
      toast.success(`Added ${data.name} as ${role.toLowerCase()}.`);
      setEmail('');
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={`${styles.card} ${styles.addMember}`} onSubmit={add}>
      <h3 className={styles.cardTitle}>Add a member</h3>
      <div className={styles.addMemberRow}>
        <Field label="Email address" className={styles.grow}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@mynwu.ac.za" />
        </Field>
        <Field label="Role" hint={ROLE_HINTS[role]}>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="primary" icon={faUserPlus} loading={saving} disabled={!email.trim()} className={styles.addMemberButton}>
          Add
        </Button>
      </div>
      <FormError>{error}</FormError>
    </form>
  );
}

export default function TeamTab({ data, reload }) {
  const toast = useToast();
  const { permissions, members, project, me } = data;
  const manage = permissions.can_manage_members;
  const [removing, setRemoving] = useState(null);
  const [savingRole, setSavingRole] = useState(null);

  const counts = members.reduce((acc, m) => ({ ...acc, [m.role]: (acc[m.role] || 0) + 1 }), {});
  const openTaskCount = (email) =>
    data.tasks.filter((t) => t.status !== 'Finalized' && t.assignees.some((a) => a.email === email)).length;

  const changeRole = async (member, role) => {
    setSavingRole(member.email);
    try {
      await api.patch(`/projects/${project.id}/members/${encodeURIComponent(member.email)}/`, { role });
      toast.success(`${member.name} is now ${role === ROLES.LEADER ? 'a group leader' : `a ${role.toLowerCase()}`}.`);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingRole(null);
    }
  };

  return (
    <div className={styles.team}>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Members ({members.length})</h3>
        </div>
        {manage && (
          <p className={styles.muted}>A project always needs at least one supervisor and one group leader.</p>
        )}
        <ul className={styles.memberRows}>
          {members.map((member) => {
            const lastOfRole = counts[member.role] === 1 && member.role !== ROLES.STUDENT;
            return (
              <li key={member.email} className={styles.memberRow}>
                <Avatar name={member.name} size="lg" />
                <div className={styles.memberInfo}>
                  <span className={styles.itemStrong}>
                    {member.name}
                    {member.email === me && <span className={styles.muted}> (you)</span>}
                  </span>
                  <a href={`mailto:${member.email}`} className={styles.memberEmail}>
                    {member.email}
                  </a>
                </div>
                {manage ? (
                  <div className={styles.memberControls}>
                    <Select
                      value={member.role}
                      aria-label={`Role for ${member.name}`}
                      disabled={savingRole === member.email || lastOfRole}
                      title={lastOfRole ? `The only ${member.role.toLowerCase()} cannot change role` : undefined}
                      onChange={(e) => changeRole(member, e.target.value)}
                      className={styles.roleSelect}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </Select>
                    <Button
                      variant="quiet-danger"
                      size="sm"
                      icon={faUserMinus}
                      disabled={lastOfRole}
                      title={lastOfRole ? `The only ${member.role.toLowerCase()} cannot be removed` : undefined}
                      onClick={() => setRemoving(member)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <RoleBadge role={member.role} />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {manage && <AddMember projectId={project.id} reload={reload} />}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          confirmLabel="Remove member"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api.delete(`/projects/${project.id}/members/${encodeURIComponent(removing.email)}/`);
            toast.success(`${removing.name} was removed from the project.`);
            await reload();
          }}
        >
          <p>
            They will lose access to the project and be notified.
            {openTaskCount(removing.email) > 0 &&
              ` They are assigned to ${openTaskCount(removing.email)} open task(s); those tasks will need someone else.`}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
