const PAGE_ID = "987662881093953";
const GRAPH_API_VERSION = "v26.0";
const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

// =====================================================
// 5 GROUPES = 5 CRON TRIGGERS
// Chaque compétition est vérifiée toutes les 5 minutes.
// =====================================================

const GROUPS = {
  "0-59/5 * * * *": [
    "eng.1",
    "esp.1",
    "ita.1",
    "ger.1",
    "fra.1"
  ],

  "1-59/5 * * * *": [
    "por.1",
    "ned.1",
    "bra.1",
    "arg.1",
    "uefa.champions"
  ],

  "2-59/5 * * * *": [
    "uefa.europa",
    "uefa.europa.conf",
    "conmebol.libertadores",
    "conmebol.sudamericana",
    "conmebol.america"
  ],

  "3-59/5 * * * *": [
    "fifa.world",
    "caf.nations",
    "concacaf.gold",
    "afc.asian.cup",
    "fifa.cwc"
  ],

  "4-59/5 * * * *": [
    "eng.fa",
    "esp.copa_del_rey",
    "bra.copa_do_brazil",
    "ksa.1"
  ]
};

// =====================================================
// CONFIGURATION
// =====================================================

const RECENT_MATCH_MINUTES = 180;
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 90;


// =====================================================
// WORKER
// =====================================================

export default {

  async fetch(request, env) {

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(
        "🌍 GlobalFoot Worker actif.",
        {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=UTF-8"
          }
        }
      );
    }

    return new Response("GlobalFoot OK", {
      status: 200
    });
  },


  async scheduled(controller, env) {

    const competitions = GROUPS[controller.cron];

    if (!competitions) {
      console.log("Cron inconnu :", controller.cron);
      return;
    }

    console.log(
      `🌍 GlobalFoot : ${competitions.length} compétitions`
    );

    for (const competition of competitions) {

      try {

        await scanCompetition(
          competition,
          env
        );

      } catch (error) {

        console.error(
          `Erreur ${competition}:`,
          error?.stack || error
        );
      }
    }
  }
};


// =====================================================
// SCAN COMPÉTITION
// =====================================================

async function scanCompetition(
  competition,
  env
) {

  const response = await fetch(
    `${ESPN_BASE}/${competition}/scoreboard`
  );

  if (!response.ok) {

    console.log(
      `ESPN ${competition}: HTTP ${response.status}`
    );

    return;
  }

  const data = await response.json();

  const events = Array.isArray(data.events)
    ? data.events
    : [];

  for (const match of events) {

    if (!shouldInspectMatch(match)) {
      continue;
    }

    try {

      await inspectMatch(
        match,
        competition,
        env
      );

    } catch (error) {

      console.error(
        `Erreur match ${competition}/${match.id}:`,
        error?.stack || error
      );
    }
  }
}


// =====================================================
// MATCH INTÉRESSANT ?
// =====================================================

function shouldInspectMatch(match) {

  const state =
    match?.status?.type?.state;

  // Match en direct
  if (state === "in") {
    return true;
  }

  // Match terminé récemment
  if (state !== "post") {
    return false;
  }

  const matchTime =
    Date.parse(match?.date || "");

  if (!Number.isFinite(matchTime)) {
    return false;
  }

  const ageMinutes =
    (Date.now() - matchTime) / 60000;

  return (
    ageMinutes >= -10 &&
    ageMinutes <= RECENT_MATCH_MINUTES
  );
}


// =====================================================
// RÉCUPÉRATION DES ÉVÉNEMENTS
// =====================================================

async function inspectMatch(
  match,
  competition,
  env
) {

  const response = await fetch(
    `${ESPN_BASE}/${competition}/summary?event=${encodeURIComponent(match.id)}`
  );

  if (!response.ok) {

    console.log(
      `Summary indisponible : ${competition}/${match.id}`
    );

    return;
  }

  const summary =
    await response.json();

  const keyEvents =
    Array.isArray(summary.keyEvents)
      ? summary.keyEvents
      : [];

  if (!keyEvents.length) {
    return;
  }

  const score =
    getCurrentScore(match);

  // Évite de publier deux fois le même événement
  // lorsqu'ESPN le représente dans plusieurs parties
  // du résumé.
  const processed = new Set();

  for (
    let index = 0;
    index < keyEvents.length;
    index++
  ) {

    const event =
      keyEvents[index];

    const eventType =
      detectEventType(event);

    if (!eventType) {
      continue;
    }

    // Hors-jeu simple :
    // pas de publication.
    if (eventType === "OFFSIDE_ONLY") {
      continue;
    }

    const eventId =
      createEventId(
        competition,
        match.id,
        event,
        index,
        eventType
      );

    if (processed.has(eventId)) {
      continue;
    }

    processed.add(eventId);

    await processEvent(
      event,
      eventType,
      eventId,
      match,
      score,
      env
    );
  }
}


