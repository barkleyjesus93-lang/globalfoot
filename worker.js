const PAGE_ID = "987662881093953";
const GRAPH_API_VERSION = "v26.0";

const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

const GROUPS = {
  "*/5 * * * *": [
    "eng.1",
    "fra.1"
  ]
};

// ======================================================
// CRON
// ======================================================

export default {
  async scheduled(controller, env, ctx) {
    console.log(
      "🔥 GLOBALFOOT CRON EXÉCUTÉ :",
      controller.cron
    );

    const competitions =
      GROUPS[controller.cron] || [];

    console.log(
      `🌍 GlobalFoot : ${competitions.length} compétitions`
    );

    for (const competition of competitions) {
      try {
        await scanCompetition(competition, env);
      } catch (error) {
        console.error(
          `❌ Erreur ${competition}:`,
          error?.stack || error?.message || String(error)
        );
      }
    }
  },

  async fetch(request) {
    return new Response(
      "🌍 GlobalFoot Worker actif.",
      {
        headers: {
          "content-type": "text/plain; charset=UTF-8"
        }
      }
    );
  }
};

// ======================================================
// FETCH ESPN
// ======================================================

async function fetchESPN(url) {
  console.log("🌐 ESPN request :", url);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "User-Agent":
        "Mozilla/5.0 (compatible; GlobalFoot/1.0)"
    }
  });

  console.log(
    "📡 ESPN response : HTTP",
    response.status
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `ESPN HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `ESPN réponse non-JSON: ${text.slice(0, 500)}`
    );
  }
}

// ======================================================
// DIAGNOSTIC CONTENT
// ======================================================

function diagnosticContent(data, competition) {
  console.log(
    `🧪 DIAGNOSTIC ESPN ${competition}`
  );

  console.log(
    "📦 ESPN ROOT TYPE :",
    typeof data
  );

  if (!data || typeof data !== "object") {
    console.log(
      "❌ ESPN ROOT invalide"
    );
    return;
  }

  console.log(
    "📦 ESPN ROOT KEYS :",
    Object.keys(data).slice(0, 50)
  );

  const content = data.content;

  console.log(
    "📦 ESPN CONTENT TYPE :",
    typeof content
  );

  if (content === undefined) {
    console.log(
      "❌ ESPN CONTENT : absent"
    );
    return;
  }

  if (typeof content === "string") {
    console.log(
      "📦 ESPN CONTENT STRING LENGTH :",
      content.length
    );

    console.log(
      "📦 ESPN CONTENT PREVIEW :",
      content.slice(0, 3000)
    );

    try {
      const parsed = JSON.parse(content);

      console.log(
        "📦 ESPN CONTENT PARSED TYPE :",
        typeof parsed
      );

      if (
        parsed &&
        typeof parsed === "object"
      ) {
        console.log(
          "📦 ESPN CONTENT PARSED KEYS :",
          Object.keys(parsed).slice(0, 50)
        );

        if (parsed.sbData) {
          console.log(
            "🎯 ESPN CONTENT sbData TROUVÉ"
          );

          console.log(
            "🎯 sbData KEYS :",
            Object.keys(parsed.sbData).slice(0, 50)
          );
        }
      }
    } catch {
      console.log(
        "⚠️ ESPN CONTENT n'est pas un JSON directement parsable"
      );
    }

    return;
  }

  if (
    typeof content === "object"
  ) {
    console.log(
      "📦 ESPN CONTENT KEYS :",
      Object.keys(content).slice(0, 100)
    );

    if (content.sbData) {
      console.log(
        "🎯 ESPN CONTENT sbData TROUVÉ"
      );

      if (
        typeof content.sbData === "object"
      ) {
        console.log(
          "🎯 sbData KEYS :",
          Object.keys(content.sbData).slice(0, 100)
        );
      }

      console.log(
        "🎯 sbData PREVIEW :",
        safePreview(content.sbData, 5000)
      );
    }

    if (content.events) {
      console.log(
        "🎯 ESPN CONTENT events TROUVÉ :",
        Array.isArray(content.events)
          ? content.events.length
          : typeof content.events
      );
    }

    if (content.scoreboard) {
      console.log(
        "🎯 ESPN CONTENT scoreboard TROUVÉ"
      );
    }
  }
}

function safePreview(value, maxLength = 3000) {
  try {
    const json = JSON.stringify(value);

    return json.length > maxLength
      ? json.slice(0, maxLength) + "..."
      : json;
  } catch {
    return "[Impossible de convertir en JSON]";
  }
}

// ======================================================
// EXTRACTION SCOREBOARD
// ======================================================

function extractScoreboardData(data) {
  if (!data || typeof data !== "object") {
    return [];
  }

  // Format direct
  if (Array.isArray(data.events)) {
    return data.events;
  }

  // gamepackageJSON
  if (
    data.gamepackageJSON &&
    Array.isArray(data.gamepackageJSON.events)
  ) {
    return data.gamepackageJSON.events;
  }

  // content
  if (
    data.content &&
    typeof data.content === "object"
  ) {
    if (Array.isArray(data.content.events)) {
      return data.content.events;
    }

    if (
      data.content.gamepackageJSON &&
      Array.isArray(
        data.content.gamepackageJSON.events
      )
    ) {
      return data.content.gamepackageJSON.events;
    }

    if (
      data.content.sbData &&
      typeof data.content.sbData === "object"
    ) {
      if (
        Array.isArray(
          data.content.sbData.events
        )
      ) {
        return data.content.sbData.events;
      }

      if (
        data.content.sbData.content &&
        Array.isArray(
          data.content.sbData.content.events
        )
      ) {
        return data.content.sbData.content.events;
      }
    }
  }

  // content sous forme de chaîne JSON
  if (typeof data.content === "string") {
    try {
      const parsed = JSON.parse(
        data.content
      );

      if (Array.isArray(parsed.events)) {
        return parsed.events;
      }

      if (
        parsed.sbData &&
        Array.isArray(parsed.sbData.events)
      ) {
        return parsed.sbData.events;
      }
    } catch {
      // Rien
    }
  }

  return [];
}

// ======================================================
// SCAN COMPÉTITION
// ======================================================

async function scanCompetition(
  competition,
  env
) {
  const url =
    `https://cdn.espn.com/core/soccer/scoreboard?xhr=1&league=${encodeURIComponent(competition)}`;

  try {
    const data =
      await fetchESPN(url);

    // Diagnostic automatique
    diagnosticContent(
      data,
      competition
    );

    const events =
      extractScoreboardData(data);

    console.log(
      `⚽ ESPN CDN ${competition}: ${events.length} match(s)`
    );

    if (!events.length) {
      console.error(
        `❌ ESPN CDN ${competition}: aucun match extrait`
      );

      return;
    }

    for (const match of events) {
      try {
        await inspectMatch(
          competition,
          match,
          env
        );
      } catch (error) {
        console.error(
          `❌ Match ${competition}/${match?.id}:`,
          error?.message || String(error)
        );
      }
    }
  } catch (error) {
    console.error(
      `❌ ESPN CDN ${competition}:`,
      error?.message || String(error)
    );
  }
}

