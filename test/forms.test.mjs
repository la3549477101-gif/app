import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFormFields } from "../src/forms.mjs";

test("form normalization supplies required defaults and preserves edited todo completion", () => {
  assert.deepEqual(normalizeFormFields("todos", { text: "  写计划  ", date: "2026-10-19" }, null, "2026-10-19"), {
    text: "写计划", date: "2026-10-19", completed: false,
  });
  assert.equal(normalizeFormFields("todos", { text: "改内容" }, { completed: true }, "2026-10-19").completed, true);
});

test("form normalization completes scene-specific dates and numeric fields", () => {
  assert.equal(normalizeFormFields("ideas", { title: "发布选题", status: "published", publishedDate: "" }, null, "2026-10-19").publishedDate, "2026-10-19");
  assert.deepEqual(normalizeFormFields("workouts", { plan: "训练", completed: true, completedDate: "" }, null, "2026-10-19"), {
    plan: "训练", completed: true, completedDate: "2026-10-19",
  });
  assert.equal(normalizeFormFields("gameSessions", { durationMinutes: "75" }, null, "2026-10-19").durationMinutes, 75);
});
