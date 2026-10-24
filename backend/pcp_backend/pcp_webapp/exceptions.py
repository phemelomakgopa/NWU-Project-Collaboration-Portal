"""Uniform error responses for the API."""
import logging

from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def portal_exception_handler(exc, context):
    """Always answer with {"error": "..."} so the frontend has one shape to read."""
    response = exception_handler(exc, context)
    if response is None:
        logger.exception('Unhandled API error', exc_info=exc)
        return Response(
            {'error': 'Something went wrong on the server. Please try again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    data = response.data
    if isinstance(data, dict) and 'error' in data:
        return response
    if isinstance(data, dict) and 'detail' in data:
        message = data['detail']
    elif isinstance(data, list) and data:
        message = data[0]
    elif isinstance(data, dict) and data:
        first = next(iter(data.values()))
        message = first[0] if isinstance(first, list) and first else first
    else:
        message = 'Request failed.'
    if isinstance(exc, exceptions.Throttled):
        message = 'Too many attempts. Please wait a minute and try again.'
    response.data = {'error': str(message)}
    return response
