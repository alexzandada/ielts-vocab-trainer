const STORAGE_KEY = "ielts-vocab-trainer-progress-v4";
const DEFAULT_SETTINGS = {
  targetDays: 45,
  dailyCap: 80,
  todayNew: 12,
  mode: "mixed",
  tier: "all",
  timerSeconds: 12,
};

const state = {
  dataset: null,
  progress: {},
  settings: { ...DEFAULT_SETTINGS },
  queue: [],
  currentCard: null,
  currentIndex: 0,
  selectedAnswer: null,
  timerId: null,
  timerRemaining: 0,
  speedMode: false,
  questionResolved: false,
  sync: {
    status: "local",
    lastSyncedAt: null,
    isSyncing: false,
  },
};

const els = {
  homePage: document.querySelector("#home-page"),
  studyPage: document.querySelector("#study-page"),
  vocabPage: document.querySelector("#vocab-page"),
  summaryPage: document.querySelector("#summary-page"),
  backHome: document.querySelector("#back-home"),
  backHomeFromVocab: document.querySelector("#back-home-from-vocab"),
  backHomeFromSummary: document.querySelector("#back-home-from-summary"),
  openVocabList: document.querySelector("#open-vocab-list"),
  openSummaryPage: document.querySelector("#open-summary-page"),
  heroStats: document.querySelector("#hero-stats"),
  summaryGrid: document.querySelector("#summary-grid"),
  dailyPlan: document.querySelector("#daily-plan"),
  planInsights: document.querySelector("#plan-insights"),
  modeSelect: document.querySelector("#mode-select"),
  newCountInput: document.querySelector("#new-count-input"),
  tierSelect: document.querySelector("#tier-select"),
  timerSelect: document.querySelector("#timer-select"),
  targetDaysInput: document.querySelector("#target-days-input"),
  dailyCapInput: document.querySelector("#daily-cap-input"),
  todayTargetInput: document.querySelector("#today-target-input"),
  startStudy: document.querySelector("#start-study"),
  startSpeed: document.querySelector("#start-speed"),
  resetProgress: document.querySelector("#reset-progress"),
  cardEmpty: document.querySelector("#card-empty"),
  studyCard: document.querySelector("#study-card"),
  taskChip: document.querySelector("#task-chip"),
  timerChip: document.querySelector("#timer-chip"),
  queueProgress: document.querySelector("#queue-progress"),
  questionMain: document.querySelector("#question-main"),
  questionSub: document.querySelector("#question-sub"),
  questionMeta: document.querySelector("#question-meta"),
  optionList: document.querySelector("#option-list"),
  resultBox: document.querySelector("#result-box"),
  showAnswer: document.querySelector("#show-answer"),
  nextCard: document.querySelector("#next-card"),
  vocabList: document.querySelector("#vocab-list"),
  vocabSearch: document.querySelector("#vocab-search"),
  vocabCount: document.querySelector("#vocab-count"),
  todaySummaryStats: document.querySelector("#today-summary-stats"),
  todaySummaryList: document.querySelector("#today-summary-list"),
  summaryDate: document.querySelector("#summary-date"),
};

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);
const todayKey = () => new Date().toISOString().slice(0, 10);

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/\s+(?=[，。；：！？）])/g, "")
    .replace(/（\s+/g, "（")
    .trim();
}

function formatMeaning(entry) {
  return normalizeText(entry.meaning);
}

function formatSynonyms(entry) {
  const cleaned = (entry.synonyms || []).map(normalizeText).filter(Boolean);
  return cleaned.length ? cleaned.join(" / ") : "该词条暂无同义替换记录。";
}

function importanceText(entry) {
  return entry.importanceRank ? `第${entry.importanceRank}个` : `扩展词 ${entry.bookOrder}`;
}

