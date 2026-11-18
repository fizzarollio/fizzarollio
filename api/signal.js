
module.exports = async (req, res) => {
  const allowedOrigin = "https://fizzarollio.github.io";
  const origin = req.headers.origin;

  if (origin !== allowedOrigin) {
    return res.status(403).json({
      ok: false,
      error: "Доступ запрещён"
    });
  }

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Метод не поддерживается"
    });
  }

  try {
    const { name, message, website } = req.body || {};

    // Скрытое поле против автоматического спама
    if (website) {
      return res.status(200).json({ ok: true });
    }

    if (
      typeof name !== "string" ||
      typeof message !== "string" ||
      !name.trim() ||
      !message.trim() ||
      name.length > 60 ||
      message.length > 1000
    ) {
      return res.status(400).json({
        ok: false,
        error: "Проверь имя и сообщение"
      });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({
        ok: false,
        error: "Сервер не настроен"
      });
    }

    const text =
      "📩 НОВОЕ СООБЩЕНИЕ — FIZZAROLLIO\n\n" +
      "👤 Имя: " + name.trim() + "\n\n" +
      "💬 Сообщение:\n" + message.trim();

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: text
        })
      }
    );

    const result = await response.json();

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        error: "Не удалось отправить сообщение"
      });
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Внутренняя ошибка сервера"
    });
  }
};
