const PAGE_ID = "987662881093953";
const GRAPH_API_VERSION = "v26.0";

const GROUPS = {
  "*/5 * * * *": [
    "eng.1",
    "fra.1",
    "esp.1"
  ]
};

const ESPN_CDN =
  "https://cdn.espn.com/core/soccer/scoreboard?xhr=1&league=";


// ============================================================
// FETCH ESPN
// ============================================================

async function fetchESPN(url) {

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json,text/plain,*/*"
    }
  });

  const text = await response.text();

  console.log(`🌐 ESPN request : ${url}`);
  console.log(`🛰️ ESPN response : HTTP ${response.status}`);

  if (!response.ok) {
    throw new Error(`ESPN HTTP ${response.status}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `ESPN réponse non-JSON: ${text.slice(0, 500)}`
    );
  }
}


// ============================================================
// EXTRACTION SCOREBOARD
// ============================================================

function extractScoreboardData(data) {

  if (data?.content?.sbData) {
    console.log("🎯 ESPN CONTENT sbData TROUVÉ");
    return data.content.sbData;
  }

  if (data?.sbData) {
    console.log("🎯 ESPN sbData TROUVÉ");
    return data.sbData;
  }

  if (data?.content?.leagues) {
    return data.content;
  }

  if (data?.leagues) {
    return data;
  }

  return null;
}


// ============================================================
// EXTRACTION DU SCORE
// ============================================================

function extractMatchScore(match) {

  const competition =
    match?.competitions?.[0];

  if (!competition) {
    return null;
  }

  const competitors =
    competition.competitors || [];

  let home = null;
  let away = null;

  for (const team of competitors) {

    const score =
      Number(team?.score ?? 0);

    if (team?.homeAway === "home") {
      home = score;
    }

    if (team?.homeAway === "away") {
      away = score;
    }
  }

  if (home === null || away === null) {
    return null;
  }

  return {
    home,
    away
  };
}


// ============================================================
// NOM DES ÉQUIPES
// ============================================================

function extractTeams(match) {

  const competitors =
    match?.competitions?.[0]?.competitors || [];

  let homeTeam = "Équipe domicile";
  let awayTeam = "Équipe extérieure";

  for (const team of competitors) {

    const name =
      team?.team?.displayName ||
      team?.team?.name ||
      team?.displayName ||
      "Équipe";

    if (team?.homeAway === "home") {
      homeTeam = name;
    }

    if (team?.homeAway === "away") {
      awayTeam = name;
    }
  }

  return {
    homeTeam,
    awayTeam
  };
}


// ============================================================
// STATUT DU MATCH
// ============================================================

function getMatchStatus(match) {

  const status =
    match?.competitions?.[0]?.status ||
    match?.status ||
    {};

  return (
    status?.type?.name ||
    status?.type?.description ||
    status?.type?.shortDetail ||
    "UNKNOWN"
  );
}


// ============================================================
// CLÉ KV
// ============================================================

function getGameKey(competition, gameId) {

  return `match:${competition}:${gameId}`;
}


// ============================================================
// LECTURE KV
// ============================================================

async function getSavedScore(env, key) {

  if (!env.GLOBALFOOT_KV) {

    throw new Error(
      "❌ KV GLOBALFOOT_KV introuvable dans les bindings."
    );
  }

  const value =
    await env.GLOBALFOOT_KV.get(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {

    console.log(
      `⚠️ Valeur KV invalide pour ${key}`
    );

    return null;
  }
}


// ============================================================
// ÉCRITURE KV
// ============================================================

async function saveScore(
  env,
  key,
  score
) {

  if (!env.GLOBALFOOT_KV) {

    throw new Error(
      "❌ KV GLOBALFOOT_KV introuvable dans les bindings."
    );
  }

  await env.GLOBALFOOT_KV.put(
    key,
    JSON.stringify(score)
  );
}


// ============================================================
// DÉTECTION DU BUT
// ============================================================

async function detectGoal(
  env,
  competition,
  gameId,
  gameName,
  currentScore
) {

  const key =
    getGameKey(
      competition,
      gameId
    );

  const previousScore =
    await getSavedScore(
      env,
      key
    );


  // ----------------------------------------------------------
  // PREMIÈRE OBSERVATION
  // ----------------------------------------------------------

  if (!previousScore) {

    console.log(
      `🆕 Première observation : ${gameName}`
    );

    console.log(
      `💾 Score initial enregistré : ` +
      `${currentScore.home}-${currentScore.away}`
    );

    await saveScore(
      env,
      key,
      currentScore
    );

    return {
      detected: false,
      firstObservation: true
    };
  }


  // ----------------------------------------------------------
  // AFFICHAGE
  // ----------------------------------------------------------

  console.log(
    `📊 Ancien score : ` +
    `${previousScore.home}-${previousScore.away}`
  );

  console.log(
    `📊 Nouveau score : ` +
    `${currentScore.home}-${currentScore.away}`
  );


  // ----------------------------------------------------------
  // CALCUL
  // ----------------------------------------------------------

  const homeGoals =
    currentScore.home -
    previousScore.home;

  const awayGoals =
    currentScore.away -
    previousScore.away;


  // ----------------------------------------------------------
  // AUCUN CHANGEMENT
  // ----------------------------------------------------------

  if (
    homeGoals <= 0 &&
    awayGoals <= 0
  ) {

    console.log(
      "⚪ Aucun nouveau but."
    );

    // On garde quand même le score actuel.
    await saveScore(
      env,
      key,
      currentScore
    );

    return {
      detected: false
    };
  }


  // ----------------------------------------------------------
  // NOUVEAU BUT / NOUVEAUX BUTS
  // ----------------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log("⚽⚽⚽ NOUVEAU BUT DÉTECTÉ ⚽⚽⚽");
  console.log("==============================================");

  console.log(
    `🏆 Compétition : ${competition}`
  );

  console.log(
    `⚽ Match : ${gameName}`
  );

  console.log(
    `📊 Avant : ` +
    `${previousScore.home}-${previousScore.away}`
  );

  console.log(
    `📊 Maintenant : ` +
    `${currentScore.home}-${currentScore.away}`
  );


  if (homeGoals > 0) {

    console.log(
      `🏠 ${homeGoals} but(s) pour l'équipe domicile`
    );
  }

  if (awayGoals > 0) {

    console.log(
      `✈️ ${awayGoals} but(s) pour l'équipe extérieure`
    );
  }


  // ----------------------------------------------------------
  // SAUVEGARDE IMMÉDIATE
  // ----------------------------------------------------------

  await saveScore(
    env,
    key,
    currentScore
  );


  return {
    detected: true,
    homeGoals,
    awayGoals,
    previousScore,
    currentScore
  };
}


// ============================================================
// PUBLICATION FACEBOOK
// ============================================================

async function publishToFacebook(
  goal,
  competition,
  gameName
) {

  console.log("");
  console.log("📘 FACEBOOK");
  console.log("----------------------------------------------");

  /*
   * La publication Facebook sera branchée ici.
   *
   * Pour le moment, on ne publie rien afin de tester
   * correctement la détection des buts avec le KV.
   */

  console.log(
    `📌 PUBLICATION À BRANCHER : ${gameName}`
  );

  console.log(
    `📊 Score : ` +
    `${goal.currentScore.home}-${goal.currentScore.away}`
  );

  console.log(
    `🏆 Compétition : ${competition}`
  );
}