function getEntryProgress(entryId) {
  if (!state.progress[entryId]) {
    state.progress[entryId] = {
      stage: -1,
      dueDate: null,
      seen: false,
      correct: 0,
      wrong: 0,
      streak: 0,
      lapses: 0,
      lastResult: null,
      lastReviewedAt: null,
      history: [],
    };
  }
  return state.progress[entryId];
}

function getPersistedState() {
  return {
    progress: state.progress,
    settings: state.settings,
    lastSyncedAt: state.sync.lastSyncedAt,
  };
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState()));
}

function loadLocalState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      progress: raw.progress || {},
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      lastSyncedAt: raw.lastSyncedAt || null,
    };
  } catch {
    return {
      progress: {},
      settings: { ...DEFAULT_SETTINGS },
      lastSyncedAt: null,
    };
  }
}

async function fetchRemoteState() {
  try {
    const response = await fetch("/api/state");
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function pushRemoteState() {
  if (state.sync.isSyncing) return;
  state.sync.isSyncing = true;
  try {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progress: state.progress,
        settings: state.settings,
      }),
    });
    if (!response.ok) throw new Error("sync failed");
    const data = await response.json();
    state.sync.status = "cloud";
    state.sync.lastSyncedAt = data.updatedAt || new Date().toISOString();
    saveLocalState();
  } catch {
    state.sync.status = "local";
    saveLocalState();
  } finally {
    state.sync.isSyncing = false;
  }
}

function showPage(page) {
  [els.homePage, els.studyPage, els.vocabPage, els.summaryPage].forEach((view) => {
    view.classList.add("hidden");
  });
  page.classList.remove("hidden");
}

function createStatCard(label, value, detail) {
  const card = document.createElement("div");
  card.className = "stat-card";
  card.innerHTML = `<span>${label}</span><strong>${value}</strong><p>${detail}</p>`;
  return card;
}

function matchesTier(entry, tier) {
  if (tier === "all") return true;
  if (tier === "high") return entry.level <= 2;
  return String(entry.level) === tier;
}