// =====================================================
// DÉTECTION DES 9 ÉVÉNEMENTS GLOBALFOOT
// =====================================================

function detectEventType(event) {

  const text =
    getEventText(event);

  const scoring =
    event?.scoringPlay === true;

  const penalty =
    isPenaltyEvent(event, text);

  const ownGoal =
    isOwnGoal(event, text);

  const cancelledGoal =
    isCancelledGoal(event, text);

  const yellow =
    isYellowCard(event, text);

  const red =
    isRedCard(event, text);

  const secondYellow =
    isSecondYellow(event, text);

  const penaltyMissed =
    isMissedPenalty(event, text);

  const penaltyAwarded =
    isPenaltyAwarded(event, text);


  // ===================================================
  // 1. DEUXIÈME JAUNE → ROUGE
  // ===================================================

  if (secondYellow) {
    return "SECOND_YELLOW_RED";
  }


  // ===================================================
  // 2. CARTON ROUGE
  // ===================================================

  if (red) {
    return "RED_CARD";
  }


  // ===================================================
  // 3. CARTON JAUNE
  // ===================================================

  if (yellow) {
    return "YELLOW_CARD";
  }


  // ===================================================
  // 4. PENALTY RATÉ
  // ===================================================

  if (penaltyMissed) {
    return "MISSED_PENALTY";
  }


  // ===================================================
  // 5. PENALTY ACCORDÉ
  // ===================================================

  if (penaltyAwarded) {
    return "PENALTY_AWARDED";
  }


  // ===================================================
  // 6. BUT ANNULÉ
  // ===================================================

  if (cancelledGoal) {
    return "CANCELLED_GOAL";
  }


  // ===================================================
  // 7. BUT
  // ===================================================

  if (scoring) {

    if (ownGoal) {
      return "OWN_GOAL";
    }

    if (penalty) {
      return "PENALTY_GOAL";
    }

    return "GOAL";
  }


  // ===================================================
  // 8. HORS-JEU SIMPLE
  // ===================================================

  if (isOffside(event, text)) {
    return "OFFSIDE_ONLY";
  }


  return null;
}


// =====================================================
// TEXTE D'UN ÉVÉNEMENT
// =====================================================

function getEventText(event) {

  let text = "";

  try {
    text += ` ${event?.text || ""}`;
    text += ` ${event?.type?.text || ""}`;
    text += ` ${event?.type?.name || ""}`;
    text += ` ${event?.type?.id || ""}`;
    text += ` ${event?.detail || ""}`;
    text += ` ${event?.description || ""}`;
    text += ` ${event?.shortText || ""}`;
    text += ` ${JSON.stringify(event || {})}`;
  } catch {
    // Rien
  }

  return text.toLowerCase();
}


// =====================================================
// IDENTIFICATION DES ÉVÉNEMENTS
// =====================================================

function isPenaltyEvent(event, text) {

  return (
    text.includes("penalty") ||
    text.includes("pen.") ||
    text.includes("penalty kick")
  );
}


function isOwnGoal(event, text) {

  return (
    text.includes("own goal") ||
    text.includes("own_goal") ||
    text.includes("autogoal") ||
    text.includes("autogol")
  );
}


function isCancelledGoal(event, text) {

  return (
    text.includes("goal disallowed") ||
    text.includes("goal cancelled") ||
    text.includes("goal canceled") ||
    text.includes("goal overturned") ||
    text.includes("goal nullified") ||
    text.includes("but annul") ||
    text.includes("but refus") ||
    text.includes("annulé")
  );
}


function isOffside(event, text) {

  return (
    text.includes("offside") ||
    text.includes("hors-jeu")
  );
}


function isYellowCard(event, text) {

  if (
    text.includes("second yellow") ||
    text.includes("second booking") ||
    text.includes("second caution")
  ) {
    return false;
  }

  return (
    text.includes("yellow card") ||
    text.includes("yellow") ||
    text.includes("caution")
  );
}


function isRedCard(event, text) {

  return (
    text.includes("red card") ||
    text.includes("red-card") ||
    text.includes("straight red") ||
    text.includes("sent off") ||
    text.includes("ejected")
  );
}


