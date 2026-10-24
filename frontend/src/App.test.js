import { render, screen } from '@testing-library/react';
import App from './App';
import { dueLabel, toDayKey, addDays, initials } from './utils/format';

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/dashboard');
});

test('signed-out visitors are sent to the sign-in page', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  expect(window.location.pathname).toBe('/login');
});

test('old dashboard addresses redirect instead of showing a blank page', async () => {
  window.history.pushState({}, '', '/studentdashboard');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
});

test('due labels read naturally', () => {
  const today = new Date();
  expect(dueLabel(toDayKey(today))).toBe('Due today');
  expect(dueLabel(toDayKey(addDays(today, 1)))).toBe('Due tomorrow');
  expect(dueLabel(toDayKey(addDays(today, 3)))).toBe('Due in 3 days');
  expect(dueLabel(toDayKey(addDays(today, -2)))).toBe('2 days overdue');
});

test('initials come from the first two names', () => {
  expect(initials('Shaun Makgopa')).toBe('SM');
  expect(initials('Cher')).toBe('C');
});
