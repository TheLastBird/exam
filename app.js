const STORAGE_KEYS = {
  currentUser: "exam.currentUser",
  users: "exam.users",
  questions: "exam.questions",
  wrongBook: "exam.wrongBook",
  answerRecords: "exam.answerRecords",
  tests: "exam.tests",
  practiceProgress: "exam.practiceProgress",
};

const QUESTION_TYPES = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
};

const DEFAULT_USERS = [
  { id: "u_admin", username: "admin", password: "admin123", nickname: "管理员", role: "admin" },
  { id: "u_student", username: "student", password: "123456", nickname: "学生用户", role: "student" },
];

const DEFAULT_QUESTIONS = [];
const REMOVED_DEMO_QUESTION_IDS = new Set(["q_single_demo", "q_multiple_demo", "q_judge_demo"]);

const appState = {
  view: "practice",
  editingQuestionId: null,
  activePracticeQuestionId: null,
  practiceResult: null,
  activeWrongQuestionId: null,
  wrongResult: null,
  activeQuiz: null,
  quizResult: null,
  questionFilter: "all",
  questionKeyword: "",
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`读取本地数据失败: ${key}`, error);
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getUsers() {
  const users = loadJSON(STORAGE_KEYS.users, null);
  if (users) return users;
  saveJSON(STORAGE_KEYS.users, DEFAULT_USERS);
  return DEFAULT_USERS;
}

function getCurrentUser() {
  return loadJSON(STORAGE_KEYS.currentUser, null);
}

function getQuestions() {
  const questions = loadJSON(STORAGE_KEYS.questions, null);
  if (questions) {
    const migratedQuestions = questions.filter((question) => !REMOVED_DEMO_QUESTION_IDS.has(question.id));
    if (migratedQuestions.length !== questions.length) {
      saveJSON(STORAGE_KEYS.questions, migratedQuestions);
      saveWrongBook(getWrongBook().filter((item) => !REMOVED_DEMO_QUESTION_IDS.has(item.questionId)));
    }
    return migratedQuestions;
  }
  saveJSON(STORAGE_KEYS.questions, DEFAULT_QUESTIONS);
  return DEFAULT_QUESTIONS;
}

function saveQuestions(questions) {
  saveJSON(STORAGE_KEYS.questions, questions);
}

function getWrongBook() {
  return loadJSON(STORAGE_KEYS.wrongBook, []);
}

function saveWrongBook(items) {
  saveJSON(STORAGE_KEYS.wrongBook, items);
}

function getAnswerRecords() {
  return loadJSON(STORAGE_KEYS.answerRecords, []);
}

function saveAnswerRecords(records) {
  saveJSON(STORAGE_KEYS.answerRecords, records);
}

function getTests() {
  return loadJSON(STORAGE_KEYS.tests, []);
}

function saveTests(tests) {
  saveJSON(STORAGE_KEYS.tests, tests);
}

function getPracticeProgress() {
  return loadJSON(STORAGE_KEYS.practiceProgress, []);
}

function savePracticeProgress(items) {
  saveJSON(STORAGE_KEYS.practiceProgress, items);
}

function getUserPracticeProgress(userId, questions = getQuestions()) {
  const progressItems = getPracticeProgress();
  const existing = progressItems.find((item) => item.userId === userId);
  const validQuestionIds = new Set(questions.map((question) => question.id));
  const correctQuestionIds = (existing?.correctQuestionIds ?? []).filter((questionId) => validQuestionIds.has(questionId));

  if (existing && correctQuestionIds.length !== existing.correctQuestionIds.length) {
    savePracticeProgress(
      progressItems.map((item) =>
        item.userId === userId
          ? {
              ...item,
              correctQuestionIds,
              updatedAt: nowISO(),
            }
          : item,
      ),
    );
  }

  return {
    userId,
    round: existing?.round ?? 1,
    correctQuestionIds,
  };
}

function getPracticeStats(user, questions = getQuestions()) {
  const progress = getUserPracticeProgress(user.id, questions);
  const correctQuestionIdSet = new Set(progress.correctQuestionIds);
  const remainingQuestions = questions.filter((question) => !correctQuestionIdSet.has(question.id));

  return {
    total: questions.length,
    round: progress.round,
    correctCount: progress.correctQuestionIds.length,
    remainingCount: remainingQuestions.length,
    completed: questions.length > 0 && remainingQuestions.length === 0,
    remainingQuestions,
  };
}

function markPracticeQuestionCorrect(userId, questionId) {
  const progressItems = getPracticeProgress();
  const existingIndex = progressItems.findIndex((item) => item.userId === userId);
  const updatedAt = nowISO();

  if (existingIndex >= 0) {
    const existing = progressItems[existingIndex];
    const correctQuestionIds = Array.from(new Set([...(existing.correctQuestionIds ?? []), questionId]));
    progressItems[existingIndex] = {
      ...existing,
      correctQuestionIds,
      updatedAt,
    };
  } else {
    progressItems.push({
      userId,
      round: 1,
      correctQuestionIds: [questionId],
      createdAt: updatedAt,
      updatedAt,
    });
  }

  savePracticeProgress(progressItems);
}

