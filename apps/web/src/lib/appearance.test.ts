import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DENSITY,
  DEFAULT_THEME,
  parseDensity,
  parseTheme,
} from "./appearance.js";

describe("parseTheme", () => {
  it("accepts each valid theme", () => {
    for (const theme of ["paper", "mist", "slate", "inkwash"] as const) {
      assert.equal(parseTheme(theme), theme);
    }
  });

  it("falls back to paper for invalid or missing values", () => {
    assert.equal(parseTheme(null), DEFAULT_THEME);
    assert.equal(parseTheme(undefined), DEFAULT_THEME);
    assert.equal(parseTheme(""), DEFAULT_THEME);
    assert.equal(parseTheme("dark"), DEFAULT_THEME);
    assert.equal(parseTheme(1), DEFAULT_THEME);
  });
});

describe("parseDensity", () => {
  it("accepts each valid density", () => {
    for (const density of ["comfortable", "compact"] as const) {
      assert.equal(parseDensity(density), density);
    }
  });

  it("falls back to comfortable for invalid or missing values", () => {
    assert.equal(parseDensity(null), DEFAULT_DENSITY);
    assert.equal(parseDensity(""), DEFAULT_DENSITY);
    assert.equal(parseDensity("dense"), DEFAULT_DENSITY);
  });
});
