from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser, AllowAny
from .models import StoreSettings
from .serializers import StoreSettingsSerializer

class StoreSettingsView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAdminUser()]

    def get(self, request):
        settings = StoreSettings.load()
        serializer = StoreSettingsSerializer(settings)
        return Response(serializer.data)

    def put(self, request):
        settings = StoreSettings.load()
        serializer = StoreSettingsSerializer(settings, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
