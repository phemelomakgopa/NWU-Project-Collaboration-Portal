import React, { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faLock, faPen } from '@fortawesome/free-solid-svg-icons';
import { api, errorMessage } from '../../api/client';
import { Badge, Button, EmptyState, ProgressBar, RoleBadge, Spinner } from '../../components/ui';
import { STATUS } from '../../utils/constants';
import { dueLabel, daysUntil, formatDate } from '../../utils/format';
import OverviewTab from './OverviewTab';
import TasksTab from './TasksTab';
import ChatTab from './ChatTab';
import SubmissionTab from './SubmissionTab';
import TeamTab from './TeamTab';
import ProjectDetailsModal from './ProjectDetailsModal';
import styles from './Workspace.module.css';

const TABS = [
  { id: 'overview', label: 'Overview', Component: OverviewTab },
  { id: 'tasks', label: 'Tasks', Component: TasksTab },
  { id: 'discussion', label: 'Discussion', Component: ChatTab },
  { id: 'submission', label: 'Submission', Component: SubmissionTab },
  { id: 'team', label: 'Team', Component: TeamTab },
];

function tabCount(tabId, data) {
  if (tabId !== 'tasks') return 0;
  if (data.permissions.can_review) return data.tasks.filter((t) => t.status === STATUS.SUBMITTED).length;
  return data.tasks.filter(
    (t) => t.status === STATUS.IN_PROGRESS && t.assignees.some((a) => a.email === data.me),
  ).length;
}

function ProjectStatus({ project }) {
  if (project.status === 'graded') return <Badge tone="green">Graded {project.grade}%</Badge>;
  if (project.status === 'submitted') return <Badge tone="primary">Handed in</Badge>;
  const days = daysUntil(project.due_date);
  return <Badge tone={days < 0 ? 'rose' : days <= 3 ? 'amber' : 'neutral'}>{dueLabel(project.due_date)}</Badge>;
}

export default function ProjectWorkspace() {
  const { projectId, tab = 'overview' } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { data: response } = await api.get(`/projects/${projectId}/`);
      setData(response);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load this project.'));
    }
  }, [projectId]);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  useEffect(() => {
    if (data) document.title = `${data.project.name} | Project Collaboration Portal`;
    return () => {
      document.title = 'Project Collaboration Portal';
    };
  }, [data]);

  const active = TABS.find((t) => t.id === tab);
  if (!active) return <Navigate to={`/projects/${projectId}`} replace />;

  if (error && !data) {
    return (
      <EmptyState
        title="This project could not be opened"
        action={
          <Link to="/dashboard" className={styles.backLink}>
            <FontAwesomeIcon icon={faArrowLeft} /> Back to my work
          </Link>
        }
      >
        {error}
      </EmptyState>
    );
  }
  if (!data) return <Spinner label="Loading project" />;

  const { project, permissions } = data;
  const { Component } = active;

  return (
    <div className={styles.page}>
      <Link to="/dashboard" className={styles.backLink}>
        <FontAwesomeIcon icon={faArrowLeft} /> My work
      </Link>

      <header className={styles.header}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>{project.name}</h1>
          <div className={styles.headerMeta}>
            <RoleBadge role={data.my_role} />
            <ProjectStatus project={project} />
            <span className={styles.muted}>Due {formatDate(project.due_date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
        <div className={styles.headerSide}>
          <div className={styles.headerProgress}>
            <span className={styles.progressLabel}>
              <strong>{project.progress}%</strong> of tasks approved
            </span>
            <ProgressBar value={project.progress} label="Tasks approved" />
          </div>
          {permissions.can_edit_project && (
            <Button size="sm" icon={faPen} onClick={() => setEditing(true)}>
              Edit details
            </Button>
          )}
        </div>
      </header>

      {permissions.read_only && (
        <div className={styles.readOnly} role="note">
          <FontAwesomeIcon icon={faLock} />
          <span>This project has been graded and is now read-only. You can still open and download everything.</span>
        </div>
      )}

      <nav className={styles.tabs} aria-label="Project sections">
        {TABS.map((t) => {
          const count = tabCount(t.id, data);
          return (
            <NavLink
              key={t.id}
              to={t.id === 'overview' ? `/projects/${projectId}` : `/projects/${projectId}/${t.id}`}
              end
              className={() => `${styles.tab} ${t.id === tab ? styles.tabActive : ''}`}
              aria-current={t.id === tab ? 'page' : undefined}
            >
              {t.label}
              {count > 0 && <span className={styles.tabCount}>{count}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className={styles.tabPanel}>
        <Component data={data} reload={reload} />
      </div>

      {editing && <ProjectDetailsModal project={project} onClose={() => setEditing(false)} onSaved={reload} />}
    </div>
  );
}