// ======================================================
// INSPECTION MATCH
// ======================================================

async function inspectMatch(
  competition,
  match,
  env
) {
  if (!match?.id) {
    return;
  }

  console.log(
    `🔎 Inspection match ${competition}: ${match.id}`
  );

  // Pour l'instant, on conserve l'endpoint summary
  // afin de diagnostiquer séparément son comportement.
  const url =
    `${ESPN_BASE}/${competition}/summary?event=${encodeURIComponent(match.id)}`;

  try {
    const data =
      await fetchESPN(url);

    const keyEvents =
      Array.isArray(data?.keyEvents)
        ? data.keyEvents
        : [];

    console.log(
      `🎯 ${competition}/${match.id}: ${keyEvents.length} événement(s)`
    );

    for (const event of keyEvents) {
      await processEvent(
        competition,
        match,
        event,
        env
      );
    }
  } catch (error) {
    console.error(
      `❌ Summary ${competition}/${match.id}:`,
      error?.message || String(error)
    );
  }
}

// ======================================================
// TRAITEMENT DES ÉVÉNEMENTS
// ======================================================

async function processEvent(
  competition,
  match,
  event,
  env
) {
  if (!event) {
    return;
  }

  const eventType =
    getEventType(event);

  if (!eventType) {
    return;
  }

  const allowedTypes = [
    "GOAL",
    "OWN_GOAL",
    "PENALTY_GOAL",
    "MISSED_PENALTY",
    "PENALTY_AWARDED",
    "CANCELLED_GOAL",
    "YELLOW_CARD",
    "RED_CARD",
    "SECOND_YELLOW_RED"
  ];

  if (!allowedTypes.includes(eventType)) {
    return;
  }

  const eventId =
    buildEventId(
      competition,
      match,
      event
    );

  const seen =
    await env.GLOBALFOOT_KV.get(eventId);

  if (seen) {
    return;
  }

  const message =
    formatFacebookMessage(
      competition,
      match,
      event,
      eventType
    );

  console.log(
    "📘 Facebook publication :",
    message
  );

  await publishToFacebook(
    message,
    env
  );

  await env.GLOBALFOOT_KV.put(
    eventId,
    "1",
    {
      expirationTtl: 60 * 60 * 24 * 90
    }
  );
}

