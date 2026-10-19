import test from "node:test";
import assert from "node:assert/strict";
import { NAV_ITEMS, getPage, pageFromHash } from "../src/navigation.mjs";

test("navigation exposes all nine PRD pages exactly once", () => {
  assert.equal(NAV_ITEMS.length, 9);
  assert.equal(new Set(NAV_ITEMS.map(({ id }) => id)).size, 9);
  assert.deepEqual(NAV_ITEMS.map(({ label }) => label), ["首页总览", "今日计划", "自媒体", "开发工作", "咨询工作", "健身计划", "饮食计划", "游戏娱乐", "数据与设置"]);
});

test("hash routing selects a page and falls back to home for unknown routes", () => {
  assert.equal(pageFromHash("#/fitness"), "fitness");
  assert.equal(pageFromHash("#/memos?q=launch"), "memos");
  assert.equal(getPage("consulting").label, "咨询工作");
  assert.equal(getPage("memos").label, "快速备忘");
  assert.equal(pageFromHash("#/missing"), "home");
});
