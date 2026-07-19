/**
 * Конфиг онлайн-режима.
 * Заполните URL и anon-ключ проекта Supabase — иначе игра работает офлайн
 * (локальная кампания + hot-seat).
 *
 * Создайте проект на https://supabase.com → Settings → API
 */
window.AppConfig = {
  SUPABASE_URL: 'https://tgqfgqvcambgkyqhytor.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncWZncXZjYW1iZ2t5cWh5dG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzc4NjYsImV4cCI6MjA5OTk1Mzg2Nn0.ERTIVdmpzedlT7OSWvqWb-fRYCJBK3AQmiDJEEY0_KY',
  /** Максимум игроков в комнате */
  MAX_ROOM_PLAYERS: 4,
  /** Минимум для старта */
  MIN_ROOM_PLAYERS: 2,
};

window.AppConfig.isOnlineConfigured = function isOnlineConfigured() {
  return Boolean(
    window.AppConfig.SUPABASE_URL &&
      window.AppConfig.SUPABASE_ANON_KEY &&
      !window.AppConfig.SUPABASE_URL.includes('YOUR_')
  );
};
