import io
import shutil
from datetime import timedelta

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .auth import hash_secret, issue_access_token
from .models import Notification, Project, Task, User, User_Task, UserNotification, UserProject

PASSWORD = 'correct-horse-battery'
TEMP_MEDIA = override_settings(MEDIA_ROOT='test-media-tmp')


def make_user(email, first='Test', last='User'):
    return User.objects.create(
        email=email, first_name=first, last_name=last,
        password=hash_secret(PASSWORD),
        security_question='What is your favourite snack?',
        security_answer=hash_secret('biltong'),
    )


class PortalTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # reset auth throttling between tests
        self.sup = make_user('sup@nwu.ac.za', 'Sam', 'Supervisor')
        self.lead = make_user('lead@nwu.ac.za', 'Lee', 'Leader')
        self.stu = make_user('stu@nwu.ac.za', 'Stu', 'Dent')
        self.outsider = make_user('out@nwu.ac.za', 'Out', 'Sider')

    def as_user(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {issue_access_token(user)}')

    def create_project(self):
        self.as_user(self.sup)
        due = (timezone.localdate() + timedelta(days=14)).isoformat()
        res = self.client.post('/api/projects/', {
            'name': 'Capstone', 'description': 'Build it', 'due_date': due, 'my_role': 'Supervisor',
            'members': [{'email': 'lead@nwu.ac.za', 'role': 'Group Leader'},
                        {'email': 'STU@nwu.ac.za ', 'role': 'Student'}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data['id']

    def unread_titles(self, user):
        return list(UserNotification.objects.filter(email=user).values_list('notif__title', flat=True))


class AuthTests(PortalTestCase):
    def test_register_then_login(self):
        res = self.client.post('/api/auth/register/', {
            'email': 'New@NWU.ac.za', 'first_name': 'New', 'last_name': 'Person', 'password': PASSWORD,
            'security_question': 'What is your favourite snack?', 'security_answer': ' Biltong ',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertIn('access', res.data)
        res = self.client.post('/api/auth/login/', {'email': 'new@nwu.ac.za', 'password': PASSWORD})
        self.assertEqual(res.status_code, 200)

    def test_weak_password_rejected(self):
        res = self.client.post('/api/auth/register/', {
            'email': 'weak@nwu.ac.za', 'first_name': 'W', 'last_name': 'P', 'password': '1234',
            'security_question': 'What is your favourite snack?', 'security_answer': 'x',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('error', res.data)

    def test_bad_login(self):
        res = self.client.post('/api/auth/login/', {'email': 'sup@nwu.ac.za', 'password': 'nope'})
        self.assertEqual(res.status_code, 401)

    def test_api_requires_token(self):
        self.assertEqual(self.client.get('/api/dashboard/').status_code, 401)

    def test_password_reset_requires_verified_answer(self):
        # The old API let anyone set a new password with just an email.
        res = self.client.post('/api/auth/forgot/reset/', {'reset_token': 'forged', 'password': 'new-strong-pass-1'})
        self.assertEqual(res.status_code, 400)
        res = self.client.post('/api/auth/forgot/verify/', {'email': 'stu@nwu.ac.za', 'security_answer': 'wrong'})
        self.assertEqual(res.status_code, 400)

        res = self.client.post('/api/auth/forgot/verify/', {'email': 'stu@nwu.ac.za', 'security_answer': 'BILTONG'})
        self.assertEqual(res.status_code, 200)
        token = res.data['reset_token']
        res = self.client.post('/api/auth/forgot/reset/', {'reset_token': token, 'password': 'new-strong-pass-1'})
        self.assertEqual(res.status_code, 200)
        # A reset token works once.
        res = self.client.post('/api/auth/forgot/reset/', {'reset_token': token, 'password': 'another-pass-22'})
        self.assertEqual(res.status_code, 400)
        res = self.client.post('/api/auth/login/', {'email': 'stu@nwu.ac.za', 'password': 'new-strong-pass-1'})
        self.assertEqual(res.status_code, 200)

    def test_password_change_needs_current_password(self):
        self.as_user(self.stu)
        res = self.client.patch('/api/me/', {'new_password': 'brand-new-pass-9'}, format='json')
        self.assertEqual(res.status_code, 400)
        res = self.client.patch('/api/me/', {'new_password': 'brand-new-pass-9', 'current_password': PASSWORD},
                                format='json')
        self.assertEqual(res.status_code, 200)


class ProjectTests(PortalTestCase):
    def test_create_requires_supervisor_and_leader(self):
        self.as_user(self.stu)
        res = self.client.post('/api/projects/', {
            'name': 'X', 'due_date': (timezone.localdate() + timedelta(days=3)).isoformat(),
            'my_role': 'Student', 'members': [{'email': 'lead@nwu.ac.za', 'role': 'Group Leader'}],
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('supervisor', res.data['error'])

    def test_create_sets_roles_and_notifies(self):
        pid = self.create_project()
        roles = dict(UserProject.objects.filter(project_id=pid).values_list('email_id', 'role'))
        self.assertEqual(roles, {'sup@nwu.ac.za': 'Supervisor', 'lead@nwu.ac.za': 'Group Leader',
                                 'stu@nwu.ac.za': 'Student'})
        self.assertTrue(Task.objects.filter(project_id=pid, is_final_submission=True).exists())
        self.assertIn('Added to a project', self.unread_titles(self.stu))
        self.assertNotIn('Added to a project', self.unread_titles(self.sup))

    def test_outsider_cannot_see_project(self):
        pid = self.create_project()
        self.as_user(self.outsider)
        self.assertEqual(self.client.get(f'/api/projects/{pid}/').status_code, 404)

    def test_role_permissions(self):
        pid = self.create_project()
        self.as_user(self.stu)
        res = self.client.get(f'/api/projects/{pid}/')
        self.assertEqual(res.data['my_role'], 'Student')
        self.assertFalse(res.data['permissions']['can_manage_tasks'])
        self.assertIsNone(res.data['contributions'])
        res = self.client.post(f'/api/projects/{pid}/tasks/', {'name': 'x', 'due_date': '2030-01-01'}, format='json')
        self.assertEqual(res.status_code, 403)
        res = self.client.patch(f'/api/projects/{pid}/', {'name': 'Hacked'}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_cannot_remove_last_leader(self):
        pid = self.create_project()
        self.as_user(self.sup)
        res = self.client.delete(f'/api/projects/{pid}/members/lead@nwu.ac.za/')
        self.assertEqual(res.status_code, 400)
        res = self.client.delete(f'/api/projects/{pid}/members/stu@nwu.ac.za/')
        self.assertEqual(res.status_code, 204)
        self.assertIn('Removed from a project', self.unread_titles(self.stu))


@TEMP_MEDIA
class WorkflowTests(PortalTestCase):
    def tearDown(self):
        shutil.rmtree('test-media-tmp', ignore_errors=True)

    def upload(self, task_id, name='report.pdf'):
        return self.client.post(f'/api/tasks/{task_id}/documents/',
                                {'file': SimpleUploadedFile(name, b'%PDF-1.4 test')}, format='multipart')

    def test_full_project_lifecycle(self):
        pid = self.create_project()

        # Leader creates a task for the student.
        self.as_user(self.lead)
        res = self.client.post(f'/api/projects/{pid}/tasks/', {
            'name': 'Literature review', 'due_date': (timezone.localdate() + timedelta(days=5)).isoformat(),
            'priority': 'High', 'assignees': ['stu@nwu.ac.za'],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        task_id = res.data['id']
        self.assertIn('New task assigned', self.unread_titles(self.stu))

        # Outsiders and non-assignees cannot upload.
        self.as_user(self.outsider)
        self.assertEqual(self.upload(task_id).status_code, 404)

        # Student uploads and submits.
        self.as_user(self.stu)
        self.assertEqual(self.upload(task_id, 'evil.exe').status_code, 400)
        self.assertEqual(self.upload(task_id).status_code, 201)
        self.assertEqual(self.client.post(f'/api/tasks/{task_id}/submit/').status_code, 200)
        self.assertIn('Task ready for review', self.unread_titles(self.lead))

        # Leader cannot hand in while work is unapproved; rejecting needs a note.
        self.as_user(self.lead)
        res = self.client.post(f'/api/tasks/{task_id}/review/', {'decision': 'reject'}, format='json')
        self.assertEqual(res.status_code, 400)
        res = self.client.post(f'/api/tasks/{task_id}/review/', {'decision': 'reject', 'note': 'Add sources'},
                               format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('Changes requested', self.unread_titles(self.stu))

        self.as_user(self.stu)
        self.client.post(f'/api/tasks/{task_id}/submit/')
        self.as_user(self.lead)
        res = self.client.post(f'/api/tasks/{task_id}/review/', {'decision': 'approve'}, format='json')
        self.assertEqual(res.status_code, 200)

        # Hand-in needs a final document.
        final_id = self.client.get(f'/api/projects/{pid}/').data['final_submission']['id']
        self.assertEqual(self.client.post(f'/api/projects/{pid}/submission/').status_code, 400)
        self.assertEqual(self.upload(final_id, 'final.docx').status_code, 201)
        self.assertEqual(self.client.post(f'/api/projects/{pid}/submission/').status_code, 200)
        self.assertIn('Project handed in', self.unread_titles(self.sup))

        # Supervisor grades; project becomes read-only.
        self.as_user(self.sup)
        detail = self.client.get(f'/api/projects/{pid}/').data
        self.assertTrue(detail['permissions']['can_grade'])
        stu_row = next(r for r in detail['contributions'] if r['email'] == 'stu@nwu.ac.za')
        self.assertEqual(stu_row['tasks_approved'], 1)
        self.assertEqual(stu_row['share'], 100)
        res = self.client.post(f'/api/projects/{pid}/grade/', {'grade': 150, 'feedback': 'x'}, format='json')
        self.assertEqual(res.status_code, 400)
        res = self.client.post(f'/api/projects/{pid}/grade/', {'grade': 78, 'feedback': 'Solid work'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Project.objects.get(pk=pid).grade, 78)
        self.assertIn('Project graded', self.unread_titles(self.stu))

        self.as_user(self.stu)
        res = self.client.post(f'/api/projects/{pid}/chat/', {'content': 'hello'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(self.client.get(f'/api/projects/{pid}/').data['permissions']['read_only'])

    def test_new_task_reopens_submission(self):
        pid = self.create_project()
        self.as_user(self.lead)
        final_id = self.client.get(f'/api/projects/{pid}/').data['final_submission']['id']
        self.upload(final_id, 'final.pdf')
        self.assertEqual(self.client.post(f'/api/projects/{pid}/submission/').status_code, 200)
        self.client.post(f'/api/projects/{pid}/tasks/', {'name': 'Late fix', 'due_date': '2030-01-01'},
                         format='json')
        self.assertEqual(Task.objects.get(pk=final_id).task_status, 'In Progress')

    def test_chat_incremental_fetch(self):
        pid = self.create_project()
        self.as_user(self.stu)
        first = self.client.post(f'/api/projects/{pid}/chat/', {'content': 'one'}, format='json').data
        self.client.post(f'/api/projects/{pid}/chat/', {'content': 'two'}, format='json')
        res = self.client.get(f'/api/projects/{pid}/chat/?after={first["id"]}')
        self.assertEqual([m['content'] for m in res.data['messages']], ['two'])
        self.assertEqual(res.data['messages'][0]['role'], 'Student')


class DashboardAndNotificationTests(PortalTestCase):
    def test_dashboard_and_notifications(self):
        pid = self.create_project()
        self.as_user(self.stu)
        data = self.client.get('/api/dashboard/').data
        self.assertEqual(data['projects'][0]['id'], pid)
        self.assertEqual(data['projects'][0]['role'], 'Student')
        self.assertEqual(data['unread_notifications'], 1)
        self.assertTrue(any(item['kind'] == 'project' for item in data['agenda']))

        notes = self.client.get('/api/notifications/').data
        self.assertEqual(notes['unread'], 1)
        self.assertEqual(notes['notifications'][0]['project_id'], pid)
        self.client.post('/api/notifications/read-all/')
        self.assertEqual(self.client.get('/api/notifications/').data['unread'], 0)

    def test_due_reminders_are_not_duplicated(self):
        pid = self.create_project()
        project = Project.objects.get(pk=pid)
        task = Task.objects.create(task_name='Draft', task_due_date=timezone.localdate() + timedelta(days=1),
                                   task_status='In Progress', task_priority='Low', project_id=project)
        User_Task.objects.create(task_id=task, email=self.stu)
        call_command('send_due_reminders', stdout=io.StringIO())
        call_command('send_due_reminders', stdout=io.StringIO())
        self.assertEqual(Notification.objects.filter(title='Due tomorrow: Draft').count(), 1)
