from django.contrib import admin
from django.urls import path

from pcp_webapp import views

urlpatterns = [
    path('admin/', admin.site.urls),

    # Authentication
    path('api/auth/login/', views.LoginView.as_view(), name='login'),
    path('api/auth/register/', views.RegisterView.as_view(), name='register'),
    path('api/auth/security-questions/', views.SecurityQuestionsView.as_view(), name='security-questions'),
    path('api/auth/forgot/question/', views.ForgotPasswordQuestionView.as_view(), name='forgot-question'),
    path('api/auth/forgot/verify/', views.ForgotPasswordVerifyView.as_view(), name='forgot-verify'),
    path('api/auth/forgot/reset/', views.ForgotPasswordResetView.as_view(), name='forgot-reset'),

    # Current user
    path('api/me/', views.MeView.as_view(), name='me'),
    path('api/users/lookup/', views.UserLookupView.as_view(), name='user-lookup'),
    path('api/dashboard/', views.DashboardView.as_view(), name='dashboard'),

    # Notifications
    path('api/notifications/', views.NotificationListView.as_view(), name='notifications'),
    path('api/notifications/read-all/', views.NotificationReadAllView.as_view(), name='notifications-read-all'),
    path('api/notifications/<int:notif_id>/', views.NotificationDetailView.as_view(), name='notification-detail'),

    # Projects
    path('api/projects/', views.ProjectCreateView.as_view(), name='projects'),
    path('api/projects/<int:project_id>/', views.ProjectDetailView.as_view(), name='project-detail'),
    path('api/projects/<int:project_id>/members/', views.MemberListView.as_view(), name='project-members'),
    path('api/projects/<int:project_id>/members/<str:email>/', views.MemberDetailView.as_view(), name='project-member'),
    path('api/projects/<int:project_id>/tasks/', views.TaskListView.as_view(), name='project-tasks'),
    path('api/projects/<int:project_id>/submission/', views.SubmissionView.as_view(), name='project-submission'),
    path('api/projects/<int:project_id>/grade/', views.GradeView.as_view(), name='project-grade'),
    path('api/projects/<int:project_id>/chat/', views.ChatView.as_view(), name='project-chat'),
    path('api/projects/<int:project_id>/meetings/', views.MeetingListView.as_view(), name='project-meetings'),
    path('api/projects/<int:project_id>/links/', views.LinkListView.as_view(), name='project-links'),

    # Tasks and documents
    path('api/tasks/<int:task_id>/', views.TaskDetailView.as_view(), name='task-detail'),
    path('api/tasks/<int:task_id>/submit/', views.TaskSubmitView.as_view(), name='task-submit'),
    path('api/tasks/<int:task_id>/review/', views.TaskReviewView.as_view(), name='task-review'),
    path('api/tasks/<int:task_id>/documents/', views.TaskDocumentsView.as_view(), name='task-documents'),
    path('api/documents/<int:document_id>/', views.DocumentDetailView.as_view(), name='document-detail'),

    # Meetings and links
    path('api/meetings/<int:meeting_id>/', views.MeetingDetailView.as_view(), name='meeting-detail'),
    path('api/links/<int:link_id>/', views.LinkDetailView.as_view(), name='link-detail'),
]