function entryWeight(entry) {
  const progress = getEntryProgress(entry.id);
  const base = entry.level === 1 ? 10 : entry.level === 2 ? 6 : 3;
  const rankBoost = entry.importanceRank ? Math.max(0, 22 - entry.importanceRank / 6) : 0;
  const errorBoost = progress.wrong * 2 + progress.lapses * 2.5;
  const synonymBoost = (entry.synonyms || []).length ? 2 : 0;
  return base + rankBoost + errorBoost + synonymBoost;
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + entryWeight(item), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= entryWeight(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function weightedSample(items, limit) {
  const pool = [...items];
  const result = [];
  while (pool.length && result.length < limit) {
    const chosen = weightedPick(pool);
    result.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return result;
}

function dueEntries(tier) {
  return state.dataset.entries
    .filter((entry) => matchesTier(entry, tier))
    .filter((entry) => {
      const progress = getEntryProgress(entry.id);
      return progress.dueDate && progress.dueDate <= todayKey();
    })
    .sort((a, b) => entryWeight(b) - entryWeight(a));
}

function newEntries(limit, tier) {
  const unseen = state.dataset.entries
    .filter((entry) => matchesTier(entry, tier))
    .filter((entry) => !getEntryProgress(entry.id).seen);
  return weightedSample(unseen, limit);
}

function pickDistractors(entry, count, extractor) {
  return shuffle(state.dataset.entries.filter((item) => item.id !== entry.id))
    .map(extractor)
    .filter(Boolean)
    .map(normalizeText)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, count);
}

function pickMode(entry, selectedMode) {
  if (selectedMode !== "mixed") return selectedMode;
  const modes = ["en_to_zh", "en_to_zh", "zh_to_en"];
  if ((entry.synonyms || []).length) modes.push("synonym", "synonym");
  return shuffle(modes)[0];
}

function buildCard(entry, selectedMode, speedMode = false) {
  const mode = pickMode(entry, selectedMode);

  if (mode === "en_to_zh") {
    const answer = formatMeaning(entry);
    return {
      entry,
      mode,
      prompt: entry.word,
      subPrompt: "看到英文，快速识别中文含义。",
      metaBefore: `重要排序：${importanceText(entry)}`,
      metaAfter: `同义替换：${formatSynonyms(entry)}`,
      choices: shuffle([answer, ...pickDistractors(entry, 3, formatMeaning)]).slice(0, 4),
      answer,
    };
  }

  if (mode === "zh_to_en") {
    const answer = normalizeText(entry.word);
    return {
      entry,
      mode,
      prompt: formatMeaning(entry),
      subPrompt: "看到中文，快速选出英文词。",
      metaBefore: `重要排序：${importanceText(entry)}`,
      metaAfter: `同义替换：${formatSynonyms(entry)}`,
      choices: shuffle([answer, ...pickDistractors(entry, 3, (item) => item.word)]).slice(0, 4),
      answer,
    };
  }

  const answer = normalizeText((entry.synonyms || [entry.word])[0]);
  const synonymPool = state.dataset.entries
    .flatMap((item) => (item.synonyms || []).slice(0, 2))
    .map(normalizeText)
    .filter(Boolean)
    .filter((value) => !(entry.synonyms || []).map(normalizeText).includes(value) && value !== answer);

  return {
    entry,
    mode: "synonym",
    prompt: entry.word,
    subPrompt: speedMode ? "限时选择最贴近的同义替换。" : "从替换表达中找出最贴近这个词的一项。",
    metaBefore: `重要排序：${importanceText(entry)}`,
    metaAfter: `中文：${formatMeaning(entry)}`,
    choices: shuffle([answer, ...shuffle(synonymPool).slice(0, 3)]).slice(0, 4),
    answer,
  };
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function setActionState({ nextEnabled = false, answerEnabled = true } = {}) {
  els.nextCard.disabled = !nextEnabled;
  els.showAnswer.disabled = !answerEnabled;
}

function recordResult(correct) {
  const progress = getEntryProgress(state.currentCard.entry.id);
  progress.seen = true;
  progress.lastResult = correct ? "correct" : "wrong";
  progress.lastReviewedAt = new Date().toISOString();
  progress.history.push({ date: todayKey(), correct });

  if (correct) {
    progress.correct += 1;
    progress.streak += 1;
  } else {
    progress.wrong += 1;
    progress.streak = 0;
    progress.lapses += 1;
  }

  const intervals = state.dataset.reviewIntervalsDays;
  if (correct) progress.stage = Math.min(progress.stage + 1, intervals.length - 1);
  else progress.stage = Math.max(progress.stage - 1, 0);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + intervals[Math.max(progress.stage, 0)]);
  progress.dueDate = dueDate.toISOString().slice(0, 10);

  if (!correct) {
    const replay = buildCard(state.currentCard.entry, state.currentCard.mode, state.speedMode);
    state.queue.splice(Math.min(state.currentIndex + 2, state.queue.length), 0, replay);
  }

  saveLocalState();
  void pushRemoteState();
}

function revealAnswer(selected, forced = false) {
  if (state.questionResolved || !state.currentCard) return;

  const card = state.currentCard;
  const chosen = normalizeText(selected || "未选择");
  const correct = !forced && chosen === normalizeText(card.answer);

  els.resultBox.classList.remove("hidden", "correct-result", "wrong-result");
  els.resultBox.classList.add(correct ? "correct-result" : "wrong-result");
  els.resultBox.innerHTML = `
    <div class="result-hero">
      <span class="result-status">${correct ? "回答正确" : "回答错误"}</span>
      <div class="result-answer">${normalizeText(card.answer)}</div>
    </div>
    <div class="result-detail"><strong>中文义</strong><span>${formatMeaning(card.entry)}</span></div>
    <div class="result-detail"><strong>同义替换</strong><span>${formatSynonyms(card.entry)}</span></div>
    <div class="result-detail"><strong>重要排序</strong><span>${importanceText(card.entry)}</span></div>
    <div class="result-detail"><strong>你的选择</strong><span>${chosen}</span></div>
  `;

  els.optionList.querySelectorAll("button").forEach((button) => {
    if (normalizeText(button.dataset.value) === normalizeText(card.answer)) button.classList.add("correct");
    if (selected && normalizeText(button.dataset.value) === normalizeText(selected) && normalizeText(selected) !== normalizeText(card.answer)) {
      button.classList.add("wrong");
    }
    button.disabled = true;
  });

  els.questionMeta.textContent = card.metaAfter;
  recordResult(correct);
  state.questionResolved = true;
  stopTimer();
  setActionState({ nextEnabled: true, answerEnabled: false });
  renderDashboard();
  renderPlanInsights();
  renderTodaySummary();
}

function startTimer(seconds) {
  stopTimer();
  if (!seconds) {
    els.timerChip.textContent = "不限时";
    return;
  }

  state.timerRemaining = seconds;
  els.timerChip.textContent = `${state.timerRemaining} 秒`;
  state.timerId = setInterval(() => {
    state.timerRemaining -= 1;
    els.timerChip.textContent = `${Math.max(state.timerRemaining, 0)} 秒`;
    if (state.timerRemaining <= 0) {
      revealAnswer(state.selectedAnswer, true);
    }
  }, 1000);
}

function renderCurrentCard() {
  const card = state.queue[state.currentIndex];
  if (!card) {
    stopTimer();
    state.currentCard = null;
    els.cardEmpty.classList.remove("hidden");
    els.studyCard.classList.add("hidden");
    els.cardEmpty.innerHTML = "<h2>今日任务完成</h2><p>你已经完成当前队列。可以返回主页查看今日汇总，或者再开一轮。</p>";
    return;
  }

  state.currentCard = card;
  state.selectedAnswer = null;
  state.questionResolved = false;

  els.cardEmpty.classList.add("hidden");
  els.studyCard.classList.remove("hidden");
  els.resultBox.classList.add("hidden");
  els.resultBox.classList.remove("correct-result", "wrong-result");
  els.resultBox.innerHTML = "";
  els.taskChip.textContent = card.mode === "en_to_zh" ? "英文识义" : card.mode === "zh_to_en" ? "中文选词" : "同义替换";
  els.queueProgress.textContent = `第 ${state.currentIndex + 1} / ${state.queue.length} 题`;
  els.questionMain.textContent = normalizeText(card.prompt);
  els.questionSub.textContent = card.subPrompt;
  els.questionMeta.textContent = card.metaBefore;
  els.optionList.innerHTML = "";
  setActionState({ nextEnabled: false, answerEnabled: true });

  card.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "option-button";
    button.textContent = normalizeText(choice);
    button.dataset.value = normalizeText(choice);
    button.addEventListener("click", () => {
      if (state.questionResolved) return;
      state.selectedAnswer = normalizeText(choice);
      revealAnswer(choice, false);
    });
    els.optionList.append(button);
  });

  startTimer(Number(els.timerSelect.value));
}

