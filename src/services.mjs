import { createRecord } from "./domain.mjs";

export async function ensureDefaultMemoCategory(store, data) {
  if (data.memoCategories.length > 0) return data;
  await store.save("memoCategories", createRecord("memoCategories", { name: "未分类" }));
  return store.readAll();
}
