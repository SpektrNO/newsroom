"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  AiUsageResponse,
  HealthResponse,
  RankModelTier,
} from "@newsroom/api-client";
import { authClient } from "@/lib/auth-client";
import { getBrowserApiClient } from "@/lib/api";
import {
  applyAppearance,
  DENSITIES,
  DEFAULT_DENSITY,
  DEFAULT_THEME,
  parseDensity,
  parseTheme,
  readStoredAppearance,
  THEME_LABELS,
  THEMES,
  writeDensity,
  writeTheme,
  type AppearanceDensity,
  type AppearanceTheme,
} from "@/lib/appearance";

type SettingsClientProps = {
  email: string;
};

function healthLabel(status: "ok" | "error"): string {
  return status === "ok" ? "Ok" : "Unavailable";
}

function formatTokens(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

const RANK_MODEL_TIER_HELP: Record<RankModelTier, string> = {
  standard:
    "Higher-quality model for this deploy (operator RANK_MODEL_STANDARD / provider default). Slower; uses more of your daily AI budget.",
  fast: "Faster / cheaper model for this deploy (operator RANK_MODEL_FAST / provider default).",
  none: "Keyword matching only — no AI calls, no AI budget used.",
};

export function SettingsClient({ email }: SettingsClientProps): ReactNode {
  const router = useRouter();
  const api = getBrowserApiClient();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [aiUsage, setAiUsage] = useState<AiUsageResponse | null>(null);
  const [aiUsageError, setAiUsageError] = useState(false);
  const [pending, setPending] = useState(false);
  const [rankModelTier, setRankModelTier] = useState<RankModelTier | null>(null);
  const [rankModelSaving, setRankModelSaving] = useState(false);
  const [rankModelError, setRankModelError] = useState(false);
  const [theme, setTheme] = useState<AppearanceTheme>(DEFAULT_THEME);
  const [density, setDensity] = useState<AppearanceDensity>(DEFAULT_DENSITY);

  useEffect(() => {
    const stored = readStoredAppearance();
    setTheme(stored.theme);
    setDensity(stored.density);
    applyAppearance(stored.theme, stored.density);
  }, []);

  useEffect(() => {
    void api
      .health()
      .then((res) => {
        setHealth(res);
        setHealthError(false);
      })
      .catch(() => {
        setHealth(null);
        setHealthError(true);
      });
    void api
      .getAiUsage()
      .then((res) => {
        setAiUsage(res);
        setAiUsageError(false);
      })
      .catch(() => {
        setAiUsage(null);
        setAiUsageError(true);
      });
    void api
      .getRankModelSetting()
      .then((res) => {
        setRankModelTier(res.tier);
        setRankModelError(false);
      })
      .catch(() => {
        setRankModelError(true);
      });
  }, [api]);

  function onThemeChange(next: AppearanceTheme) {
    const themeValue = parseTheme(next);
    setTheme(themeValue);
    writeTheme(themeValue);
    applyAppearance(themeValue, density);
  }

  function onDensityChange(next: AppearanceDensity) {
    const densityValue = parseDensity(next);
    setDensity(densityValue);
    writeDensity(densityValue);
    applyAppearance(theme, densityValue);
  }

  async function onRankModelTierChange(tier: RankModelTier) {
    const previous = rankModelTier;
    setRankModelTier(tier);
    setRankModelSaving(true);
    setRankModelError(false);
    try {
      const res = await api.setRankModelSetting(tier);
      setRankModelTier(res.tier);
    } catch {
      setRankModelTier(previous);
      setRankModelError(true);
    } finally {
      setRankModelSaving(false);
    }
  }

  async function onSignOut() {
    setPending(true);
    await authClient.signOut();
    setPending(false);
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <section className="manage-page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-lede">
          Account, appearance, and read-only system status.
        </p>
      </header>

      <div className="settings-block">
        <p className="manage-title">{email}</p>
        <button type="button" onClick={() => void onSignOut()} disabled={pending}>
          {pending ? "Signing out…" : "Sign out"}
        </button>
      </div>

      <div className="settings-block">
        <h2 className="form-heading">Appearance</h2>
        <p className="appearance-lede">
          Background tint and reading density for this browser.
        </p>

        <div
          className="appearance-group"
          role="group"
          aria-labelledby="appearance-background-label"
        >
          <span
            id="appearance-background-label"
            className="appearance-group-label"
          >
            Background
          </span>
          <div className="appearance-swatches">
            {THEMES.map((id) => (
              <button
                key={id}
                type="button"
                className="appearance-swatch"
                data-theme-preview={id}
                aria-pressed={theme === id}
                onClick={() => onThemeChange(id)}
              >
                <span className="appearance-swatch-preview" aria-hidden />
                <span className="appearance-swatch-label">
                  {THEME_LABELS[id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div
          className="appearance-group"
          role="group"
          aria-labelledby="appearance-density-label"
        >
          <span
            id="appearance-density-label"
            className="appearance-group-label"
          >
            Density
          </span>
          <div className="appearance-density">
            {DENSITIES.map((id) => (
              <button
                key={id}
                type="button"
                className="appearance-density-btn"
                aria-pressed={density === id}
                onClick={() => onDensityChange(id)}
              >
                {id === "comfortable" ? "Comfortable" : "Compact"}
              </button>
            ))}
          </div>
        </div>

        <p className="appearance-note">
          Saved on this device only. Clearing site data resets appearance.
        </p>
      </div>

      <div className="settings-block">
        <h2 className="form-heading">Ranking model</h2>
        {rankModelTier === null ? (
          <p className="feed-placeholder">Checking…</p>
        ) : (
          <>
            <label className="filter-field">
              <span className="filter-label">AI tier</span>
              <select
                value={rankModelTier}
                disabled={rankModelSaving}
                onChange={(e) =>
                  void onRankModelTierChange(e.target.value as RankModelTier)
                }
              >
                <option value="standard">Standard</option>
                <option value="fast">Fast</option>
                <option value="none">None (keyword only)</option>
              </select>
            </label>
            <p className="manage-meta">
              {RANK_MODEL_TIER_HELP[rankModelTier]}
            </p>
            {rankModelError ? (
              <p className="manage-meta" role="status">
                Couldn’t save the ranking model setting. Try again.
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="settings-block">
        <h2 className="form-heading">AI tokens today</h2>
        {aiUsageError ? (
          <p className="manage-meta">Couldn’t load token usage.</p>
        ) : !aiUsage ? (
          <p className="feed-placeholder">Checking…</p>
        ) : (
          <>
            <p className="manage-meta">
              {formatTokens(aiUsage.used)} / {formatTokens(aiUsage.limit)}
              {aiUsage.limit <= 0 ? " (unlimited)" : ""} · UTC {aiUsage.day}
            </p>
            <ul className="health-list">
              <li>Rank · {formatTokens(aiUsage.byPurpose.rank)}</li>
              <li>Chat · {formatTokens(aiUsage.byPurpose.chat)}</li>
              {aiUsage.byPurpose.other > 0 ? (
                <li>Other · {formatTokens(aiUsage.byPurpose.other)}</li>
              ) : null}
            </ul>
            {aiUsage.hardExceeded ? (
              <p className="manage-meta" role="status">
                Daily token limit reached. Chat is paused; ranking uses keywords
                only until tomorrow (UTC).
              </p>
            ) : aiUsage.softExceeded ? (
              <p className="manage-meta" role="status">
                Approaching today’s token limit ({formatTokens(aiUsage.softLimit)}{" "}
                soft threshold).
              </p>
            ) : null}
            {aiUsage.rankAi ? (
              <div className="manage-meta">
                <p>
                  Ollama scored {formatTokens(aiUsage.rankAi.used)} article
                  {aiUsage.rankAi.used === 1 ? "" : "s"} today
                  {aiUsage.rankAi.dayLimit > 0
                    ? ` (cap ${formatTokens(aiUsage.rankAi.dayLimit)} / UTC day)`
                    : " (no daily article cap — token budget above applies)"}
                  .
                </p>
                {aiUsage.rankAi.runLimit > 0 ? (
                  <p>
                    Each Rank latest run AI-scores at most{" "}
                    {formatTokens(aiUsage.rankAi.runLimit)} articles; anything
                    beyond that stays keyword-only until a later run (or until
                    the token budget is used up).
                  </p>
                ) : null}
                {aiUsage.rankAi.remaining === 0 &&
                aiUsage.rankAi.dayLimit > 0 ? (
                  <p role="status">
                    Today’s AI article limit is used up. Rank latest will keep
                    adding keyword matches, but Ollama won’t score them until
                    tomorrow (UTC).
                  </p>
                ) : aiUsage.rankAi.remaining > 0 &&
                  aiUsage.rankAi.dayLimit > 0 ? (
                  <p>
                    {formatTokens(aiUsage.rankAi.remaining)} AI article
                    {aiUsage.rankAi.remaining === 1 ? "" : "s"} left today.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="settings-block">
        <h2 className="form-heading">System</h2>
        {healthError ? (
          <p className="manage-meta">Couldn’t reach health checks.</p>
        ) : !health ? (
          <p className="feed-placeholder">Checking…</p>
        ) : (
          <ul className="health-list">
            <li>
              Database · {healthLabel(health.checks.database)}
            </li>
            <li>
              AI
              {health.aiProvider ? ` (${health.aiProvider})` : ""} ·{" "}
              {healthLabel(health.checks.ai ?? health.checks.ollama)}
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