function isSecondYellow(event, text) {

  return (
    text.includes("second yellow") ||
    text.includes("second booking") ||
    text.includes("second caution") ||
    text.includes("2nd yellow") ||
    text.includes("yellow-red")
  );
}


function isMissedPenalty(event, text) {

  if (!isPenaltyEvent(event, text)) {
    return false;
  }

  return (
    text.includes("missed") ||
    text.includes("miss") ||
    text.includes("saved") ||
    text.includes("save") ||
    text.includes("penalty miss") ||
    text.includes("penalty saved") ||
    text.includes("penalty not scored") ||
    text.includes("off target") ||
    text.includes("wide")
  );
}


function isPenaltyAwarded(event, text) {

  if (!isPenaltyEvent(event, text)) {
    return false;
  }

  if (event?.scoringPlay === true) {
    return false;
  }

  if (isMissedPenalty(event, text)) {
    return false;
  }

  return (
    text.includes("penalty awarded") ||
    text.includes("penalty given") ||
    text.includes("penalty won") ||
    text.includes("penalty") &&
    (
      text.includes("awarded") ||
      text.includes("given") ||
      text.includes("decision")
    )
  );
}


// =====================================================
// TRAITEMENT D'UN ÉVÉNEMENT
// =====================================================

async function processEvent(
  event,
  eventType,
  eventId,
  match,
  score,
  env
) {

  const alreadyPosted =
    await env.GLOBALFOOT_KV.get(eventId);

  if (alreadyPosted) {
    return;
  }

  const player =
    getEventPlayer(event);

  const minute =
    getEventMinute(event);

  const message =
    formatGlobalFootMessage(
      eventType,
      player,
      minute,
      score,
      event
    );

  if (!message) {
    return;
  }

  console.log(
    `🌍 GlobalFoot ${eventType}: ${message}`
  );

  const result =
    await publishToFacebook(
      message,
      env.FACEBOOK_PAGE_TOKEN
    );

  if (!result.ok) {

    console.error(
      "❌ Facebook a refusé la publication :",
      JSON.stringify(result.data)
    );

    return;
  }

  await env.GLOBALFOOT_KV.put(
    eventId,
    "1",
    {
      expirationTtl: EVENT_TTL_SECONDS
    }
  );

  console.log(
    `✅ Événement publié : ${eventId}`
  );
}


// =====================================================
// ID UNIQUE D'ÉVÉNEMENT
// =====================================================

function createEventId(
  competition,
  matchId,
  event,
  index,
  eventType
) {

  const eventId =
    event?.id ??
    event?.sequenceNumber ??
    event?.clock?.value ??
    event?.clock?.displayValue ??
    event?.type?.id ??
    `${eventType}-${index}`;

  return (
    `event:${competition}:${matchId}:${eventType}:${eventId}`
  );
}


// =====================================================
// JOUEUR / ACTEUR
// =====================================================

function getEventPlayer(event) {

  if (event?.athlete?.displayName) {
    return event.athlete.displayName;
  }

  if (event?.player?.displayName) {
    return event.player.displayName;
  }

  for (
    const participant of event?.participants || []
  ) {

    if (
      participant?.athlete?.displayName
    ) {
      return participant.athlete.displayName;
    }

    if (
      participant?.player?.displayName
    ) {
      return participant.player.displayName;
    }
  }

  return "Joueur";
}


// =====================================================
// MINUTE
// =====================================================

function getEventMinute(event) {

  if (event?.clock?.displayValue) {
    return event.clock.displayValue
      .replace(/\s+/g, "");
  }

  if (event?.minute != null) {
    return `${event.minute}'`;
  }

  if (event?.clock?.value != null) {

    const seconds =
      Number(event.clock.value);

    if (Number.isFinite(seconds)) {
      return `${Math.floor(seconds / 60)}'`;
    }
  }

  return "?";
}


// =====================================================
// SCORE
// =====================================================

function getCurrentScore(match) {

  const teams =
    match?.competitions?.[0]?.competitors || [];

  let home = {
    name: "Équipe locale",
    score: "?"
  };

  let away = {
    name: "Équipe visiteuse",
    score: "?"
  };

  for (const team of teams) {

    const data = {

      name:
        team?.team?.shortDisplayName ||
        team?.team?.displayName ||
        team?.team?.name ||
        "Équipe",

      score:
        team?.score ?? "?"
    };

    if (team?.homeAway === "home") {
      home = data;
    }

    if (team?.homeAway === "away") {
      away = data;
    }
  }

  return {
    home,
    away
  };
}