function buildStudyQueue({ mode, newCount, tier, speedMode }) {
  const reviewCap = Math.max(10, Math.floor(Number(state.settings.dailyCap || 80) * 0.6));
  const reviewList = dueEntries(tier).slice(0, reviewCap);
  const newList = newEntries(newCount, tier);
  return weightedSample([...reviewList, ...newList], reviewList.length + newList.length).map((entry) =>
    buildCard(entry, mode, speedMode)
  );
}

function countTodayStats(progress) {
  const today = todayKey();
  const todayHistory = (progress.history || []).filter((item) => item.date === today);
  return {
    seen: todayHistory.length,
    wrong: todayHistory.filter((item) => !item.correct).length,
  };
}

function renderDashboard() {
  const entries = state.dataset.entries;
  const dueTodayList = dueEntries(state.settings.tier);
  const unseenCount = entries.filter((entry) => !getEntryProgress(entry.id).seen).length;
  const learnedCount = entries.length - unseenCount;
  const hardEntries = entries
    .map((entry) => ({ entry, progress: getEntryProgress(entry.id) }))
    .filter(({ progress }) => progress.wrong > 0)
    .sort((a, b) => b.progress.wrong - a.progress.wrong)
    .slice(0, 4);

  els.heroStats.innerHTML = "";
  els.heroStats.append(
    createStatCard("词库规模", entries.length, "已从 PDF 导入"),
    createStatCard("今日到期", dueTodayList.length, "优先安排复习"),
    createStatCard("已学习", learnedCount, "已有学习记录"),
    createStatCard("同步状态", state.sync.status === "cloud" ? "云端" : "本地", state.sync.lastSyncedAt ? `最近同步 ${new Date(state.sync.lastSyncedAt).toLocaleString()}` : "尚未同步"),
  );

  els.summaryGrid.innerHTML = "";
  els.summaryGrid.append(
    createStatCard("第1类", entries.filter((entry) => entry.level === 1).length, "最优先"),
    createStatCard("第2类", entries.filter((entry) => entry.level === 2).length, "重点推进"),
    createStatCard("第3类", entries.filter((entry) => entry.level === 3).length, "扩展补充"),
    createStatCard("易错词", hardEntries.length, hardEntries.length ? hardEntries.map((item) => item.entry.word).join(" / ") : "暂时没有"),
  );

  const reviewTarget = Math.min(dueTodayList.length, Math.floor(Number(state.settings.dailyCap) * 0.6));
  const newTarget = Number(state.settings.todayNew);
  const reviewNames = dueTodayList.slice(0, Math.min(8, reviewTarget || 8)).map((entry) => entry.word);
  const newNames = newEntries(Math.min(8, newTarget), state.settings.tier).map((entry) => entry.word);

  els.dailyPlan.innerHTML = "";
  [
    {
      title: "复习词列表",
      body: reviewNames.length ? reviewNames.join(" / ") : "今天没有到期复习词。",
    },
    {
      title: "新词列表",
      body: newNames.length ? newNames.join(" / ") : "今天建议先清复习，再补新词。",
    },
    {
      title: "今天建议",
      body: `先复习 ${reviewTarget} 个，再学 ${newTarget} 个新词，总量控制在 ${reviewTarget + newTarget} 题左右。`,
    },
    {
      title: "当前重点",
      body: hardEntries.length ? `优先加练：${hardEntries.map((item) => item.entry.word).join(" / ")}` : "优先把第1类词打牢。",
    },
  ].forEach((item) => {
    const article = document.createElement("article");
    article.className = "daily-item";
    article.innerHTML = `<h3>${item.title}</h3><p>${item.body}</p>`;
    els.dailyPlan.append(article);
  });
}