function resetPracticeProgress(userId) {
  const progressItems = getPracticeProgress();
  const existingIndex = progressItems.findIndex((item) => item.userId === userId);
  const updatedAt = nowISO();

  if (existingIndex >= 0) {
    const existing = progressItems[existingIndex];
    progressItems[existingIndex] = {
      ...existing,
      round: (existing.round ?? 1) + 1,
      correctQuestionIds: [],
      updatedAt,
    };
  } else {
    progressItems.push({
      userId,
      round: 1,
      correctQuestionIds: [],
      createdAt: updatedAt,
      updatedAt,
    });
  }

  savePracticeProgress(progressItems);
}

function normalizeType(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["single", "单选", "单选题"].includes(text)) return "single";
  if (["multiple", "多选", "多选题"].includes(text)) return "multiple";
  if (["judge", "判断", "判断题", "truefalse"].includes(text)) return "judge";
  return "";
}

function normalizeAnswer(rawValue, type) {
  const raw = String(rawValue ?? "").trim();
  if (type === "judge") {
    const normalized = raw.toLowerCase();
    if (["正确", "对", "是", "true", "t", "1", "yes", "y", "a"].includes(normalized)) return ["正确"];
    if (["错误", "错", "否", "false", "f", "0", "no", "n", "b"].includes(normalized)) return ["错误"];
    return [];
  }

  const answers = raw
    .toUpperCase()
    .replace(/[，、；;|]/g, ",")
    .replace(/\s+/g, "")
    .split(",")
    .join("")
    .split("")
    .filter((item) => ["A", "B", "C", "D"].includes(item));

  const unique = Array.from(new Set(answers)).sort();
  return type === "single" ? unique.slice(0, 1) : unique;
}

function answerToText(answer) {
  return Array.isArray(answer) ? answer.join(",") : String(answer ?? "");
}

