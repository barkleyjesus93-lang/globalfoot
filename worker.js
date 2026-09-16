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
// PLAY-BY-PLAY — DIAGNOSTIC COMPLET
// ============================================================

async function getPlayRefs(competition, gameId) {

  const url =
    `${ESPN_CORE}/${competition}` +
    `/events/${gameId}` +
    `/competitions/${gameId}/plays?limit=300`;

  try {

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json,text/plain,*/*"
      }
    });

    const text = await response.text();

    console.log("");
    console.log("==============================================");
    console.log("🛠️ DEBUG PLAY-BY-PLAY");
    console.log("==============================================");

    console.log(`🌐 URL : ${url}`);
    console.log(`🛰️ HTTP : ${response.status}`);
    console.log(`📏 TAILLE : ${text.length}`);

    console.log("");
    console.log("📦 RÉPONSE ESPN COMPLÈTE :");
    console.log(text);

    console.log("");
    console.log("==============================================");

    if (!response.ok) {

      console.log(
        `❌ PLAY HTTP ${response.status}`
      );

      return [];
    }

    let data;

    try {

      data = JSON.parse(text);

    } catch {

      console.log(
        "❌ PLAY RESPONSE NON-JSON"
      );

      return [];
    }

    console.log("");
    console.log("🔑 TYPE ESPN :");

    if (Array.isArray(data)) {
      console.log("ARRAY");
    } else {
      console.log("OBJECT");
    }

    console.log("");
    console.log("🔑 CLÉS ESPN :");

    if (data && typeof data === "object") {
      console.log(
        Object.keys(data)
      );
    }

    // --------------------------------------------------------
    // FORMAT ARRAY
    // --------------------------------------------------------

    if (Array.isArray(data)) {

      console.log(
        `📚 PLAY ARRAY : ${data.length}`
      );

      if (data.length > 0) {

        console.log("");
        console.log("🔗 PREMIER ÉLÉMENT :");

        console.log(
          JSON.stringify(
            data[0],
            null,
            2
          ).slice(0, 5000)
        );
      }

      return data;
    }


    // --------------------------------------------------------
    // FORMAT ITEMS
    // --------------------------------------------------------

    if (Array.isArray(data.items)) {

      console.log(
        `📚 PLAY ITEMS : ${data.items.length}`
      );

      if (data.items.length > 0) {

        console.log("");
        console.log("🔗 PREMIER ITEM :");

        console.log(
          JSON.stringify(
            data.items[0],
            null,
            2
          ).slice(0, 5000)
        );
      }

      return data.items;
    }


    // --------------------------------------------------------
    // FORMAT PLAYS
    // --------------------------------------------------------

    if (Array.isArray(data.plays)) {

      console.log(
        `📚 PLAY PLAYS : ${data.plays.length}`
      );

      return data.plays;
    }


    // --------------------------------------------------------
    // FORMAT EVENTS
    // --------------------------------------------------------

    if (Array.isArray(data.events)) {

      console.log(
        `📚 PLAY EVENTS : ${data.events.length}`
      );

      return data.events;
    }


    // --------------------------------------------------------
    // ESPN $REF
    // --------------------------------------------------------

    if (data.$ref) {

      console.log("");
      console.log("🔗 ESPN $REF TROUVÉ :");

      console.log(
        data.$ref
      );

      return [
        {
          $ref: data.$ref
        }
      ];
    }


    // --------------------------------------------------------
    // ESPN LINKS
    // --------------------------------------------------------

    if (data.links) {

      console.log("");
      console.log("🔗 ESPN LINKS TROUVÉS :");

      console.log(
        JSON.stringify(
          data.links,
          null,
          2
        ).slice(0, 5000)
      );
    }


    // --------------------------------------------------------
    // AUCUN FORMAT RECONNU
    // --------------------------------------------------------

    console.log("");
    console.log(
      "⚠️ Aucun format Play-by-Play reconnu."
    );

    console.log(
      "📦 OBJET COMPLET :"
    );

    console.log(
      JSON.stringify(
        data,
        null,
        2
      ).slice(0, 10000)
    );

    console.log(
      "=============================================="
    );

    return [];

  } catch (error) {

    console.log(
      `❌ ERREUR PLAY : ${error.message}`
    );

    return [];
  }
}


// ============================================================
// FETCH UNE ACTION ESPN
// ============================================================

async function fetchPlay(refObject) {

  const ref =
    refObject?.$ref ||
    refObject?.ref ||
    null;

  if (!ref) {

    console.log(
      "❌ Aucun $ref trouvé"
    );

    console.log(
      JSON.stringify(
        refObject
      ).slice(0, 2000)
    );

    return null;
  }

  const url =
    ref.replace(
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

    const text =
      await response.text();

    console.log(
      `📡 REF RESPONSE : HTTP ${response.status}`
    );

    console.log(
      "📦 REF DATA :"
    );

    console.log(
      text.slice(0, 5000)
    );

    if (!response.ok) {
      return null;
    }

    try {

      const data =
        JSON.parse(text);

      console.log(
        "✅ REF JSON REÇU"
      );

      return data;

    } catch {

      console.log(
        "❌ REF NON-JSON"
      );

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
// INSPECTION MATCH
// ============================================================

async function inspectLiveGame(
  competition,
  gameId,
  gameName
) {

  console.log("");
  console.log("===============================");
  console.log(`🟣 ${competition}/${gameId}`);
  console.log(`⚽ ${gameName}`);
  console.log("🔎 INSPECTION MATCH");
  console.log("===============================");

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

  console.log(
    `📚 PLAY REFS ${competition}/${gameId}: ${refs.length}`
  );

  const recentRefs =
    refs.slice(-8);

  console.log(
    `🔬 Analyse des ${recentRefs.length} dernières références`
  );

  const plays = [];

  for (const ref of recentRefs) {

    const play =
      await fetchPlay(ref);

    if (play) {
      plays.push(play);
    }
  }

  console.log(
    `✅ ${plays.length} actions récupérées`
  );

  plays.sort(
    (a, b) =>
      (a.clock?.value || 0) -
      (b.clock?.value || 0)
  );

  console.log("");
  console.log("==============================================");
  console.log("📋 ACTIONS");
  console.log("==============================================");

  for (const play of plays) {

    console.log(
      `⏱️ ${play.clock?.displayValue || "?"} | ` +
      `${play.text || "Action"} | ` +
      `scoringPlay=${play.scoringPlay}`
    );
  }

  const goals =
    plays.filter(
      play =>
        play.scoringPlay === true
    );

  if (!goals.length) {

    console.log(
      "⚪ Aucun but détecté."
    );

  } else {

    console.log("");
    console.log("==============================================");
    console.log("⚽⚽⚽ BUT DÉTECTÉ ⚽⚽⚽");
    console.log("==============================================");

    for (const goal of goals) {

      console.log(
        `🆔 Play ID : ${goal.id}`
      );

      console.log(
        `📝 ${goal.text || "N/A"}`
      );

      console.log(
        `⏱️ ${goal.clock?.displayValue || "N/A"}`
      );

      console.log(
        `🏠 ${goal.homeScore}`
      );

      console.log(
        `✈️ ${goal.awayScore}`
      );
    }
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
