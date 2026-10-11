from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.paginator import Paginator
from django.db import DatabaseError
from django.db.models import Case, Count, IntegerField, Q, Value, When
from django.db.models.functions import Lower
from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404, render
from django.template import TemplateDoesNotExist
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import services, storage
from .demo import DEMO_ACCOUNTS
from .errors import StorageUnavailable
from .models import Submission
from .permissions import is_demo, is_reviewer, visible_submissions
from .serializers import (
    CreateSubmissionSerializer,
    DecisionSerializer,
    SubmissionSerializer,
    user_summary,
)


def csrf_failure(request, reason=""):
    return JsonResponse(
        {
            "message": "Your session could not be verified. Refresh the page and try again."
        },
        status=403,
    )


def session_user(user):
    return {
        **user_summary(user),
        "role": "reviewer" if is_reviewer(user) else "submitter",
        "is_demo": is_demo(user),
    }


@method_decorator(never_cache, name="dispatch")
class SessionView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "user": session_user(request.user)
                if request.user.is_authenticated
                else None,
                "csrfToken": get_token(request),
                "demoEnabled": settings.DEMO_ENABLED,
            }
        )


@method_decorator(csrf_protect, name="dispatch")
@method_decorator(never_cache, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        username, password = request.data.get("username"), request.data.get("password")
        if (
            not isinstance(username, str)
            or not isinstance(password, str)
            or not username
            or not password
        ):
            raise ValidationError({"username": ["Enter your username and password."]})
        user = authenticate(request, username=username[:150], password=password)
        if user is None:
            return Response(
                {"message": "The username or password is incorrect."}, status=401
            )
        login(request, user)
        return Response({"user": session_user(user), "csrfToken": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
@method_decorator(never_cache, name="dispatch")
class DemoLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        if not settings.DEMO_ENABLED:
            return Response({"message": "Demo access is not enabled."}, status=404)
        role = request.data.get("role")
        if not isinstance(role, str) or role not in DEMO_ACCOUNTS:
            raise ValidationError({"role": ["Choose submitter or reviewer."]})
        user = (
            get_user_model()
            .objects.filter(
                username=DEMO_ACCOUNTS[role],
                groups__name="demo",
                is_active=True,
                is_staff=False,
                is_superuser=False,
            )
            .first()
        )
        if user is None or is_reviewer(user) != (role == "reviewer"):
            return Response(
                {"message": "The demo is not ready yet. Please try again shortly."},
                status=503,
            )
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response({"user": session_user(user), "csrfToken": get_token(request)})


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({"message": "Signed out."})


class DemoSampleView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "demo_sample"

    def post(self, request):
        if not settings.DEMO_ENABLED:
            return Response({"message": "Demo access is not enabled."}, status=404)
        if (
            not is_demo(request.user)
            or request.user.username not in DEMO_ACCOUNTS.values()
            or request.user.is_staff
            or request.user.is_superuser
        ):
            raise PermissionDenied("Sample reviews are available only in the demo.")
        owner = (
            get_user_model()
            .objects.filter(
                username=DEMO_ACCOUNTS["submitter"],
                groups__name="demo",
                is_active=True,
                is_staff=False,
                is_superuser=False,
            )
            .first()
        )
        if owner is None or is_reviewer(owner):
            raise StorageUnavailable(
                "The demo is not ready yet. Please try again shortly."
            )
        sample = (
            settings.BASE_DIR
            / "frontend"
            / "public"
            / "samples"
            / "project-proposal.pdf"
        )
        try:
            upload = SimpleUploadedFile("project-proposal.pdf", sample.read_bytes())
            submission = services.create_submission(
                owner, "Practice review — project proposal", upload
            )
        except (OSError, DatabaseError) as exc:
            raise StorageUnavailable(
                "The sample review could not be created. Please try again."
            ) from exc
        return Response(SubmissionSerializer(submission).data, status=201)


@method_decorator(never_cache, name="dispatch")
class SubmissionListView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        queryset = visible_submissions(request.user)
        submitters = []
        if is_reviewer(request.user):
            submitters = [
                user_summary(user)
                for user in get_user_model()
                .objects.filter(
                    pk__in=queryset.order_by().values("owner_id").distinct()
                )
                .order_by(Lower("first_name"), Lower("last_name"), "username")
            ]
        owner = request.query_params.get("owner")
        if owner:
            try:
                owner_id = int(owner)
                if owner_id < 1 or owner_id > 2**63 - 1:
                    raise ValueError()
            except ValueError as exc:
                raise ValidationError({"owner": ["Use a valid submitter ID."]}) from exc
            queryset = queryset.filter(owner_id=owner_id)
        search = request.query_params.get("q", "").strip()
        if len(search) > 200:
            raise ValidationError({"q": ["Use 200 characters or fewer."]})
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) | Q(original_filename__icontains=search)
            )
        counts = queryset.aggregate(
            all=Count("id"),
            pending=Count("id", filter=Q(status="pending")),
            approved=Count("id", filter=Q(status="approved")),
            rejected=Count("id", filter=Q(status="rejected")),
        )
        status = request.query_params.get("status")
        if status:
            if status not in Submission.Status.values:
                raise ValidationError(
                    {"status": ["Use pending, approved, or rejected."]}
                )
            queryset = queryset.filter(status=status)
        status_order = Case(
            When(status="pending", then=Value(0)),
            When(status="approved", then=Value(1)),
            When(status="rejected", then=Value(2)),
            output_field=IntegerField(),
        )
        ordering = {
            "newest": ["-created_at", "-id"],
            "oldest": ["created_at", "id"],
            "submitter_asc": [
                Lower("owner__first_name"),
                Lower("owner__last_name"),
                "owner__username",
                "-created_at",
                "-id",
            ],
            "submitter_desc": [
                Lower("owner__first_name").desc(),
                Lower("owner__last_name").desc(),
                "-owner__username",
                "-created_at",
                "-id",
            ],
            "status_asc": [status_order, "-created_at", "-id"],
            "status_desc": [status_order.desc(), "-created_at", "-id"],
        }
        sort = request.query_params.get("sort", "newest")
        if sort not in ordering:
            raise ValidationError({"sort": ["Choose a supported sort order."]})
        queryset = queryset.order_by(*ordering[sort])
        try:
            requested_page = int(request.query_params.get("page", "1"))
            if requested_page < 1:
                raise ValueError()
        except ValueError as exc:
            raise ValidationError({"page": ["Use a positive page number."]}) from exc
        paginator = Paginator(queryset, 20)
        # Clamp stale/out-of-range pages when another review changes the filtered list.
        page = paginator.get_page(requested_page)
        return Response(
            {
                "results": SubmissionSerializer(page.object_list, many=True).data,
                "page": page.number,
                "page_size": paginator.per_page,
                "count": paginator.count,
                "total_pages": paginator.num_pages,
                "counts": counts,
                "submitters": submitters,
            }
        )

    def post(self, request):
        if is_reviewer(request.user):
            raise PermissionDenied("Sign in as a submitter to submit documents.")
        if len(request.FILES.getlist("file")) != 1 or set(request.FILES) != {"file"}:
            raise ValidationError({"file": ["Choose exactly one document."]})
        serializer = CreateSubmissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            submission = services.create_submission(
                request.user,
                serializer.validated_data["title"],
                serializer.validated_data["file"],
            )
        except DatabaseError as exc:
            raise StorageUnavailable(
                "Your submission could not be saved. Please try again."
            ) from exc
        return Response(SubmissionSerializer(submission).data, status=201)


@method_decorator(never_cache, name="dispatch")
class SubmissionDetailView(APIView):
    def get(self, request, pk):
        return Response(
            SubmissionSerializer(
                get_object_or_404(visible_submissions(request.user), pk=pk)
            ).data
        )


class DecisionView(APIView):
    def post(self, request, pk):
        submission = get_object_or_404(visible_submissions(request.user), pk=pk)
        serializer = DecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = services.decide_submission(
            request.user, submission, serializer.validated_data["status"]
        )
        return Response(SubmissionSerializer(submission).data)


class DocumentView(APIView):
    def get(self, request, pk):
        submission = get_object_or_404(visible_submissions(request.user), pk=pk)
        data = storage.read_document(submission.blob_path)
        response = HttpResponse(data, content_type=submission.content_type)
        response["Content-Length"] = len(data)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Disposition"] = "inline"
        return response


@never_cache
def app_shell(request):
    try:
        return render(request, "index.html")
    except TemplateDoesNotExist:
        return HttpResponse(
            "Frontend build missing. Run pnpm build, or use the Vite development server.",
            status=503,
            content_type="text/plain",
        )
