"""REST API for the Project Collaboration Portal.

Every endpoint except sign-in, sign-up and password reset requires a valid
access token, and every project endpoint checks that the caller is a member
with a role that allows the action (see permissions.py).
"""
import logging
import mimetypes
import os
from collections import defaultdict
from datetime import date, datetime

from django.conf import settings
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator, validate_email
from django.db import transaction
from django.db.models import Count, Q
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import permissions as perms
from .auth import (
    check_secret,
    check_security_answer,
    hash_secret,
    issue_access_token,
    issue_reset_token,
    normalize_answer,
    normalize_email,
    user_from_reset_token,
)
from .models import (
    ChatMessage,
    Document,
    Meeting,
    Project,
    ProjectChat,
    ProjectLinks,
    Task,
    User,
    User_Task,
    UserNotification,
    UserProject,
)
from .permissions import (
    APPROVED,
    GROUP_LEADER,
    IN_PROGRESS,
    MANAGER_ROLES,
    PRIORITIES,
    ROLES,
    STUDENT,
    SUBMITTED,
    SUPERVISOR,
)
from .utils import member_emails, notify

logger = logging.getLogger(__name__)

SECURITY_QUESTIONS = (
    'What is your favourite car model?',
    'Where is your favourite holiday destination?',
    'What is your favourite snack?',
    'Who is your favourite superhero?',
    'What is your favourite name for a pet?',
)

ALLOWED_UPLOAD_EXTENSIONS = {
    '.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md',
    '.ppt', '.pptx', '.odp', '.xls', '.xlsx', '.ods', '.csv',
    '.png', '.jpg', '.jpeg', '.gif', '.zip',
}

MAX_CHAT_LENGTH = 2000


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def text(data, key, required=False, label=None, max_length=None):
    value = data.get(key)
    value = value.strip() if isinstance(value, str) else ('' if value is None else str(value).strip())
    label = label or key.replace('_', ' ').capitalize()
    if required and not value:
        raise ValidationError(f'{label} is required.')
    if max_length and len(value) > max_length:
        raise ValidationError(f'{label} must be {max_length} characters or fewer.')
    return value


def parse_date(value, label='Date'):
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        raise ValidationError(f'{label} must be a valid date (YYYY-MM-DD).')


def parse_datetime(value, label='Date and time'):
    try:
        parsed = datetime.fromisoformat(str(value).replace(' ', 'T'))
    except (TypeError, ValueError):
        raise ValidationError(f'{label} must be a valid date and time.')
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def find_user(email):
    email = normalize_email(email)
    if not email:
        return None
    return User.objects.filter(email=email).first() or User.objects.filter(email__iexact=email).first()


def validate_new_password(password, user=None):
    if not password:
        raise ValidationError('Password is required.')
    try:
        password_validation.validate_password(password)
    except DjangoValidationError as exc:
        raise ValidationError(' '.join(exc.messages))


def user_summary(user):
    return {
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'name': user.full_name or user.email,
    }


def iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return timezone.localtime(value).isoformat(timespec='minutes')
    return value.isoformat()


def task_assignees(tasks):
    by_task = defaultdict(list)
    links = User_Task.objects.filter(task_id__in=tasks).select_related('email')
    for link in links:
        by_task[link.task_id_id].append(user_summary(link.email))
    return by_task


def task_documents(tasks):
    by_task = defaultdict(list)
    docs = Document.objects.filter(task_id__in=tasks).select_related('last_modified_by').order_by('date_time_uploaded')
    for doc in docs:
        by_task[doc.task_id_id].append(document_dict(doc))
    return by_task


def document_dict(doc):
    size = None
    try:
        size = doc.file.size if doc.file else None
    except (OSError, ValueError):
        pass
    return {
        'id': doc.document_id,
        'title': doc.document_title,
        'uploaded_at': iso(doc.date_time_uploaded),
        'uploaded_by': user_summary(doc.last_modified_by),
        'size': size,
    }


def task_dict(task, assignees, documents):
    return {
        'id': task.task_id,
        'name': task.task_name,
        'description': task.task_description or '',
        'due_date': iso(task.task_due_date),
        'status': task.task_status,
        'priority': task.task_priority,
        'is_final': task.is_final_submission,
        'assignees': assignees.get(task.task_id, []),
        'documents': documents.get(task.task_id, []),
    }


def project_progress(project_ids):
    """Share of regular (non-final) tasks approved, per project."""
    rows = (
        Task.objects.filter(project_id__in=project_ids, is_final_submission=False)
        .values('project_id')
        .annotate(
            total=Count('task_id'),
            approved=Count('task_id', filter=Q(task_status=APPROVED)),
            submitted=Count('task_id', filter=Q(task_status=SUBMITTED)),
        )
    )
    return {row['project_id']: row for row in rows}


def project_status(project, final, today=None):
    today = today or timezone.localdate()
    if perms.is_graded(project):
        return 'graded'
    if final and final.task_status == APPROVED:
        return 'submitted'
    if project.due_date < today:
        return 'overdue'
    return 'active'


def touch_final_due_date(project):
    Task.objects.filter(project_id=project, is_final_submission=True).update(task_due_date=project.due_date)