// ============================================================
// SCAN D'UNE COMPÉTITION
// ============================================================

async function scanCompetition(
  competition,
  env
) {

  console.log("");
  console.log("==============================================");
  console.log(
    `🔍 SCAN COMPÉTITION : ${competition}`
  );
  console.log("==============================================");


  try {

    const data =
      await fetchESPN(
        ESPN_CDN +
        encodeURIComponent(
          competition
        )
      );


    const sbData =
      extractScoreboardData(data);


    if (!sbData) {

      console.log(
        `❌ Format scoreboard inconnu pour ${competition}`
      );

      return;
    }


    const matches =
      sbData.events ||
      sbData.games ||
      [];


    console.log(
      `⚽ ESPN CDN ${competition}: ` +
      `${matches.length} match(s)`
    );


    // --------------------------------------------------------
    // MATCHS
    // --------------------------------------------------------

    for (const match of matches) {

      const gameId =
        match.id ||
        match.eventId;


      if (!gameId) {
        continue;
      }


      const gameName =
        match.name ||
        match.shortName ||
        "Match";


      const score =
        extractMatchScore(
          match
        );


      const teams =
        extractTeams(
          match
        );


      const status =
        getMatchStatus(
          match
        );


      console.log("");
      console.log("----------------------------------------------");

      console.log(
        `📌 Match : ${competition}/${gameId}`
      );

      console.log(
        `⚽ ${gameName}`
      );

      console.log(
        `🏠 ${teams.homeTeam}`
      );

      console.log(
        `✈️ ${teams.awayTeam}`
      );

      console.log(
        `📊 Statut : ${status}`
      );


      if (!score) {

        console.log(
          "⚠️ Impossible de lire le score."
        );

        continue;
      }


      console.log(
        `📊 SCORE ACTUEL : ` +
        `${score.home}-${score.away}`
      );


      // ------------------------------------------------------
      // DÉTECTION
      // ------------------------------------------------------

      const goal =
        await detectGoal(
          env,
          competition,
          gameId,
          gameName,
          score
        );


      // ------------------------------------------------------
      // BUT DÉTECTÉ
      // ------------------------------------------------------

      if (goal.detected) {

        await publishToFacebook(
          goal,
          competition,
          gameName
        );
      }
    }


  } catch (error) {

    console.log(
      `❌ Erreur scan ${competition}: ` +
      `${error.message}`
    );
  }
}


// ============================================================
// CRON
// ============================================================

export default {

  async scheduled(
    event,
    env,
    ctx
  ) {

    console.log("");
    console.log("==============================================");
    console.log("🌍 GLOBALFOOT CRON");
    console.log("==============================================");

    console.log(
      "⏰ Déclenchement automatique toutes les 5 minutes"
    );


    const competitions =
      GROUPS["*/5 * * * *"] || [];


    console.log(
      `🏆 Compétitions : ${competitions.join(", ")}`
    );


    for (
      const competition of competitions
    ) {

      await scanCompetition(
        competition,
        env
      );
    }


    console.log("");
    console.log("==============================================");
    console.log("✅ CRON TERMINÉ");
    console.log("==============================================");
  },


  // ==========================================================
  // TEST MANUEL
  // ==========================================================

  async fetch(
    request,
    env
  ) {

    return new Response(
      "🌍 GlobalFoot Worker actif.\n" +
      "KV : GLOBALFOOT_KV\n" +
      "Compétitions : ENG / FRA / ESP\n" +
      "Détection : Scoreboard ESPN + KV",
      {
        status: 200,
        headers: {
          "content-type":
            "text/plain; charset=UTF-8"
        }
      }
    );
  }
};
