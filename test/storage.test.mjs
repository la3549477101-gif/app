import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, emptyData } from "../src/domain.mjs";
import { createLocalStore } from "../src/storage.mjs";
import { ensureDefaultMemoCategory } from "../src/services.mjs";
import { FakeIndexedDB } from "./fake-indexeddb.mjs";

const now = "2026-10-19T02:00:00.000Z";
const todo = (id, text) => createRecord("todos", { text, date: "2026-10-19", completed: false }, { id, now });

test("local store saves and reads records across store instances", async () => {
  const api = new FakeIndexedDB();
  const first = createLocalStore(api);
  await first.save("todos", todo("todo-a", "保留数据"));
  const second = createLocalStore(api);
  assert.deepEqual((await second.readAll()).todos, [todo("todo-a", "保留数据")]);
});

test("full restore replaces all collections and export includes the restored content", async () => {
  const store = createLocalStore(new FakeIndexedDB());
  await store.save("todos", todo("old", "旧记录"));
  const data = emptyData();
  data.todos.push(todo("new", "备份中的记录"));
  await store.replaceAll(data);
  assert.deepEqual((await store.readAll()).todos, data.todos);
  assert.deepEqual((await store.exportBackup(now)).data, data);
});

test("invalid full restore is rejected before existing records change", async () => {
  const store = createLocalStore(new FakeIndexedDB());
  await store.save("todos", todo("kept", "现有记录"));
  const invalid = emptyData();
  invalid.devTasks.push(createRecord("devTasks", { projectId: "missing", title: "悬空任务", status: "not-started" }, { id: "task", now }));
  await assert.rejects(store.replaceAll(invalid), /关联的projects记录不存在/);
  assert.deepEqual((await store.readAll()).todos, [todo("kept", "现有记录")]);
});

test("deleting a project removes its dependent development tasks atomically", async () => {
  const api = new FakeIndexedDB();
  const store = createLocalStore(api);
  await store.save("projects", createRecord("projects", { name: "样例项目", status: "in-progress" }, { id: "project", now }));
  await store.save("devTasks", createRecord("devTasks", { projectId: "project", title: "开发页面", status: "not-started" }, { id: "task", now }));
  await store.remove("projects", "project");
  const data = await store.readAll();
  assert.equal(data.projects.length, 0);
  assert.equal(data.devTasks.length, 0);
});

test("restoring an empty dataset re-establishes the required default memo category", async () => {
  const store = createLocalStore(new FakeIndexedDB());
  await store.replaceAll(emptyData());
  const restored = await ensureDefaultMemoCategory(store, await store.readAll());
  assert.equal(restored.memoCategories.length, 1);
  assert.equal(restored.memoCategories[0].name, "未分类");
});