# --------------------------------------------------------------------------
# Authentication
# --------------------------------------------------------------------------

class AuthView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = 'auth'


class LoginView(AuthView):
    def post(self, request):
        email = text(request.data, 'email', required=True, label='Email')
        password = request.data.get('password') or ''
        user = find_user(email)
        if user is None or not check_secret(password, user.password):
            return Response({'error': 'That email and password do not match an account.'},
                            status=status.HTTP_401_UNAUTHORIZED)
        return Response({'access': issue_access_token(user), 'user': user_summary(user)})


class RegisterView(AuthView):
    def post(self, request):
        data = request.data
        email = normalize_email(data.get('email'))
        try:
            validate_email(email)
        except DjangoValidationError:
            raise ValidationError('Enter a valid email address.')
        first_name = text(data, 'first_name', required=True, label='First name', max_length=50)
        last_name = text(data, 'last_name', required=True, label='Last name', max_length=50)
        question = text(data, 'security_question', required=True, label='Security question')
        answer = normalize_answer(data.get('security_answer'))
        if question not in SECURITY_QUESTIONS:
            raise ValidationError('Choose one of the listed security questions.')
        if not answer:
            raise ValidationError('Security answer is required.')
        password = data.get('password') or ''
        validate_new_password(password)
        if find_user(email):
            raise ValidationError('An account with this email already exists. Sign in instead.')

        user = User.objects.create(
            email=email,
            first_name=first_name,
            last_name=last_name,
            password=hash_secret(password),
            security_question=question,
            security_answer=hash_secret(answer),
        )
        return Response({'access': issue_access_token(user), 'user': user_summary(user)},
                        status=status.HTTP_201_CREATED)


class SecurityQuestionsView(AuthView):
    throttle_classes = ()

    def get(self, request):
        return Response({'questions': SECURITY_QUESTIONS})


class ForgotPasswordQuestionView(AuthView):
    def post(self, request):
        user = find_user(request.data.get('email'))
        if user is None:
            raise NotFound('No account uses this email address.')
        return Response({'email': user.email, 'security_question': user.security_question})


class ForgotPasswordVerifyView(AuthView):
    def post(self, request):
        user = find_user(request.data.get('email'))
        if user is None or not check_security_answer(user, request.data.get('security_answer')):
            raise ValidationError('That answer does not match. Check the spelling and try again.')
        return Response({'reset_token': issue_reset_token(user)})


class ForgotPasswordResetView(AuthView):
    def post(self, request):
        user = user_from_reset_token(request.data.get('reset_token') or '')
        password = request.data.get('password') or ''
        validate_new_password(password)
        user.password = hash_secret(password)
        user.save(update_fields=['password'])
        return Response({'message': 'Password changed. You can now sign in.'})


# --------------------------------------------------------------------------
# Current user
# --------------------------------------------------------------------------

class MeView(APIView):
    def get(self, request):
        user = request.user
        return Response({**user_summary(user), 'security_question': user.security_question,
                         'security_questions': SECURITY_QUESTIONS})

    def patch(self, request):
        user = request.user
        data = request.data
        fields = []
        if 'first_name' in data:
            user.first_name = text(data, 'first_name', required=True, label='First name', max_length=50)
            fields.append('first_name')
        if 'last_name' in data:
            user.last_name = text(data, 'last_name', required=True, label='Last name', max_length=50)
            fields.append('last_name')

        new_answer = normalize_answer(data.get('security_answer'))
        new_question = text(data, 'security_question')
        new_password = data.get('new_password') or ''
        if new_answer or new_password or (new_question and new_question != user.security_question):
            if not check_secret(data.get('current_password') or '', user.password):
                raise ValidationError('Enter your current password to change your password or security question.')
        if new_question and new_question != user.security_question:
            if new_question not in SECURITY_QUESTIONS:
                raise ValidationError('Choose one of the listed security questions.')
            if not new_answer:
                raise ValidationError('Give an answer for your new security question.')
            user.security_question = new_question
            fields.append('security_question')
        if new_answer:
            user.security_answer = hash_secret(new_answer)
            fields.append('security_answer')
        if new_password:
            validate_new_password(new_password)
            user.password = hash_secret(new_password)
            fields.append('password')
        if fields:
            user.save(update_fields=fields)
        return Response({**user_summary(user), 'security_question': user.security_question})


class UserLookupView(APIView):
    def get(self, request):
        user = find_user(request.query_params.get('email'))
        if user is None:
            raise NotFound('No portal account uses this email. Ask them to sign up first.')
        return Response(user_summary(user))


# --------------------------------------------------------------------------
# Dashboard
# --------------------------------------------------------------------------

