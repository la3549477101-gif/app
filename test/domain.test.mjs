import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APP_NAME, COLLECTIONS, SCHEMA_VERSION, createRecord, emptyData, localDateString,
  makeBackup, parseBackupText, serializeBackup, validateBackup,
} from "../src/domain.mjs";

const fixedNow = "2026-10-19T02:00:00.000Z";

test("all product areas have distinct persisted collections", () => {
  assert.deepEqual(COLLECTIONS, [
    "todos", "memos", "memoCategories", "ideas", "projects", "devTasks",
    "clients", "consultations", "followUps", "workouts", "meals", "gameSessions",
  ]);
  assert.equal(new Set(COLLECTIONS).size, COLLECTIONS.length);
});

test("record creation supplies stable identity and timestamps and validates required data", () => {
  const row = createRecord("todos", { text: "写开发计划", date: "2026-10-19", completed: false }, { id: "todo-1", now: fixedNow });
  assert.deepEqual(row, {
    text: "写开发计划", date: "2026-10-19", completed: false,
    id: "todo-1", createdAt: fixedNow, updatedAt: fixedNow,
  });
  assert.throws(() => createRecord("gameSessions", { gameName: "", date: "2026-10-19", durationMinutes: -1 }, { id: "bad", now: fixedNow }), /不能为空/);
  assert.throws(() => createRecord("unknown", {}, { id: "bad", now: fixedNow }), /未知的数据集合/);
});

test("local day uses local calendar fields rather than UTC conversion", () => {
  const date = new Date(2026, 9, 19, 0, 5);
  assert.equal(localDateString(date), "2026-10-19");
});

test("backup is versioned, contains every collection, and validates successfully", () => {
  const data = emptyData();
  data.todos.push(createRecord("todos", { text: "保存备份", date: "2026-10-19", completed: false }, { id: "todo-1", now: fixedNow }));
  const backup = makeBackup(data, fixedNow);
  assert.equal(backup.app, APP_NAME);
  assert.equal(backup.schemaVersion, SCHEMA_VERSION);
  assert.equal(validateBackup(backup).valid, true);
});

test("backup validation rejects unsupported versions and malformed module data", () => {
  const base = makeBackup(emptyData(), fixedNow);
  assert.match(validateBackup({ ...base, schemaVersion: 999 }).errors.join(" "), /不支持的备份版本/);
  const invalid = structuredClone(base);
  invalid.data.meals.push({ id: "m1", date: "19-10-2026", content: "午餐", createdAt: fixedNow, updatedAt: fixedNow });
  assert.match(validateBackup(invalid).errors.join(" "), /date 日期无效/);
  const missingCollection = structuredClone(base);
  delete missingCollection.data.projects;
  assert.match(validateBackup(missingCollection).errors.join(" "), /projects 必须是数组/);
});

test("backup text codec round-trips data and reports malformed JSON clearly", () => {
  const data = emptyData();
  const category = createRecord("memoCategories", { name: "灵感" }, { id: "category-1", now: fixedNow });
  data.memoCategories.push(category);
  data.memos.push(createRecord("memos", { content: "记下一个点子", categoryId: category.id }, { id: "memo-1", now: fixedNow }));
  const parsed = parseBackupText(serializeBackup(data, fixedNow));
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.backup.data, data);
  assert.match(parseBackupText("{broken").errors[0], /有效的 JSON/);
});

test("empty backup fixture is valid for restoring a fresh local data set", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/empty-backup.json", import.meta.url), "utf8"));
  assert.equal(validateBackup(fixture).valid, true);
});

test("backup validation rejects broken references and duplicate identifiers", () => {
  const data = emptyData();
  data.devTasks.push(createRecord("devTasks", { projectId: "missing-project", title: "实现页面", status: "not-started" }, { id: "task-1", now: fixedNow }));
  data.todos.push(
    createRecord("todos", { text: "第一项", date: "2026-10-19", completed: false }, { id: "duplicate", now: fixedNow }),
    createRecord("todos", { text: "第二项", date: "2026-10-19", completed: false }, { id: "duplicate", now: fixedNow }),
  );
  const result = validateBackup(makeBackupForValidation(data));
  assert.match(result.errors.join(" "), /关联的projects记录不存在/);
  assert.match(result.errors.join(" "), /id 重复/);
});

test("scene-specific records validate their own progress and duration fields", () => {
  assert.throws(() => createRecord("ideas", { title: "选题", status: "in-progress" }, { id: "idea", now: fixedNow }), /选题状态无效/);
  assert.throws(() => createRecord("consultations", { clientId: "client", title: "事项", status: "pending" }, { id: "consultation", now: fixedNow }), /咨询进度无效/);
  assert.throws(() => createRecord("gameSessions", { gameName: "游戏", date: "2026-10-19", durationMinutes: -3 }, { id: "game", now: fixedNow }), /游玩时长必须/);
  assert.throws(() => createRecord("workouts", { date: "2026-02-31", plan: "训练", completed: false }, { id: "workout", now: fixedNow }), /date 日期无效/);
});

function makeBackupForValidation(data) {
  return { app: APP_NAME, schemaVersion: SCHEMA_VERSION, exportedAt: fixedNow, data };
}
