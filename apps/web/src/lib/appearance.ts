export const APPEARANCE_THEME_KEY = "newsroom.appearance.theme";
export const APPEARANCE_DENSITY_KEY = "newsroom.appearance.density";

export const THEMES = ["paper", "mist", "slate", "inkwash"] as const;
export type AppearanceTheme = (typeof THEMES)[number];

export const DENSITIES = ["comfortable", "compact"] as const;
export type AppearanceDensity = (typeof DENSITIES)[number];

export const DEFAULT_THEME: AppearanceTheme = "paper";
export const DEFAULT_DENSITY: AppearanceDensity = "comfortable";

export const THEME_LABELS: Record<AppearanceTheme, string> = {
  paper: "Paper",
  mist: "Mist",
  slate: "Slate",
  inkwash: "Inkwash",
};

export function parseTheme(value: unknown): AppearanceTheme {
  if (typeof value === "string" && (THEMES as readonly string[]).includes(value)) {
    return value as AppearanceTheme;
  }
  return DEFAULT_THEME;
}

export function parseDensity(value: unknown): AppearanceDensity {
  if (
    typeof value === "string" &&
    (DENSITIES as readonly string[]).includes(value)
  ) {
    return value as AppearanceDensity;
  }
  return DEFAULT_DENSITY;
}

export function applyAppearance(
  theme: AppearanceTheme,
  density: AppearanceDensity,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme;
  root.dataset.density = density;
}

export function readStoredAppearance(): {
  theme: AppearanceTheme;
  density: AppearanceDensity;
} {
  if (typeof localStorage === "undefined") {
    return { theme: DEFAULT_THEME, density: DEFAULT_DENSITY };
  }
  return {
    theme: parseTheme(localStorage.getItem(APPEARANCE_THEME_KEY)),
    density: parseDensity(localStorage.getItem(APPEARANCE_DENSITY_KEY)),
  };
}

export function writeTheme(theme: AppearanceTheme): void {
  localStorage.setItem(APPEARANCE_THEME_KEY, theme);
}

export function writeDensity(density: AppearanceDensity): void {
  localStorage.setItem(APPEARANCE_DENSITY_KEY, density);
}

/** Inline boot script — keep allowlists identical to THEMES / DENSITIES. */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(APPEARANCE_THEME_KEY)});var d=localStorage.getItem(${JSON.stringify(APPEARANCE_DENSITY_KEY)});var themes=${JSON.stringify([...THEMES])};var densities=${JSON.stringify([...DENSITIES])};var root=document.documentElement;root.dataset.theme=themes.indexOf(t)>=0?t:${JSON.stringify(DEFAULT_THEME)};root.dataset.density=densities.indexOf(d)>=0?d:${JSON.stringify(DEFAULT_DENSITY)};}catch(e){}})();`;