class DashboardView(APIView):
    def get(self, request):
        user = request.user
        links = list(UserProject.objects.filter(email=user).select_related('project_id'))
        projects = [link.project_id for link in links]
        project_ids = [p.project_id for p in projects]
        progress = project_progress(project_ids)
        finals = {t.project_id_id: t for t in Task.objects.filter(project_id__in=project_ids, is_final_submission=True)}
        today = timezone.localdate()

        my_task_ids = set(User_Task.objects.filter(email=user, task_id__project_id__in=project_ids)
                          .values_list('task_id', flat=True))
        my_tasks = list(Task.objects.filter(task_id__in=my_task_ids, is_final_submission=False)
                        .select_related('project_id'))
        open_by_project = defaultdict(int)
        for task in my_tasks:
            if task.task_status == IN_PROGRESS:
                open_by_project[task.project_id_id] += 1

        project_rows = []
        for link in links:
            project = link.project_id
            counts = progress.get(project.project_id, {'total': 0, 'approved': 0, 'submitted': 0})
            total = counts['total']
            project_rows.append({
                'id': project.project_id,
                'name': project.project_name,
                'description': project.project_description or '',
                'due_date': iso(project.due_date),
                'role': link.role,
                'grade': project.grade,
                'status': project_status(project, finals.get(project.project_id), today),
                'progress': round(counts['approved'] * 100 / total) if total else 0,
                'tasks_total': total,
                'tasks_approved': counts['approved'],
                'awaiting_review': counts['submitted'] if link.role in MANAGER_ROLES else 0,
                'my_open_tasks': open_by_project[project.project_id],
            })
        project_rows.sort(key=lambda p: (p['status'] in ('graded', 'submitted'), p['due_date']))

        agenda = []
        for task in my_tasks:
            if task.task_status == IN_PROGRESS:
                agenda.append({
                    'kind': 'task', 'id': task.task_id, 'title': task.task_name,
                    'date': iso(task.task_due_date), 'time': None,
                    'project_id': task.project_id_id, 'project_name': task.project_id.project_name,
                    'priority': task.task_priority,
                })
        for project in projects:
            if project_status(project, finals.get(project.project_id), today) in ('active', 'overdue'):
                agenda.append({
                    'kind': 'project', 'id': project.project_id, 'title': f'{project.project_name} due',
                    'date': iso(project.due_date), 'time': None,
                    'project_id': project.project_id, 'project_name': project.project_name,
                })
        for meeting in Meeting.objects.filter(project_id__in=project_ids).select_related('project_id'):
            when = timezone.localtime(meeting.date_time)
            agenda.append({
                'kind': 'meeting', 'id': meeting.meeting_id, 'title': meeting.meeting_title,
                'date': when.date().isoformat(), 'time': when.strftime('%H:%M'),
                'project_id': meeting.project_id_id, 'project_name': meeting.project_id.project_name,
            })
        agenda.sort(key=lambda item: (item['date'], item['time'] or '99:99'))

        unread = UserNotification.objects.filter(email=user, is_read=False).count()
        return Response({
            'user': user_summary(user),
            'projects': project_rows,
            'agenda': agenda,
            'unread_notifications': unread,
            'today': today.isoformat(),
        })


# --------------------------------------------------------------------------
# Notifications
# --------------------------------------------------------------------------

