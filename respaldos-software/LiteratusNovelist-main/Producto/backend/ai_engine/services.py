import os
import requests
import json
from google import genai
from google.genai import types
from django.conf import settings
from .models import ChatMessage

class AIService:
    """
    Orquestador de IA con soporte Multi-Provider y Failover.
    Gemini (2 keys) -> DeepSeek.
    """
    def __init__(self, avatar, session):
        self.avatar = avatar
        self.session = session
        
        # API Keys
        self.gemini_key_1 = getattr(settings, 'GOOGLE_API_KEY', os.environ.get('GOOGLE_API_KEY'))
        self.gemini_key_2 = getattr(settings, 'GOOGLE_API_KEY_2', os.environ.get('GOOGLE_API_KEY_2'))
        self.deepseek_key = getattr(settings, 'DEEPSEEK_API_KEY', os.environ.get('DEEPSEEK_API_KEY'))

    def generate_reply(self, new_message_content):
        """
        Intenta generar una respuesta recorriendo los proveedores disponibles.
        """
        # 1. Intentar Gemini Key 1 (2 Ink)
        if self.gemini_key_1:
            try:
                text = self._call_gemini(new_message_content, self.gemini_key_1)
                return {"text": text, "provider": "gemini", "cost": 2, "status": "ok"}
            except Exception as e:
                print(f"Gemini Key 1 failed: {e}")

        # 2. Intentar Gemini Key 2 (2 Ink) - Failover
        if self.gemini_key_2:
            try:
                text = self._call_gemini(new_message_content, self.gemini_key_2)
                return {"text": text, "provider": "gemini", "cost": 2, "status": "ok"}
            except Exception as e:
                print(f"Gemini Key 2 failed: {e}")

        # 3. Intentar DeepSeek (1 Ink) - Backup
        if self.deepseek_key:
            try:
                text = self._call_deepseek(new_message_content)
                return {"text": text, "provider": "deepseek", "cost": 1, "status": "warning"}
            except Exception as e:
                print(f"DeepSeek failed: {e}")

        # Si todo falla
        return {
            "text": "Lo siento, mi conexión con el mundo espiritual está débil ahora mismo. (Error de API)",
            "provider": "none",
            "cost": 0,
            "status": "error"
        }

    def _call_gemini(self, content, api_key):
        client = genai.Client(api_key=api_key)
        
        # Lista de modelos ACTUALIZADA para 2026 basada en el diagnóstico
        models_to_try = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]
        last_err = None

        for model_name in models_to_try:
            try:
                system_prompt = self._build_system_prompt()
                history = self._format_history()
                config = types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=float(self.avatar.temperature)
                )
                
                response = client.models.generate_content(
                    model=model_name,
                    contents=history + [types.Content(role="user", parts=[types.Part.from_text(text=content)])],
                    config=config
                )
                return response.text
            except Exception as e:
                last_err = e
                print(f"Attempt with {model_name} failed: {e}")
                continue
        
        # Si todos los modelos de esta llave fallan, lanzamos la última excepción
        raise last_err

    def _call_deepseek(self, content):
        # DeepSeek Chat API (OpenAI Compatible)
        url = "https://api.deepseek.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.deepseek_key}"
        }
        
        # Reconstruir historial para DeepSeek
        messages = [{"role": "system", "content": self._build_system_prompt()}]
        for msg in self._format_history(limit=8): # Menos historial para ahorrar
            role = "user" if msg.role == "user" else "assistant"
            # Extraer texto de la estructura Content de Gemini si viene de _format_history
            msg_text = msg.parts[0].text if hasattr(msg, 'parts') else str(msg)
            messages.append({"role": role, "content": msg_text})
        
        messages.append({"role": "user", "content": content})

        payload = {
            "model": "deepseek-chat",
            "messages": messages,
            "temperature": float(self.avatar.temperature),
            "max_tokens": 512 # Limitar para ahorrar
        }

        response = requests.post(url, headers=headers, json=payload, timeout=20)
        response.raise_for_status()
        return response.json()['choices'][0]['message']['content']

    def _build_system_prompt(self):
        base_prompt = f"Eres {self.avatar.name}. \n\nDirectrices:\n{self.avatar.system_prompt}\n"
        if self.avatar.behavioral_context:
            base_prompt += f"\nContexto emocional:\n{self.avatar.behavioral_context}\n"
        
        base_prompt += "\nREGLA: No digas que eres IA. Mantén la inmersión total."
            
        return base_prompt

    def _format_history(self, limit=10):
        history_qs = self.session.messages.order_by('-created_at')[:limit]
        messages = reversed(list(history_qs))
        
        gemini_history = []
        for msg in messages:
            g_role = "user" if msg.role == ChatMessage.RoleChoices.USER else "model"
            gemini_history.append(
                types.Content(
                    role=g_role,
                    parts=[types.Part.from_text(text=msg.content)]
                )
            )
        return gemini_history

