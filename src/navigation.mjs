export const NAV_ITEMS = Object.freeze([
  { id: "home", label: "首页总览", icon: "⌂", description: "今日重点与各模块摘要" },
  { id: "today", label: "今日计划", icon: "☑", description: "今天要完成的待办" },
  { id: "media", label: "自媒体", icon: "✎", description: "内容选题与发布记录" },
  { id: "development", label: "开发工作", icon: "⌘", description: "项目、任务与进度" },
  { id: "consulting", label: "咨询工作", icon: "◇", description: "客户、事项与跟进" },
  { id: "fitness", label: "健身计划", icon: "↗", description: "训练安排与完成情况" },
  { id: "food", label: "饮食计划", icon: "◒", description: "每天饮食记录" },
  { id: "gaming", label: "游戏娱乐", icon: "△", description: "游戏与游玩时长" },
  { id: "settings", label: "数据与设置", icon: "⚙", description: "数据导出、备份和恢复" },
]);

export function getPage(id) {
  if (id === "memos") return { id: "memos", label: "快速备忘", icon: "✦", description: "可分类和搜索的备忘" };
  return NAV_ITEMS.find((item) => item.id === id) ?? NAV_ITEMS[0];
}

export function pageFromHash(hash) {
  return getPage(String(hash ?? "").replace(/^#\/?/, "").split("?")[0]).id;
}
