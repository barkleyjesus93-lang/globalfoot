const PAGE_ID = "987662881093953";
const GRAPH_API_VERSION = "v26.0";

const GROUPS = {
  "*/5 * * * *": [
    "eng.1",
    "fra.1"
  ]
};

const ESPN_CDN =
  "https://cdn.espn.com/core/soccer/scoreboard?xhr=1&league=";

const ESPN_CORE =
  "https://sports.core.api.espn.com/v2/sports/soccer/leagues";


// ============================================================
// FETCH
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
// PLAY-BY-PLAY ESPN CORE
// ============================================================

async function fetchPlayByPlay(competition, gameId) {
  const url =
    `${ESPN_CORE}/${competition}/events/${gameId}` +
    `/competitions/${gameId}/plays?limit=300`;

  try {
    const data = await fetchESPN(url);

    let plays = [];

    if (Array.isArray(data)) {
      plays = data;
    } else if (Array.isArray(data.items)) {
      plays = data.items;
    } else if (Array.isArray(data.plays)) {
      plays = data.plays;
    }

    console.log(
      `🎬 PLAY-BY-PLAY ${competition}/${gameId}: ${plays.length} play(s)`
    );

    if (plays.length > 0) {
      console.log(
        "🔎 PREMIERS PLAYS:",
        JSON.stringify(plays.slice(0, 5)).slice(0, 5000)
      );
    }

    return plays;

  } catch (error) {
    console.log(
      `❌ Play-by-play ${competition}/${gameId}: ${error.message}`
    );

    return [];
  }
}


// ============================================================
// TEST LEEDS - NEWCASTLE
// ============================================================

async function testLeedsNewcastle() {

  const competition = "eng.1";
  const gameId = "401879280";

  console.log("");
  console.log("==============================================");
  console.log("🧪 TEST PLAY-BY-PLAY LEEDS 4-1 NEWCASTLE");
  console.log(`⚽ Match ID : ${gameId}`);
  console.log("==============================================");

  const plays = await fetchPlayByPlay(
    competition,
    gameId
  );

  console.log(
    `🧪 TOTAL PLAYS TROUVÉS : ${plays.length}`
  );

  if (plays.length === 0) {
    console.log(
      "⚠️ Aucun play trouvé pour Leeds-Newcastle."
    );

    return;
  }

  console.log(
    "🧪 DONNÉES PLAY-BY-PLAY COMPLÈTES :"
  );

  console.log(
    JSON.stringify(plays).slice(0, 15000)
  );

  console.log("==============================================");
  console.log("🧪 FIN DU TEST");
  console.log("==============================================");
}


// ============================================================
// SCAN NORMAL
// ============================================================

async function scanCompetition(competition) {

  console.log("");
  console.log(`🔍 Scan compétition : ${competition}`);

  try {

    const url =
      ESPN_CDN + encodeURIComponent(competition);

    const data = await fetchESPN(url);

    const sbData = extractScoreboardData(data);

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

      console.log(
        `📌 Match ${competition}/${gameId}`
      );

      console.log(
        `📅 ${match.name || match.shortName || "Match"}`
      );

      // ------------------------------------------------------
      // Pour l'instant : on utilise uniquement le scoreboard
      // pour découvrir les matchs.
      // ------------------------------------------------------

      const plays = await fetchPlayByPlay(
        competition,
        gameId
      );

      console.log(
        `🎬 ${competition}/${gameId} → ${plays.length} play(s)`
      );
    }

  } catch (error) {

    console.log(
      `❌ Erreur scan ${competition}: ${error.message}`
    );
  }
}


// ============================================================
// SCHEDULED
// ============================================================

export default {

  async scheduled(event, env, ctx) {

    console.log("");
    console.log("==============================================");
    console.log("🌍 GLOBALFOOT CRON");
    console.log("==============================================");

    // TEST TEMPORAIRE
    await testLeedsNewcastle();

    // Scan normal
    const competitions =
      GROUPS["*/5 * * * *"] || [];

    for (const competition of competitions) {
      await scanCompetition(competition);
    }

    console.log("");
    console.log("✅ CRON TERMINÉ");
    console.log("==============================================");
  },


  async fetch(request, env) {

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
};
