import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthProvider';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { formatDate, todayKey } from '../../utils/format';
import Planner from './Planner';
import ProjectList from './ProjectList';
import NewProjectModal from './NewProjectModal';
import styles from './Dashboard.module.css';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: response } = await api.get('/dashboard/');
      setData(response);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load your work.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    if (!data) return null;
    const today = todayKey();
    const open = data.agenda.filter((item) => item.kind === 'task');
    return {
      openTasks: open.length,
      overdue: open.filter((item) => item.date < today).length,
      toReview: data.projects.reduce((sum, p) => sum + p.awaiting_review, 0),
    };
  }, [data]);

  if (!data && !error) return <Spinner label="Loading your work" />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.date}>{formatDate(todayKey(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className={styles.greeting}>
            {greeting()}, {data?.user.first_name || user.first_name}
          </h1>
          {summary && (
            <p className={styles.summary}>
              {summary.openTasks === 0
                ? 'You have no open tasks.'
                : `You have ${summary.openTasks} open ${summary.openTasks === 1 ? 'task' : 'tasks'}`}
              {summary.overdue > 0 && <span className={styles.summaryAlert}>, {summary.overdue} overdue</span>}
              {summary.openTasks > 0 && '.'}
              {summary.toReview > 0 && (
                <>
                  {' '}
                  {summary.toReview} {summary.toReview === 1 ? 'submission is' : 'submissions are'} waiting for your review.
                </>
              )}
            </p>
          )}
        </div>
        <Button variant="primary" icon={faPlus} onClick={() => setCreating(true)}>
          New project
        </Button>
      </header>

      {error && (
        <EmptyState title="Your work could not be loaded" action={<Button onClick={load}>Try again</Button>}>
          {error}
        </EmptyState>
      )}

      {data && (
        <>
          <Planner agenda={data.agenda} />
          <section className={styles.section} aria-labelledby="projects-heading">
            <div className={styles.sectionHead}>
              <h2 id="projects-heading" className={styles.sectionTitle}>
                Projects
              </h2>
            </div>
            {data.projects.length === 0 ? (
              <div className={styles.emptyPanel}>
                <EmptyState
                  title="You're not in any projects yet"
                  action={
                    <Button variant="primary" icon={faPlus} onClick={() => setCreating(true)}>
                      Create a project
                    </Button>
                  }
                >
                  Create one for your group, or ask your group leader to add you using {data.user.email}.
                </EmptyState>
              </div>
            ) : (
              <ProjectList projects={data.projects} />
            )}
          </section>
        </>
      )}

      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}
