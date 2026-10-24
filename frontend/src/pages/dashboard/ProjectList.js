import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, ProgressBar, RoleBadge } from '../../components/ui';
import { dueLabel, daysUntil } from '../../utils/format';
import styles from './Dashboard.module.css';

const FINISHED = ['graded', 'submitted'];

function StatusLine({ project }) {
  if (project.status === 'graded') return <Badge tone="green">Graded {project.grade}%</Badge>;
  if (project.status === 'submitted') return <Badge tone="primary">Handed in, awaiting grade</Badge>;
  const days = daysUntil(project.due_date);
  const tone = days < 0 ? 'rose' : days <= 3 ? 'amber' : 'neutral';
  return <Badge tone={tone}>{dueLabel(project.due_date)}</Badge>;
}

export default function ProjectList({ projects }) {
  const active = projects.filter((p) => !FINISHED.includes(p.status));
  const finished = projects.filter((p) => FINISHED.includes(p.status));
  const [tab, setTab] = useState(active.length || !finished.length ? 'active' : 'finished');
  const shown = tab === 'active' ? active : finished;

  return (
    <div className={styles.projects}>
      <div className={styles.segmented} role="group" aria-label="Which projects">
        <button aria-pressed={tab === 'active'} onClick={() => setTab('active')}>
          In progress ({active.length})
        </button>
        <button aria-pressed={tab === 'finished'} onClick={() => setTab('finished')}>
          Handed in ({finished.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <div className={styles.emptyPanel}>
          <EmptyState title={tab === 'active' ? 'Nothing in progress' : 'Nothing handed in yet'}>
            {tab === 'active'
              ? 'All your projects have been handed in.'
              : 'Projects move here once the group leader hands them in.'}
          </EmptyState>
        </div>
      ) : (
        <ul className={styles.projectRows}>
          {shown.map((project) => (
            <li key={project.id}>
              <Link to={`/projects/${project.id}`} className={styles.projectRow}>
                <div className={styles.projectMain}>
                  <div className={styles.projectTitleLine}>
                    <h3 className={styles.projectName}>{project.name}</h3>
                    <RoleBadge role={project.role} />
                  </div>
                  {project.description && <p className={styles.projectDesc}>{project.description}</p>}
                </div>
                <div className={styles.projectProgress}>
                  <ProgressBar value={project.progress} label={`${project.name} progress`} />
                  <span className={styles.muted}>
                    {project.tasks_total === 0
                      ? 'No tasks yet'
                      : `${project.tasks_approved} of ${project.tasks_total} tasks approved`}
                  </span>
                </div>
                <div className={styles.projectMeta}>
                  <StatusLine project={project} />
                  {project.awaiting_review > 0 && <Badge tone="amber">{project.awaiting_review} to review</Badge>}
                  {project.my_open_tasks > 0 && (
                    <Badge tone="primary">
                      {project.my_open_tasks} open {project.my_open_tasks === 1 ? 'task' : 'tasks'} for you
                    </Badge>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
