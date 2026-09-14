const PAGE_ID = "987662881093953";
const GRAPH_API_VERSION = "v26.0";
const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

// 5 groupes = 5 Cron Triggers.
// Chaque groupe revient toutes les 5 minutes.
const GROUPS = {
  "0-59/5 * * * *": [
    "eng.1",              // Premier League
    "esp.1",              // La Liga
    "ita.1",              // Serie A
    "ger.1",              // Bundesliga
    "fra.1"               // Ligue 1
  ],

  "1-59/5 * * * *": [
    "por.1",              // Primeira Liga
    "ned.1",              // Eredivisie
    "bra.1",              // Brasileirão
    "arg.1",              // Liga Argentina
    "uefa.champions"      // Champions League
  ],

  "2-59/5 * * * *": [
    "uefa.europa",        // Europa League
    "uefa.europa.conf",   // Conference League
    "conmebol.libertadores",
    "conmebol.sudamericana",
    "conmebol.america"    // Copa América
  ],

  "3-59/5 * * * *": [
    "fifa.world",         // Coupe du Monde
    "caf.nations",        // CAN
    "concacaf.gold",      // Gold Cup
    "afc.asian.cup",      // Asian Cup
    "fifa.cwc"            // Club World Cup
  ],

  "4-59/5 * * * *": [
    "eng.fa",             // FA Cup
    "esp.copa_del_rey",   // Copa del Rey
    "bra.copa_do_brazil",
    "ksa.1"               // Saudi Pro League
  ]
};

// On regarde aussi les matchs terminés récemment,
// pour ne pas rater un but marqué juste avant la fin.
const RECENT_MATCH_MINUTES = 180;

// Un but reste mémorisé 90 jours.
const GOAL_TTL_SECONDS = 60 * 60 * 24 * 90;


export default {

  // Vérification normale du Worker dans le navigateur.
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


  // Déclenché automatiquement par les Cron Triggers.
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
        await scanCompetition(competition, env);
      } catch (error) {
        console.error(
          `Erreur ${competition}:`,
          error?.stack || error
        );
      }
    }
  }
};


/* =====================================================
   SCAN D'UNE COMPÉTITION
===================================================== */

async function scanCompetition(competition, env) {

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


/* =====================================================
   DÉTERMINE SI LE MATCH EST INTÉRESSANT
===================================================== */

function shouldInspectMatch(match) {

  const state =
    match?.status?.type?.state;

  // Match en direct.
  if (state === "in") {
    return true;
  }

  // Match terminé récemment.
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


/* =====================================================
   RÉCUPÈRE LES ÉVÉNEMENTS DU MATCH
===================================================== */

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

  const goals =
    (summary.keyEvents || [])
      .filter(event => event?.scoringPlay === true);

  if (!goals.length) {
    return;
  }

  const score =
    getCurrentScore(match);

  for (
    let index = 0;
    index < goals.length;
    index++
  ) {

    await processGoal(
      goals[index],
      index,
      match,
      competition,
      score,
      env
    );
  }
}


/* =====================================================
   TRAITEMENT D'UN BUT
===================================================== */

async function processGoal(
  goal,
  index,
  match,
  competition,
  score,
  env
) {

  const goalId =
    createGoalId(
      competition,
      match.id,
      goal,
      index
    );

  // Déjà publié ?
  const alreadyPosted =
    await env.GLOBALFOOT_KV.get(goalId);

  if (alreadyPosted) {
    return;
  }

  const scorer =
    getScorerName(goal);

  const minute =
    getGoalMinute(goal);

  const modifier =
    getGoalModifier(goal);

  const message =
    formatFacebookMessage(
      score,
      scorer,
      minute,
      modifier
    );

  console.log(
    `⚽ Nouveau but : ${message}`
  );

  // Publication Facebook.
  const result =
    await publishToFacebook(
      message,
      env.FACEBOOK_PAGE_TOKEN
    );

  // IMPORTANT :
  // si Facebook refuse, on ne mémorise PAS le but.
  if (!result.ok) {

    console.error(
      "❌ Facebook a refusé la publication :",
      JSON.stringify(result.data)
    );

    return;
  }

  // Facebook a confirmé la publication.
  // Maintenant seulement, on mémorise le but.
  await env.GLOBALFOOT_KV.put(
    goalId,
    "1",
    {
      expirationTtl: GOAL_TTL_SECONDS
    }
  );

  console.log(
    `✅ But publié : ${goalId}`
  );
}


/* =====================================================
   ID UNIQUE DU BUT
===================================================== */

function createGoalId(
  competition,
  matchId,
  goal,
  index
) {

  const eventId =
    goal?.id ??
    goal?.sequenceNumber ??
    goal?.clock?.value ??
    goal?.clock?.displayValue ??
    `goal-${index}`;

  return (
    `goal:${competition}:${matchId}:${eventId}`
  );
}


/* =====================================================
   NOM DU BUTEUR
===================================================== */

function getScorerName(goal) {

  if (goal?.athlete?.displayName) {
    return goal.athlete.displayName;
  }

  for (const participant of goal?.participants || []) {

    if (participant?.athlete?.displayName) {
      return participant.athlete.displayName;
    }
  }

  return "Buteur";
}


/* =====================================================
   MINUTE DU BUT
===================================================== */

function getGoalMinute(goal) {

  if (goal?.clock?.displayValue) {
    return goal.clock.displayValue
      .replace(/\s+/g, "");
  }

  if (goal?.minute != null) {
    return `${goal.minute}'`;
  }

  if (goal?.clock?.value != null) {

    const seconds =
      Number(goal.clock.value);

    if (Number.isFinite(seconds)) {
      return `${Math.floor(seconds / 60)}'`;
    }
  }

  return "?";
}


/* =====================================================
   PENALTY / BUT CONTRE SON CAMP
===================================================== */

function getGoalModifier(goal) {

  const text =
    `${goal?.text || ""} ${JSON.stringify(goal || {})}`
      .toLowerCase();

  if (
    text.includes("penalty") ||
    text.includes("pen.")
  ) {
    return "pen.";
  }

  if (
    text.includes("own goal") ||
    text.includes("autogoal") ||
    text.includes("own_goal")
  ) {
    return "o.g.";
  }

  return "";
}


/* =====================================================
   SCORE ACTUEL
===================================================== */

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


/* =====================================================
   MESSAGE FACEBOOK
===================================================== */

function formatFacebookMessage(
  score,
  scorer,
  minute,
  modifier
) {

  const live =
    `🚩 Live: ${score.home.name} ${score.home.score}-${score.away.score} ${score.away.name}`;

  const goal =
    modifier
      ? `⚽️ Goal: ${scorer} (${modifier}) (${minute})`
      : `⚽️ Goal: ${scorer} (${minute})`;

  return `${live}

${goal}

🔥 Tu l’as vu ?
👍 Réagis • 💬 Commente • 🔄 Partage
➕ Suis GlobalFoot pour ne manquer aucun but !

🌍 GlobalFoot`;
}


/* =====================================================
   PUBLICATION FACEBOOK
===================================================== */

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
