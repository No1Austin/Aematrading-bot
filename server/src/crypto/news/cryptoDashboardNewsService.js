/**
 * AEMA Crypto Dashboard News Service v3
 * Free RSS aggregation. No API key. No GPT. No fabricated content.
 *
 * Sources:
 * - Cointelegraph
 * - CoinDesk
 * - Decrypt
 * - CryptoNews
 * - CryptoSlate
 * - Google News crypto query (fallback breadth)
 */

const CACHE_TTL_MS = Math.max(
  60_000,
  Number(process.env.AEMA_CRYPTO_NEWS_CACHE_MS) || 5 * 60_000,
);
const TIMEOUT_MS = Math.max(
  3000,
  Number(process.env.AEMA_CRYPTO_NEWS_TIMEOUT_MS) || 12000,
);

const FEEDS = Object.freeze([
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Decrypt", url: "https://decrypt.co/feed" },
  { name: "CryptoNews", url: "https://cryptonews.com/news/feed/" },
  { name: "CryptoSlate", url: "https://cryptoslate.com/feed/" },
  {
    name: "Google Crypto News",
    url:
      "https://news.google.com/rss/search?q=(bitcoin%20OR%20ethereum%20OR%20crypto%20OR%20%22digital%20assets%22)%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen",
  },
]);

let cache = {
  fetchedAt: 0,
  articles: [],
  feeds: [],
  errors: [],
};

function decodeXml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n)),
    )
    .trim();
}

