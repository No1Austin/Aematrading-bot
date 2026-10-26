
import express from "express";

import {
  runStockResearch,
  listPublishedStockSetups
} from "../stock/botStockResearchEngine.js";

import {
  runStockDiscoveryResearch
} from "../stock/botStockDiscoveryWorkflow.js";

import {
  botLogin,
  botLogout,
  botAuthStatus,
  requireBotAccess
} from "../auth/botAccess.js";

import {
  getBotPaperAccount,
  setBotControls
} from "../account/botPaperLedger.js";

import { getTradeMemory } from "../learning/botTradeMemoryStore.js";

import {
  manuallyCloseBotPosition,
  emergencyStopBot
} from "../positions/botManualControls.js";

import {
  isBotRuntimeBusy,
  isBotRuntimeRunning
} from "../runtime/botRuntime.js";

import getDedicatedAlpacaOverview from "../alpaca/botDedicatedAlpacaOverview.js";

import runBotMarketSearch from "../orchestration/botMarketSearchCycle.js";

import analyzeBotSingleSetup from "../orchestration/botSingleSetupAnalysis.js";

import calculateBotPositionScenario from "../setup/botPositionScenarioCalculator.js";

import { getSearchSetup } from "../monitoring/botSearchResultStore.js";

import {
  createMonitoredSetup,
  listMonitoredSetups,
  getMonitoredSetup
} from "../monitoring/botSetupMonitorStore.js";

import refreshMonitoredSetup from "../monitoring/botSetupMonitoringEngine.js";

import createBotManualHistoryRoutes from "./botManualHistoryRoutes.js";

/* -------------------------------------------------------------------------- */
/* Error handling                                                             */
/* -------------------------------------------------------------------------- */

const handle = (fn) => (req, res) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((error) => {
      console.error("[BOT ROUTE ERROR]", error);

      const status =
        error.message === "BOT_RUNTIME_BUSY_RETRY" ? 409 :
        error.message === "BOT_POSITION_NOT_FOUND" ? 404 :
        error.message === "SETUP_NOT_FOUND" ? 404 :
        error.message === "MONITORED_SETUP_NOT_FOUND" ? 404 :
        error.message === "MONITOR_OWNERSHIP_NOT_VERIFIED" ? 403 :
        400;

      return res.status(status).json({
        error: error.message
      });
    });

/* -------------------------------------------------------------------------- */
/* Supabase authentication                                                    */
/* -------------------------------------------------------------------------- */

function requireSupabaseIdentity(req, res, next) {
  if (
    req.botAuthMethod !== "supabase" ||
    !req.botUser?.id
  ) {
    return res.status(403).json({
      error: "SUPABASE_USER_REQUIRED"
    });
  }

  return next();
}

/* -------------------------------------------------------------------------- */
/* Monitor ownership                                                          */
/* -------------------------------------------------------------------------- */

function monitorBelongsToUser(monitor, userId) {
  return Boolean(
    monitor &&
    monitor.userId &&
    monitor.userId === userId
  );
}

/* -------------------------------------------------------------------------- */
/* Trade history helpers                                                      */
/* -------------------------------------------------------------------------- */

const completeClosedTrade = (position) => {
  const finalExitPnlUsd = Number(position.realizedPnlUsd);

  const partialRealizedPnlUsd = Number(
    position.partialRealizedPnlUsd ?? 0
  );

  return {
    ...position,
    finalExitPnlUsd,
    partialRealizedPnlUsd,
    realizedPnlUsd:
      finalExitPnlUsd + partialRealizedPnlUsd
  };
};

/* -------------------------------------------------------------------------- */
/* Private bot routes                                                         */
/* -------------------------------------------------------------------------- */

