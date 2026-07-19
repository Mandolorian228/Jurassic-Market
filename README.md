# Jurassic Market — запуск и онлайн

## Офлайн (сразу)

Откройте `index.html` в браузере → **Играть офлайн**.

- Деньги и динозавры сохраняются при смене локации (localStorage).
- «Новая игра» сбрасывает кампанию.

## Онлайн (Supabase)

1. Создайте проект на [supabase.com](https://supabase.com).
2. SQL Editor → выполните скрипт [`sql/schema.sql`](sql/schema.sql).
3. Authentication → Providers → Email включён.
4. Settings → API → скопируйте URL и `anon` key в [`js/config.js`](js/config.js):

```js
SUPABASE_URL: 'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJ...',
```

5. Откройте сайт (нужен любой статический хост или Live Server).
6. Регистрация → Создать комнату → скопировать ссылку `?room=CODE` другу → Начать игру.

## Реферальная ссылка

Формат: `https://ваш-домен/index.html?room=ABC123`

Друг должен быть залогинен; по ссылке он попадает в лобби комнаты.