function stripHtml(value = "") {
  return decodeXml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function httpUrl(value) {
  try {
    const url = new URL(decodeXml(value));
    return ["http:", "https:"].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function tag(block, names) {
  for (const name of names) {
    const escaped = name.replace(":", "\\:");
    const match = block.match(
      new RegExp(
        `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
        "i",
      ),
    );
    if (match?.[1]) return decodeXml(match[1]);
  }
  return null;
}

function attr(block, tagNames, attrName) {
  for (const name of tagNames) {
    const escaped = name.replace(":", "\\:");
    const regex = new RegExp(
      `<${escaped}\\b[^>]*\\b${attrName}=["']([^"']+)["'][^>]*\\/?>`,
      "i",
    );
    const match = block.match(regex);
    if (match?.[1]) return decodeXml(match[1]);
  }
  return null;
}

function imageFromHtml(html = "") {
  const match = decodeXml(html).match(
    /<img\b[^>]*\bsrc=["']([^"']+)["']/i,
  );
  return httpUrl(match?.[1]);
}

function extractImage(block, description, content) {
  return (
    httpUrl(
      attr(
        block,
        ["media:content", "media:thumbnail", "enclosure"],
        "url",
      ),
    ) ||
    imageFromHtml(content) ||
    imageFromHtml(description) ||
    null
  );
}

function parseFeed(xml, source) {
  const itemMatches = [
    ...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi),
  ].map(match => match[0]);

  const entryMatches = [
    ...String(xml).matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ].map(match => match[0]);

  const blocks = itemMatches.length ? itemMatches : entryMatches;

  return blocks
    .map((block, index) => {
      const title = stripHtml(tag(block, ["title"]) || "");
      if (!title) return null;

      const description =
        tag(block, ["description", "summary"]) || "";
      const content =
        tag(block, ["content:encoded", "content"]) || "";

      let articleUrl =
        httpUrl(tag(block, ["link", "guid"])) ||
        httpUrl(attr(block, ["link"], "href"));

      // Google News RSS sometimes puts the publisher in <source>.
      const rssSource = stripHtml(tag(block, ["source"]) || "");
      const publishedAt =
        tag(block, [
          "pubDate",
          "published",
          "updated",
          "dc:date",
        ]) || null;

      return {
        id:
          articleUrl ||
          `${source.name}-${index}-${title.slice(0, 80)}`,
        title,
        description:
          stripHtml(description || content).slice(0, 420) || null,
        imageUrl: extractImage(block, description, content),
        articleUrl,
        source:
          rssSource && source.name === "Google Crypto News"
            ? rssSource
            : source.name,
        publishedAt,
        category: "crypto",
        feed: source.name,
      };
    })
    .filter(Boolean);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; AEMA-Crypto-News/1.0; +https://aemasystems.com)",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function loadFeed(source) {
  try {
    const xml = await fetchText(source.url);
    const articles = parseFeed(xml, source);
    return {
      name: source.name,
      url: source.url,
      ok: true,
      count: articles.length,
      articles,
      error: null,
    };
  } catch (error) {
    return {
      name: source.name,
      url: source.url,
      ok: false,
      count: 0,
      articles: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function canonicalKey(article) {
  if (article.articleUrl) {
    try {
      const u = new URL(article.articleUrl);
      u.hash = "";
      ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"]
        .forEach(k => u.searchParams.delete(k));
      return u.toString().toLowerCase();
    } catch {}
  }
  return article.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function timeOf(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

const DIRECT_SOURCE_PRIORITY = Object.freeze({
  Cointelegraph: 6,
  CoinDesk: 6,
  Decrypt: 6,
  CryptoNews: 5,
  CryptoSlate: 5,
  "Google Crypto News": 1,
});

function sourcePriority(article) {
  return DIRECT_SOURCE_PRIORITY[article?.feed] ?? 2;
}

function richnessScore(article) {
  return (
    Number(Boolean(article?.imageUrl)) * 8 +
    Number(Boolean(article?.description)) * 2 +
    sourcePriority(article)
  );
}

function merge(results) {
  const seen = new Set();
  const rows = [];

  for (const result of results) {
    for (const article of result.articles) {
      const key = canonicalKey(article);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push(article);
    }
  }

  return rows.sort((a, b) => {
    const timeDiff = timeOf(b.publishedAt) - timeOf(a.publishedAt);
    if (timeDiff) return timeDiff;
    return richnessScore(b) - richnessScore(a);
  });
}

function buildFeatured(articles, limit = 4) {
  const now = Date.now();
  const maxAgeMs = 72 * 60 * 60 * 1000;

  const candidates = articles
    .filter(article => article?.imageUrl)
    .map(article => {
      const ageMs = Math.max(0, now - timeOf(article.publishedAt));
      const freshness =
        timeOf(article.publishedAt)
          ? Math.max(0, 12 - ageMs / (6 * 60 * 60 * 1000))
          : 0;

      return {
        article,
        score:
          richnessScore(article) +
          freshness +
          (ageMs <= maxAgeMs ? 4 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(row => row.article);

  return candidates.slice(0, Math.max(1, limit));
}

export async function getCryptoDashboardNews({
  limit = 20,
  refresh = false,
} = {}) {
  const safeLimit = Math.max(
    1,
    Math.min(50, Math.trunc(Number(limit) || 20)),
  );
  const now = Date.now();

  if (
    !refresh &&
    cache.articles.length &&
    now - cache.fetchedAt < CACHE_TTL_MS
  ) {
    return {
      status: "CRYPTO_NEWS_READY",
      source: "MULTI_RSS",
      cached: true,
      stale: false,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      feeds: cache.feeds,
      errors: cache.errors,
      articles: cache.articles.slice(0, safeLimit),
      latest: cache.articles.slice(0, safeLimit),
      featured: buildFeatured(cache.articles, 4),
    };
  }

  const results = await Promise.all(FEEDS.map(loadFeed));
  const articles = merge(results);

  const feeds = results.map(r => ({
    name: r.name,
    ok: r.ok,
    count: r.count,
    error: r.error,
  }));
  const errors = feeds
    .filter(f => !f.ok)
    .map(f => ({ feed: f.name, error: f.error }));

  if (articles.length) {
    cache = { fetchedAt: now, articles, feeds, errors };
    return {
      status: "CRYPTO_NEWS_READY",
      source: "MULTI_RSS",
      cached: false,
      stale: false,
      fetchedAt: new Date(now).toISOString(),
      feeds,
      errors,
      articles: articles.slice(0, safeLimit),
      latest: articles.slice(0, safeLimit),
      featured: buildFeatured(articles, 4),
    };
  }

  if (cache.articles.length) {
    return {
      status: "CRYPTO_NEWS_STALE_CACHE",
      source: "MULTI_RSS",
      cached: true,
      stale: true,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      feeds,
      errors,
      articles: cache.articles.slice(0, safeLimit),
      latest: cache.articles.slice(0, safeLimit),
      featured: buildFeatured(cache.articles, 4),
    };
  }

  return {
    status: "CRYPTO_NEWS_UNAVAILABLE",
    source: "MULTI_RSS",
    cached: false,
    stale: false,
    fetchedAt: null,
    feeds,
    errors,
    articles: [],
    latest: [],
    featured: [],
  };
}

export function getCryptoDashboardNewsState() {
  return {
    fetchedAt: cache.fetchedAt
      ? new Date(cache.fetchedAt).toISOString()
      : null,
    count: cache.articles.length,
    source: "MULTI_RSS",
    feeds: cache.feeds,
    errors: cache.errors,
    cacheTtlMs: CACHE_TTL_MS,
  };
}

export default getCryptoDashboardNews;
