"""Remind members about tasks and projects due tomorrow.

Run once a day, e.g. as a Render cron job:  python manage.py send_due_reminders
Running it more than once on the same day does not send duplicates.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from pcp_webapp.models import Notification, Task, User_Task
from pcp_webapp.permissions import APPROVED, IN_PROGRESS, is_graded
from pcp_webapp.utils import member_emails, notify


def already_sent(title, project, since):
    return Notification.objects.filter(title=title, project=project, time_sent__gte=since).exists()


class Command(BaseCommand):
    help = 'Send reminders for tasks and projects due tomorrow.'

    def handle(self, *args, **options):
        now = timezone.localtime()
        tomorrow = now.date() + timedelta(days=1)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        sent = 0

        tasks = Task.objects.filter(task_due_date=tomorrow, task_status=IN_PROGRESS, is_final_submission=False)
        for task in tasks.select_related('project_id'):
            project = task.project_id
            title = f'Due tomorrow: {task.task_name}'[:100]
            if is_graded(project) or already_sent(title, project, start_of_day):
                continue
            assignees = User_Task.objects.filter(task_id=task).values_list('email_id', flat=True)
            notify(assignees, title, f'"{task.task_name}" in "{project.project_name}" is due tomorrow. '
                                     'Submit it for review when it is ready.', project=project)
            sent += 1

        finals = Task.objects.filter(is_final_submission=True, project_id__due_date=tomorrow).exclude(task_status=APPROVED)
        for final in finals.select_related('project_id'):
            project = final.project_id
            title = f'Project due tomorrow: {project.project_name}'[:100]
            if is_graded(project) or already_sent(title, project, start_of_day):
                continue
            notify(member_emails(project), title,
                   f'"{project.project_name}" is due tomorrow and has not been handed in yet.', project=project)
            sent += 1

        self.stdout.write(self.style.SUCCESS(f'Sent {sent} reminder(s).'))
