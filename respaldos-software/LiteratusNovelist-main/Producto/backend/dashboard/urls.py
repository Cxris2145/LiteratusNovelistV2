"""
dashboard/urls.py — Enrutador de Endpoints Administrativos para Literatus Nexus
"""
from django.urls import path
from .views_stats import DashboardStatsView, BookViewsStatsView
from .views_content import (
    BookListAdminView,
    EpubParseView,
    BookSaveView,
    BookDetailAdminView,
    AuthorListAdminView,
    AuthorDetailAdminView,
    AvatarAdminView,
    AvatarListGlobalAdminView,
    UploadChapterImageView,
)
from .views_users import UserListAdminView
from .views_admin_extended import (
    AdminCurationView,
    AdminBookTogglePublishView,
    AdminBookApproveView,
    AdminUserToggleActiveView,
    AdminUserRoleView,
    AdminUserAdjustInkView,
    AdminTransactionsView,
    AdminInkView,
    AdminGamificationView,
    AdminAIChatsView,
    AdminAuditLogsView,
    AdminSettingsView,
    AdminGenreView,
    AdminGenreDetailView,
)

urlpatterns = [
    # ─── Analíticas y Estadísticas Principales ───
    path('stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('stats/books/', BookViewsStatsView.as_view(), name='dashboard-book-stats'),

    # ─── Biblioteca y Libros ───
    path('books/', BookListAdminView.as_view(), name='dashboard-books'),
    path('books/parse-epub/', EpubParseView.as_view(), name='dashboard-parse-epub'),
    path('books/save/', BookSaveView.as_view(), name='dashboard-save-book'),
    path('books/upload-image/', UploadChapterImageView.as_view(), name='dashboard-upload-image'),
    path('books/<uuid:pk>/', BookDetailAdminView.as_view(), name='dashboard-book-detail'),
    path('books/<uuid:pk>/toggle-publish/', AdminBookTogglePublishView.as_view(), name='dashboard-book-toggle-publish'),
    path('books/<uuid:pk>/approve/', AdminBookApproveView.as_view(), name='dashboard-book-approve'),

    # ─── Curaduría y Aprobaciones ───
    path('curation/', AdminCurationView.as_view(), name='dashboard-curation'),

    # ─── Autores ───
    path('authors/', AuthorListAdminView.as_view(), name='dashboard-authors'),
    path('authors/<uuid:pk>/', AuthorDetailAdminView.as_view(), name='dashboard-author-detail'),

    # ─── Avatares / Personajes IA ───
    path('avatars/all/', AvatarListGlobalAdminView.as_view(), name='dashboard-avatars-all'),
    path('avatars/', AvatarAdminView.as_view(), name='dashboard-avatars-create'),
    path('avatars/<uuid:pk>/', AvatarAdminView.as_view(), name='dashboard-avatars-detail'),

    # ─── Categorías y Géneros ───
    path('genres/', AdminGenreView.as_view(), name='dashboard-genres'),
    path('genres/<uuid:pk>/', AdminGenreDetailView.as_view(), name='dashboard-genre-detail'),

    # ─── Usuarios y Roles ───
    path('users/', UserListAdminView.as_view(), name='dashboard-users'),
    path('users/<uuid:pk>/toggle-active/', AdminUserToggleActiveView.as_view(), name='dashboard-user-toggle-active'),
    path('users/<uuid:pk>/role/', AdminUserRoleView.as_view(), name='dashboard-user-role'),
    path('users/<uuid:pk>/adjust-ink/', AdminUserAdjustInkView.as_view(), name='dashboard-user-adjust-ink'),

    # ─── Finanzas y Transacciones Webpay ───
    path('transactions/', AdminTransactionsView.as_view(), name='dashboard-transactions'),

    # ─── Economía de Tinta ───
    path('ink/', AdminInkView.as_view(), name='dashboard-ink'),

    # ─── Gamificación (Logros, Misiones, Niveles) ───
    path('gamification/', AdminGamificationView.as_view(), name='dashboard-gamification'),

    # ─── Inteligencia Artificial y Chats ───
    path('ai-chats/', AdminAIChatsView.as_view(), name='dashboard-ai-chats'),

    # ─── Auditoría y Logs del Sistema ───
    path('audit-logs/', AdminAuditLogsView.as_view(), name='dashboard-audit-logs'),

    # ─── Configuración General de la Plataforma ───
    path('settings/', AdminSettingsView.as_view(), name='dashboard-settings'),
]
