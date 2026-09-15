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
// EXTRAIRE LE GAMEPACKAGE
// ======================================================

function getGamePackage(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (
    data.gamepackageJSON &&
    typeof data.gamepackageJSON === "object"
  ) {
    return data.gamepackageJSON;
  }

  if (
    data.content &&
    typeof data.content === "object" &&
    data.content.gamepackageJSON
  ) {
    return data.content.gamepackageJSON;
  }

  if (
    data.content &&
    typeof data.content === "object"
  ) {
    return data.content;
  }

  return data;
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

    const events =
      extractScoreboardEvents(data);

    console.log(
      `⚽ ESPN CDN ${competition}: ${events.length} match(s)`
    );

    if (!events.length) {
      console.error(
        `❌ ESPN CDN ${competition}: aucun match`
      );
      return;
    }

    for (const match of events) {
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
// INSPECT MATCH — CDN GAME
// ======================================================

async function inspectMatch(
  competition,
  match,
  env
) {
  const gameId = match.id;

  console.log(
    `🔎 Inspection CDN match ${competition}: ${gameId}`
  );

  const gameUrl =
    `https://cdn.espn.com/core/soccer/game?xhr=1&gameId=${encodeURIComponent(gameId)}`;

  try {
    const data =
      await fetchESPN(gameUrl);

    const pkg =
      getGamePackage(data);

    if (!pkg) {
      console.error(
        `❌ Package CDN absent ${competition}/${gameId}`
      );
      return;
    }

    console.log(
      `📦 Game package reçu ${competition}/${gameId}`
    );

    // On cherche plusieurs emplacements possibles.
    const events =
      extractGameEvents(pkg);

    console.log(
      `🎯 Événements CDN ${competition}/${gameId}: ${events.length}`
    );

    if (events.length) {
      for (const event of events) {
        await processEvent(
          competition,
          match,
          event,
          env
        );
      }

      return;
    }

    // Si le package game ne contient pas directement
    // les événements, on tente playbyplay.
    await inspectPlayByPlay(
      competition,
      match,
      env
    );
  } catch (error) {
    console.error(
      `❌ Game CDN ${competition}/${gameId}:`,
      error?.message || String(error)
    );
  }
}

// ======================================================
// PLAY-BY-PLAY CDN
// ======================================================

async function inspectPlayByPlay(
  competition,
  match,
  env
) {
  const gameId = match.id;

  const url =
    `https://cdn.espn.com/core/soccer/playbyplay?xhr=1&gameId=${encodeURIComponent(gameId)}`;

  try {
    const data =
      await fetchESPN(url);

    const pkg =
      getGamePackage(data);

    const plays =
      extractGameEvents(pkg);

    console.log(
      `🎬 PlayByPlay ${competition}/${gameId}: ${plays.length} événement(s)`
    );

    for (const event of plays) {
      await processEvent(
        competition,
        match,
        event,
        env
      );
    }
  } catch (error) {
    console.error(
      `❌ PlayByPlay ${competition}/${gameId}:`,
      error?.message || String(error)
    );
  }
}

// ======================================================
// EXTRACTION DES ÉVÉNEMENTS
// ======================================================

function extractGameEvents(pkg) {
  if (!pkg || typeof pkg !== "object") {
    return [];
  }

  if (Array.isArray(pkg.keyEvents)) {
    return pkg.keyEvents;
  }

  if (Array.isArray(pkg.plays)) {
    return pkg.plays;
  }

  if (Array.isArray(pkg.events)) {
    return pkg.events;
  }

  if (
    pkg.game &&
    Array.isArray(pkg.game.plays)
  ) {
    return pkg.game.plays;
  }

  if (
    pkg.game &&
    Array.isArray(pkg.game.keyEvents)
  ) {
    return pkg.game.keyEvents;
  }

  if (
    pkg.content &&
    Array.isArray(pkg.content.plays)
  ) {
    return pkg.content.plays;
  }

  if (
    pkg.content &&
    Array.isArray(pkg.content.keyEvents)
  ) {
    return pkg.content.keyEvents;
  }

  return [];
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
    event.shortText
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  if (!text) {
    return null;
  }

  if (
    text.includes("OWN GOAL") ||
    text.includes("OWN_GOAL")
  ) {
    return "OWN_GOAL";
  }

  if (
    text.includes("PENALTY") &&
    (
      text.includes("MISSED") ||
      text.includes("MISS")
    )
  ) {
    return "MISSED_PENALTY";
  }

  if (
    text.includes("PENALTY") &&
    (
      text.includes("GOAL") ||
      text.includes("SCORED")
    )
  ) {
    return "PENALTY_GOAL";
  }

  if (
    text.includes("PENALTY") &&
    (
      text.includes("AWARDED") ||
      text.includes("AWARD")
    )
  ) {
    return "PENALTY_AWARDED";
  }

  if (
    text.includes("CANCEL") &&
    text.includes("GOAL")
  ) {
    return "CANCELLED_GOAL";
  }

  if (
    text.includes("SECOND") &&
    text.includes("YELLOW") &&
    text.includes("RED")
  ) {
    return "SECOND_YELLOW_RED";
  }

  if (text.includes("RED CARD")) {
    return "RED_CARD";
  }

  if (text.includes("YELLOW CARD")) {
    return "YELLOW_CARD";
  }

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
// TRAITEMENT
// ======================================================

async function processEvent(
  competition,
  match,
  event,
  env
) {
  const eventType =
    getEventType(event);

  if (!eventType) {
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

  await publishToFacebook(
    message,
    env
  );

  await env.GLOBALFOOT_KV.put(
    eventId,
    "1",
    {
      expirationTtl:
        60 * 60 * 24 * 90
    }
  );

  console.log(
    `✅ Événement enregistré : ${eventId}`
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
      title = "🟥 EXPULSION !";
      break;

    default:
      title = "⚽ ACTION !";
  }

  return `${title}

🏆 ${competition}
${homeTeam} ${home?.score ?? ""} - ${away?.score ?? ""} ${awayTeam}
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
