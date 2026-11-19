// FIZZAROLLIO · серверная функция выдачи карточки.
// 1) проверяет, что пользователь вошёл (по его токену) и почта подтверждена,
// 2) проверяет ПАРОЛЬ ФАЙЛА №001 на сервере (карточку нельзя получить без него),
// 3) вызывает SQL-функцию issue_card с серверным ключом,
// 4) возвращает карточку. Повторный вызов вернёт ту же самую карточку.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Разрешённые адреса сайта. Задаётся секретом ALLOWED_ORIGIN (см. инструкцию).
const allowed = (Deno.env.get("ALLOWED_ORIGIN") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// Пароль файла. Должен совпадать с паролем в index.html (ARCH.pass).
// Хочешь другой — задай секрет FILE_PASSWORD. Если секрета нет, используется «СЛЕД».
const norm = (s: string) => s.trim().toUpperCase().replace(/Ё/g, "Е");
const FILE_PASSWORD = norm(Deno.env.get("FILE_PASSWORD") ?? "СЛЕД");

function corsHeaders(origin: string | null): Record<string, string> {
  const ok = origin && allowed.includes(origin) ? origin : (allowed[0] ?? "null");
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  // Эти переменные Supabase подставляет автоматически, вручную их вводить не нужно
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Проверяем токен на сервере Supabase Auth
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  // Почта должна быть подтверждена
  if (!user.email_confirmed_at) return json({ error: "email_not_confirmed" }, 403);

  // Пароль файла: из тела запроса берём только его, и только для сравнения
  let pass = "";
  try {
    const body = await req.json();
    if (typeof body?.password === "string") pass = norm(body.password.slice(0, 64));
  } catch { /* тела нет */ }
  if (pass !== FILE_PASSWORD) return json({ error: "wrong_password" }, 403);

  // Берём ТОЛЬКО id из проверенного токена
  const { data, error } = await admin.rpc("issue_card", { p_user_id: user.id });
  if (error || !data || data.length === 0) {
    console.error("issue_card failed", error?.message);
    return json({ error: "issue_failed" }, 500);
  }
  const c = data[0];
  return json({
    card: {
      serial_number: c.serial_number, name: c.name, description: c.description,
      symbol: c.symbol, rarity: c.rarity, glyph: c.glyph, acquired_at: c.acquired_at, owner_id: user.id,
    },
    is_new: c.is_new,
  });
});
