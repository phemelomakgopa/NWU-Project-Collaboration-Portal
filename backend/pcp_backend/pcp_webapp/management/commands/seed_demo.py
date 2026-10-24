"""Create a small demo project for local testing and walkthroughs.

    python manage.py seed_demo

Creates three accounts (password: demo-pass-2025) and one project with tasks
in every state. Refuses to run when DEBUG is off.
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from pcp_webapp.auth import hash_secret
from pcp_webapp.models import ChatMessage, Meeting, Project, ProjectChat, ProjectLinks, Task, User, User_Task, UserProject
from pcp_webapp.permissions import APPROVED, GROUP_LEADER, IN_PROGRESS, STUDENT, SUBMITTED, SUPERVISOR, final_task
from pcp_webapp.utils import notify

PASSWORD = 'demo-pass-2025'
PEOPLE = [
    ('supervisor@demo.nwu.ac.za', 'Thandi', 'Mokoena', SUPERVISOR),
    ('leader@demo.nwu.ac.za', 'Pieter', 'van Wyk', GROUP_LEADER),
    ('student@demo.nwu.ac.za', 'Lerato', 'Dlamini', STUDENT),
    ('student2@demo.nwu.ac.za', 'Ayanda', 'Nkosi', STUDENT),
]


class Command(BaseCommand):
    help = 'Create demo accounts and a sample project (development only).'

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('seed_demo only runs with DEBUG on.')
        users = {}
        for email, first, last, _ in PEOPLE:
            users[email], _ = User.objects.update_or_create(email=email, defaults={
                'first_name': first, 'last_name': last, 'password': hash_secret(PASSWORD),
                'security_question': 'What is your favourite snack?', 'security_answer': hash_secret('biltong'),
            })

        today = timezone.localdate()
        project = Project.objects.create(
            project_name='CMPG323 Deliverable 3: Usability study',
            project_description='Run a usability study of the portal with five participants and report the findings '
                                'with recommendations.',
            due_date=today + timedelta(days=12),
            created_on=today - timedelta(days=9),
        )
        for email, _, _, role in PEOPLE:
            UserProject.objects.create(email=users[email], project_id=project, role=role)
        final_task(project)

        leader, s1, s2 = users['leader@demo.nwu.ac.za'], users['student@demo.nwu.ac.za'], users['student2@demo.nwu.ac.za']
        tasks = [
            ('Recruit participants', 'Find five students who have not used the portal.', -3, APPROVED, 'Medium', [s2]),
            ('Write the test script', 'Tasks, think-aloud prompts and the post-test survey.', 1, SUBMITTED, 'High', [s1]),
            ('Run the sessions', 'Record notes for each session in the shared template.', 5, IN_PROGRESS, 'High', [s1, s2]),
            ('Analyse findings', 'Group issues by severity and frequency.', 8, IN_PROGRESS, 'Medium', [leader]),
            ('Draft recommendations', '', -1, IN_PROGRESS, 'Low', [s2]),
        ]
        for name, desc, days, status, priority, people in tasks:
            task = Task.objects.create(task_name=name, task_description=desc, task_due_date=today + timedelta(days=days),
                                       task_status=status, task_priority=priority, project_id=project)
            for person in people:
                User_Task.objects.create(task_id=task, email=person)

        Meeting.objects.create(project_id=project, meeting_title='Pilot session review',
                               date_time=timezone.now().replace(hour=14, minute=0, second=0) + timedelta(days=2))
        ProjectLinks.objects.create(project=project, link_name='Assignment brief', link_url='https://efundi.nwu.ac.za/')

        for sender, role, text in [
            (leader, GROUP_LEADER, 'Script is ready for review. Lerato, can you check the timing?'),
            (s1, STUDENT, 'Will do tonight. I booked the lab for Thursday.'),
            (users['supervisor@demo.nwu.ac.za'], SUPERVISOR, 'Remember to get signed consent from every participant.'),
        ]:
            msg = ChatMessage.objects.create(email=sender, content=text, Role=role)
            ProjectChat.objects.create(project_id=project, chat_message=msg)

        notify([leader], 'Task ready for review', f'Lerato Dlamini submitted "Write the test script" for review.', project=project)
        notify([s2], 'New task assigned', f'You have been assigned "Draft recommendations" in "{project.project_name}".',
               project=project)

        self.stdout.write(self.style.SUCCESS(
            f'Demo project #{project.project_id} created. Sign in as any of '
            f'{", ".join(p[0] for p in PEOPLE)} with password {PASSWORD}'
        ))
