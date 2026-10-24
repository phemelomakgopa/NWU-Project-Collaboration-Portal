"""Authentication helpers for the portal's custom User model.

The portal stores users in its own `User` table (email as primary key) rather
than Django's auth user, so we issue and verify simplejwt tokens ourselves and
expose the portal user as `request.user`.
"""
import hashlib
import logging

import bcrypt
from django.conf import settings
from django.core import signing
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .models import User

logger = logging.getLogger(__name__)

RESET_SALT = 'pcp.password-reset'


def normalize_email(email):
    return (email or '').strip().lower()


def hash_secret(value):
    return bcrypt.hashpw(value.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def check_secret(value, hashed):
    if not value or not hashed:
        return False
    try:
        return bcrypt.checkpw(value.encode('utf-8'), hashed.encode('utf-8'))
    except ValueError:
        logger.error('Stored hash is not a valid bcrypt hash')
        return False


def normalize_answer(answer):
    """Security answers are compared case- and whitespace-insensitively."""
    return ' '.join((answer or '').split()).lower()


def check_security_answer(user, answer):
    # Older accounts hashed the answer exactly as typed, so accept that too.
    return check_secret(normalize_answer(answer), user.security_answer) or check_secret(
        (answer or '').strip(), user.security_answer
    )


def issue_access_token(user):
    token = AccessToken()
    token.set_exp(from_time=timezone.now(), lifetime=settings.ACCESS_TOKEN_LIFETIME)
    token['user_email'] = user.email
    token['fname'] = user.first_name
    token['lname'] = user.last_name
    return str(token)


def _password_fingerprint(user):
    # Changing the password invalidates any outstanding reset token.
    return hashlib.sha256(user.password.encode('utf-8')).hexdigest()[:16]


def issue_reset_token(user):
    return signing.dumps(
        {'email': user.email, 'fp': _password_fingerprint(user)},
        salt=RESET_SALT,
    )


def user_from_reset_token(token):
    try:
        data = signing.loads(token, salt=RESET_SALT, max_age=settings.PASSWORD_RESET_TOKEN_MAX_AGE)
    except signing.SignatureExpired:
        raise exceptions.ValidationError('This reset link has expired. Start the reset again.')
    except signing.BadSignature:
        raise exceptions.ValidationError('This reset request is not valid. Start the reset again.')
    user = User.objects.filter(email=data.get('email')).first()
    if not user or data.get('fp') != _password_fingerprint(user):
        raise exceptions.ValidationError('This reset request has already been used. Start the reset again.')
    return user


class PortalJWTAuthentication(BaseAuthentication):
    keyword = b'bearer'

    def authenticate(self, request):
        header = get_authorization_header(request).split()
        if not header or header[0].lower() != self.keyword:
            return None
        if len(header) != 2:
            raise exceptions.AuthenticationFailed('Invalid authorization header.')
        try:
            token = AccessToken(header[1].decode('utf-8'))
        except (TokenError, UnicodeError):
            raise exceptions.AuthenticationFailed('Your session has expired. Please sign in again.')
        user = User.objects.filter(email=token.get('user_email')).first()
        if user is None:
            raise exceptions.AuthenticationFailed('Your account could not be found. Please sign in again.')
        return user, token

    def authenticate_header(self, request):
        return 'Bearer'

