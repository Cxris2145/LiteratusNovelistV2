import os, sys, json, urllib.request
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
import django
django.setup()
from users.models import User
from rest_framework_simplejwt.tokens import RefreshToken

user = User.objects.first()
refresh = RefreshToken.for_user(user)
access_token = str(refresh.access_token)

req = urllib.request.Request('http://localhost:8000/api/v1/ai/hub/avatars/?sort=popularity')
req.add_header('Authorization', f'Bearer {access_token}')

try:
    resp = urllib.request.urlopen(req)
    print('STATUS:', resp.status)
    data = json.loads(resp.read().decode('utf-8'))
    print('TOTAL AVATARS:', len(data))
    for item in data[:5]:
        print(f"Name: {item.get('name')} | URL: {item.get('avatar_image_url')}")
except Exception as e:
    print('ERROR:', e)