class NotificationListView(APIView):
    def get(self, request):
        links = (UserNotification.objects.filter(email=request.user)
                 .select_related('notif').order_by('-notif__time_sent')[:60])
        items = [{
            'id': link.notif.notif_id,
            'title': link.notif.title,
            'message': link.notif.message,
            'time_sent': iso(link.notif.time_sent),
            'project_id': link.notif.project_id,
            'is_read': link.is_read,
        } for link in links]
        unread = UserNotification.objects.filter(email=request.user, is_read=False).count()
        return Response({'notifications': items, 'unread': unread})

    def delete(self, request):
        UserNotification.objects.filter(email=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationReadAllView(APIView):
    def post(self, request):
        UserNotification.objects.filter(email=request.user, is_read=False).update(is_read=True)
        return Response({'unread': 0})


class NotificationDetailView(APIView):
    def delete(self, request, notif_id):
        deleted, _ = UserNotification.objects.filter(email=request.user, notif__notif_id=notif_id).delete()
        if not deleted:
            raise NotFound('Notification not found.')
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------
# Projects
# --------------------------------------------------------------------------

def parse_member_list(raw_members, creator, creator_role):
    """Validate [{email, role}] from the create-project form."""
    if creator_role not in ROLES:
        raise ValidationError('Choose your role in this project.')
    members = {creator.email: creator_role}
    for entry in raw_members or []:
        if not isinstance(entry, dict):
            raise ValidationError('Each member needs an email and a role.')
        user = find_user(entry.get('email'))
        if user is None:
            raise ValidationError(f'No portal account uses {entry.get("email")}. Ask them to sign up first.')
        role = entry.get('role')
        if role not in ROLES:
            raise ValidationError(f'Choose a role for {user.email}.')
        members[user.email] = role
    roles = list(members.values())
    if SUPERVISOR not in roles:
        raise ValidationError('Add a supervisor. Every project needs one to grade the final submission.')
    if GROUP_LEADER not in roles:
        raise ValidationError('Add a group leader. Every project needs one to review tasks and hand in.')
    return members


class ProjectCreateView(APIView):
    def post(self, request):
        data = request.data
        name = text(data, 'name', required=True, label='Project name', max_length=100)
        description = text(data, 'description', label='Description', max_length=5000)
        due_date = parse_date(data.get('due_date'), 'Due date')
        if due_date < timezone.localdate():
            raise ValidationError('The due date cannot be in the past.')
        members = parse_member_list(data.get('members'), request.user, data.get('my_role'))

        with transaction.atomic():
            project = Project.objects.create(
                project_name=name,
                project_description=description,
                due_date=due_date,
                created_on=timezone.localdate(),
            )
            users = {u.email: u for u in User.objects.filter(email__in=members.keys())}
            UserProject.objects.bulk_create([
                UserProject(email=users[email], project_id=project, role=role)
                for email, role in members.items()
            ])
            perms.final_task(project)

        creator = request.user.full_name or request.user.email
        for email, role in members.items():
            notify([email], 'Added to a project',
                   f'{creator} added you to "{name}" as {role.lower()}.',
                   project=project, exclude=request.user)
        return Response({'id': project.project_id}, status=status.HTTP_201_CREATED)


class ProjectDetailView(APIView):
    def get(self, request, project_id):
        project, role = perms.membership(request.user, project_id)
        final = perms.final_task(project)
        tasks = list(Task.objects.filter(project_id=project).order_by('task_due_date', 'task_id'))
        assignees = task_assignees(tasks)
        documents = task_documents(tasks)
        regular = [task_dict(t, assignees, documents) for t in tasks if not t.is_final_submission]
        approved = sum(1 for t in regular if t['status'] == APPROVED)

        members = [
            {**user_summary(link.email), 'role': link.role}
            for link in UserProject.objects.filter(project_id=project).select_related('email')
        ]
        role_order = {SUPERVISOR: 0, GROUP_LEADER: 1, STUDENT: 2}
        members.sort(key=lambda m: (role_order.get(m['role'], 3), m['name'].lower()))

        permissions = perms.permissions_for(project, role)
        return Response({
            'project': {
                'id': project.project_id,
                'name': project.project_name,
                'description': project.project_description or '',
                'due_date': iso(project.due_date),
                'created_on': iso(project.created_on),
                'grade': project.grade,
                'feedback': project.feedback or '',
                'status': project_status(project, final),
                'progress': round(approved * 100 / len(regular)) if regular else 0,
            },
            'my_role': role,
            'me': request.user.email,
            'permissions': permissions,
            'members': members,
            'tasks': regular,
            'final_submission': task_dict(final, assignees, documents),
            'meetings': [
                {'id': m.meeting_id, 'title': m.meeting_title, 'date_time': iso(m.date_time)}
                for m in Meeting.objects.filter(project_id=project).order_by('date_time')
            ],
            'links': [
                {'id': link.link_id, 'name': link.link_name, 'url': link.link_url}
                for link in ProjectLinks.objects.filter(project=project).order_by('link_id')
            ],
            'contributions': contributions(project, members, tasks, assignees)
            if permissions['can_view_contributions'] else None,
        })

    def patch(self, request, project_id):
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, (SUPERVISOR,), 'Only a supervisor can edit the project details.')
        perms.require_editable(project)
        data = request.data
        if 'name' in data:
            project.project_name = text(data, 'name', required=True, label='Project name', max_length=100)
        if 'description' in data:
            project.project_description = text(data, 'description', max_length=5000)
        due_changed = False
        if 'due_date' in data:
            new_due = parse_date(data.get('due_date'), 'Due date')
            due_changed = new_due != project.due_date
            project.due_date = new_due
        project.save()
        if due_changed:
            touch_final_due_date(project)
        message = f'{request.user.full_name} updated the details of "{project.project_name}".'
        if due_changed:
            message += f' The due date is now {project.due_date:%d %B %Y}.'
        notify(member_emails(project), 'Project details updated', message, project=project, exclude=request.user)
        return Response({'message': 'Project details saved.'})

    def delete(self, request, project_id):
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, (SUPERVISOR,), 'Only a supervisor can delete a project.')
        name = project.project_name
        recipients = member_emails(project)
        with transaction.atomic():
            message_ids = list(ProjectChat.objects.filter(project_id=project).values_list('chat_message_id', flat=True))
            project.delete()  # Cascades to tasks, documents, members, meetings, links and chat links
            ChatMessage.objects.filter(chat_message_id__in=message_ids).delete()
        notify(recipients, 'Project deleted', f'{request.user.full_name} deleted the project "{name}".',
               exclude=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


def contributions(project, members, tasks, assignees):
    """Who did what: task assignments, approvals and uploads per member."""
    regular = [t for t in tasks if not t.is_final_submission]
    approved_ids = {t.task_id for t in regular if t.task_status == APPROVED}
    uploads = dict(
        Document.objects.filter(task_id__in=tasks).values('last_modified_by')
        .annotate(n=Count('document_id')).values_list('last_modified_by', 'n')
    )
    approved_assignments = sum(len(assignees.get(tid, [])) for tid in approved_ids)
    rows = []
    for member in members:
        if member['role'] == SUPERVISOR:
            continue
        mine = [t for t in regular if any(a['email'] == member['email'] for a in assignees.get(t.task_id, []))]
        approved = [t for t in mine if t.task_id in approved_ids]
        rows.append({
            'email': member['email'],
            'name': member['name'],
            'role': member['role'],
            'tasks_assigned': len(mine),
            'tasks_approved': len(approved),
            'documents_uploaded': uploads.get(member['email'], 0),
            'share': round(len(approved) * 100 / approved_assignments) if approved_assignments else 0,
        })
    rows.sort(key=lambda r: (-r['tasks_approved'], r['name'].lower()))
    return rows


# --------------------------------------------------------------------------
# Members
# --------------------------------------------------------------------------

def role_counts_after(project, email, new_role):
    counts = defaultdict(int)
    for link in UserProject.objects.filter(project_id=project):
        role = new_role if link.email_id == email else link.role
        if role:
            counts[role] += 1
    return counts


def check_minimum_roles(counts, action):
    if counts[SUPERVISOR] < 1:
        raise ValidationError(f'Cannot {action}: the project needs at least one supervisor.')
    if counts[GROUP_LEADER] < 1:
        raise ValidationError(f'Cannot {action}: the project needs at least one group leader.')


class MemberListView(APIView):
    def post(self, request, project_id):
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, (SUPERVISOR,), 'Only a supervisor can add members.')
        perms.require_editable(project)
        user = find_user(request.data.get('email'))
        if user is None:
            raise ValidationError('No portal account uses this email. Ask them to sign up first.')
        new_role = request.data.get('role')
        if new_role not in ROLES:
            raise ValidationError('Choose a role for the new member.')
        if UserProject.objects.filter(project_id=project, email=user).exists():
            raise ValidationError(f'{user.full_name} is already a member of this project.')
        UserProject.objects.create(project_id=project, email=user, role=new_role)
        notify([user], 'Added to a project',
               f'{request.user.full_name} added you to "{project.project_name}" as {new_role.lower()}.',
               project=project)
        return Response({**user_summary(user), 'role': new_role}, status=status.HTTP_201_CREATED)