// ======================================================
// EVENT TYPE
// ======================================================

function getEventType(event) {
  const type =
    event?.type?.text ||
    event?.type?.name ||
    event?.type?.id ||
    event?.type;

  if (!type) {
    return null;
  }

  const value =
    String(type)
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

  if (
    value.includes("OWN") &&
    value.includes("GOAL")
  ) {
    return "OWN_GOAL";
  }

  if (
    value.includes("PENALTY") &&
    value.includes("GOAL")
  ) {
    return "PENALTY_GOAL";
  }

  if (
    value.includes("MISSED") &&
    value.includes("PENALTY")
  ) {
    return "MISSED_PENALTY";
  }

  if (
    value.includes("PENALTY") &&
    value.includes("AWARDED")
  ) {
    return "PENALTY_AWARDED";
  }

  if (
    value.includes("CANCEL") &&
    value.includes("GOAL")
  ) {
    return "CANCELLED_GOAL";
  }

  if (
    value.includes("SECOND") &&
    value.includes("YELLOW") &&
    value.includes("RED")
  ) {
    return "SECOND_YELLOW_RED";
  }

  if (value.includes("RED")) {
    return "RED_CARD";
  }

  if (value.includes("YELLOW")) {
    return "YELLOW_CARD";
  }

  if (value.includes("GOAL")) {
    return "GOAL";
  }

  return null;
}

// ======================================================
// EVENT ID
// ======================================================

function buildEventId(
  competition,
  match,
  event
) {
  return [
    "globalfoot",
    competition,
    match?.id || "unknown",
    event?.id ||
      event?.sequenceNumber ||
      event?.clock?.displayValue ||
      JSON.stringify(event)
  ].join(":");
}

// ======================================================
// FACEBOOK MESSAGE
// ======================================================

function formatFacebookMessage(
  competition,
  match,
  event,
  eventType
) {
  const competitionName =
    competition;

  const homeTeam =
    match?.competitions?.[0]?.competitors?.find(
      c => c.homeAway === "home"
    )?.team?.displayName ||
    "Équipe locale";

  const awayTeam =
    match?.competitions?.[0]?.competitors?.find(
      c => c.homeAway === "away"
    )?.team?.displayName ||
    "Équipe visiteuse";

  const athlete =
    event?.athletesInvolved?.[0]?.displayName ||
    event?.athlete?.displayName ||
    event?.participants?.[0]?.athlete?.displayName ||
    "";

  const minute =
    event?.clock?.displayValue ||
    event?.time?.displayValue ||
    "";

  let title = "";

  switch (eventType) {
    case "GOAL":
      title = "⚽ BUT !";
      break;

    case "OWN_GOAL":
      title = "😱 BUT CONTRE SON CAMP !";
      break;

    case "PENALTY_GOAL":
      title = "⚽ PENALTY TRANSFORMÉ !";
      break;

    case "MISSED_PENALTY":
      title = "❌ PENALTY RATÉ !";
      break;

    case "PENALTY_AWARDED":
      title = "🟨 PENALTY !";
      break;

    case "CANCELLED_GOAL":
      title = "🚫 BUT ANNULÉ !";
      break;

    case "YELLOW_CARD":
      title = "🟨 CARTON JAUNE !";
      break;

    case "RED_CARD":
      title = "🟥 CARTON ROUGE !";
      break;

    case "SECOND_YELLOW_RED":
      title = "🟥 DEUXIÈME JAUNE — EXPULSION !";
      break;

    default:
      title = "⚽ ACTION !";
  }

  return `${title}

🏆 ${competitionName}
${homeTeam} vs ${awayTeam}
${athlete ? `👤 ${athlete}` : ""}
${minute ? `⏱️ ${minute}` : ""}

🌍 GlobalFoot`;
}

// ======================================================
// FACEBOOK
// ======================================================

async function publishToFacebook(
  message,
  env
) {
  if (!env.FACEBOOK_PAGE_TOKEN) {
    throw new Error(
      "FACEBOOK_PAGE_TOKEN absent"
    );
  }

  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${PAGE_ID}/feed`;

  const body =
    new URLSearchParams();

  body.set(
    "message",
    message
  );

  body.set(
    "access_token",
    env.FACEBOOK_PAGE_TOKEN
  );

  const response =
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body
    });

  const text =
    await response.text();

  console.log(
    "📘 Facebook response : HTTP",
    response.status
  );

  console.log(
    "📘 Facebook body :",
    text.slice(0, 1000)
  );

  if (!response.ok) {
    throw new Error(
      `Facebook HTTP ${response.status}: ${text}`
    );
  }

  return text;
                   }
