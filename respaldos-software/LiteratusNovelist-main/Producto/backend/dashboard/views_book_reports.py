"""
dashboard/views_book_reports.py — Vistas administrativas para gestionar reportes de errores en libros.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from django.utils import timezone
from catalog.models import BookErrorReport, Book
from catalog.serializers import (
    BookErrorReportListAdminSerializer,
    BookErrorReportDetailSerializer,
)
from core.pagination import StandardResultsSetPagination


class AdminBookReportListView(APIView):
    """
    GET /api/v1/dashboard/book-reports/
    Listado paginado de reportes con filtros por estado, tipo, severidad, libro y búsqueda textual.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = BookErrorReport.objects.select_related(
            'book', 'chapter', 'audio', 'reporter', 'assigned_to'
        ).all().order_by('-created_at')

        # Filtro por estado
        report_status = request.query_params.get('status')
        if report_status and report_status != 'all':
            qs = qs.filter(status=report_status)

        # Filtro por tipo de error
        error_type = request.query_params.get('error_type')
        if error_type and error_type != 'all':
            qs = qs.filter(error_type=error_type)

        # Filtro por severidad
        severity = request.query_params.get('severity')
        if severity and severity != 'all':
            qs = qs.filter(severity=severity)

        # Filtro por libro
        book_id = request.query_params.get('book_id')
        if book_id:
            qs = qs.filter(book_id=book_id)

        # Filtro por audio vs texto
        media_type = request.query_params.get('media_type')
        if media_type == 'audio':
            qs = qs.filter(error_type__in=[
                BookErrorReport.ErrorType.AUDIO_DESYNC,
                BookErrorReport.ErrorType.AUDIO_GLITCH,
                BookErrorReport.ErrorType.AUDIO_PRONUNCIATION
            ])
        elif media_type == 'text':
            qs = qs.exclude(error_type__in=[
                BookErrorReport.ErrorType.AUDIO_DESYNC,
                BookErrorReport.ErrorType.AUDIO_GLITCH,
                BookErrorReport.ErrorType.AUDIO_PRONUNCIATION
            ])

        # Búsqueda textual
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(selected_text__icontains=search) |
                Q(user_comment__icontains=search) |
                Q(book__title__icontains=search) |
                Q(chapter__title__icontains=search) |
                Q(reporter__username__icontains=search)
            )

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = BookErrorReportListAdminSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class AdminBookReportStatsView(APIView):
    """
    GET /api/v1/dashboard/book-reports/stats/
    Métricas ejecutivas de los reportes para KPIs y gráficas en el panel.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = BookErrorReport.objects.all()
        total = qs.count()
        pending = qs.filter(status=BookErrorReport.Status.PENDING).count()
        in_review = qs.filter(status=BookErrorReport.Status.IN_REVIEW).count()
        resolved = qs.filter(status=BookErrorReport.Status.RESOLVED).count()
        dismissed = qs.filter(status=BookErrorReport.Status.DISMISSED).count()

        audio_count = qs.filter(error_type__in=[
            BookErrorReport.ErrorType.AUDIO_DESYNC,
            BookErrorReport.ErrorType.AUDIO_GLITCH,
            BookErrorReport.ErrorType.AUDIO_PRONUNCIATION
        ]).count()
        text_count = total - audio_count

        # Desglose por tipo
        type_counts = dict(
            qs.values_list('error_type').annotate(c=Count('id')).order_by('-c')
        )

        return Response({
            'total': total,
            'pending': pending,
            'in_review': in_review,
            'resolved': resolved,
            'dismissed': dismissed,
            'audio_count': audio_count,
            'text_count': text_count,
            'by_type': type_counts,
        })


class AdminBookReportDetailView(APIView):
    """
    GET, PATCH, DELETE /api/v1/dashboard/book-reports/<uuid:pk>/
    Inspección, resolución y actualización editorial del reporte.
    """
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        report = get_object_or_404(
            BookErrorReport.objects.select_related('book', 'chapter', 'audio', 'reporter', 'assigned_to'),
            pk=pk
        )
        serializer = BookErrorReportDetailSerializer(report)
        return Response(serializer.data)

    def patch(self, request, pk):
        report = get_object_or_404(BookErrorReport, pk=pk)
        serializer = BookErrorReportDetailSerializer(report, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        new_status = request.data.get('status')
        if new_status == BookErrorReport.Status.RESOLVED and report.status != BookErrorReport.Status.RESOLVED:
            serializer.validated_data['resolved_at'] = timezone.now()
        elif new_status and new_status != BookErrorReport.Status.RESOLVED:
            serializer.validated_data['resolved_at'] = None

        if 'assigned_to' in request.data:
            assigned_id = request.data.get('assigned_to')
            if assigned_id == 'me':
                serializer.validated_data['assigned_to'] = request.user
            elif not assigned_id:
                serializer.validated_data['assigned_to'] = None

        updated_report = serializer.save()
        return Response(BookErrorReportDetailSerializer(updated_report).data)

    def delete(self, request, pk):
        report = get_object_or_404(BookErrorReport, pk=pk)
        report.delete()
        return Response({"message": "Reporte eliminado correctamente."}, status=status.HTTP_204_NO_CONTENT)


class AdminBookReportBatchStatusView(APIView):
    """
    POST /api/v1/dashboard/book-reports/batch-status/
    Actualización masiva de estado para múltiples reportes.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        ids = request.data.get('ids', [])
        new_status = request.data.get('status')
        admin_notes = request.data.get('admin_notes')

        if not ids or not isinstance(ids, list):
            return Response({"error": "Debe proporcionar una lista de IDs."}, status=status.HTTP_400_BAD_REQUEST)

        valid_statuses = [choice[0] for choice in BookErrorReport.Status.choices]
        if new_status not in valid_statuses:
            return Response({"error": f"Estado inválido. Opciones: {valid_statuses}"}, status=status.HTTP_400_BAD_REQUEST)

        updates = {'status': new_status}
        if new_status == BookErrorReport.Status.RESOLVED:
            updates['resolved_at'] = timezone.now()
        else:
            updates['resolved_at'] = None

        if admin_notes:
            updates['admin_notes'] = admin_notes

        count = BookErrorReport.objects.filter(id__in=ids).update(**updates)
        return Response({
            "message": f"Se actualizaron {count} reportes al estado '{new_status}'.",
            "updated_count": count
        })
