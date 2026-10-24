import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircle, faCircleCheck, faPaperPlane, faRotateLeft } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { Button, ConfirmDialog, Field, Input, Notice, ProgressBar, Textarea } from '../../components/ui';
import { ROLES, STATUS } from '../../utils/constants';
import Documents from './Documents';
import styles from './Workspace.module.css';

function Check({ done, children }) {
  return (
    <li className={done ? styles.checkDone : styles.checkTodo}>
      <FontAwesomeIcon icon={done ? faCircleCheck : faCircle} />
      <span>{children}</span>
    </li>
  );
}

export function Contributions({ rows }) {
  if (!rows?.length) return <p className={styles.muted}>No students or group leaders in this project yet.</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">Contribution per member</caption>
        <thead>
          <tr>
            <th scope="col">Member</th>
            <th scope="col">Tasks assigned</th>
            <th scope="col">Approved</th>
            <th scope="col">Uploads</th>
            <th scope="col">Share of approved work</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.email}>
              <th scope="row">
                <span className={styles.itemStrong}>{row.name}</span>
                <span className={styles.muted}>{row.role}</span>
              </th>
              <td>{row.tasks_assigned}</td>
              <td>{row.tasks_approved}</td>
              <td>{row.documents_uploaded}</td>
              <td>
                <div className={styles.shareCell}>
                  <ProgressBar value={row.share} label={`${row.name} share`} />
                  <span>{row.share}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GradeForm({ data, reload }) {
  const toast = useToast();
  const { project } = data;
  const [grade, setGrade] = useState(project.grade ?? '');
  const [feedback, setFeedback] = useState(project.feedback || '');
  const [confirming, setConfirming] = useState(false);
  const regrade = project.grade != null;
  const gradeNumber = Number(grade);
  const validGrade = grade !== '' && Number.isInteger(gradeNumber) && gradeNumber >= 0 && gradeNumber <= 100;

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>{regrade ? 'Update grade' : 'Grade the project'}</h3>
      <p className={styles.muted}>
        {regrade
          ? 'Members are notified when you change the grade.'
          : 'Once you submit a grade the project becomes read-only for everyone.'}
      </p>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          setConfirming(true);
        }}
      >
        <Field label="Grade (%)" error={grade !== '' && !validGrade ? 'Enter a whole number from 0 to 100.' : ''}>
          <Input type="number" inputMode="numeric" min={0} max={100} step={1} value={grade} onChange={(e) => setGrade(e.target.value)} className={styles.gradeInput} />
        </Field>
        <Field label="Feedback" hint="What went well and what to improve. The whole group will read this.">
          <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={6} />
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={!validGrade || !feedback.trim()}>
            {regrade ? 'Update grade' : 'Submit grade'}
          </Button>
        </div>
      </form>
      {confirming && (
        <ConfirmDialog
          title={regrade ? 'Update the grade?' : `Submit ${gradeNumber}% for this project?`}
          confirmLabel={regrade ? 'Update grade' : 'Submit grade'}
          tone="primary"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await api.post(`/projects/${project.id}/grade/`, { grade: gradeNumber, feedback });
            toast.success(regrade ? 'Grade updated. Members have been notified.' : 'Grade submitted. Members have been notified.');
            await reload();
          }}
        >
          <p>
            {regrade
              ? 'Everyone in the project will be notified of the change.'
              : 'Everyone in the project will be notified, and the project will become read-only.'}
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

export default function SubmissionTab({ data, reload }) {
  const toast = useToast();
  const { project, permissions, final_submission: final, my_role: role } = data;
  const [confirm, setConfirm] = useState(null);

  const submitted = final.status === STATUS.APPROVED;
  const graded = project.status === 'graded';
  const unapproved = data.tasks.filter((t) => t.status !== STATUS.APPROVED);
  const hasDocs = final.documents.length > 0;
  const ready = unapproved.length === 0 && hasDocs;
  const isLeader = role === ROLES.LEADER;
  const canUpload = permissions.can_submit_final && !submitted;

  const handIn = () =>
    setConfirm({
      title: 'Hand in the project?',
      body: 'Your supervisor will be notified that the project is ready for grading. You can withdraw it until it is graded.',
      label: 'Hand in project',
      run: async () => {
        await api.post(`/projects/${project.id}/submission/`);
        toast.success('Project handed in. Your supervisor has been notified.');
        await reload();
      },
    });

  const withdraw = () =>
    setConfirm({
      title: 'Withdraw the hand-in?',
      body: 'The supervisor will be told you are making changes. Hand it in again when you are done.',
      label: 'Withdraw hand-in',
      run: async () => {
        await api.delete(`/projects/${project.id}/submission/`);
        toast.success('Hand-in withdrawn. You can change the final documents again.');
        await reload();
      },
    });

  return (
    <div className={styles.submission}>
      <div className={styles.submissionMain}>
        {graded && (
          <Notice tone="success" title={`Graded: ${project.grade}%`}>
            <p className={styles.feedback}>{project.feedback}</p>
          </Notice>
        )}
        {!graded && submitted && (
          <Notice
            tone="info"
            title={role === ROLES.SUPERVISOR ? 'Handed in and ready for grading' : 'Handed in, awaiting grade'}
            action={
              permissions.can_submit_final && (
                <Button icon={faRotateLeft} onClick={withdraw}>
                  Withdraw
                </Button>
              )
            }
          >
            {role === ROLES.SUPERVISOR
              ? 'Download the final documents, check the contributions below and submit a grade.'
              : 'Your supervisor has been notified.'}
          </Notice>
        )}

        {!submitted && (
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>Before handing in</h3>
            <ul className={styles.checklist}>
              <Check done={unapproved.length === 0}>
                {data.tasks.length === 0
                  ? 'No tasks to approve'
                  : unapproved.length === 0
                    ? `All ${data.tasks.length} tasks are approved`
                    : `${unapproved.length} of ${data.tasks.length} tasks still need approval`}
              </Check>
              <Check done={hasDocs}>{hasDocs ? 'Final document uploaded' : 'Upload the final combined document'}</Check>
            </ul>
            {unapproved.length > 0 && (
              <p className={styles.muted}>
                Waiting on: {unapproved.map((t) => t.name).join(', ')}.{' '}
                <Link to={`/projects/${project.id}/tasks`}>Go to tasks</Link>
              </p>
            )}
            {!isLeader && <p className={styles.muted}>Only a group leader can hand in the project.</p>}
          </section>
        )}

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Final documents</h3>
          <Documents
            taskId={final.id}
            documents={final.documents}
            canUpload={canUpload}
            canRemove={() => canUpload}
            onChange={reload}
            emptyText={canUpload ? 'Upload the combined final version of the project here.' : 'Nothing uploaded yet.'}
          />
          {permissions.can_submit_final && !submitted && (
            <div className={styles.handIn}>
              <Button variant="primary" icon={faPaperPlane} onClick={handIn} disabled={!ready}>
                Hand in project
              </Button>
              {!ready && <span className={styles.muted}>Complete the checklist above to hand in.</span>}
            </div>
          )}
        </section>

        {permissions.can_grade && <GradeForm data={data} reload={reload} />}
      </div>

      {data.contributions && (
        <aside className={styles.submissionSide}>
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>Contributions</h3>
            <p className={styles.muted}>Based on task assignments, approvals and uploads.</p>
            <Contributions rows={data.contributions} />
          </section>
        </aside>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.label}
          tone="primary"
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
        >
          <p>{confirm.body}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
