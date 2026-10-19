import test from "node:test";
import assert from "node:assert/strict";
import { emptyData } from "../src/domain.mjs";
import { getHomeSummary, selectMemos, selectTodayTodos } from "../src/selectors.mjs";

const row = (id, extra = {}) => ({ id, createdAt: "2026-10-19T01:00:00.000Z", updatedAt: "2026-10-19T01:00:00.000Z", ...extra });

test("today selector shares the same date filter and leaves other days out", () => {
  const data = emptyData();
  data.todos = [
    row("yesterday", { date: "2026-10-18", completed: false }),
    row("done", { date: "2026-10-19", completed: true }),
    row("today", { date: "2026-10-19", completed: false }),
  ];
  assert.deepEqual(selectTodayTodos(data, "2026-10-19").map(({ id }) => id), ["today", "done"]);
});

test("memo selector combines category and case-insensitive keyword filters", () => {
  const data = emptyData();
  data.memos = [
    row("a", { content: "Record a launch idea", categoryId: "work" }),
    row("b", { content: "Personal grocery note", categoryId: "life" }),
    row("c", { content: "Another LAUNCH plan", categoryId: "work" }),
  ];
  assert.deepEqual(selectMemos(data, { query: "launch", categoryId: "work" }).map(({ id }) => id).sort(), ["a", "c"]);
  assert.equal(selectMemos(data, { query: "missing" }).length, 0);
});

test("home summary derives module highlights from records and handles empty collections", () => {
  const data = emptyData();
  data.todos.push(row("t", { date: "2026-10-19", completed: false }));
  data.ideas.push(row("i", { title: "新选题", status: "pending" }));
  data.projects.push(row("p", { name: "工具", status: "in-progress" }));
  data.projects.push(row("p2", { name: "尚未开始的项目", status: "not-started" }));
  data.consultations.push(row("c", { title: "咨询事项", status: "in-progress" }));
  data.workouts.push(row("w", { date: "2026-10-19", completed: true }));
  data.meals.push(row("m", { date: "2026-10-19", content: "午餐" }));
  data.gameSessions.push(row("g", { date: "2026-10-18", gameName: "样例游戏" }));
  const summary = getHomeSummary(data, "2026-10-19");
  assert.equal(summary.todoRemaining, 1);
  assert.equal(summary.pendingIdeas[0].id, "i");
  assert.equal(summary.activeProjects[0].id, "p");
  assert.equal(summary.activeProjects.length, 1);
  assert.equal(summary.activeConsultations[0].id, "c");
  assert.equal(summary.workoutCompleted, 1);
  assert.equal(summary.todayMeal.id, "m");
  assert.equal(summary.latestGame.id, "g");
  assert.equal(getHomeSummary(emptyData(), "2026-10-19").recentMemos.length, 0);
});
