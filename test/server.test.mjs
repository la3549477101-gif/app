import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../server.mjs";

test("local server serves the app and module assets without external dependencies", async (t) => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /个人工作与生活管理工具/);
  const module = await fetch(`${base}/src/storage.mjs`);
  assert.equal(module.status, 200);
  assert.match(await module.text(), /createLocalStore/);
  const missing = await fetch(`${base}/unknown`);
  assert.equal(missing.status, 404);
});

test("local server refuses non-read methods", async (t) => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});
