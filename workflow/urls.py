from django.urls import path

from .views import (
    DecisionView,
    DemoLoginView,
    DocumentView,
    LoginView,
    LogoutView,
    SessionView,
    SubmissionDetailView,
    SubmissionListView,
)

urlpatterns = [
    path("session/", SessionView.as_view()),
    path("login/", LoginView.as_view()),
    path("demo/login/", DemoLoginView.as_view()),
    path("logout/", LogoutView.as_view()),
    path("submissions/", SubmissionListView.as_view()),
    path("submissions/<uuid:pk>/", SubmissionDetailView.as_view()),
    path("submissions/<uuid:pk>/file/", DocumentView.as_view()),
    path("submissions/<uuid:pk>/decision/", DecisionView.as_view()),
]