function getSevenDayForecast() {
  const forecast = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    const key = day.toISOString().slice(0, 10);
    const count = state.dataset.entries.filter((entry) => {
      const dueDate = getEntryProgress(entry.id).dueDate;
      return dueDate === key;
    }).length;
    forecast.push({
      label: day.toLocaleDateString(undefined, { month: "numeric", day: "numeric", weekday: "short" }),
      count,
    });
  }
  return forecast;
}

function renderPlanInsights() {
  const unseenCount = state.dataset.entries.filter((entry) => !getEntryProgress(entry.id).seen).length;
  const targetDays = Number(state.settings.targetDays);
  const dailyCap = Number(state.settings.dailyCap);
  const todayNew = Number(state.settings.todayNew);
  const suggestedNew = Math.max(5, Math.ceil(unseenCount / Math.max(targetDays, 1)));
  const reviewBacklog = dueEntries(state.settings.tier).length;
  const forecast = getSevenDayForecast();

  els.planInsights.innerHTML = "";
  [
    {
      title: "计划建议",
      body: `按 ${targetDays} 天完成估算，建议每天新词约 ${suggestedNew} 个。`,
    },
    {
      title: "复习负担",
      body: `当前有 ${reviewBacklog} 个到期复习词；每日总量上限设为 ${dailyCap}，主要防止复习堆积。`,
    },
    {
      title: "今天目标",
      body: `今天按 ${todayNew} 个新词推进，如果错题变多，就优先压新词、保复习。`,
    },
    {
      title: "7天计划",
      body: forecast.map((item) => `${item.label} ${item.count}个`).join(" / "),
    },
  ].forEach((item) => {
    const card = document.createElement("article");
    card.className = "daily-item";
    card.innerHTML = `<h3>${item.title}</h3><p>${item.body}</p>`;
    els.planInsights.append(card);
  });
}

