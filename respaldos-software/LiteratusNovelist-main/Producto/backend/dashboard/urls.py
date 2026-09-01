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

urlpatterns = [
    # --- Analíticas ---
    path('stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('stats/books/', BookViewsStatsView.as_view(), name='dashboard-book-stats'),

    # --- Libros ---
    path('books/', BookListAdminView.as_view(), name='dashboard-books'),
    path('books/parse-epub/', EpubParseView.as_view(), name='dashboard-parse-epub'),
    path('books/save/', BookSaveView.as_view(), name='dashboard-save-book'),
    path('books/upload-image/', UploadChapterImageView.as_view(), name='dashboard-upload-image'),
    path('books/<uuid:pk>/', BookDetailAdminView.as_view(), name='dashboard-book-detail'),

    # --- Autores ---
    path('authors/', AuthorListAdminView.as_view(), name='dashboard-authors'),
    path('authors/<uuid:pk>/', AuthorDetailAdminView.as_view(), name='dashboard-author-detail'),

    # --- Avatares / Personajes ---
    path('avatars/all/', AvatarListGlobalAdminView.as_view(), name='dashboard-avatars-all'),
    path('avatars/', AvatarAdminView.as_view(), name='dashboard-avatars-create'),
    path('avatars/<uuid:pk>/', AvatarAdminView.as_view(), name='dashboard-avatars-detail'),

    # --- Usuarios ---
    path('users/', UserListAdminView.as_view(), name='dashboard-users'),
]
