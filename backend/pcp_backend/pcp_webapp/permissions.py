"""Project roles, task states and the rules for who may do what."""
from rest_framework.exceptions import NotFound, PermissionDenied

from .models import Task, UserProject

SUPERVISOR = 'Supervisor'
GROUP_LEADER = 'Group Leader'
STUDENT = 'Student'
ROLES = (SUPERVISOR, GROUP_LEADER, STUDENT)
MANAGER_ROLES = (SUPERVISOR, GROUP_LEADER)

# Stored task statuses. The UI shows them as "In progress", "Awaiting review"
# and "Approved"; the stored values are kept for compatibility with old data.
IN_PROGRESS = 'In Progress'
SUBMITTED = 'Completed'
APPROVED = 'Finalized'

PRIORITIES = ('Low', 'Medium', 'High')

FINAL_TASK_NAME = 'Final Submission'

READ_ONLY_MESSAGE = 'This project has been graded and is now read-only.'


def membership(user, project_id):
    """Return (project, role) for a member, or raise 404 if they have no access.

    A 404 (not 403) avoids revealing which project ids exist.
    """
    link = (
        UserProject.objects.select_related('project_id')
        .filter(email=user, project_id=project_id)
        .first()
    )
    if link is None:
        raise NotFound('Project not found, or you are not a member of it.')
    return link.project_id, link.role


def is_graded(project):
    return project.grade is not None


def require_role(role, allowed, message='You do not have permission to do that.'):
    if role not in allowed:
        raise PermissionDenied(message)


def require_editable(project):
    if is_graded(project):
        raise PermissionDenied(READ_ONLY_MESSAGE)


def final_task(project):
    """The project's final-submission task, created if missing."""
    task = Task.objects.filter(project_id=project, is_final_submission=True).first()
    if task is None:
        task = Task.objects.filter(project_id=project, task_name=FINAL_TASK_NAME).first()
        if task is not None:
            task.is_final_submission = True
            task.save(update_fields=['is_final_submission'])
    if task is None:
        task = Task.objects.create(
            task_name=FINAL_TASK_NAME,
            task_description='Combine the approved work and hand it in for grading.',
            task_due_date=project.due_date,
            task_status=IN_PROGRESS,
            task_priority='High',
            project_id=project,
            is_final_submission=True,
        )
    return task


def is_submitted(project):
    return final_task(project).task_status == APPROVED


def permissions_for(project, role):
    graded = is_graded(project)
    submitted = is_submitted(project)
    manager = role in MANAGER_ROLES
    return {
        'read_only': graded,
        'can_manage_tasks': manager and not graded,
        'can_review': manager and not graded,
        'can_schedule': manager and not graded,
        'can_chat': not graded,
        'can_submit_final': role == GROUP_LEADER and not graded,
        'can_grade': role == SUPERVISOR and submitted,
        'can_manage_members': role == SUPERVISOR and not graded,
        'can_edit_project': role == SUPERVISOR and not graded,
        'can_delete_project': role == SUPERVISOR,
        'can_view_contributions': manager,
    }


def task_in_project_for(user, task_id):
    """Return (task, project, role) for a task the user can see."""
    task = Task.objects.select_related('project_id').filter(task_id=task_id).first()
    if task is None:
        raise NotFound('Task not found.')
    project, role = membership(user, task.project_id_id)
    return task, project, role

