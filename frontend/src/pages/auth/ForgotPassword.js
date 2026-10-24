import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { Button, Field, FormError, Input, PasswordInput } from '../../components/ui';
import AuthLayout from './AuthLayout';
import styles from './Auth.module.css';

const STEPS = ['email', 'answer', 'password'];

export default function ForgotPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState(location.state?.email || '');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async (fn) => {
    setError('');
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const findAccount = (event) => {
    event.preventDefault();
    run(async () => {
      const { data } = await api.post('/auth/forgot/question/', { email: email.trim() });
      setQuestion(data.security_question);
      setStep('answer');
    });
  };

  const checkAnswer = (event) => {
    event.preventDefault();
    run(async () => {
      const { data } = await api.post('/auth/forgot/verify/', { email: email.trim(), security_answer: answer });
      setResetToken(data.reset_token);
      setStep('password');
    });
  };

  const mismatch = confirm && password !== confirm;

  const savePassword = (event) => {
    event.preventDefault();
    if (password !== confirm) return setError('The passwords do not match.');
    run(async () => {
      await api.post('/auth/forgot/reset/', { reset_token: resetToken, password });
      toast.success('Password changed. Sign in with your new password.');
      navigate('/login', { replace: true, state: { email: email.trim() } });
    });
  };

  const stepNumber = STEPS.indexOf(step) + 1;

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={`Step ${stepNumber} of 3`}
      footer={
        <>
          Remembered it? <Link to="/login">Back to sign in</Link>
        </>
      }
    >
      <ol className={styles.steps} aria-label="Progress">
        {['Find account', 'Answer question', 'New password'].map((label, i) => (
          <li key={label} className={i < stepNumber ? styles.stepDone : ''} aria-current={i + 1 === stepNumber ? 'step' : undefined}>
            {label}
          </li>
        ))}
      </ol>

      {step === 'email' && (
        <form className={styles.form} onSubmit={findAccount} noValidate>
          <Field label="Email address">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
          </Field>
          <FormError>{error}</FormError>
          <Button type="submit" variant="primary" loading={loading} disabled={!email.trim()} className={styles.submit}>
            Continue
          </Button>
        </form>
      )}

      {step === 'answer' && (
        <form className={styles.form} onSubmit={checkAnswer} noValidate>
          <p className={styles.question}>{question}</p>
          <Field label="Your answer" hint="Not case-sensitive.">
            <Input value={answer} onChange={(e) => setAnswer(e.target.value)} autoComplete="off" autoFocus />
          </Field>
          <FormError>{error}</FormError>
          <div className={styles.buttonRow}>
            <Button variant="ghost" onClick={() => setStep('email')}>
              Back
            </Button>
            <Button type="submit" variant="primary" loading={loading} disabled={!answer.trim()}>
              Check answer
            </Button>
          </div>
        </form>
      )}

      {step === 'password' && (
        <form className={styles.form} onSubmit={savePassword} noValidate>
          <Field label="New password" hint="At least 8 characters. Avoid common words and numbers only.">
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
          </Field>
          <Field label="Confirm new password" error={mismatch ? 'The passwords do not match.' : ''}>
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
          <FormError>{error}</FormError>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={password.length < 8 || password !== confirm}
            className={styles.submit}
          >
            Save new password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
