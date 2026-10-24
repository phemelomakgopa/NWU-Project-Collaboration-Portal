import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthProvider';
import { Button, Field, FormError, Input, PasswordInput } from '../../components/ui';
import AuthLayout from './AuthLayout';
import styles from './Auth.module.css';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login/', { email: email.trim(), password });
      signIn(data.access, data.user);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not sign you in. Please try again.'));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the email address you registered with."
      footer={
        <>
          New to the portal? <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <Field label="Email address">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="12345678@mynwu.ac.za"
            autoFocus
            required
          />
        </Field>
        <div className={styles.passwordField}>
          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Link to="/forgot-password" state={{ email }} className={styles.forgot}>
            Forgot password?
          </Link>
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" variant="primary" loading={loading} disabled={!email.trim() || !password} className={styles.submit}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