function answersEqual(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function getChoices(question) {
  if (question.type === "judge") {
    return [
      { key: "正确", label: "正确" },
      { key: "错误", label: "错误" },
    ];
  }

  return question.options
    .map((option, index) => ({
      key: String.fromCharCode(65 + index),
      label: `${String.fromCharCode(65 + index)}. ${option}`,
    }))
    .filter((item) => item.label.trim() !== `${item.key}.`);
}

function getQuestionById(id) {
  return getQuestions().find((question) => question.id === id);
}

function getVisibleQuestions() {
  const keyword = appState.questionKeyword.trim().toLowerCase();
  return getQuestions().filter((question) => {
    const matchesType = appState.questionFilter === "all" || question.type === appState.questionFilter;
    const matchesKeyword =
      !keyword ||
      question.content.toLowerCase().includes(keyword) ||
      question.options.some((option) => option.toLowerCase().includes(keyword));
    return matchesType && matchesKeyword;
  });
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function collectAnswer(groupName) {
  return Array.from(document.querySelectorAll(`input[name="${groupName}"]:checked`)).map((input) => input.value);
}

function validateQuestionPayload(payload) {
  const errors = [];
  if (!payload.type) errors.push("题型不能为空");
  if (!payload.content.trim()) errors.push("题干不能为空");
  if (payload.type !== "judge") {
    const availableOptions = payload.options.filter((option) => option.trim());
    if (availableOptions.length < 2) errors.push("单选/多选题至少需要 2 个选项");
    if (payload.answer.some((item) => !availableOptions[choiceIndex(item)])) errors.push("答案不能指向空选项");
  }
  if (!payload.answer.length) errors.push("正确答案不能为空");
  if (payload.type === "single" && payload.answer.length !== 1) errors.push("单选题只能有 1 个正确答案");
  return errors;
}

function choiceIndex(choice) {
  return choice.charCodeAt(0) - 65;
}

function handleAnsweredQuestion(user, question, userAnswer, source) {
  const correct = answersEqual(userAnswer, question.answer);
  const submittedAt = nowISO();
  const records = getAnswerRecords();
  records.unshift({
    id: uid("record"),
    userId: user.id,
    questionId: question.id,
    userAnswer,
    correct,
    source,
    submittedAt,
  });
  saveAnswerRecords(records);

  const wrongBook = getWrongBook();
  const existingIndex = wrongBook.findIndex((item) => item.userId === user.id && item.questionId === question.id);

  if (!correct) {
    if (existingIndex >= 0) {
      wrongBook[existingIndex] = {
        ...wrongBook[existingIndex],
        wrongCount: wrongBook[existingIndex].wrongCount + 1,
        correctStreak: 0,
        lastAnswerAt: submittedAt,
        updatedAt: submittedAt,
      };
    } else {
      wrongBook.unshift({
        id: uid("wrong"),
        userId: user.id,
        questionId: question.id,
        wrongCount: 1,
        correctStreak: 0,
        lastAnswerAt: submittedAt,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      });
    }
  } else if (existingIndex >= 0) {
    const nextStreak = wrongBook[existingIndex].correctStreak + 1;
    if (nextStreak >= 2) {
      wrongBook.splice(existingIndex, 1);
    } else {
      wrongBook[existingIndex] = {
        ...wrongBook[existingIndex],
        correctStreak: nextStreak,
        lastAnswerAt: submittedAt,
        updatedAt: submittedAt,
      };
    }
  }

  saveWrongBook(wrongBook);
  return { correct, submittedAt };
}

function render() {
  const user = getCurrentUser();
  const root = document.querySelector("#app");
  root.innerHTML = user ? renderShell(user) : renderLogin();
}

function renderLogin() {
  return `
    <main class="login-page">
      <section class="login-card">
        <div class="brand">
          <span class="brand-logo">考</span>
          <div>
            <h1>考试刷题系统</h1>
            <p>题库、刷题、错题本、练习测验一体化 MVP</p>
          </div>
        </div>

        <form class="login-form" onsubmit="ExamApp.login(event)">
          <label>
            账号
            <input id="loginUsername" type="text" value="student" autocomplete="username" required />
          </label>
          <label>
            密码
            <input id="loginPassword" type="password" value="123456" autocomplete="current-password" required />
          </label>
          <button type="submit" class="primary full">登录</button>
        </form>

        <div class="demo-account">
          <strong>演示账号</strong>
          <span>普通用户：student / 123456</span>
          <span>管理员：admin / admin123</span>
        </div>
      </section>
    </main>
  `;
}

function renderShell(user) {
  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="side-brand">
          <span class="brand-logo">考</span>
          <div>
            <h2>考试刷题系统</h2>
            <p>${escapeHTML(user.nickname)} · ${user.role === "admin" ? "管理员" : "学习用户"}</p>
          </div>
        </div>
        <nav>
          ${renderNavButton("questions", "题库管理")}
          ${renderNavButton("practice", "随机刷题")}
          ${renderNavButton("wrong", "错题本")}
          ${renderNavButton("quiz", "练习测验")}
          ${renderNavButton("records", "答题记录")}
        </nav>
        <button class="ghost logout" onclick="ExamApp.logout()">退出登录</button>
      </aside>
      <main class="content">
        ${renderDashboardHeader()}
        ${renderCurrentView(user)}
      </main>
    </div>
  `;
}

function renderDashboardHeader() {
  const user = getCurrentUser();
  const questions = getQuestions();
  const wrongCount = getWrongBook().filter((item) => item.userId === user.id).length;
  const records = getAnswerRecords().filter((item) => item.userId === user.id);
  const correctCount = records.filter((item) => item.correct).length;
  const accuracy = records.length ? Math.round((correctCount / records.length) * 100) : 0;

  return `
    <section class="stats-grid">
      <article class="stat-card">
        <span>题库题量</span>
        <strong>${questions.length}</strong>
      </article>
      <article class="stat-card">
        <span>我的错题</span>
        <strong>${wrongCount}</strong>
      </article>
      <article class="stat-card">
        <span>答题次数</span>
        <strong>${records.length}</strong>
      </article>
      <article class="stat-card">
        <span>正确率</span>
        <strong>${accuracy}%</strong>
      </article>
    </section>
  `;
}

function renderNavButton(view, label) {
  const active = appState.view === view ? "active" : "";
  return `<button class="nav-button ${active}" onclick="ExamApp.switchView('${view}')">${label}</button>`;
}

function renderCurrentView(user) {
  if (appState.view === "questions") return renderQuestionsView(user);
  if (appState.view === "wrong") return renderWrongBookView(user);
  if (appState.view === "quiz") return renderQuizView(user);
  if (appState.view === "records") return renderRecordsView(user);
  return renderPracticeView(user);
}

function renderQuestionsView() {
  const visibleQuestions = getVisibleQuestions();
  return `
    <section class="page-section">
      <div class="section-title">
        <div>
          <h1>题库管理</h1>
          <p>题库是刷题、错题本和练习测验的统一来源，支持 Excel 导入导出。</p>
        </div>
        <div class="actions">
          <button onclick="ExamApp.downloadTemplate()">下载模板</button>
          <button onclick="ExamApp.exportQuestions()">导出 Excel</button>
          <label class="file-button">
            导入 Excel
            <input type="file" accept=".xlsx,.xls" onchange="ExamApp.importQuestions(event)" />
          </label>
        </div>
      </div>

      <div class="grid two-columns">
        <article class="card">
          <h2>${appState.editingQuestionId ? "编辑题目" : "新增题目"}</h2>
          ${renderQuestionForm()}
        </article>

        <article class="card">
          <div class="toolbar">
            <input
              type="search"
              placeholder="搜索题干或选项"
              value="${escapeHTML(appState.questionKeyword)}"
              oninput="ExamApp.updateQuestionKeyword(this.value)"
            />
            <select onchange="ExamApp.updateQuestionFilter(this.value)">
              <option value="all" ${appState.questionFilter === "all" ? "selected" : ""}>全部题型</option>
              ${Object.entries(QUESTION_TYPES)
                .map(([key, label]) => `<option value="${key}" ${appState.questionFilter === key ? "selected" : ""}>${label}</option>`)
                .join("")}
            </select>
          </div>
          <div class="question-list">
            ${
              visibleQuestions.length
                ? visibleQuestions.map(renderQuestionListItem).join("")
                : `<div class="empty">暂无题目，请新增或导入题库。</div>`
            }
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderQuestionForm() {
  const editing = appState.editingQuestionId ? getQuestionById(appState.editingQuestionId) : null;
  const options = editing?.options ?? ["", "", "", ""];
  return `
    <form class="question-form" onsubmit="ExamApp.saveQuestion(event)">
      <label>
        题型
        <select id="questionType" required>
          ${Object.entries(QUESTION_TYPES)
            .map(([key, label]) => `<option value="${key}" ${editing?.type === key ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </label>
      <label>
        题干
        <textarea id="questionContent" rows="4" required>${escapeHTML(editing?.content ?? "")}</textarea>
      </label>
      <div class="form-grid">
        ${["A", "B", "C", "D"]
          .map(
            (letter, index) => `
              <label>
                选项 ${letter}
                <input id="option${letter}" type="text" value="${escapeHTML(options[index] ?? "")}" placeholder="判断题可留空" />
              </label>
            `,
          )
          .join("")}
      </div>
      <label>
        正确答案
        <input id="questionAnswer" type="text" value="${escapeHTML(answerToText(editing?.answer ?? []))}" placeholder="单选 A；多选 A,B,C；判断 正确/错误" required />
      </label>
      <label>
        答案解析
        <textarea id="questionAnalysis" rows="3">${escapeHTML(editing?.analysis ?? "")}</textarea>
      </label>
      <div class="form-actions">
        <button class="primary" type="submit">${editing ? "保存修改" : "新增题目"}</button>
        ${editing ? `<button type="button" onclick="ExamApp.cancelEditQuestion()">取消编辑</button>` : ""}
      </div>
      <p class="hint">导入 Excel 字段：题型、题干、选项A、选项B、选项C、选项D、答案、解析。</p>
    </form>
  `;
}

function renderQuestionListItem(question, index) {
  return `
    <article class="question-item">
      <div class="question-main">
        <div class="question-meta">
          <span class="badge">${QUESTION_TYPES[question.type]}</span>
          <span>#${index + 1}</span>
        </div>
        <h3>${escapeHTML(question.content)}</h3>
        ${renderChoicePreview(question)}
        <p class="answer-line">答案：<strong>${escapeHTML(answerToText(question.answer))}</strong></p>
        <p class="analysis-line">解析：${escapeHTML(question.analysis || "暂无解析")}</p>
      </div>
      <div class="item-actions">
        <button onclick="ExamApp.editQuestion('${question.id}')">编辑</button>
        <button class="danger" onclick="ExamApp.deleteQuestion('${question.id}')">删除</button>
      </div>
    </article>
  `;
}

function renderChoicePreview(question) {
  if (question.type === "judge") return `<ul class="choice-preview"><li>正确</li><li>错误</li></ul>`;
  return `
    <ul class="choice-preview">
      ${question.options
        .map((option, index) => (option ? `<li>${String.fromCharCode(65 + index)}. ${escapeHTML(option)}</li>` : ""))
        .join("")}
    </ul>
  `;
}

function renderPracticeView(user) {
  const questions = getQuestions();
  const stats = getPracticeStats(user, questions);
  const question = appState.activePracticeQuestionId ? getQuestionById(appState.activePracticeQuestionId) : null;
  return `
    <section class="page-section">
      <div class="section-title">
        <div>
          <h1>随机刷题</h1>
          <p>本轮随机抽题只会抽取尚未答对的题目，直到题库全部答对。</p>
        </div>
        <div class="actions">
          <button class="primary" onclick="ExamApp.startRandomPractice()" ${questions.length && !stats.completed ? "" : "disabled"}>随机抽一题</button>
          ${stats.completed ? `<button type="button" onclick="ExamApp.startNewPracticeRound()">开启新一轮</button>` : ""}
        </div>
      </div>
      ${renderPracticeProgress(stats)}
      <article class="card">
        ${question ? renderAnswerCard(question, "practice", appState.practiceResult) : renderPracticeEmpty(questions.length, stats)}
      </article>
    </section>
  `;
}

function renderPracticeProgress(stats) {
  if (!stats.total) return "";
  const percent = Math.round((stats.correctCount / stats.total) * 100);
  return `
    <article class="practice-progress">
      <div>
        <strong>第 ${stats.round} 轮刷题进度</strong>
        <p>已答对 ${stats.correctCount} / ${stats.total} 题，剩余 ${stats.remainingCount} 题。</p>
      </div>
      <div class="progress-meter" aria-label="随机刷题进度">
        <span style="width: ${percent}%"></span>
      </div>
      <span class="badge ${stats.completed ? "success" : ""}">${stats.completed ? "本轮完成" : `${percent}%`}</span>
    </article>
  `;
}

function renderPracticeEmpty(questionCount, stats) {
  if (!questionCount) {
    return `<div class="empty">题库暂无题目，请先在题库管理中新增或导入。</div>`;
  }
  if (stats.completed) {
    return `
      <div class="empty">
        <p>本轮题库题目已全部答对。</p>
        <button class="primary" type="button" onclick="ExamApp.startNewPracticeRound()">开启新一轮刷题</button>
      </div>
    `;
  }
  return `<div class="empty">点击“随机抽一题”开始练习。</div>`;
}

function renderAnswerCard(question, scope, result) {
  const practiceCompleted = scope === "practice" && result?.correct && getPracticeStats(getCurrentUser()).completed;
  return `
    <form class="answer-card" onsubmit="ExamApp.submitAnswer(event, '${scope}', '${question.id}')">
      <div class="question-meta">
        <span class="badge">${QUESTION_TYPES[question.type]}</span>
        <span>正确答案：${result ? escapeHTML(answerToText(question.answer)) : "提交后展示"}</span>
      </div>
      <h2>${escapeHTML(question.content)}</h2>
      ${renderAnswerOptions(question, scope, result)}
      <div class="form-actions">
        <button class="primary" type="submit" ${result ? "disabled" : ""}>提交答案</button>
        ${
          scope === "practice"
            ? practiceCompleted
              ? `<button type="button" onclick="ExamApp.startNewPracticeRound()">开启新一轮</button>`
              : `<button type="button" onclick="ExamApp.startRandomPractice()">下一题</button>`
            : `<button type="button" onclick="ExamApp.backToWrongList()">返回错题列表</button>`
        }
      </div>
      ${result ? renderAnswerResult(question, result) : ""}
    </form>
  `;
}

function renderAnswerOptions(question, scope, result) {
  const inputType = question.type === "multiple" ? "checkbox" : "radio";
  const disabled = result ? "disabled" : "";
  return `
    <div class="answer-options">
      ${getChoices(question)
        .map(
          (choice) => `
            <label class="answer-option">
              <input type="${inputType}" name="${scope}_${question.id}" value="${escapeHTML(choice.key)}" ${disabled} />
              <span>${escapeHTML(choice.label)}</span>
            </label>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderAnswerResult(question, result) {
  return `
    <div class="result-box ${result.correct ? "success" : "danger"}">
      <strong>${result.correct ? "回答正确" : "回答错误"}</strong>
      <p>你的答案：${escapeHTML(result.userAnswer.length ? answerToText(result.userAnswer) : "未作答")}</p>
      <p>正确答案：${escapeHTML(answerToText(question.answer))}</p>
      <p>答案解析：${escapeHTML(question.analysis || "暂无解析")}</p>
      ${result.message ? `<p>${escapeHTML(result.message)}</p>` : ""}
    </div>
  `;
}

function renderWrongBookView(user) {
  const wrongItems = getWrongBook()
    .filter((item) => item.userId === user.id)
    .map((item) => ({ ...item, question: getQuestionById(item.questionId) }))
    .filter((item) => item.question);

  const activeQuestion = appState.activeWrongQuestionId ? getQuestionById(appState.activeWrongQuestionId) : null;

  return `
    <section class="page-section">
      <div class="section-title">
        <div>
          <h1>错题本</h1>
          <p>答错自动加入错题本；错题连续答对 2 次后自动删除。</p>
        </div>
      </div>
      ${
        activeQuestion
          ? `<article class="card">${renderAnswerCard(activeQuestion, "wrong", appState.wrongResult)}</article>`
          : `<article class="card">${renderWrongList(wrongItems)}</article>`
      }
    </section>
  `;
}

function renderWrongList(items) {
  if (!items.length) return `<div class="empty">暂无错题，保持得不错。</div>`;
  return `
    <div class="question-list">
      ${items
        .map(
          (item, index) => `
            <article class="question-item">
              <div class="question-main">
                <div class="question-meta">
                  <span class="badge">${QUESTION_TYPES[item.question.type]}</span>
                  <span>#${index + 1}</span>
                  <span>答错 ${item.wrongCount} 次</span>
                  <span>连续答对 ${item.correctStreak}/2</span>
                </div>
                <h3>${escapeHTML(item.question.content)}</h3>
                <p class="analysis-line">最近答题：${formatTime(item.lastAnswerAt)}</p>
              </div>
              <div class="item-actions">
                <button class="primary" onclick="ExamApp.practiceWrong('${item.question.id}')">练习本题</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderQuizView(user) {
  return `
    <section class="page-section">
      <div class="section-title">
        <div>
          <h1>练习测验</h1>
          <p>指定题目数量，可按题库顺序或随机抽题生成一次练习测试。</p>
        </div>
      </div>
      ${
        appState.quizResult
          ? renderQuizResult()
          : appState.activeQuiz
            ? renderQuizPaper()
            : renderQuizCreator()
      }
      ${renderTestHistory(user)}
    </section>
  `;
}

function renderQuizCreator() {
  const total = getQuestions().length;
  return `
    <article class="card">
      <h2>生成练习测试</h2>
      <form class="quiz-form" onsubmit="ExamApp.createQuiz(event)">
        <label>
          题目数量
          <input id="quizCount" type="number" min="1" max="${Math.max(total, 1)}" value="${Math.min(5, Math.max(total, 1))}" required />
        </label>
        <label>
          抽题方式
          <select id="quizMode">
            <option value="random">随机抽题</option>
            <option value="sequence">顺序抽题</option>
          </select>
        </label>
        <button class="primary" type="submit" ${total ? "" : "disabled"}>开始测验</button>
      </form>
      ${total ? `<p class="hint">当前题库共 ${total} 题。</p>` : `<div class="empty">题库暂无题目，无法生成测验。</div>`}
    </article>
  `;
}

function renderQuizPaper() {
  const questions = appState.activeQuiz.questionIds.map(getQuestionById).filter(Boolean);
  return `
    <article class="card">
      <div class="toolbar">
        <h2>练习测试进行中</h2>
        <button onclick="ExamApp.cancelQuiz()">取消测验</button>
      </div>
      <form class="quiz-paper" onsubmit="ExamApp.submitQuiz(event)">
        ${questions
          .map(
            (question, index) => `
              <section class="quiz-question">
                <div class="question-meta">
                  <span>第 ${index + 1} 题</span>
                  <span class="badge">${QUESTION_TYPES[question.type]}</span>
                </div>
                <h3>${escapeHTML(question.content)}</h3>
                ${renderAnswerOptions(question, `quiz_${question.id}`, null)}
              </section>
            `,
          )
          .join("")}
        <button class="primary" type="submit">提交测验</button>
      </form>
    </article>
  `;
}

function renderQuizResult() {
  const result = appState.quizResult;
  return `
    <article class="card">
      <div class="result-summary">
        <div>
          <span>得分</span>
          <strong>${result.score}</strong>
        </div>
        <div>
          <span>正确</span>
          <strong>${result.correctCount}</strong>
        </div>
        <div>
          <span>错误</span>
          <strong>${result.wrongCount}</strong>
        </div>
      </div>
      <div class="question-list">
        ${result.items
          .map(
            (item, index) => `
              <article class="question-item">
                <div class="question-main">
                  <div class="question-meta">
                    <span>第 ${index + 1} 题</span>
                    <span class="badge ${item.correct ? "success" : "danger"}">${item.correct ? "正确" : "错误"}</span>
                  </div>
                  <h3>${escapeHTML(item.question.content)}</h3>
                  <p>你的答案：${escapeHTML(item.userAnswer.length ? answerToText(item.userAnswer) : "未作答")}</p>
                  <p>正确答案：${escapeHTML(answerToText(item.question.answer))}</p>
                  <p class="analysis-line">解析：${escapeHTML(item.question.analysis || "暂无解析")}</p>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
      <div class="form-actions">
        <button class="primary" onclick="ExamApp.resetQuiz()">再来一次</button>
      </div>
    </article>
  `;
}

function renderTestHistory(user) {
  const tests = getTests().filter((test) => test.userId === user.id).slice(0, 5);
  if (!tests.length) return "";
  return `
    <article class="card history-card">
      <h2>最近测验</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>题量</th>
              <th>方式</th>
              <th>得分</th>
              <th>正确/错误</th>
            </tr>
          </thead>
          <tbody>
            ${tests
              .map(
                (test) => `
                  <tr>
                    <td>${formatTime(test.createdAt)}</td>
                    <td>${test.total}</td>
                    <td>${test.mode === "random" ? "随机" : "顺序"}</td>
                    <td>${test.score}</td>
                    <td>${test.correctCount}/${test.wrongCount}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderRecordsView(user) {
  const questions = getQuestions();
  const records = getAnswerRecords()
    .filter((item) => item.userId === user.id)
    .slice(0, 50)
    .map((item) => ({ ...item, question: questions.find((question) => question.id === item.questionId) }));

  return `
    <section class="page-section">
      <div class="section-title">
        <div>
          <h1>答题记录</h1>
          <p>展示最近 50 条答题记录。</p>
        </div>
      </div>
      <article class="card">
        ${
          records.length
            ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>来源</th>
                      <th>题目</th>
                      <th>答案</th>
                      <th>结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${records
                      .map(
                        (record) => `
                          <tr>
                            <td>${formatTime(record.submittedAt)}</td>
                            <td>${sourceLabel(record.source)}</td>
                            <td>${escapeHTML(record.question?.content ?? "题目已删除")}</td>
                            <td>${escapeHTML(record.userAnswer.length ? answerToText(record.userAnswer) : "未作答")}</td>
                            <td><span class="badge ${record.correct ? "success" : "danger"}">${record.correct ? "正确" : "错误"}</span></td>
                          </tr>
                        `,
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            `
            : `<div class="empty">暂无答题记录。</div>`
        }
      </article>
    </section>
  `;
}

function sourceLabel(source) {
  const labels = {
    practice: "随机刷题",
    wrong_book: "错题本",
    quiz: "练习测验",
  };
  return labels[source] ?? source;
}

function readQuestionForm() {
  const type = normalizeType(document.querySelector("#questionType").value);
  const answer = normalizeAnswer(document.querySelector("#questionAnswer").value, type);
  return {
    type,
    content: document.querySelector("#questionContent").value.trim(),
    options: ["A", "B", "C", "D"].map((letter) => document.querySelector(`#option${letter}`).value.trim()),
    answer,
    analysis: document.querySelector("#questionAnalysis").value.trim(),
  };
}

function rowValue(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== "") return row[name];
  }
  return "";
}

function parseImportedQuestion(row) {
  const type = normalizeType(rowValue(row, ["题型", "类型", "type"]));
  const payload = {
    type,
    content: String(rowValue(row, ["题干", "题目", "content"])).trim(),
    options: ["A", "B", "C", "D"].map((letter) =>
      String(rowValue(row, [`选项${letter}`, `选项 ${letter}`, `option_${letter.toLowerCase()}`, `option${letter}`])).trim(),
    ),
    answer: normalizeAnswer(rowValue(row, ["答案", "正确答案", "answer"]), type),
    analysis: String(rowValue(row, ["解析", "答案解析", "analysis"])).trim(),
  };

  const errors = validateQuestionPayload(payload);
  if (errors.length) {
    return { errors };
  }

  return {
    question: {
      id: uid("q"),
      ...payload,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    },
  };
}

const ExamApp = {
  login(event) {
    event.preventDefault();
    const username = document.querySelector("#loginUsername").value.trim();
    const password = document.querySelector("#loginPassword").value;
    const user = getUsers().find((item) => item.username === username && item.password === password);
    if (!user) {
      alert("账号或密码错误");
      return;
    }
    saveJSON(STORAGE_KEYS.currentUser, { id: user.id, username: user.username, nickname: user.nickname, role: user.role });
    appState.view = "practice";
    render();
  },

  logout() {
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    appState.activePracticeQuestionId = null;
    appState.activeWrongQuestionId = null;
    appState.activeQuiz = null;
    appState.quizResult = null;
    render();
  },

  switchView(view) {
    appState.view = view;
    appState.practiceResult = null;
    appState.wrongResult = null;
    if (view !== "wrong") appState.activeWrongQuestionId = null;
    render();
  },

  updateQuestionKeyword(value) {
    appState.questionKeyword = value;
    render();
  },

  updateQuestionFilter(value) {
    appState.questionFilter = value;
    render();
  },

  saveQuestion(event) {
    event.preventDefault();
    const payload = readQuestionForm();
    const errors = validateQuestionPayload(payload);
    if (errors.length) {
      alert(errors.join("\n"));
      return;
    }

    const questions = getQuestions();
    if (appState.editingQuestionId) {
      const index = questions.findIndex((question) => question.id === appState.editingQuestionId);
      if (index >= 0) {
        questions[index] = {
          ...questions[index],
          ...payload,
          updatedAt: nowISO(),
        };
      }
    } else {
      questions.unshift({
        id: uid("q"),
        ...payload,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    }

    saveQuestions(questions);
    appState.editingQuestionId = null;
    render();
  },

  editQuestion(id) {
    appState.editingQuestionId = id;
    render();
  },

  cancelEditQuestion() {
    appState.editingQuestionId = null;
    render();
  },

  deleteQuestion(id) {
    if (!confirm("确认删除这道题吗？相关错题记录也会移除。")) return;
    saveQuestions(getQuestions().filter((question) => question.id !== id));
    saveWrongBook(getWrongBook().filter((item) => item.questionId !== id));
    savePracticeProgress(
      getPracticeProgress().map((item) => ({
        ...item,
        correctQuestionIds: (item.correctQuestionIds ?? []).filter((questionId) => questionId !== id),
      })),
    );
    if (appState.activePracticeQuestionId === id) appState.activePracticeQuestionId = null;
    if (appState.activeWrongQuestionId === id) appState.activeWrongQuestionId = null;
    if (appState.editingQuestionId === id) appState.editingQuestionId = null;
    render();
  },

  downloadTemplate() {
    if (!window.XLSX) {
      alert("Excel 组件尚未加载，请检查网络后重试。");
      return;
    }
    const rows = [
      {
        题型: "单选",
        题干: "示例单选题题干",
        选项A: "选项 A",
        选项B: "选项 B",
        选项C: "选项 C",
        选项D: "选项 D",
        答案: "A",
        解析: "这里填写答案解析",
      },
      {
        题型: "多选",
        题干: "示例多选题题干",
        选项A: "选项 A",
        选项B: "选项 B",
        选项C: "选项 C",
        选项D: "选项 D",
        答案: "A,C",
        解析: "多个答案用逗号分隔",
      },
      {
        题型: "判断",
        题干: "示例判断题题干",
        选项A: "",
        选项B: "",
        选项C: "",
        选项D: "",
        答案: "正确",
        解析: "判断题答案填写正确或错误",
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "题库模板");
    XLSX.writeFile(book, "题库导入模板.xlsx");
  },

  exportQuestions() {
    if (!window.XLSX) {
      alert("Excel 组件尚未加载，请检查网络后重试。");
      return;
    }
    const rows = getQuestions().map((question) => ({
      题型: QUESTION_TYPES[question.type],
      题干: question.content,
      选项A: question.options[0] ?? "",
      选项B: question.options[1] ?? "",
      选项C: question.options[2] ?? "",
      选项D: question.options[3] ?? "",
      答案: answerToText(question.answer),
      解析: question.analysis,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "题库");
    XLSX.writeFile(book, `题库导出_${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  importQuestions(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.XLSX) {
      alert("Excel 组件尚未加载，请检查网络后重试。");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const workbook = XLSX.read(loadEvent.target.result, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
        const imported = [];
        const failures = [];

        rows.forEach((row, index) => {
          const result = parseImportedQuestion(row);
          if (result.question) imported.push(result.question);
          else failures.push(`第 ${index + 2} 行：${result.errors.join("、")}`);
        });

        if (imported.length) {
          saveQuestions([...imported, ...getQuestions()]);
        }

        alert(`成功导入 ${imported.length} 道题${failures.length ? `，失败 ${failures.length} 行\n${failures.slice(0, 5).join("\n")}` : ""}`);
        appState.view = "questions";
        render();
      } catch (error) {
        console.error(error);
        alert("导入失败，请确认 Excel 格式正确。");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  },

  startRandomPractice() {
    const user = getCurrentUser();
    const questions = getQuestions();
    if (!user || !questions.length) return;
    const stats = getPracticeStats(user, questions);
    if (stats.completed) {
      appState.activePracticeQuestionId = null;
      appState.practiceResult = null;
      appState.view = "practice";
      render();
      return;
    }
    const pool = stats.remainingQuestions;
    const question = pool[Math.floor(Math.random() * pool.length)];
    appState.activePracticeQuestionId = question.id;
    appState.practiceResult = null;
    appState.view = "practice";
    render();
  },

  startNewPracticeRound() {
    const user = getCurrentUser();
    if (!user) return;
    resetPracticeProgress(user.id);
    appState.activePracticeQuestionId = null;
    appState.practiceResult = null;
    this.startRandomPractice();
  },

  submitAnswer(event, scope, questionId) {
    event.preventDefault();
    const user = getCurrentUser();
    const question = getQuestionById(questionId);
    if (!user || !question) return;
    const userAnswer = collectAnswer(`${scope}_${questionId}`);
    const outcome = handleAnsweredQuestion(user, question, userAnswer, scope === "wrong" ? "wrong_book" : "practice");
    const remainingWrong = getWrongBook().find((item) => item.userId === user.id && item.questionId === question.id);
    let message = "";
    if (scope === "wrong" && outcome.correct) {
      message = remainingWrong
        ? `错题连续答对 ${remainingWrong.correctStreak}/2 次，再答对 ${2 - remainingWrong.correctStreak} 次会自动删除。`
        : "该错题已连续答对 2 次，已自动从错题本删除。";
    } else if (scope === "practice") {
      if (outcome.correct) {
        markPracticeQuestionCorrect(user.id, question.id);
        const stats = getPracticeStats(user);
        message = stats.completed
          ? "本轮题库已全部答对，可开启新一轮刷题。"
          : `本轮已答对 ${stats.correctCount}/${stats.total} 题，剩余 ${stats.remainingCount} 题不会重复抽取已答对题。`;
      } else {
        message = "本题未答对，不会计入本轮已答对题目，后续仍可能再次抽到。";
      }
    }

    const result = { ...outcome, userAnswer, message };
    if (scope === "wrong") appState.wrongResult = result;
    else appState.practiceResult = result;
    render();
  },

  practiceWrong(questionId) {
    appState.activeWrongQuestionId = questionId;
    appState.wrongResult = null;
    render();
  },

  backToWrongList() {
    appState.activeWrongQuestionId = null;
    appState.wrongResult = null;
    render();
  },

  createQuiz(event) {
    event.preventDefault();
    const count = Number(document.querySelector("#quizCount").value);
    const mode = document.querySelector("#quizMode").value;
    const questions = getQuestions();
    if (!questions.length) return;
    const selected = mode === "random" ? shuffle(questions).slice(0, count) : questions.slice(0, count);
    appState.activeQuiz = {
      id: uid("test"),
      mode,
      questionIds: selected.map((question) => question.id),
      createdAt: nowISO(),
    };
    appState.quizResult = null;
    render();
  },

  cancelQuiz() {
    if (!confirm("确认取消当前测验吗？")) return;
    appState.activeQuiz = null;
    appState.quizResult = null;
    render();
  },

  submitQuiz(event) {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user || !appState.activeQuiz) return;

    const resultItems = appState.activeQuiz.questionIds
      .map(getQuestionById)
      .filter(Boolean)
      .map((question) => {
        const userAnswer = collectAnswer(`quiz_${question.id}_${question.id}`);
        const outcome = handleAnsweredQuestion(user, question, userAnswer, "quiz");
        return {
          question,
          userAnswer,
          correct: outcome.correct,
        };
      });

    const correctCount = resultItems.filter((item) => item.correct).length;
    const wrongCount = resultItems.length - correctCount;
    const score = resultItems.length ? Math.round((correctCount / resultItems.length) * 100) : 0;
    const result = {
      id: appState.activeQuiz.id,
      userId: user.id,
      mode: appState.activeQuiz.mode,
      total: resultItems.length,
      score,
      correctCount,
      wrongCount,
      items: resultItems,
      createdAt: nowISO(),
    };

    saveTests([result, ...getTests()]);
    appState.quizResult = result;
    appState.activeQuiz = null;
    render();
  },

  resetQuiz() {
    appState.activeQuiz = null;
    appState.quizResult = null;
    render();
  },
};

window.ExamApp = ExamApp;
render();
