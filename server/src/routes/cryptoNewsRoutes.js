import express from "express";

import {
  getCryptoDashboardNews,
  getCryptoDashboardNewsState,
} from "../crypto/news/cryptoDashboardNewsService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await getCryptoDashboardNews({
      limit: req.query?.limit,
      refresh:
        String(req.query?.refresh ?? "")
          .toLowerCase() === "true",
    });

    const news =
      Array.isArray(result?.articles)
        ? result.articles
        : [];

    return res.status(200).json({
      approved:
        result?.status !== "CRYPTO_NEWS_UNAVAILABLE",
      status:
        result?.status ?? "CRYPTO_NEWS_UNAVAILABLE",
      source: result?.source ?? null,
      cached: result?.cached === true,
      stale: result?.stale === true,
      fetchedAt: result?.fetchedAt ?? null,
      count: news.length,
      news,
      featured:
        Array.isArray(result?.featured)
          ? result.featured
          : [],
      latest:
        Array.isArray(result?.latest)
          ? result.latest
          : news,
      feeds: result?.feeds ?? [],
      errors: result?.errors ?? [],
      executionAuthority: false,
      liveExecution: false,
    });
  } catch (error) {
    return res.status(200).json({
      approved: false,
      status: "CRYPTO_NEWS_UNAVAILABLE",
      source: "MULTI_RSS",
      cached: false,
      stale: false,
      fetchedAt: null,
      count: 0,
      news: [],
      featured: [],
      latest: [],
      feeds: [],
      errors: [
        {
          feed: "service",
          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      ],
      executionAuthority: false,
      liveExecution: false,
    });
  }
});

router.get("/status", (req, res) => {
  return res.status(200).json({
    approved: true,
    status: "CRYPTO_NEWS_SERVICE_STATUS",
    ...getCryptoDashboardNewsState(),
  });
});

export default router;
