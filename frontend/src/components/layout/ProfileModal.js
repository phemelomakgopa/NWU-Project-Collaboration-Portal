import React, { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthProvider';
import { useToast } from '../../context/ToastProvider';
import { Button, Field, FormError, Input, Modal, PasswordInput, Select, Spinner } from '../ui';
import styles from './AppShell.module.css';

export default function ProfileModal({ onClose }) {
  const { updateProfile } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    security_question: '',
    security_answer: '',
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/me/')
      .then(({ data }) => {
        setProfile(data);
        setForm((f) => ({ ...f, first_name: data.first_name, last_name: data.last_name, security_question: data.security_question }));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const questionChanged = profile && form.security_question !== profile.security_question;
  const needsCurrent = Boolean(form.new_password || form.security_answer || questionChanged);
  const mismatch = form.new_password && form.confirm_password && form.new_password !== form.confirm_password;

  const save = async (event) => {
    event.preventDefault();
    setError('');
    if (mismatch) return setError('The new passwords do not match.');
    if (form.new_password && !form.confirm_password) return setError('Type the new password again to confirm it.');
    setSaving(true);
    const payload = { first_name: form.first_name, last_name: form.last_name };
    if (needsCurrent) payload.current_password = form.current_password;
    if (form.new_password) payload.new_password = form.new_password;
    if (questionChanged) payload.security_question = form.security_question;
    if (form.security_answer) payload.security_answer = form.security_answer;
    try {
      const { data } = await api.patch('/me/', payload);
      updateProfile({ first_name: data.first_name, last_name: data.last_name, name: data.name });
      toast.success('Profile saved.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Profile and password"
      description={profile ? `Signed in as ${profile.email}. Your email is your login and cannot be changed.` : undefined}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="profile-form" loading={saving} disabled={!profile}>
            Save changes
          </Button>
        </>
      }
    >
      {!profile && !error ? (
        <Spinner />
      ) : (
        <form id="profile-form" className={styles.formStack} onSubmit={save}>
          <div className={styles.formRow}>
            <Field label="First name">
              <Input value={form.first_name} onChange={set('first_name')} required autoComplete="given-name" />
            </Field>
            <Field label="Last name">
              <Input value={form.last_name} onChange={set('last_name')} required autoComplete="family-name" />
            </Field>
          </div>

          <fieldset className={styles.fieldset}>
            <legend>Change password</legend>
            <Field label="New password" optional hint="At least 8 characters. Avoid common words and only numbers.">
              <PasswordInput value={form.new_password} onChange={set('new_password')} autoComplete="new-password" />
            </Field>
            {form.new_password && (
              <Field label="Confirm new password" error={mismatch ? 'The passwords do not match.' : ''}>
                <PasswordInput value={form.confirm_password} onChange={set('confirm_password')} autoComplete="new-password" />
              </Field>
            )}
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>Account recovery</legend>
            <Field label="Security question">
              <Select value={form.security_question} onChange={set('security_question')}>
                {(profile?.security_questions || []).map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="New answer"
              optional={!questionChanged}
              hint={questionChanged ? 'Required because you chose a new question.' : 'Leave blank to keep your current answer.'}
            >
              <Input value={form.security_answer} onChange={set('security_answer')} autoComplete="off" />
            </Field>
          </fieldset>

          {needsCurrent && (
            <Field label="Current password" hint="Needed to confirm security changes.">
              <PasswordInput value={form.current_password} onChange={set('current_password')} autoComplete="current-password" required />
            </Field>
          )}
          <FormError>{error}</FormError>
        </form>
      )}
    </Modal>
  );
}
