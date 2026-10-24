import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { session, setSessionExpiredHandler } from '../api/client';
import { useToast } from './ToastProvider';

const AuthContext = createContext(null);

function tokenIsValid(token) {
  if (!token) return false;
  try {
    const { exp } = jwtDecode(token);
    return !exp || exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [user, setUser] = useState(() => (tokenIsValid(session.token) ? session.user : null));

  const signIn = useCallback((token, profile) => {
    session.save(token, profile);
    setUser(profile);
  }, []);

  const signOut = useCallback(
    (message) => {
      session.clear();
      setUser(null);
      navigate('/login', { replace: true });
      if (message) toast.info(message);
    },
    [navigate, toast],
  );

  const updateProfile = useCallback((profile) => {
    setUser((current) => {
      const next = { ...current, ...profile };
      session.saveUser(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => signOut('Your session has ended. Please sign in again.'));
  }, [signOut]);

  // Sign out when the token runs out while the tab is open.
  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(() => {
      if (!tokenIsValid(session.token)) signOut('Your session has ended. Please sign in again.');
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [user, signOut]);

  const value = useMemo(
    () => ({ user, signIn, signOut, updateProfile }),
    [user, signIn, signOut, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
