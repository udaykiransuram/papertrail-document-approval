from django.urls import include, path, re_path

from workflow.views import app_shell

urlpatterns = [
    path("api/", include("workflow.urls")),
    re_path(r"^(?!api/|static/).*$", app_shell),
]
