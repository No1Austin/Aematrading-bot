import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowUpRight,
  Clock3,
  Newspaper,
  RefreshCw,
} from "lucide-react";

import { getCryptoNews } from "../services/cryptoApi.js";
import "./CryptoNewsFeed.css";

function timeAgo(value) {
  const ms = Date.parse(String(value ?? ""));
  if (!Number.isFinite(ms)) return "Recently";

  const diff = Math.max(0, Date.now() - ms);
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? ""), window.location.origin);
    return ["http:", "https:"].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function StoryLink({ story, className = "", children }) {
  const href = safeUrl(story?.articleUrl);

  if (!href) {
    return <div className={className}>{children}</div>;
  }

  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

function StoryImage({ story, hero = false }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : safeUrl(story?.imageUrl);

  if (!src) {
    return (
      <div
        className={
          hero
            ? "crypto-news-image-fallback hero"
            : "crypto-news-image-fallback"
        }
      >
        <Newspaper size={hero ? 40 : 28} />
        <span>{story?.source ?? "Crypto News"}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading={hero ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  );
}

export default function CryptoNewsFeed() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ refresh = false } = {}) => {
    refresh ? setRefreshing(true) : setLoading(true);

    try {
      const body = await getCryptoNews({
        limit: 20,
        refresh,
      });

      setPayload(body);

      setError(
        body?.status === "CRYPTO_NEWS_UNAVAILABLE"
          ? "Live crypto news is temporarily unavailable."
          : null,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load crypto news.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      void load();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [load]);

  const latest = useMemo(() => {
    if (Array.isArray(payload?.latest)) return payload.latest;
    if (Array.isArray(payload?.news)) return payload.news;
    return [];
  }, [payload]);

  const featured = useMemo(() => {
    if (Array.isArray(payload?.featured) && payload.featured.length) {
      return payload.featured;
    }

    return latest
      .filter(item => item?.imageUrl)
      .slice(0, 4);
  }, [payload, latest]);

  const hero = featured[0] ?? latest[0] ?? null;
  const secondary = featured.slice(1, 4);

  const featuredIds = useMemo(
    () =>
      new Set(
        [hero, ...secondary]
          .filter(Boolean)
          .map(item => item?.id ?? item?.articleUrl),
      ),
    [hero, secondary],
  );

  const stream = useMemo(
    () =>
      latest
        .filter(
          item =>
            !featuredIds.has(
              item?.id ?? item?.articleUrl,
            ),
        )
        .slice(0, 10),
    [latest, featuredIds],
  );

  return (
    <section className="crypto-newsroom">
      <div className="crypto-newsroom-head">
        <div>
          <div className="crypto-news-eyebrow">
            <span className="crypto-live-dot" />
            CRYPTO INTELLIGENCE
          </div>

          <h2>Live Crypto News</h2>

          <p>
            Real headlines from multiple crypto publishers and news feeds.
          </p>
        </div>

        <button
          type="button"
          className="crypto-news-refresh"
          onClick={() => void load({ refresh: true })}
          disabled={refreshing}
        >
          <RefreshCw
            size={16}
            className={refreshing ? "spin" : ""}
          />
          Refresh
        </button>
      </div>

      {loading && !payload ? (
        <div className="crypto-news-state">
          <RefreshCw className="spin" size={20} />
          Loading live crypto news…
        </div>
      ) : error && !hero ? (
        <div className="crypto-news-state error">
          <Newspaper size={20} />
          {error}
        </div>
      ) : hero ? (
        <>
          <div className="crypto-news-feature-grid">
            <StoryLink story={hero} className="crypto-news-hero">
              <div className="crypto-news-hero-media">
                <StoryImage story={hero} hero />
                <div className="crypto-news-image-shade" />
              </div>

              <div className="crypto-news-hero-copy">
                <div className="crypto-news-meta">
                  <strong>{hero.source}</strong>
                  <span>
                    <Clock3 size={13} />
                    {timeAgo(hero.publishedAt)}
                  </span>
                </div>

                <h3>{hero.title}</h3>

                {hero.description ? (
                  <p>{hero.description}</p>
                ) : null}

                <span className="crypto-read-story">
                  Read full story
                  <ArrowUpRight size={16} />
                </span>
              </div>
            </StoryLink>

            <div className="crypto-news-secondary-grid">
              {secondary.map(story => (
                <StoryLink
                  key={story.id ?? story.articleUrl}
                  story={story}
                  className="crypto-news-card"
                >
                  <div className="crypto-news-card-media">
                    <StoryImage story={story} />
                  </div>

                  <div className="crypto-news-card-copy">
                    <div className="crypto-news-meta">
                      <strong>{story.source}</strong>
                      <span>{timeAgo(story.publishedAt)}</span>
                    </div>

                    <h4>{story.title}</h4>

                    {story.description ? (
                      <p>{story.description}</p>
                    ) : null}
                  </div>
                </StoryLink>
              ))}
            </div>
          </div>

          <div className="crypto-latest-news">
            <div className="crypto-latest-head">
              <div>
                <span>MARKET WIRE</span>
                <h3>Latest Crypto News</h3>
              </div>

              <span className="crypto-news-count">
                {payload?.count ?? latest.length} stories
              </span>
            </div>

            <div className="crypto-latest-list">
              {stream.map(story => (
                <StoryLink
                  key={story.id ?? story.articleUrl}
                  story={story}
                  className="crypto-latest-row"
                >
                  <div className="crypto-latest-source">
                    {story.source}
                  </div>

                  <div className="crypto-latest-title">
                    {story.title}
                  </div>

                  <div className="crypto-latest-time">
                    {timeAgo(story.publishedAt)}
                    <ArrowUpRight size={14} />
                  </div>
                </StoryLink>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="crypto-news-state">
          <Newspaper size={20} />
          No current stories were returned by the live feeds.
        </div>
      )}

      <div className="crypto-news-foot">
        <span>
          {payload?.stale
            ? "Showing the last available feed snapshot"
            : "Live multi-source RSS"}
        </span>

        <span>
          Updated {timeAgo(payload?.fetchedAt)}
        </span>
      </div>
    </section>
  );
}
