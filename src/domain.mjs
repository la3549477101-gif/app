export const APP_NAME = "我的日常";
export const SCHEMA_VERSION = 1;

export const COLLECTIONS = Object.freeze([
  "todos",
  "memos",
  "memoCategories",
  "ideas",
  "projects",
  "devTasks",
  "clients",
  "consultations",
  "followUps",
  "workouts",
  "meals",
  "gameSessions",
]);

const requiredStrings = {
  todos: ["text", "date"],
  memos: ["content", "categoryId"],
  memoCategories: ["name"],
  ideas: ["title", "status"],
  projects: ["name", "status"],
  devTasks: ["projectId", "title", "status"],
  clients: ["name"],
  consultations: ["clientId", "title", "status"],
  followUps: ["consultationId", "content", "date"],
  workouts: ["date", "plan"],
  meals: ["date", "content"],
  gameSessions: ["date", "gameName"],
};

const allowedStatuses = {
  ideas: ["pending", "published"],
  projects: ["not-started", "in-progress", "completed"],
  devTasks: ["not-started", "in-progress", "completed"],
  consultations: ["in-progress", "completed"],
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isIsoDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const isTimestamp = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createRecord(collection, fields = {}, { id = globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`, now = new Date().toISOString() } = {}) {
  if (!COLLECTIONS.includes(collection)) throw new TypeError(`未知的数据集合：${collection}`);
  const record = { ...fields, id, createdAt: now, updatedAt: now };
  const errors = validateRecord(collection, record);
  if (errors.length) throw new TypeError(errors.join("；"));
  return record;
}

export function validateRecord(collection, record) {
  if (!COLLECTIONS.includes(collection)) return [`未知的数据集合：${collection}`];
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["记录格式无效"];
  if (!isNonEmptyString(record.id)) errors.push("缺少有效 id");
  for (const field of requiredStrings[collection] ?? []) {
    if (!isNonEmptyString(record[field])) errors.push(`${field} 不能为空`);
  }
  if (!isTimestamp(record.createdAt)) errors.push("createdAt 时间无效");
  if (!isTimestamp(record.updatedAt)) errors.push("updatedAt 时间无效");
  if ((collection === "todos" || collection === "followUps" || collection === "workouts" || collection === "meals" || collection === "gameSessions") && !isIsoDate(record.date)) errors.push("date 日期无效");
  if (collection === "ideas" && !allowedStatuses.ideas.includes(record.status)) errors.push("选题状态无效");
  if (collection === "projects" && !allowedStatuses.projects.includes(record.status)) errors.push("项目进度无效");
  if (collection === "devTasks" && !allowedStatuses.devTasks.includes(record.status)) errors.push("任务进度无效");
  if (collection === "consultations" && !allowedStatuses.consultations.includes(record.status)) errors.push("咨询进度无效");
  if (collection === "todos" && typeof record.completed !== "boolean") errors.push("待办完成状态无效");
  if (collection === "workouts" && typeof record.completed !== "boolean") errors.push("训练完成状态无效");
  if (collection === "gameSessions" && (!Number.isFinite(record.durationMinutes) || record.durationMinutes < 0)) errors.push("游玩时长必须为不小于 0 的分钟数");
  return errors;
}

export function validateBackup(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["备份文件内容必须是 JSON 对象"] };
  if (value.app !== APP_NAME) errors.push("这不是本应用的备份文件");
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push(`不支持的备份版本：${String(value.schemaVersion)}`);
  if (!isTimestamp(value.exportedAt)) errors.push("缺少有效的导出时间");
  if (!value.data || typeof value.data !== "object" || Array.isArray(value.data)) {
    errors.push("缺少数据内容");
  } else {
    const idsByCollection = new Map();
    for (const collection of COLLECTIONS) {
      const rows = value.data[collection];
      if (!Array.isArray(rows)) {
        errors.push(`${collection} 必须是数组`);
        continue;
      }
      const ids = new Set();
      for (let index = 0; index < rows.length; index += 1) {
        for (const error of validateRecord(collection, rows[index])) errors.push(`${collection}[${index}]：${error}`);
        const id = rows[index]?.id;
        if (id && ids.has(id)) errors.push(`${collection}[${index}]：id 重复`);
        if (id) ids.add(id);
      }
      idsByCollection.set(collection, ids);
    }
    const references = [
      ["memos", "categoryId", "memoCategories"],
      ["devTasks", "projectId", "projects"],
      ["consultations", "clientId", "clients"],
      ["followUps", "consultationId", "consultations"],
    ];
    for (const [collection, field, targetCollection] of references) {
      for (const [index, row] of (value.data[collection] ?? []).entries()) {
        if (row?.[field] && !idsByCollection.get(targetCollection)?.has(row[field])) {
          errors.push(`${collection}[${index}]：关联的${targetCollection}记录不存在`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function emptyData() {
  return Object.fromEntries(COLLECTIONS.map((collection) => [collection, []]));
}

export function makeBackup(data, exportedAt = new Date().toISOString()) {
  const backup = { app: APP_NAME, schemaVersion: SCHEMA_VERSION, exportedAt, data };
  const result = validateBackup(backup);
  if (!result.valid) throw new TypeError(result.errors.join("；"));
  return backup;
}

export function serializeBackup(data, exportedAt = new Date().toISOString()) {
  return JSON.stringify(makeBackup(data, exportedAt), null, 2);
}

export function parseBackupText(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { valid: false, errors: ["文件不是有效的 JSON 格式"], backup: null };
  }
  const result = validateBackup(value);
  return { ...result, backup: result.valid ? value : null };
}
