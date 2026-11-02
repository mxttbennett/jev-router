import test from "node:test";
import assert from "node:assert/strict";
import { availableTiers, parseTierList } from "../src/config.mjs";

test("offers every tier except fable by default", () => {
  // Arrange
  const env = {};

  // Act
  const tiers = availableTiers(env);

  // Assert
  assert.deepEqual(tiers, ["haiku", "sonnet", "opus"]);
});

test("JEV_ALLOWED_TIERS narrows routing to the listed tiers", () => {
  // Arrange
  const env = { JEV_ALLOWED_TIERS: "haiku,sonnet" };

  // Act
  const tiers = availableTiers(env);

  // Assert
  assert.deepEqual(tiers, ["haiku", "sonnet"]);
});

test("JEV_ALLOWED_TIERS ignores whitespace and unknown names", () => {
  // Arrange
  const env = { JEV_ALLOWED_TIERS: " sonnet , gpt-9 " };

  // Act
  const tiers = availableTiers(env);

  // Assert
  assert.deepEqual(tiers, ["sonnet"]);
});

test("JEV_ALLOWED_TIERS with only unknown names leaves every tier available", () => {
  // Arrange
  const env = { JEV_ALLOWED_TIERS: "gpt-9" };

  // Act
  const tiers = availableTiers(env);

  // Assert
  assert.deepEqual(tiers, ["haiku", "sonnet", "opus"]);
});

test("fable stays opt-in even when JEV_ALLOWED_TIERS names it", () => {
  // Arrange
  const listed = { JEV_ALLOWED_TIERS: "sonnet,fable" };
  const allowed = { JEV_ALLOWED_TIERS: "sonnet,fable", JEV_ALLOW_FABLE: "1" };

  // Act & Assert
  assert.deepEqual(availableTiers(listed), ["sonnet"]);
  assert.deepEqual(availableTiers(allowed), ["sonnet", "fable"]);
});

test("parseTierList accepts commas and spaces and lowercases names", () => {
  // Act & Assert
  assert.equal(parseTierList("Haiku, sonnet  opus"), "haiku,sonnet,opus");
});

test("parseTierList rejects an empty list and any unknown tier", () => {
  // Act & Assert
  assert.equal(parseTierList(""), null);
  assert.equal(parseTierList("sonnet,gpt-9"), null);
});