// =====================================================
// NOM DU MATCH
// =====================================================

function getMatchLine(score) {

  return (
    `📍 ${score.home.name} ${score.home.score}-${score.away.score} ${score.away.name}`
  );
}


// =====================================================
// FORMAT GLOBALFOOT
// =====================================================

function formatGlobalFootMessage(
  eventType,
  player,
  minute,
  score,
  event
) {

  const matchLine =
    getMatchLine(score);


  // ================================================
  // BUT
  // ================================================

  if (eventType === "GOAL") {

    return `⚡ BUT !

⚽️ ${player} frappe et ça fait ${score.home.score}-${score.away.score} !
⏱️ ${minute}

${matchLine}

🌍 GlobalFoot`;
  }


  // ================================================
  // BUT CONTRE SON CAMP
  // ================================================

  if (eventType === "OWN_GOAL") {

    return `⚡ BUT !

⚽️ But contre son camp de ${player} !
⏱️ ${minute}

${matchLine}

🌍 GlobalFoot`;
  }


  // ================================================
  // PENALTY MARQUÉ
  // ================================================

  if (eventType === "PENALTY_GOAL") {

    return `🎯 PENALTY !

⚽️ ${player} transforme le penalty !
⏱️ ${minute}

${matchLine}

🌍 GlobalFoot`;
  }


  // ================================================
  // PENALTY RATÉ
  // ================================================

  if (eventType === "MISSED_PENALTY") {

    return `❌ PENALTY RATÉ !

🎯 ${player} manque sa tentative.
⏱️ ${minute}

${matchLine}

🌍 GlobalFoot`;
  }


  // ================================================
  // PENALTY ACCORDÉ
  // ================================================

  if (eventType === "PENALTY_AWARDED") {

    return `🎯 PENALTY !

🚨 Penalty accordé.
⏱️ ${minute}

${matchLine}

🌍 GlobalFoot`;
  }


  // ================================================
  // BUT ANNULÉ
  // ================================================

  if (eventType === "CANCELLED_GOAL") {

    const text =
      getEventText(event);

    let reason =
      "Le but est refusé.";

    if (
      text.includes("offside") ||
      text.includes("hors-jeu")
    ) {
      reason =
        "Le but est annulé pour hors-jeu.";
    } else if (
      text.includes("foul") ||
      text.includes("faute")
    ) {
      reason =
        "Le but est annulé pour faute.";
    } else if (
      text.includes("var") ||
      text.includes("overturned")
    ) {
      reason =
        "Le but est annulé après vérification.";
    }

    return `🚫 BUT ANNULÉ !

⚽️ ${reason}
⏱️ ${minute}

${matchLine}

🌍 GlobalFoot`;
  }


  // ================================================
  // CARTON JAUNE
  // ================================================

  if (eventType === "YELLOW_CARD") {

    return `🟨 CARTON !

👤 ${player} est averti.
⏱️ ${minute}

${matchLine}

🌍 GlobalFoot`;
  }


  // ================================================
  // CARTON ROUGE
  // ================================================

  if (eventType === "RED_CARD") {

    return `🟥 CARTON ROUGE !

🚨 ${player} est expulsé !
⏱️ ${minute}

${matchLine}

🌍 GlobalFoot`;
  }


  // ================================================
  // DEUXIÈME JAUNE → ROUGE
  // ================================================

  if (eventType === "SECOND_YELLOW_RED") {

    return `🟨🟥 EXPULSION !

🚨 ${player} reçoit un deuxième jaune et est expulsé !
⏱️ ${minute}

${matchLine}

🌍 GlobalFoot`;
  }


  return null;
}


// =====================================================
// FACEBOOK
// =====================================================

async function publishToFacebook(
  message,
  token
) {

  if (!token) {

    return {
      ok: false,
      data: {
        error:
          "FACEBOOK_PAGE_TOKEN absent"
      }
    };
  }

  const body =
    new URLSearchParams({
      message,
      access_token: token
    });

  const response =
    await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PAGE_ID}/feed`,
      {
        method: "POST",

        headers: {
          "content-type":
            "application/x-www-form-urlencoded"
        },

        body
      }
    );

  let data;

  try {

    data =
      await response.json();

  } catch {

    data = {
      error:
        "Réponse Facebook non JSON"
    };
  }

  return {

    ok:
      response.ok &&
      !data?.error &&
      Boolean(data?.id),

    data
  };
}
