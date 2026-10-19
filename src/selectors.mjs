import { localDateString } from "./domain.mjs";

export function selectTodayTodos(data, date = localDateString()) {
  return [...(data.todos ?? [])]
    .filter((todo) => todo.date === date)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.createdAt.localeCompare(b.createdAt));
}

export function selectMemos(data, { query = "", categoryId = "" } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return [...(data.memos ?? [])]
    .filter((memo) => !categoryId || memo.categoryId === categoryId)
    .filter((memo) => !normalizedQuery || memo.content.toLocaleLowerCase().includes(normalizedQuery))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getHomeSummary(data, date = localDateString()) {
  const todos = selectTodayTodos(data, date);
  const memos = [...(data.memos ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pendingIdeas = [...(data.ideas ?? [])].filter((idea) => idea.status !== "published").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const activeProjects = [...(data.projects ?? [])].filter((project) => project.status === "in-progress");
  const activeConsultations = [...(data.consultations ?? [])].filter((consultation) => consultation.status === "in-progress");
  const todayWorkouts = [...(data.workouts ?? [])].filter((workout) => workout.date === date);
  const todayMeal = [...(data.meals ?? [])].find((meal) => meal.date === date) ?? null;
  const latestGame = [...(data.gameSessions ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  return {
    todos,
    todoRemaining: todos.filter((todo) => !todo.completed).length,
    recentMemos: memos.slice(0, 3),
    pendingIdeas,
    activeProjects,
    activeConsultations,
    todayWorkouts,
    workoutCompleted: todayWorkouts.filter((workout) => workout.completed).length,
    todayMeal,
    latestGame,
  };
}