function renderVocabList(filter = "") {
  const keyword = normalizeText(filter).toLowerCase();
  const list = state.dataset.entries.filter((entry) => {
    if (!keyword) return true;
    return [entry.word, formatMeaning(entry), formatSynonyms(entry), importanceText(entry)].join(" ").toLowerCase().includes(keyword);
  });

  els.vocabCount.textContent = `${list.length} / ${state.dataset.entries.length} 个词条`;
  els.vocabList.innerHTML = "";
  list.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "vocab-item";
    item.innerHTML = `
      <div class="vocab-item-head">
        <div class="vocab-word">${entry.word}</div>
        <span class="chip light">${importanceText(entry)}</span>
      </div>
      <div><strong>中文：</strong> ${formatMeaning(entry)}</div>
      <div><strong>同义替换：</strong> ${formatSynonyms(entry)}</div>
    `;
    els.vocabList.append(item);
  });
}

function renderTodaySummary() {
  const today = todayKey();
  const items = state.dataset.entries
    .map((entry) => ({ entry, progress: getEntryProgress(entry.id) }))
    .map(({ entry, progress }) => ({ entry, stats: countTodayStats(progress) }))
    .filter(({ stats }) => stats.seen > 0);

  const wrongItems = items.filter(({ stats }) => stats.wrong > 0);
  const maxWrong = wrongItems.reduce((max, item) => Math.max(max, item.stats.wrong), 0);

  els.summaryDate.textContent = today;
  els.todaySummaryStats.innerHTML = "";
  els.todaySummaryStats.append(
    createStatCard("今日已学", items.length, "今天做过题的单词"),
    createStatCard("今日错题", wrongItems.length, "至少错过一次"),
    createStatCard("最高错次", maxWrong, maxWrong ? "单词单日最大错误次数" : "今天暂无错题"),
  );

  els.todaySummaryList.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("article");
    empty.className = "vocab-item";
    empty.innerHTML = "<div>今天还没有学习记录。</div>";
    els.todaySummaryList.append(empty);
    return;
  }

  items
    .sort((a, b) => b.stats.wrong - a.stats.wrong || b.stats.seen - a.stats.seen)
    .forEach(({ entry, stats }) => {
      const item = document.createElement("article");
      item.className = "vocab-item";
      if (stats.wrong > 0) item.classList.add("wrong-result");
      item.innerHTML = `
        <div class="vocab-item-head">
          <div class="vocab-word">${entry.word}</div>
          <span class="chip light">${stats.wrong > 0 ? `易错 ${stats.wrong} 次` : "今日掌握较稳"}</span>
        </div>
        <div><strong>中文：</strong> ${formatMeaning(entry)}</div>
        <div><strong>同义替换：</strong> ${formatSynonyms(entry)}</div>
        <div><strong>今日作答：</strong> ${stats.seen} 次</div>
      `;
      els.todaySummaryList.append(item);
    });
}

