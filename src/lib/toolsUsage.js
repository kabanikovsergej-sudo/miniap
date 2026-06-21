// Трекинг использования инструментов
const LS_KEY_TOOLS_USAGE = "nightcore_tools_usage_v1";

/**
 * Отслеживает использование инструмента
 * @param {string} toolId - ID инструмента (например, "Menu", "Timer", "Calculator", "BP")
 */
export function trackToolUsage(toolId) {
  if (!toolId || typeof toolId !== "string") return;
  
  try {
    const raw = localStorage.getItem(LS_KEY_TOOLS_USAGE);
    const data = raw ? JSON.parse(raw) : {};
    
    const now = Date.now();
    const dayKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Инициализируем данные для инструмента
    if (!data[toolId]) {
      data[toolId] = {
        totalUses: 0,
        lastUsed: now,
        dailyUses: {},
        firstUsed: now
      };
    }
    
    // Обновляем статистику
    data[toolId].totalUses++;
    data[toolId].lastUsed = now;
    
    // Обновляем дневную статистику
    if (!data[toolId].dailyUses[dayKey]) {
      data[toolId].dailyUses[dayKey] = 0;
    }
    data[toolId].dailyUses[dayKey]++;
    
    // Сохраняем
    localStorage.setItem(LS_KEY_TOOLS_USAGE, JSON.stringify(data));
  } catch (err) {
    console.warn("Failed to track tool usage:", err);
  }
}

/**
 * Получает статистику использования инструментов
 * @returns {Object} Статистика использования
 */
export function getToolsUsage() {
  try {
    const raw = localStorage.getItem(LS_KEY_TOOLS_USAGE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Получает самые часто используемые инструменты (топ N)
 * @param {number} limit - Максимальное количество инструментов
 * @param {number} daysThreshold - Учитывать только использование за последние N дней
 * @returns {Array} Массив объектов {toolId, uses, lastUsed}
 */
export function getMostUsedTools(limit = 3, daysThreshold = 30) {
  try {
    const data = getToolsUsage();
    const now = Date.now();
    const cutoffTime = now - (daysThreshold * 24 * 60 * 60 * 1000);
    
    // Преобразуем объект в массив и фильтруем
    const tools = Object.entries(data)
      .map(([toolId, stats]) => {
        // Взвешенный счет: учитываем общее использование + свежесть
        const recencyWeight = stats.lastUsed > cutoffTime ? 2 : 1;
        const weightedScore = stats.totalUses * recencyWeight;
        
        return {
          toolId,
          totalUses: stats.totalUses,
          lastUsed: stats.lastUsed,
          weightedScore,
          daysSinceLastUse: Math.floor((now - stats.lastUsed) / (24 * 60 * 60 * 1000))
        };
      })
      .filter(tool => tool.totalUses > 0)
      .sort((a, b) => b.weightedScore - a.weightedScore) // Сортировка по взвешенному счету
      .slice(0, limit);
    
    return tools;
  } catch {
    return [];
  }
}

/**
 * Сбрасывает статистику использования
 */
export function resetToolsUsage() {
  localStorage.removeItem(LS_KEY_TOOLS_USAGE);
}