class MemberDetailView(APIView):
    def _link(self, project, email):
        link = UserProject.objects.select_related('email').filter(project_id=project, email_id=email).first()
        if link is None:
            raise NotFound('That person is not a member of this project.')
        return link

    def patch(self, request, project_id, email):
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, (SUPERVISOR,), 'Only a supervisor can change roles.')
        perms.require_editable(project)
        link = self._link(project, email)
        new_role = request.data.get('role')
        if new_role not in ROLES:
            raise ValidationError('Choose a valid role.')
        if new_role == link.role:
            return Response({'message': 'No change.'})
        check_minimum_roles(role_counts_after(project, link.email_id, new_role), 'change this role')
        if new_role == SUPERVISOR:
            open_tasks = User_Task.objects.filter(
                email=link.email, task_id__project_id=project, task_id__is_final_submission=False,
            ).exclude(task_id__task_status=APPROVED).count()
            if open_tasks:
                raise ValidationError(
                    f'{link.email.full_name} still has {open_tasks} open task(s). '
                    'Reassign them before making this person a supervisor.'
                )
        link.role = new_role
        link.save(update_fields=['role'])
        notify([link.email], 'Your role changed',
               f'{request.user.full_name} changed your role in "{project.project_name}" to {new_role.lower()}.',
               project=project)
        return Response({'message': 'Role updated.'})

    def delete(self, request, project_id, email):
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, (SUPERVISOR,), 'Only a supervisor can remove members.')
        perms.require_editable(project)
        link = self._link(project, email)
        check_minimum_roles(role_counts_after(project, link.email_id, None), 'remove this member')
        with transaction.atomic():
            User_Task.objects.filter(email=link.email, task_id__project_id=project).delete()
            link.delete()
        notify([link.email], 'Removed from a project',
               f'{request.user.full_name} removed you from "{project.project_name}".')
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------
# Tasks
# --------------------------------------------------------------------------

def resolve_assignees(project, emails):
    emails = {normalize_email(e) for e in (emails or []) if e}
    if not emails:
        return []
    links = {link.email_id.lower(): link.email for link in
             UserProject.objects.filter(project_id=project).select_related('email')}
    missing = [e for e in emails if e not in links]
    if missing:
        raise ValidationError(f'{", ".join(missing)} is not a member of this project.')
    return [links[e] for e in emails]


def reopen_final_if_needed(project, actor):
    """Adding work after hand-in reopens the submission so leaders can resubmit."""
    final = perms.final_task(project)
    if final.task_status == APPROVED:
        final.task_status = IN_PROGRESS
        final.save(update_fields=['task_status'])
        notify(member_emails(project, (GROUP_LEADER,)), 'Submission reopened',
               f'A new task was added to "{project.project_name}", so the final submission has been reopened. '
               'Submit again once all tasks are approved.', project=project, exclude=actor)


