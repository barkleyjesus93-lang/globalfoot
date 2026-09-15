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

const ESPN_CORE =
  "https://sports.core.api.espn.com/v2/sports/soccer/leagues";


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
// SCOREBOARD
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
// RÉCUPÉRER LES RÉFÉRENCES PLAY-BY-PLAY
// ============================================================

async function getPlayRefs(competition, gameId) {

  const url =
    `${ESPN_CORE}/${competition}` +
    `/events/${gameId}` +
    `/competitions/${gameId}/plays?limit=300`;

  try {

    const data = await fetchESPN(url);

    let refs = [];

    if (Array.isArray(data)) {
      refs = data;
    } else if (Array.isArray(data.items)) {
      refs = data.items;
    } else if (Array.isArray(data.plays)) {
      refs = data.plays;
    }

    console.log(
      `📚 PLAY REFS ${competition}/${gameId}: ${refs.length}`
    );

    return refs;

  } catch (error) {

    console.log(
      `❌ Play refs ${competition}/${gameId}: ${error.message}`
    );

    return [];
  }
}


// ============================================================
// RÉCUPÉRER UNE VRAIE ACTION À PARTIR DU $ref
// ============================================================

async function fetchPlay(refObject) {

  const ref =
    refObject?.$ref ||
    refObject?.ref ||
    null;

  if (!ref) {
    console.log("❌ Aucun $ref trouvé");
    console.log(
      "📦 PLAY REF :",
      JSON.stringify(refObject).slice(0, 1000)
    );
    return null;
  }

  // ESPN fournit parfois http://
  // On force https://
  const url = ref.replace(
    /^http:\/\//i,
    "https://"
  );

  console.log("");
  console.log("🔗 REF ESPN :");
  console.log(url);

  try {

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    const text = await response.text();

    console.log(
      `📡 REF RESPONSE : HTTP ${response.status}`
    );

    console.log(
      "📦 REF DATA :",
      text.slice(0, 3000)
    );

    if (!response.ok) {
      return null;
    }

    try {

      const data = JSON.parse(text);

      console.log("✅ REF JSON REÇU");

      console.log(
        "🔑 REF KEYS :",
        Object.keys(data)
      );

      return data;

    } catch {

      console.log("❌ REF NON-JSON");

      return null;
    }

  } catch (error) {

    console.log(
      `❌ ERREUR REF : ${error.message}`
    );

    return null;
  }
}


// ============================================================
// TEST DES VRAIES ACTIONS
// ============================================================

async function inspectLiveGame(
  competition,
  gameId,
  gameName
) {

  console.log("");
  console.log("==============================================");
  console.log("🔎 INSPECTION MATCH");
  console.log(`⚽ ${gameName}`);
  console.log(`🆔 ${competition}/${gameId}`);
  console.log("==============================================");

  const refs =
    await getPlayRefs(
      competition,
      gameId
    );

  if (!refs.length) {

    console.log(
      "⚠️ Aucune référence Play-by-Play"
    );

    return;
  }

  /*
    IMPORTANT :

    On ne récupère volontairement que les
    10 dernières actions.

    Cela évite de faire des centaines de
    requêtes ESPN à chaque Cron.
  */

  const recentRefs =
    refs.slice(-10);

  console.log(
    `🔬 Analyse des ${recentRefs.length} dernières actions`
  );

  for (let i = 0; i < recentRefs.length; i++) {

  const play =
    await fetchPlay(
      recentRefs[i]
    );

  if (!play) {
    continue;
  }

  console.log("");
  console.log(
    `🎬 PLAY ${i + 1}/${recentRefs.length}`
  );

  console.log(
    JSON.stringify(play).slice(0, 5000)
  );

  // ==========================================
  // 🚨 DÉTECTION D'UN BUT
  // ==========================================

  if (play.scoringPlay === true) {

    console.log("");
    console.log("==============================================");
    console.log("⚽⚽⚽ BUT DÉTECTÉ ⚽⚽⚽");
    console.log("==============================================");

    console.log(
      `🆔 Play ID : ${play.id}`
    );

    console.log(
      `📝 Action : ${play.text || "N/A"}`
    );

    console.log(
      `🏠 Score domicile : ${play.homeScore}`
    );

    console.log(
      `✈️ Score extérieur : ${play.awayScore}`
    );

    console.log(
      `⏱️ Minute : ${play.clock?.displayValue || "N/A"}`
    );

    console.log("==============================================");
  }
  }


// ============================================================
// SCAN COMPÉTITION
// ============================================================

async function scanCompetition(
  competition
) {

  console.log("");
  console.log(
    `🔍 Scan compétition : ${competition}`
  );

  try {

    const data =
      await fetchESPN(
        ESPN_CDN +
        encodeURIComponent(competition)
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
      `⚽ ESPN CDN ${competition}: ${matches.length} match(s)`
    );

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

      console.log(
        `📌 Match ${competition}/${gameId}`
      );

      console.log(
        `⚽ ${gameName}`
      );

      /*
        Pour chaque match découvert,
        on inspecte les dernières actions.
      */

      await inspectLiveGame(
        competition,
        gameId,
        gameName
      );
    }

  } catch (error) {

    console.log(
      `❌ Erreur scan ${competition}: ${error.message}`
    );
  }
}


// ============================================================
// CRON
// ============================================================

export default {

  async scheduled(event, env, ctx) {

    console.log("");
    console.log("==============================================");
    console.log("🌍 GLOBALFOOT CRON");
    console.log("==============================================");

    const competitions =
      GROUPS["*/5 * * * *"] || [];

    for (const competition of competitions) {

      await scanCompetition(
        competition
      );
    }

    console.log("");
    console.log("==============================================");
    console.log("✅ CRON TERMINÉ");
    console.log("==============================================");
  },


  async fetch(request, env) {

    return new Response(
      "🌍 GlobalFoot Worker actif.",
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
