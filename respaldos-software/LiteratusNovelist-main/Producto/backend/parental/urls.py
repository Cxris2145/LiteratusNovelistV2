"""
parental/urls.py — Control parental (/api/v1/parental/).
"""
from django.urls import path

from .views import (ChildActionView, ChildChatDetailView, ChildCreateView, ChildLinkView, ChildSectionView,
                    StatusView)

urlpatterns = [
    path('status/', StatusView.as_view(), name='parental_status'),
    path('children/', ChildCreateView.as_view(), name='parental_child_create'),
    path('children/link/', ChildLinkView.as_view(), name='parental_child_link'),

    # Historial del hijo, por secciones (cada pestaña del panel pide la suya)
    path('children/<uuid:child_id>/', ChildSectionView.as_view(section='overview'), name='parental_child'),
    path('children/<uuid:child_id>/reading/', ChildSectionView.as_view(section='reading'), name='parental_reading'),
    path('children/<uuid:child_id>/games/', ChildSectionView.as_view(section='games'), name='parental_games'),
    path('children/<uuid:child_id>/writing/', ChildSectionView.as_view(section='writing'), name='parental_writing'),
    path('children/<uuid:child_id>/chats/', ChildSectionView.as_view(section='chats'), name='parental_chats'),
    path('children/<uuid:child_id>/chats/<uuid:session_id>/', ChildChatDetailView.as_view(), name='parental_chat'),
    path('children/<uuid:child_id>/activity/', ChildSectionView.as_view(section='activity'), name='parental_activity'),

    # Poderes del tutor (piden su contraseña)
    path('children/<uuid:child_id>/password/', ChildActionView.as_view(action='password'), name='parental_password'),
    path('children/<uuid:child_id>/unlink/', ChildActionView.as_view(action='unlink'), name='parental_unlink'),
    path('children/<uuid:child_id>/delete/', ChildActionView.as_view(action='delete'), name='parental_delete'),
]