class TaskListView(APIView):
    def post(self, request, project_id):
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, MANAGER_ROLES, 'Only group leaders and supervisors can create tasks.')
        perms.require_editable(project)
        data = request.data
        name = text(data, 'name', required=True, label='Task name', max_length=100)
        priority = data.get('priority') or 'Medium'
        if priority not in PRIORITIES:
            raise ValidationError('Priority must be Low, Medium or High.')
        due = parse_date(data.get('due_date'), 'Due date')
        assignees = resolve_assignees(project, data.get('assignees'))
        with transaction.atomic():
            task = Task.objects.create(
                task_name=name,
                task_description=text(data, 'description', max_length=5000),
                task_due_date=due,
                task_status=IN_PROGRESS,
                task_priority=priority,
                project_id=project,
            )
            User_Task.objects.bulk_create([User_Task(task_id=task, email=u) for u in assignees])
            reopen_final_if_needed(project, request.user)
        notify(assignees, 'New task assigned',
               f'You have been assigned "{name}" in "{project.project_name}", due {due:%d %B %Y}.',
               project=project, exclude=request.user)
        return Response({'id': task.task_id}, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    def patch(self, request, task_id):
        task, project, role = perms.task_in_project_for(request.user, task_id)
        perms.require_role(role, MANAGER_ROLES, 'Only group leaders and supervisors can edit tasks.')
        perms.require_editable(project)
        if task.is_final_submission:
            raise ValidationError('The final submission is managed from the Submission tab.')
        if task.task_status == APPROVED:
            raise ValidationError('Approved tasks cannot be edited.')
        data = request.data
        if 'name' in data:
            task.task_name = text(data, 'name', required=True, label='Task name', max_length=100)
        if 'description' in data:
            task.task_description = text(data, 'description', max_length=5000)
        if 'due_date' in data:
            task.task_due_date = parse_date(data.get('due_date'), 'Due date')
        if 'priority' in data:
            if data['priority'] not in PRIORITIES:
                raise ValidationError('Priority must be Low, Medium or High.')
            task.task_priority = data['priority']
        added, removed = [], []
        with transaction.atomic():
            task.save()
            if 'assignees' in data:
                wanted = {u.email: u for u in resolve_assignees(project, data.get('assignees'))}
                current = {link.email_id: link for link in User_Task.objects.filter(task_id=task).select_related('email')}
                for email, link in current.items():
                    if email not in wanted:
                        removed.append(link.email)
                        link.delete()
                for email, user in wanted.items():
                    if email not in current:
                        added.append(user)
                        User_Task.objects.create(task_id=task, email=user)
        notify(added, 'New task assigned',
               f'You have been assigned "{task.task_name}" in "{project.project_name}".',
               project=project, exclude=request.user)
        notify(removed, 'Removed from a task',
               f'You are no longer assigned to "{task.task_name}" in "{project.project_name}".',
               project=project, exclude=request.user)
        return Response({'message': 'Task saved.'})

    def delete(self, request, task_id):
        task, project, role = perms.task_in_project_for(request.user, task_id)
        perms.require_role(role, MANAGER_ROLES, 'Only group leaders and supervisors can delete tasks.')
        perms.require_editable(project)
        if task.is_final_submission:
            raise ValidationError('The final submission task cannot be deleted.')
        recipients = list(User_Task.objects.filter(task_id=task).values_list('email_id', flat=True))
        name = task.task_name
        task.delete()
        notify(recipients, 'Task deleted', f'"{name}" was deleted from "{project.project_name}".',
               project=project, exclude=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskSubmitView(APIView):
    """An assignee hands their task in for review."""

    def post(self, request, task_id):
        task, project, role = perms.task_in_project_for(request.user, task_id)
        perms.require_editable(project)
        if task.is_final_submission:
            raise ValidationError('Use the Submission tab to hand in the project.')
        if not User_Task.objects.filter(task_id=task, email=request.user).exists():
            raise PermissionDenied('Only people assigned to this task can submit it.')
        if task.task_status != IN_PROGRESS:
            raise ValidationError('This task has already been submitted.')
        task.task_status = SUBMITTED
        task.save(update_fields=['task_status'])
        reviewers = member_emails(project, (GROUP_LEADER,)) or member_emails(project, (SUPERVISOR,))
        notify(reviewers, 'Task ready for review',
               f'{request.user.full_name} submitted "{task.task_name}" in "{project.project_name}" for review.',
               project=project, exclude=request.user)
        return Response({'status': task.task_status})


class TaskReviewView(APIView):
    """A group leader or supervisor approves a submitted task or sends it back."""

    def post(self, request, task_id):
        task, project, role = perms.task_in_project_for(request.user, task_id)
        perms.require_role(role, MANAGER_ROLES, 'Only group leaders and supervisors can review tasks.')
        perms.require_editable(project)
        if task.task_status != SUBMITTED:
            raise ValidationError('Only tasks awaiting review can be approved or sent back.')
        decision = request.data.get('decision')
        note = text(request.data, 'note', max_length=1000)
        assignees = list(User_Task.objects.filter(task_id=task).values_list('email_id', flat=True))
        if decision == 'approve':
            task.task_status = APPROVED
            title = 'Task approved'
            message = f'{request.user.full_name} approved "{task.task_name}" in "{project.project_name}".'
        elif decision == 'reject':
            if not note:
                raise ValidationError('Say what needs to change so the team knows what to fix.')
            task.task_status = IN_PROGRESS
            title = 'Changes requested'
            message = f'{request.user.full_name} sent "{task.task_name}" back for changes.'
        else:
            raise ValidationError('Decision must be "approve" or "reject".')
        if note:
            message += f' Note: {note}'
        task.save(update_fields=['task_status'])
        notify(assignees, title, message, project=project, exclude=request.user)
        return Response({'status': task.task_status})


# --------------------------------------------------------------------------
# Documents
# --------------------------------------------------------------------------

def can_change_documents(task, project, role, user, allow_managers=False):
    """Uploads go to open tasks you are assigned to; leaders may also tidy up."""
    if perms.is_graded(project) or task.task_status != IN_PROGRESS:
        return False
    if task.is_final_submission:
        return role == GROUP_LEADER
    if allow_managers and role in MANAGER_ROLES:
        return True
    return User_Task.objects.filter(task_id=task, email=user).exists()


class TaskDocumentsView(APIView):
    def post(self, request, task_id):
        task, project, role = perms.task_in_project_for(request.user, task_id)
        if not can_change_documents(task, project, role, request.user):
            raise PermissionDenied('You can only upload to open tasks you are assigned to.')
        upload = request.FILES.get('file')
        if upload is None:
            raise ValidationError('Choose a file to upload.')
        ext = os.path.splitext(upload.name)[1].lower()
        if ext not in ALLOWED_UPLOAD_EXTENSIONS:
            raise ValidationError('That file type is not supported. Upload a document, spreadsheet, '
                                  'presentation, image or ZIP file.')
        if upload.size > settings.MAX_UPLOAD_SIZE:
            raise ValidationError(f'Files can be at most {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB.')
        title = os.path.basename(upload.name)[:200]
        mime = mimetypes.guess_type(title)[0] or upload.content_type or 'application/octet-stream'
        doc = Document.objects.create(
            task_id=task,
            document_title=title,
            doc_type=mime,
            last_modified_by=request.user,
            file=upload,
        )
        return Response(document_dict(doc), status=status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    def _doc(self, request, document_id):
        doc = Document.objects.select_related('task_id', 'task_id__project_id').filter(document_id=document_id).first()
        if doc is None or doc.task_id is None:
            raise NotFound('Document not found.')
        project, role = perms.membership(request.user, doc.task_id.project_id_id)
        return doc, project, role

    def get(self, request, document_id):
        doc, project, role = self._doc(request, document_id)
        try:
            handle = doc.file.open('rb')
        except (FileNotFoundError, ValueError):
            raise NotFound('The file for this document is missing on the server.')
        filename = os.path.basename(doc.document_title) or f'document-{doc.document_id}'
        content_type = mimetypes.guess_type(filename)[0] or doc.doc_type or 'application/octet-stream'
        return FileResponse(handle, as_attachment=True, filename=filename, content_type=content_type)

    def delete(self, request, document_id):
        doc, project, role = self._doc(request, document_id)
        task = doc.task_id
        is_owner = doc.last_modified_by_id == request.user.email
        if not (can_change_documents(task, project, role, request.user, allow_managers=True)
                and (is_owner or role in MANAGER_ROLES)):
            raise PermissionDenied('Documents can only be removed from open tasks by the uploader or a group leader.')
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------
# Final submission and grading
# --------------------------------------------------------------------------

class SubmissionView(APIView):
    def post(self, request, project_id):
        """Group leader hands the project in."""
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, (GROUP_LEADER,), 'Only a group leader can hand in the project.')
        perms.require_editable(project)
        final = perms.final_task(project)
        if final.task_status == APPROVED:
            raise ValidationError('The project has already been handed in.')
        unfinished = Task.objects.filter(project_id=project, is_final_submission=False).exclude(task_status=APPROVED).count()
        if unfinished:
            raise ValidationError(f'{unfinished} task(s) still need to be approved before you can hand in.')
        if not Document.objects.filter(task_id=final).exists():
            raise ValidationError('Upload at least one final document before handing in.')
        final.task_status = APPROVED
        final.save(update_fields=['task_status'])
        notify(member_emails(project, (SUPERVISOR,)), 'Project handed in',
               f'{request.user.full_name} handed in "{project.project_name}". It is ready for grading.',
               project=project, exclude=request.user)
        notify(member_emails(project, (STUDENT, GROUP_LEADER)), 'Project handed in',
               f'"{project.project_name}" was handed in for grading.', project=project, exclude=request.user)
        return Response({'status': final.task_status})

    def delete(self, request, project_id):
        """Group leader withdraws the hand-in to make changes (only before grading)."""
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, (GROUP_LEADER,), 'Only a group leader can withdraw the hand-in.')
        perms.require_editable(project)
        final = perms.final_task(project)
        if final.task_status != APPROVED:
            raise ValidationError('The project has not been handed in yet.')
        final.task_status = IN_PROGRESS
        final.save(update_fields=['task_status'])
        notify(member_emails(project, (SUPERVISOR,)), 'Hand-in withdrawn',
               f'{request.user.full_name} withdrew the hand-in for "{project.project_name}" to make changes.',
               project=project, exclude=request.user)
        return Response({'status': final.task_status})


class GradeView(APIView):
    def post(self, request, project_id):
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, (SUPERVISOR,), 'Only a supervisor can grade the project.')
        if not perms.is_submitted(project):
            raise ValidationError('The project can be graded once the group leader has handed it in.')
        try:
            grade = int(str(request.data.get('grade')).strip())
        except (TypeError, ValueError):
            raise ValidationError('Enter the grade as a whole number from 0 to 100.')
        if not 0 <= grade <= 100:
            raise ValidationError('Enter the grade as a whole number from 0 to 100.')
        feedback = text(request.data, 'feedback', required=True, label='Feedback', max_length=5000)
        regrade = perms.is_graded(project)
        project.grade = grade
        project.feedback = feedback
        project.save(update_fields=['grade', 'feedback'])
        notify(member_emails(project), 'Grade updated' if regrade else 'Project graded',
               f'"{project.project_name}" received {grade}%. Open the project to read the feedback.',
               project=project, exclude=request.user)
        return Response({'grade': grade, 'feedback': feedback})