export default function createBotPrivateRoutes() {
  const r = express.Router();

  /* ------------------------------------------------------------------------ */
  /* Authentication                                                           */
  /* ------------------------------------------------------------------------ */

  r.post("/auth/login", botLogin);
  r.post("/auth/logout", botLogout);
  r.get("/auth/status", botAuthStatus);

  r.use(requireBotAccess);

  /* ------------------------------------------------------------------------ */
  /* Manual trade history                                                     */
  /* ------------------------------------------------------------------------ */

  // Supabase user identity is required.
  // This feature records user-reported trade outcomes.
  // It never places orders.

  r.use(
    "/manual-history",
    requireSupabaseIdentity,
    createBotManualHistoryRoutes({
      getMonitoredSetup
    })
  );

  /* ------------------------------------------------------------------------ */
  /* Dashboard                                                                */
  /* ------------------------------------------------------------------------ */

  r.get("/dashboard", (_req, res) => {
    const account = getBotPaperAccount();
    const memory = getTradeMemory();

    return res.json({
      paperOnly: true,
      liveExecution: false,
      portfolioLimit: 3,
      account,
      runtime: {
        running: isBotRuntimeRunning(),
        busy: isBotRuntimeBusy()
      },
      memory: {
        records: memory.records || [],
        count: (memory.records || []).length
      },
      generatedAt: new Date().toISOString()
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Dedicated crypto Alpaca overview                                         */
  /* ------------------------------------------------------------------------ */

  const alpacaOverview = async (_req, res) => {
    res.set("Cache-Control", "no-store");

    try {
      return res.json(
        await getDedicatedAlpacaOverview()
      );
    } catch (error) {
      console.error(
        "[DEDICATED CRYPTO ALPACA]",
        error?.message || error
      );

      return res.status(503).json({
        connected: false,
        provider: "ALPACA_PAPER",
        executionEnabled: false,
        error: "DEDICATED_ALPACA_OVERVIEW_UNAVAILABLE"
      });
    }
  };

  r.get("/alpaca/overview", alpacaOverview);
  r.get("/alpaca/account", alpacaOverview);

  /* ------------------------------------------------------------------------ */
  /* Existing paper trade history                                             */
  /* ------------------------------------------------------------------------ */

  r.get("/history", (_req, res) => {
    const account = getBotPaperAccount();

    const trades = [...account.closedPositions]
      .reverse()
      .map(completeClosedTrade);

    return res.json({
      trades,
      paperOnly: true
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Position explanation                                                     */
  /* ------------------------------------------------------------------------ */

  r.get("/positions/:id/explanation", (req, res) => {
    const account = getBotPaperAccount();

    const position = [
      ...account.positions,
      ...account.closedPositions
    ].find((item) => item.id === req.params.id);

    if (!position) {
      return res.status(404).json({
        error: "BOT_POSITION_NOT_FOUND"
      });
    }

    const memory = getTradeMemory().records.find(
      (item) => item.tradeId === position.id
    );

    return res.json({
      positionId: position.id,
      symbol: position.symbol,
      direction: position.direction,
      entrySnapshot:
        position.entryCandidateSnapshot ?? null,
      researchRankScore:
        position.entryResearchRankScore ?? null,
      executionRankScore:
        position.entryExecutionRankScore ?? null,
      entryDirectionDecision:
        position.entryDirectionDecision ?? null,
      consistencyHistory:
        position.consistencyHistory ?? [],
      management: {
        trailingActive: position.trailingActive,
        trailingStop: position.trailingStop,
        stop: position.stop,
        addCount: position.addCount,
        exitReason: position.exitReason ?? null
      },
      result: memory ?? null,
      evidenceMissing:
        !position.entryCandidateSnapshot,
      explanationSource: "RECORDED_EVIDENCE_ONLY"
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Paper account controls                                                   */
  /* ------------------------------------------------------------------------ */

  r.put(
    "/controls/allocation",
    handle((req, res) => {
      if (isBotRuntimeBusy()) {
        throw new Error("BOT_RUNTIME_BUSY_RETRY");
      }

      return res.json({
        account: setBotControls({
          allocationUsd: req.body?.allocationUsd
        })
      });
    })
  );

  r.post(
    "/controls/pause",
    handle((_req, res) =>
      res.json({
        account: setBotControls({
          paused: true
        })
      })
    )
  );

  r.post(
    "/controls/resume",
    handle((_req, res) =>
      res.json({
        account: setBotControls({
          paused: false
        })
      })
    )
  );

  r.post(
    "/positions/:id/close",
    handle(async (req, res) =>
      res.json(
        await manuallyCloseBotPosition(req.params.id)
      )
    )
  );

  r.post(
    "/controls/emergency-stop",
    handle(async (_req, res) => {
      setBotControls({
        paused: true
      });

      return res.json(
        await emergencyStopBot()
      );
    })
  );

  /* ------------------------------------------------------------------------ */
  /* Crypto market research                                                   */
  /* ------------------------------------------------------------------------ */

  r.post(
    "/market/search",
    handle(async (req, res) => {
      if (isBotRuntimeBusy()) {
        throw new Error("BOT_RUNTIME_BUSY_RETRY");
      }

      res.set("Cache-Control", "no-store");

      return res.json(
        await runBotMarketSearch(
          req.body?.options || {}
        )
      );
    })
  );

  /* ------------------------------------------------------------------------ */
  /* Single-symbol setup analysis                                             */
  /* ------------------------------------------------------------------------ */

  r.post(
    "/setup/analyze",
    handle(async (req, res) => {
      if (isBotRuntimeBusy()) {
        throw new Error("BOT_RUNTIME_BUSY_RETRY");
      }

      res.set("Cache-Control", "no-store");

      return res.json(
        await analyzeBotSingleSetup(
          req.body?.symbol,
          req.body?.options || {}
        )
      );
    })
  );

  /* ------------------------------------------------------------------------ */
  /* Setup scenario                                                           */
  /* ------------------------------------------------------------------------ */

  r.post(
    "/setups/:setupId/scenario",
    handle((req, res) => {
      const candidate = getSearchSetup(
        req.params.setupId
      );

      if (!candidate) {
        throw new Error("SETUP_NOT_FOUND");
      }

      return res.json({
        setupId: req.params.setupId,
        scenario: calculateBotPositionScenario(
          candidate.setup,
          {
            capitalUsd: req.body?.capitalUsd,
            leverage: req.body?.leverage,
            feeRatePercent:
              req.body?.feeRatePercent
          }
        )
      });
    })
  );

  /* ------------------------------------------------------------------------ */
  /* Monitor Trade                                                            */
  /* ------------------------------------------------------------------------ */

  r.post(
    "/setups/:setupId/monitor",
    requireSupabaseIdentity,
    handle((req, res) => {
      const candidate = getSearchSetup(
        req.params.setupId
      );

      if (!candidate) {
        throw new Error("SETUP_NOT_FOUND");
      }

      const scenario = req.body?.capitalUsd
        ? calculateBotPositionScenario(
            candidate.setup,
            {
              capitalUsd:
                req.body.capitalUsd,
              leverage:
                req.body?.leverage,
              feeRatePercent:
                req.body?.feeRatePercent
            }
          )
        : null;

      const monitor = createMonitoredSetup(
        candidate,
        scenario,
        {
          userId: req.botUser.id
        }
      );

      if (
        !monitorBelongsToUser(
          monitor,
          req.botUser.id
        )
      ) {
        return res.status(503).json({
          error:
            "MONITOR_OWNER_STORAGE_NOT_CONFIGURED"
        });
      }

      return res.status(201).json({
        monitor
      });
    })
  );

  /* ------------------------------------------------------------------------ */
  /* Stock research — unchanged                                               */
  /* ------------------------------------------------------------------------ */

  r.post(
    "/stock/research",
    handle(async (req, res) => {
      res.set("Cache-Control", "no-store");

      return res.json(
        await runStockResearch(
          req.body ?? {}
        )
      );
    })
  );

  r.post(
    "/stock/discover",
    handle(async (req, res) => {
      res.set("Cache-Control", "no-store");

      return res.json(
        await runStockDiscoveryResearch(
          req.body ?? {}
        )
      );
    })
  );

  r.get("/stock/setups", (_req, res) => {
    res.set("Cache-Control", "no-store");

    return res.json({
      assetClass: "STOCK",
      researchOnly: true,
      executionAuthority: false,
      liveExecution: false,
      setups: listPublishedStockSetups()
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Monitored setups                                                         */
  /* ------------------------------------------------------------------------ */

  r.get(
    "/monitoring",
    requireSupabaseIdentity,
    handle((req, res) => {
      const monitors = listMonitoredSetups()
        .filter((monitor) =>
          monitorBelongsToUser(
            monitor,
            req.botUser.id
          )
        );

      res.set("Cache-Control", "no-store");

      return res.json({
        monitors
      });
    })
  );

  r.get(
    "/monitoring/:id",
    requireSupabaseIdentity,
    handle((req, res) => {
      const monitor = getMonitoredSetup(
        req.params.id
      );

      if (
        !monitorBelongsToUser(
          monitor,
          req.botUser.id
        )
      ) {
        return res.status(404).json({
          error: "MONITORED_SETUP_NOT_FOUND"
        });
      }

      res.set("Cache-Control", "no-store");

      return res.json({
        monitor
      });
    })
  );

  /* ------------------------------------------------------------------------ */
  /* Refresh monitored setup                                                  */
  /* ------------------------------------------------------------------------ */

  r.post(
    "/monitoring/:id/refresh",
    requireSupabaseIdentity,
    handle(async (req, res) => {
      const monitor = getMonitoredSetup(
        req.params.id
      );

      if (
        !monitorBelongsToUser(
          monitor,
          req.botUser.id
        )
      ) {
        return res.status(404).json({
          error: "MONITORED_SETUP_NOT_FOUND"
        });
      }

      const refreshed =
        await refreshMonitoredSetup(
          req.params.id,
          req.body?.options || {}
        );

      res.set("Cache-Control", "no-store");

      return res.json({
        monitor: refreshed
      });
    })
  );

  return r;
}
