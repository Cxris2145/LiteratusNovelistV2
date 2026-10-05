"""
community/urls.py — La Taberna de Tinta: amigos, brindis, perfiles y ranking.
"""
from django.urls import path

from .views import (
    BrindisView,
    CommunityMeView,
    CommunityProfileView,
    CommunitySearchView,
    FriendListView,
    FriendRequestAcceptView,
    FriendRequestCancelView,
    FriendRequestDeclineView,
    FriendRequestsView,
    PresenceView,
    RankingView,
    UnfriendView,
)

urlpatterns = [
    path('me/', CommunityMeView.as_view(), name='community-me'),
    path('search/', CommunitySearchView.as_view(), name='community-search'),
    path('friends/', FriendListView.as_view(), name='community-friends'),
    path('friends/<str:code>/', UnfriendView.as_view(), name='community-unfriend'),
    path('requests/', FriendRequestsView.as_view(), name='community-requests'),
    path('requests/<uuid:pk>/accept/', FriendRequestAcceptView.as_view(), name='community-request-accept'),
    path('requests/<uuid:pk>/decline/', FriendRequestDeclineView.as_view(), name='community-request-decline'),
    path('requests/<uuid:pk>/', FriendRequestCancelView.as_view(), name='community-request-cancel'),
    path('profiles/<str:code>/', CommunityProfileView.as_view(), name='community-profile'),
    path('profiles/<str:code>/brindis/', BrindisView.as_view(), name='community-brindis'),
    path('ranking/', RankingView.as_view(), name='community-ranking'),
    path('presence/', PresenceView.as_view(), name='community-presence'),
]