# --------------------------------------------------------------------------
# Chat
# --------------------------------------------------------------------------

def message_dict(msg):
    return {
        'id': msg.chat_message_id,
        'sender': user_summary(msg.email),
        'role': msg.Role,
        'content': msg.content,
        'sent_at': iso(msg.sent_at),
    }


class ChatView(APIView):
    def get(self, request, project_id):
        project, role = perms.membership(request.user, project_id)
        messages = (ChatMessage.objects.filter(projectchat__project_id=project)
                    .select_related('email').order_by('chat_message_id'))
        after = request.query_params.get('after')
        if after and str(after).isdigit():
            messages = messages.filter(chat_message_id__gt=int(after))
        else:
            messages = messages.reverse()[:200][::-1]
        return Response({'messages': [message_dict(m) for m in messages]})

    def post(self, request, project_id):
        project, role = perms.membership(request.user, project_id)
        perms.require_editable(project)
        content = text(request.data, 'content', required=True, label='Message', max_length=MAX_CHAT_LENGTH)
        with transaction.atomic():
            msg = ChatMessage.objects.create(email=request.user, content=content, Role=role)
            ProjectChat.objects.create(project_id=project, chat_message=msg)
        return Response(message_dict(msg), status=status.HTTP_201_CREATED)


# --------------------------------------------------------------------------
# Meetings and links
# --------------------------------------------------------------------------

