"""Server-side notification helpers.

Notifications are created by the backend whenever something happens that a
member should know about, so they are consistent no matter which client made
the change.
"""
import logging

from django.db import transaction
from django.utils import timezone

from .models import Notification, User, UserNotification, UserProject

logger = logging.getLogger(__name__)


def _emails(recipients):
    emails = set()
    for item in recipients or []:
        if isinstance(item, User):
            emails.add(item.email)
        elif item:
            emails.add(item)
    return emails


def notify(recipients, title, message, project=None, exclude=None):
    """Send one notification to each recipient (users or emails)."""
    emails = _emails(recipients) - _emails([exclude] if exclude else [])
    if not emails:
        return
    try:
        with transaction.atomic():
            notification = Notification.objects.create(
                title=title[:100],
                message=message,
                time_sent=timezone.now(),
                project=project,
            )
            users = User.objects.filter(email__in=emails)
            UserNotification.objects.bulk_create(
                [UserNotification(email=user, notif=notification) for user in users]
            )
    except Exception:  # Notifications must never break the action that caused them
        logger.exception('Failed to create notification "%s"', title)


def member_emails(project, roles=None):
    links = UserProject.objects.filter(project_id=project)
    if roles:
        links = links.filter(role__in=roles)
    return list(links.values_list('email_id', flat=True))
