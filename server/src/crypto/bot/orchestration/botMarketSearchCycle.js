import getBotFuturesUniverse from "../universe/botFuturesUniverseProvider.js";
import filterBotHardEligibleAssets from "../filters/botHardEligibilityFilter.js";
import rankBotOpportunities from "../filters/botOpportunityFilter.js";
import { researchBotTop20 } from "../research/botResearchOrchestrator.js";
import determineBotDirection from "../direction/botDirectionEngine.js";
import rankBotResearchCandidates from "../ranking/botResearchRankingEngine.js";
import getBotFuturesExecutionMarket from "../market/botFuturesExecutionMarketProvider.js";
import buildBotFuturesSetup from "../setup/botFuturesSetupBuilder.js";
import rankBotExecutionSetups from "../ranking/botExecutionRankingEngine.js";
import { registerSearchSetups } from "../monitoring/botSearchResultStore.js";

export async function runBotMarketSearch(options = {}) {
  const startedAt = new Date().toISOString();

  /*
   * STEP 1
   * Load genuine futures/perpetual universe.
   */
  const universe = await getBotFuturesUniverse(
    options.universe
  );

  /*
   * STEP 2
   * Hard eligibility.
   *
   * Only valid perpetual futures instruments should survive.
   */
  const eligibility = filterBotHardEligibleAssets(
    universe.assets,
    options.eligibility
  );

  /*
   * STEP 3
   * Cheap opportunity ranking.
   */
  const opportunity = rankBotOpportunities(
    eligibility.approved,
    options.opportunity
  );

  /*
   * STEP 4
   * Select Top 20 for deeper research.
   */
  const top20 = opportunity.topCandidates.map(
    (row, index) => ({
      rank: index + 1,

      symbol: row.asset.symbol,
      baseAsset: row.asset.baseAsset,
      quoteAsset: row.asset.quoteAsset,

      opportunityScore:
        row.opportunity.opportunityScore,

      dimensions:
        row.opportunity.dimensions,

      market:
        row.asset.market,

      asset:
        row.asset,

      opportunity:
        row.opportunity,
    })
  );

  /*
   * STEP 5
   * Fire the deeper research engines.
   */
  const research = await researchBotTop20(
    top20,
    options.research
  );

  /*
   * STEP 6
   * Determine directional evidence.
   */
  const directional = research.researched.map(
    (row) =>
      determineBotDirection(
        row,
        options.direction
      )
  );

  /*
   * STEP 7
   * HARD DIRECTION GATE
   *
   * This is important:
   *
   * A candidate MUST explicitly pass the direction
   * qualification before it can become a setup.
   *
   * Weak/conflicting direction becomes NO SETUP.
   */
  const directionQualified = directional.filter(
    (row) =>
      row.directionDecision?.qualified === true
  );

  const rejectedDirection = directional.filter(
    (row) =>
      row.directionDecision?.qualified !== true
  );

  /*
   * STEP 8
   * Rank ONLY direction-qualified candidates.
   */
  const ranking = rankBotResearchCandidates(
    directionQualified,
    options.ranking
  );

  /*
   * STEP 9
   * Build futures setups.
   *
   * Only Top 10 direction-qualified candidates
   * can reach this stage.
   */
  const setups = [];
  const setupFailures = [];

  for (const candidate of ranking.top10) {
    try {
      const market =
        await getBotFuturesExecutionMarket(
          candidate,
          options.setup
        );

      const setup =
        buildBotFuturesSetup(
          candidate,
          market,
          options.setup
        );

      setups.push(setup);
    } catch (error) {
      setupFailures.push({
        symbol: candidate.symbol,
        error:
          error?.message ||
          String(error),
      });
    }
  }

  /*
   * STEP 10
   * Setup-quality ranking.
   *
   * This does NOT execute anything.
   */
  const setupRanking =
    rankBotExecutionSetups(
      setups,
      options.executionRanking
    );

  /*
   * STEP 11
   * Convert internal LONG/SHORT terminology
   * into private portal BUY/SELL setup terminology.
   *
   * LONG  -> BUY
   * SHORT -> SELL
   */
const qualifiedSetups =
  registerSearchSetups(
    setupRanking.rankedSetups.map(
      (candidate) => ({
        ...candidate,

        setup: {
          ...candidate.setup,

          setupType:
            candidate.setup?.direction === "LONG"
              ? "BUY"
              : candidate.setup?.direction === "SHORT"
                ? "SELL"
                : "NONE",
        },

        executionAuthority: false,
        liveExecution: false,
      })
    )
  );

  /*
   * STEP 12
   * Build explicit NO SETUP explanations.
   */
  const noSetup = [
    /*
     * Failed direction qualification.
     */
    ...rejectedDirection.map(
      (candidate) => ({
        symbol:
          candidate.symbol,

        stage:
          "DIRECTION",

        reason:
          candidate.directionDecision?.reason ||
          "DIRECTION_NOT_QUALIFIED",

        blockers:
          candidate.directionDecision?.blockers ||
          [],

        direction:
          candidate.directionDecision?.direction ||
          null,

        confidence:
          candidate.directionDecision?.confidence ??
          null,

        separation:
          candidate.directionDecision?.separation ??
          null,
      })
    ),

    /*
     * Passed direction but failed setup qualification.
     */
    ...setups
      .filter(
        (candidate) =>
          candidate.setup?.approved !== true
      )
      .map(
        (candidate) => ({
          symbol:
            candidate.symbol,

          stage:
            "SETUP",

          reason:
            "SETUP_BLOCKED",

          blockers:
            candidate.setup?.blockers ||
            [],

          direction:
            candidate.setup?.direction ||
            null,

          entry:
            candidate.setup?.entry ??
            null,

          stop:
            candidate.setup?.stop ??
            null,

          target:
            candidate.setup?.target ??
            null,

          riskReward:
            candidate.setup?.riskReward ??
            null,
        })
      ),
  ];

  const completedAt =
    new Date().toISOString();

  /*
   * FINAL SEARCH RESPONSE
   */
  return {
    system:
      "AEMA_PRIVATE_MARKET_RESEARCH",

    status:
      qualifiedSetups.length > 0
        ? "SETUPS_FOUND"
        : "NO_SETUP",

    startedAt,
    completedAt,

    /*
     * Search is explicitly user initiated.
     */
    onDemand: true,

    /*
     * Research / monitoring system.
     * No execution from this pipeline.
     */
    executionDisabled: true,
    executionAuthority: false,
    liveExecution: false,

    /*
     * Market integrity.
     */
    marketType:
      universe.marketType,

    exchange:
      universe.exchange ??
      null,

    instrumentWarning:
      universe.marketType !== "FUTURES" &&
      universe.marketType !== "PERPETUAL"
        ? "CURRENT_PROVIDER_IS_NOT_FUTURES"
        : "NONE",

    /*
     * Pipeline diagnostics.
     */
    counts: {
      universe:
        universe.assets.length,

      hardEligible:
        eligibility.approved.length,

      opportunityQualified:
        opportunity.qualified.length,

      top20:
        top20.length,

      researchCompleted:
        research.completed,

      researchFailed:
        research.failed.length,

      /*
       * IMPORTANT:
       * Actual number that passed
       * the direction gate.
       */
      directionQualified:
        directionQualified.length,

      directionRejected:
        rejectedDirection.length,

      top10:
        ranking.top10.length,

      setupsBuilt:
        setups.length,

      qualifiedSetups:
        qualifiedSetups.length,

      noSetup:
        noSetup.length,

      setupFailures:
        setupFailures.length,
    },

    /*
     * These are the signals the future
     * private frontend will display.
     */
    setups:
      qualifiedSetups,

    /*
     * Useful for debugging why a market
     * did not become a setup.
     */
    noSetup,

    researchFailures:
      research.failed,

    setupFailures,
  };
}

export default runBotMarketSearch;