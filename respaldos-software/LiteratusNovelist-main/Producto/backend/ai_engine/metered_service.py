"""Bounded character generation, normalized usage, and per-attempt cost telemetry."""
import json
from decimal import Decimal
import requests
from django.conf import settings
from google import genai
from google.genai import types
from .services import AIService


class MeteredAIService(AIService):
    def __init__(self, avatar, session):
        super().__init__(avatar, session)
        self.attempts = []
        self.messages = []

    def prepare(self, message):
        history = list(reversed(list(self.session.messages.order_by('-created_at')[:10])))
        self.messages = [{'role': 'system', 'content': self._build_system_prompt()}]
        self.messages += [{'role': msg.role, 'content': msg.content} for msg in history]
        self.messages.append({'role': 'user', 'content': message})
        # UTF-8 byte count is a conservative ceiling, including provider message framing.
        # Only actual provider usage is charged. This also bounds a cross-provider failover.
        return len(json.dumps(self.messages, ensure_ascii=False).encode('utf-8')) + 256 + settings.AI_MAX_OUTPUT_TOKENS

    def _result(self, text, provider, model, input_tokens, output_tokens, reasoning=0):
        total = input_tokens + output_tokens + reasoning
        prefix = 'AI_GEMINI_' if provider == 'gemini' else 'AI_DEEPSEEK_'
        input_rate = Decimal(getattr(settings, prefix + 'INPUT_USD_PER_MILLION'))
        output_rate = Decimal(getattr(settings, prefix + 'OUTPUT_USD_PER_MILLION'))
        cost = (input_tokens * input_rate + (output_tokens + reasoning) * output_rate) / Decimal(1000000)
        attempt = {'provider': provider, 'model': model, 'input_tokens': input_tokens,
            'output_tokens': output_tokens, 'reasoning_tokens': reasoning, 'estimated_cost': str(cost)}
        self.attempts.append(attempt)
        if not isinstance(text, str) or not text.strip() or input_tokens <= 0 or output_tokens <= 0:
            raise ValueError('Invalid response or missing usage metadata')
        return {'text': text.strip(), **attempt, 'total_tokens': total, 'attempts': self.attempts}

    def generate_metered(self):
        model = settings.AI_SUBSCRIPTION_MODEL
        for key in (self.gemini_key_1, self.gemini_key_2):
            if not key:
                continue
            try:
                client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=20000))
                response = client.models.generate_content(model=model,
                    contents=[types.Content(role='user' if m['role'] == 'user' else 'model',
                        parts=[types.Part.from_text(text=m['content'])]) for m in self.messages[1:]],
                    config=types.GenerateContentConfig(system_instruction=self.messages[0]['content'],
                        temperature=float(self.avatar.temperature), max_output_tokens=settings.AI_MAX_OUTPUT_TOKENS,
                        thinking_config=types.ThinkingConfig(thinking_budget=0)))
                usage = response.usage_metadata
                try:
                    text = response.text
                except (ValueError, AttributeError):
                    text = ''
                return self._result(text, 'gemini', model, usage.prompt_token_count or 0,
                    usage.candidates_token_count or 0, usage.thoughts_token_count or 0)
            except Exception:
                self.attempts.append({'provider': 'gemini', 'model': model, 'status': 'failed'})
        if self.deepseek_key:
            model = settings.AI_DEEPSEEK_MODEL
            try:
                response = requests.post('https://api.deepseek.com/chat/completions',
                    headers={'Authorization': 'Bearer ' + self.deepseek_key}, json={
                        'model': model, 'messages': self.messages, 'max_tokens': settings.AI_MAX_OUTPUT_TOKENS,
                        'thinking': {'type': 'disabled'}, 'temperature': float(self.avatar.temperature)}, timeout=20)
                response.raise_for_status()
                data = response.json()
                usage = data['usage']
                reasoning = usage.get('completion_tokens_details', {}).get('reasoning_tokens', 0) or 0
                choice = (data.get('choices') or [{}])[0]
                return self._result(choice.get('message', {}).get('content', ''), 'deepseek', model,
                    usage['prompt_tokens'], usage['completion_tokens'] - reasoning, reasoning)
            except Exception:
                self.attempts.append({'provider': 'deepseek', 'model': model, 'status': 'failed'})
        raise RuntimeError('El personaje no pudo responder. Tu cuota y Tinta se mantienen.')
