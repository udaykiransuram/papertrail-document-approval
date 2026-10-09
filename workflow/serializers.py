from rest_framework import serializers

from .models import Submission
from .validation import validate_document


def user_summary(user):
    return {
        "id": user.pk,
        "name": user.get_full_name() or user.username,
        "username": user.username,
    }


class CreateSubmissionSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, trim_whitespace=True)
    file = serializers.FileField(validators=[validate_document])


class DecisionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["approved", "rejected"])


class SubmissionSerializer(serializers.ModelSerializer):
    owner = serializers.SerializerMethodField()
    reviewed_by = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = [
            "id",
            "title",
            "owner",
            "original_filename",
            "content_type",
            "size",
            "status",
            "created_at",
            "reviewed_by",
            "reviewed_at",
            "file_url",
        ]

    def get_owner(self, obj):
        return user_summary(obj.owner)

    def get_reviewed_by(self, obj):
        return user_summary(obj.reviewed_by) if obj.reviewed_by_id else None

    def get_file_url(self, obj):
        return f"/api/submissions/{obj.pk}/file/"
