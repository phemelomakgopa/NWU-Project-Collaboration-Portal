import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthProvider';
import { useToast } from '../../context/ToastProvider';
import { Button, Field, FormError, Input, PasswordInput, Select } from '../../components/ui';
import AuthLayout from './AuthLayout';
import styles from './Auth.module.css';

const FALLBACK_QUESTIONS = [
  'What is your favourite car model?',
  'Where is your favourite holiday destination?',
  'What is your favourite snack?',
  'Who is your favourite superhero?',
  'What is your favourite name for a pet?',
];

export default function Signup() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState(FALLBACK_QUESTIONS);
  const [form, setForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    security_question: '',
    security_answer: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get('/auth/security-questions/')
      .then(({ data }) => setQuestions(data.questions))
      .catch(() => {});
  }, []);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const complete = Object.values(form).every((value) => value.trim());
  const shortPassword = form.password.length > 0 && form.password.length < 8;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register/', form);
      signIn(data.access, data.user);
      toast.success(`Welcome, ${data.user.first_name}. Your account is ready.`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not create your account. Please try again.'));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Supervisors and students use the same account. Your role is set per project."
      footer={
        <>
          Already registered? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.row}>
          <Field label="First name">
            <Input value={form.first_name} onChange={set('first_name')} autoComplete="given-name" autoFocus />
          </Field>
          <Field label="Last name">
            <Input value={form.last_name} onChange={set('last_name')} autoComplete="family-name" />
          </Field>
        </div>
        <Field label="Email address" hint="This is what you'll sign in with, and how teammates add you to projects.">
          <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="12345678@mynwu.ac.za" />
        </Field>
        <Field
          label="Password"
          hint="At least 8 characters. Avoid common words and numbers only."
          error={shortPassword ? 'Use at least 8 characters.' : ''}
        >
          <PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Field label="Security question" hint="Used to confirm it's you if you forget your password.">
          <Select value={form.security_question} onChange={set('security_question')}>
            <option value="">Choose a question</option>
            {questions.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Your answer" hint="Not case-sensitive.">
          <Input value={form.security_answer} onChange={set('security_answer')} autoComplete="off" />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" variant="primary" loading={loading} disabled={!complete || shortPassword} className={styles.submit}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
