# FIZZAROLLIO — настройка Supabase (вручную в Dashboard)

Проект: gqpiiioyhwscbxivufre. В index.html лежит только publishable key — он публичный по дизайну.

1. Authentication → URL Configuration: Site URL = https://fizzarollio.github.io ; Redirect URLs: https://fizzarollio.github.io/**
2. Authentication → Emails → SMTP Settings: подключить свой SMTP (встроенный сервис ~2 письма/час на весь проект).
3. Authentication → Emails → Templates («Confirm signup», «Magic Link»): добавить `Код: {{ .Token }}` и убрать ссылку.
4. Project Settings → API Keys: отключить legacy anon/service_role JWT-ключи, если ими никто не пользуется (сайт использует только sb_publishable_...).
5. Authentication → Attack Protection: включить CAPTCHA (потребует небольшой доработки клиента).
6. Authentication → Sign In / Providers → Email: срок кода (OTP expiry) 600 секунд; Anonymous sign-ins — выключены.
