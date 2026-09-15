const PAGE_ID = "987662881093953";
const GRAPH_API_VERSION = "v26.0";

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
  async scheduled(controller, env) {
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

  async fetch() {
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
// FETCH JSON
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
    "🛰️ ESPN response : HTTP",
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
// SCOREBOARD
// ======================================================

function extractScoreboardEvents(data) {
  if (!data || typeof data !== "object") {
    return [];
  }

  if (Array.isArray(data.events)) {
    return data.events;
  }

  if (
    data.gamepackageJSON &&
    Array.isArray(data.gamepackageJSON.events)
  ) {
    return data.gamepackageJSON.events;
  }

  if (
    data.content &&
    typeof data.content === "object"
  ) {
    if (Array.isArray(data.content.events)) {
      return data.content.events;
    }

    if (
      data.content.sbData &&
      typeof data.content.sbData === "object"
    ) {
      if (
        Array.isArray(data.content.sbData.events)
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

  return [];
}

// ======================================================
// EXTRAIRE LES ÉVÉNEMENTS DIRECTEMENT DU SCOREBOARD
// ======================================================

function extractMatchEvents(match) {
  if (!match || typeof match !== "object") {
    return [];
  }

  const results = [];

  // ----------------------------------------------------
  // 1. Détails de la compétition
  // ----------------------------------------------------

  const competitions =
    Array.isArray(match.competitions)
      ? match.competitions
      : [];

  for (const competition of competitions) {
    if (
      Array.isArray(competition.details)
    ) {
      results.push(
        ...competition.details
      );
    }

    if (
      Array.isArray(competition.keyEvents)
    ) {
      results.push(
        ...competition.keyEvents
      );
    }

    if (
      Array.isArray(competition.plays)
    ) {
      results.push(
        ...competition.plays
      );
    }
  }

  // ----------------------------------------------------
  // 2. Événements directement sur le match
  // ----------------------------------------------------

  if (Array.isArray(match.details)) {
    results.push(...match.details);
  }

  if (Array.isArray(match.keyEvents)) {
    results.push(...match.keyEvents);
  }

  if (Array.isArray(match.plays)) {
    results.push(...match.plays);
  }

  // ----------------------------------------------------
  // 3. Supprimer les doublons
  // ----------------------------------------------------

  const seen = new Set();

  return results.filter(event => {
    if (!event || typeof event !== "object") {
      return false;
    }

    const id =
      event.id ||
      event.sequenceNumber ||
      event.clock?.value ||
      event.clock?.displayValue ||
      event.text ||
      JSON.stringify(event);

    if (seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
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

    const matches =
      extractScoreboardEvents(data);

    console.log(
      `⚽ ESPN CDN ${competition}: ${matches.length} match(s)`
    );

    if (!matches.length) {
      console.log(
        `ℹ️ Aucun match ${competition}`
      );
      return;
    }

    for (const match of matches) {
      if (!match?.id) {
        continue;
      }

      await inspectMatch(
        competition,
        match,
        env
      );
    }
  } catch (error) {
    console.error(
      `❌ ESPN CDN ${competition}:`,
      error?.message || String(error)
    );
  }
}

// ======================================================
// INSPECTION DU MATCH
// ======================================================

async function inspectMatch(
  competition,
  match,
  env
) {
  const gameId = match.id;

  console.log(
    `🔎 Inspection match ${competition}: ${gameId}`
  );

  // ====================================================
  // DIAGNOSTIC TEMPORAIRE
  // ====================================================

  console.log(
    `🧪 STRUCTURE MATCH ${competition}/${gameId}:`,
    JSON.stringify(match).slice(0, 5000)
  );

  // Aucun appel Game CDN.
  // On utilise directement les événements
  // présents dans le scoreboard.

  const events =
    extractMatchEvents(match);

  console.log(
    `🎯 Événements trouvés ${competition}/${gameId}: ${events.length}`
  );

  if (!events.length) {
    return;
  }

  for (const event of events) {
    await processEvent(
      competition,
      match,
      event,
      env
    );
  }
}

// ======================================================
// EVENT TYPE
// ======================================================

function getEventType(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const text = [
    event.type?.text,
    event.type?.name,
    event.type?.id,
    event.type,
    event.text,
    event.description,
    event.shortText,
    event.label
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  if (!text) {
    return null;
  }

  // ----------------------------------------------------
  // BUT CONTRE SON CAMP
  // ----------------------------------------------------

  if (
    text.includes("OWN GOAL") ||
    text.includes("OWN_GOAL") ||
    text.includes("AUTOGOAL")
  ) {
    return "OWN_GOAL";
  }

  // ----------------------------------------------------
  // PENALTY RATÉ
  // ----------------------------------------------------

  if (
    text.includes("PENALTY") &&
    (
      text.includes("MISSED") ||
      text.includes("MISS")
    )
  ) {
    return "MISSED_PENALTY";
  }

  // ----------------------------------------------------
  // PENALTY MARQUÉ
  // ----------------------------------------------------

  if (
    text.includes("PENALTY") &&
    (
      text.includes("GOAL") ||
      text.includes("SCORED") ||
      text.includes("CONVERTED")
    )
  ) {
    return "PENALTY_GOAL";
  }

  // ----------------------------------------------------
  // BUT
  // ----------------------------------------------------

  if (
    text.includes("GOAL") ||
    text.includes("SCORES") ||
    text.includes("SCORED")
  ) {
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
      event?.clock?.value ||
      event?.clock?.displayValue ||
      event?.text ||
      JSON.stringify(event)
  ].join(":");
}

// ======================================================
// TRAITEMENT DU BUT
// ======================================================

async function processEvent(
  competition,
  match,
  event,
  env
) {
  const eventType =
    getEventType(event);

  // GlobalFoot est actuellement configuré
  // pour publier uniquement les buts.
  if (
    eventType !== "GOAL" &&
    eventType !== "OWN_GOAL" &&
    eventType !== "PENALTY_GOAL"
  ) {
    return;
  }

  const eventId =
    buildEventId(
      competition,
      match,
      event
    );

  const alreadySeen =
    await env.GLOBALFOOT_KV.get(eventId);

  if (alreadySeen) {
    console.log(
      `♻️ Déjà traité : ${eventId}`
    );
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

  // On publie d'abord.
  await publishToFacebook(
    message,
    env
  );

  // On enregistre seulement si Facebook
  // a accepté la publication.
  await env.GLOBALFOOT_KV.put(
    eventId,
    "1",
    {
      expirationTtl:
        60 * 60 * 24 * 90
    }
  );

  console.log(
    `✅ But enregistré : ${eventId}`
  );
}

// ======================================================
// MESSAGE FACEBOOK
// ======================================================

function formatFacebookMessage(
  competition,
  match,
  event,
  eventType
) {
  const competitors =
    match?.competitions?.[0]?.competitors ||
    [];

  const home =
    competitors.find(
      c => c.homeAway === "home"
    );

  const away =
    competitors.find(
      c => c.homeAway === "away"
    );

  const homeTeam =
    home?.team?.displayName ||
    home?.team?.shortDisplayName ||
    "Équipe locale";

  const awayTeam =
    away?.team?.displayName ||
    away?.team?.shortDisplayName ||
    "Équipe visiteuse";

  const athlete =
    event?.athletesInvolved?.[0]?.displayName ||
    event?.athlete?.displayName ||
    event?.participants?.[0]?.athlete?.displayName ||
    event?.athletesInvolved?.[0]?.fullName ||
    "";

  const minute =
    event?.clock?.displayValue ||
    event?.time?.displayValue ||
    "";

  const description =
    event?.text ||
    event?.description ||
    event?.shortText ||
    "";

  let title;

  switch (eventType) {
    case "OWN_GOAL":
      title =
        "😱 BUT CONTRE SON CAMP !";
      break;

    case "PENALTY_GOAL":
      title =
        "⚽ PENALTY TRANSFORMÉ !";
      break;

    default:
      title =
        "⚽ BUT !";
  }

  const score =
    `${home?.score ?? ""} - ${away?.score ?? ""}`;

  return `${title}

🏆 ${competition}
${homeTeam} ${score} ${awayTeam}
${athlete ? `👤 ${athlete}` : ""}
${minute ? `⏱️ ${minute}` : ""}
${description ? `\n${description}` : ""}

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