function applySettingsFromControls() {
  state.settings = {
    ...state.settings,
    targetDays: Number(els.targetDaysInput.value || DEFAULT_SETTINGS.targetDays),
    dailyCap: Number(els.dailyCapInput.value || DEFAULT_SETTINGS.dailyCap),
    todayNew: Number(els.todayTargetInput.value || DEFAULT_SETTINGS.todayNew),
    mode: els.modeSelect.value,
    tier: els.tierSelect.value,
    timerSeconds: Number(els.timerSelect.value || DEFAULT_SETTINGS.timerSeconds),
  };
  saveLocalState();
  void pushRemoteState();
}

function hydrateControls() {
  els.targetDaysInput.value = state.settings.targetDays;
  els.dailyCapInput.value = state.settings.dailyCap;
  els.todayTargetInput.value = state.settings.todayNew;
  els.newCountInput.value = state.settings.todayNew;
  els.modeSelect.value = state.settings.mode;
  els.tierSelect.value = state.settings.tier;
  els.timerSelect.value = String(state.settings.timerSeconds);
}

function startSession(speedMode = false) {
  applySettingsFromControls();
  state.speedMode = speedMode;
  state.queue = buildStudyQueue({
    mode: speedMode ? "synonym" : state.settings.mode,
    newCount: Number(state.settings.todayNew),
    tier: state.settings.tier,
    speedMode,
  });
  state.currentIndex = 0;
  showPage(els.studyPage);
  renderCurrentCard();
}

async function init() {
  state.dataset = window.VOCAB_DATA;
  if (!state.dataset) {
    showPage(els.studyPage);
    els.cardEmpty.classList.remove("hidden");
    els.studyCard.classList.add("hidden");
    els.cardEmpty.innerHTML = "<h2>数据加载失败</h2><p>没有读取到本地词库，请确认 data/vocab-data.js 存在。</p>";
    return;
  }

  const localState = loadLocalState();
  state.progress = localState.progress;
  state.settings = localState.settings;
  state.sync.lastSyncedAt = localState.lastSyncedAt;

  const remoteState = await fetchRemoteState();
  if (remoteState && remoteState.progress) {
    state.progress = remoteState.progress || state.progress;
    state.settings = { ...state.settings, ...(remoteState.settings || {}) };
    state.sync.status = "cloud";
    state.sync.lastSyncedAt = remoteState.updatedAt || state.sync.lastSyncedAt;
    saveLocalState();
  }

  hydrateControls();
  renderDashboard();
  renderPlanInsights();
  renderVocabList();
  renderTodaySummary();
  showPage(els.homePage);
}

els.startStudy.addEventListener("click", () => startSession(false));
els.startSpeed.addEventListener("click", () => startSession(true));
els.openVocabList.addEventListener("click", () => {
  renderVocabList(els.vocabSearch.value);
  showPage(els.vocabPage);
});
els.openSummaryPage.addEventListener("click", () => {
  renderTodaySummary();
  showPage(els.summaryPage);
});
els.showAnswer.addEventListener("click", () => revealAnswer(state.selectedAnswer, true));
els.nextCard.addEventListener("click", () => {
  if (!state.questionResolved) return;
  state.currentIndex += 1;
  renderCurrentCard();
});
els.backHome.addEventListener("click", () => {
  stopTimer();
  renderDashboard();
  renderPlanInsights();
  renderTodaySummary();
  showPage(els.homePage);
});
els.backHomeFromVocab.addEventListener("click", () => showPage(els.homePage));
els.backHomeFromSummary.addEventListener("click", () => showPage(els.homePage));
els.vocabSearch.addEventListener("input", (event) => renderVocabList(event.target.value));
[els.targetDaysInput, els.dailyCapInput, els.todayTargetInput, els.modeSelect, els.tierSelect, els.timerSelect].forEach((input) => {
  input.addEventListener("input", () => {
    applySettingsFromControls();
    renderDashboard();
    renderPlanInsights();
  });
});
els.resetProgress.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state.progress = {};
  renderDashboard();
  renderPlanInsights();
  renderTodaySummary();
  void pushRemoteState();
});

init();