class MeetingListView(APIView):
    def post(self, request, project_id):
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, MANAGER_ROLES, 'Only group leaders and supervisors can schedule meetings.')
        perms.require_editable(project)
        title = text(request.data, 'title', required=True, label='Meeting title', max_length=200)
        when = parse_datetime(request.data.get('date_time'))
        if when < timezone.now():
            raise ValidationError('Choose a date and time in the future.')
        meeting = Meeting.objects.create(project_id=project, meeting_title=title, date_time=when)
        local = timezone.localtime(when)
        notify(member_emails(project), 'Meeting scheduled',
               f'"{title}" for "{project.project_name}" on {local:%A %d %B at %H:%M}.',
               project=project, exclude=request.user)
        return Response({'id': meeting.meeting_id, 'title': title, 'date_time': iso(when)},
                        status=status.HTTP_201_CREATED)


class MeetingDetailView(APIView):
    def delete(self, request, meeting_id):
        meeting = Meeting.objects.select_related('project_id').filter(meeting_id=meeting_id).first()
        if meeting is None:
            raise NotFound('Meeting not found.')
        project, role = perms.membership(request.user, meeting.project_id_id)
        perms.require_role(role, MANAGER_ROLES, 'Only group leaders and supervisors can cancel meetings.')
        perms.require_editable(project)
        title, when = meeting.meeting_title, timezone.localtime(meeting.date_time)
        meeting.delete()
        if when > timezone.now():
            notify(member_emails(project), 'Meeting cancelled',
                   f'"{title}" on {when:%A %d %B at %H:%M} was cancelled.',
                   project=project, exclude=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class LinkListView(APIView):
    def post(self, request, project_id):
        project, role = perms.membership(request.user, project_id)
        perms.require_role(role, MANAGER_ROLES, 'Only group leaders and supervisors can add links.')
        perms.require_editable(project)
        name = text(request.data, 'name', required=True, label='Link name', max_length=100)
        url = text(request.data, 'url', required=True, label='Link address', max_length=500)
        if not url.lower().startswith(('http://', 'https://')):
            url = 'https://' + url
        try:
            URLValidator(schemes=['http', 'https'])(url)
        except DjangoValidationError:
            raise ValidationError('Enter a full web address, for example https://example.com.')
        link = ProjectLinks.objects.create(project=project, link_name=name, link_url=url)
        return Response({'id': link.link_id, 'name': name, 'url': url}, status=status.HTTP_201_CREATED)


class LinkDetailView(APIView):
    def delete(self, request, link_id):
        link = ProjectLinks.objects.filter(link_id=link_id).first()
        if link is None:
            raise NotFound('Link not found.')
        project, role = perms.membership(request.user, link.project_id)
        perms.require_role(role, MANAGER_ROLES, 'Only group leaders and supervisors can remove links.')
        perms.require_editable(project)
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
