export function normalizeFormFields(collection, values, existing = null, currentDate) {
  const fields = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
  if (collection === "todos") fields.completed = existing?.completed ?? false;
  if (collection === "ideas" && fields.status === "published" && !fields.publishedDate) fields.publishedDate = currentDate;
  if (collection === "workouts") {
    fields.completed = Boolean(fields.completed);
    if (fields.completed && !fields.completedDate) fields.completedDate = currentDate;
    if (!fields.completed) fields.completedDate = "";
  }
  if (collection === "gameSessions") fields.durationMinutes = Number(fields.durationMinutes);
  return fields;
}
