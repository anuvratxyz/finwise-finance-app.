const cognitoConfig = {
    region: "ap-south-1",
    userPoolId: "ap-south-1_0sbpuVJDc",
    clientId: "3up877bu8eni0k2hg7s6jlofev",
  };
  
  const apiConfig = {
    baseUrl: "https://1xjqqab56c.execute-api.ap-south-1.amazonaws.com",
  };
  
  const authStorageKey = "finwiseCognitoSession";
  const folderStorageKey = "finwiseTransactionFolders";
  const cognitoEndpoint = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`;
  
  const state = {
    accounts: [],
    transactions: [
      { description: "Internship stipend", amount: 2200, type: "income", category: "Salary", date: "Jun 22", folder: "Income" },
      { description: "Apartment rent", amount: 980, type: "expense", category: "Rent", date: "Jun 20", folder: "Bills" },
      { description: "Metro card", amount: 54, type: "expense", category: "Transport", date: "Jun 19", folder: "Daily Spend" },
      { description: "Groceries", amount: 132, type: "expense", category: "Food", date: "Jun 18", folder: "Daily Spend" },
      { description: "Online course", amount: 49, type: "expense", category: "Education", date: "Jun 17", folder: "Learning" },
    ],
    monthly: [
      { month: "Jan", income: 3200, expenses: 2140 },
      { month: "Feb", income: 3380, expenses: 2290 },
      { month: "Mar", income: 3500, expenses: 2440 },
      { month: "Apr", income: 3600, expenses: 2210 },
      { month: "May", income: 3700, expenses: 2680 },
      { month: "Jun", income: 3900, expenses: 2815 },
    ],
    budgets: [
      { category: "Rent", spent: 980, limit: 1000 },
      { category: "Food", spent: 520, limit: 700 },
      { category: "Transport", spent: 210, limit: 300 },
      { category: "Shopping", spent: 260, limit: 450 },
    ],
    folders: ["General", "Bills", "Daily Spend", "Income", "Learning"],
    selectedFolder: "all",
  };
  
  const colors = ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];
  const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  let transactionsLoadedFromApi = false;
  let activeView = "dashboard";
  
  function loadFolders() {
    try {
      const savedFolders = JSON.parse(localStorage.getItem(folderStorageKey));
      if (Array.isArray(savedFolders) && savedFolders.length) {
        state.folders = savedFolders;
      }
    } catch {
      localStorage.removeItem(folderStorageKey);
    }
  }
  
  function saveFolders() {
    localStorage.setItem(folderStorageKey, JSON.stringify(state.folders));
  }
  
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  
  function decodeJwtPayload(token) {
    const [, payload] = token.split(".");
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="));
    return JSON.parse(json);
  }
  
  function getSession() {
    try {
      const raw = localStorage.getItem(authStorageKey);
      if (!raw) return null;
      const session = JSON.parse(raw);
      const payload = decodeJwtPayload(session.idToken);
      if (!payload.exp || payload.exp * 1000 <= Date.now()) {
        localStorage.removeItem(authStorageKey);
        return null;
      }
      return { ...session, payload };
    } catch {
      localStorage.removeItem(authStorageKey);
      return null;
    }
  }
  
  function saveSession(authenticationResult) {
    localStorage.setItem(
      authStorageKey,
      JSON.stringify({
        accessToken: authenticationResult.AccessToken,
        idToken: authenticationResult.IdToken,
        refreshToken: authenticationResult.RefreshToken,
        expiresIn: authenticationResult.ExpiresIn,
        tokenType: authenticationResult.TokenType,
      }),
    );
  }
  
  async function cognitoRequest(action, payload) {
    const response = await fetch(cognitoEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      const type = data.__type?.split("#").pop() || "CognitoError";
      const message = data.message || "Cognito rejected the request.";
      throw new Error(`${type}: ${message}`);
    }
    return data;
  }
  
  function getAuthHeaders() {
    const session = getSession();
    if (!session?.accessToken) return {};
  
    return {
      Authorization: `Bearer ${session.accessToken}`,
    };
  }
  
  async function apiRequest(path, options = {}) {
    const response = await fetch(`${apiConfig.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
  
    if (!response.ok) {
      throw new Error(data.message || `API request failed with status ${response.status}`);
    }
  
    return data;
  }
  
  function normalizeTransaction(transaction) {
    return {
      id: transaction.itemId || transaction.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}`,
      amount: Number(transaction.amount || 0),
      category: transaction.category || "Other",
      date: transaction.date || transaction.createdAt?.slice(0, 10) || "Today",
      description: transaction.description || "Transaction",
      folder: transaction.folder || "General",
      type: transaction.transactionType || transaction.type || "expense",
    };
  }
  
  function setTransactionStatus(message, isError = false) {
    const target = document.querySelector("#transactionStatus");
    target.textContent = message;
    target.classList.toggle("error-text", isError);
  }
  
  async function loadTransactionsFromApi() {
    setTransactionStatus("Loading transactions from API Gateway...");
  
    try {
      const data = await apiRequest("/transactions");
      state.transactions = (data.transactions || []).map(normalizeTransaction);
      transactionsLoadedFromApi = true;
      setTransactionStatus(`Loaded ${state.transactions.length} transaction(s) from DynamoDB`);
    } catch (error) {
      setTransactionStatus(`Using local mock data. API error: ${error.message}`, true);
    }
  
    renderAll();
  }
  
  async function createTransactionInApi(transaction) {
    const payload = {
      amount: transaction.amount,
      transactionType: transaction.type,
      category: transaction.category,
      description: transaction.description,
      date: transaction.date,
      folder: transaction.folder,
    };
    const data = await apiRequest("/transactions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ...normalizeTransaction(data.transaction), folder: transaction.folder };
  }
  
  function setAuthMessage(message, isError = false) {
    const target = document.querySelector("#authMessage");
    target.textContent = message;
    target.classList.toggle("error", isError);
  }
  
  function showAuthForm(formName) {
    const formIds = {
      signIn: "signInForm",
      signUp: "signUpForm",
      confirm: "confirmForm",
    };
    const tabIds = {
      signIn: "showSignIn",
      signUp: "showSignUp",
      confirm: "showConfirm",
    };
  
    Object.values(formIds).forEach((id) => document.querySelector(`#${id}`).classList.remove("active"));
    Object.values(tabIds).forEach((id) => document.querySelector(`#${id}`).classList.remove("active"));
    document.querySelector(`#${formIds[formName]}`).classList.add("active");
    document.querySelector(`#${tabIds[formName]}`).classList.add("active");
  }
  
  function showDashboard() {
    const session = getSession();
    document.querySelector("#authScreen").classList.toggle("is-hidden", Boolean(session));
    document.querySelector("#appShell").classList.toggle("is-hidden", !session);
  
    if (session) {
      const userName = session.payload.email || session.payload["cognito:username"] || "there";
      setPageTitle(userName);
      renderAll();
      if (!transactionsLoadedFromApi) {
        loadTransactionsFromApi();
      }
    }
  }
  
  function signOut() {
    localStorage.removeItem(authStorageKey);
    showAuthForm("signIn");
    setAuthMessage("Signed out locally. Cognito tokens were removed from this browser.");
    showDashboard();
  }
  
  function totals() {
    const income = state.transactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expenses = state.transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const balance = state.accounts.reduce((sum, account) => sum + account.balance, 0);
    return { income, expenses, balance, savings: income - expenses };
  }
  
  function renderMetrics() {
    const { income, expenses, balance, savings } = totals();
    document.querySelector("#totalBalance").textContent = currency.format(balance);
    document.querySelector("#monthlyIncome").textContent = currency.format(income);
    document.querySelector("#monthlyExpenses").textContent = currency.format(expenses);
    document.querySelector("#netSavings").textContent = currency.format(savings);
  }
  
  function renderTransactions() {
    const list = document.querySelector("#transactionList");
    list.innerHTML = state.transactions
      .slice(0, 6)
      .map((transaction) => {
        const amountClass = transaction.type === "income" ? "amount-income" : "amount-expense";
        const sign = transaction.type === "income" ? "+" : "-";
        return `
          <div class="transaction-row">
            <div class="transaction-name">
              <span class="transaction-icon">${escapeHtml(transaction.category.charAt(0))}</span>
              <div>
                <strong>${escapeHtml(transaction.description)}</strong>
                <span>${escapeHtml(transaction.category)} · ${escapeHtml(transaction.date)}</span>
              </div>
            </div>
            <strong class="${amountClass}">${sign}${currency.format(transaction.amount)}</strong>
          </div>
        `;
      })
      .join("");
  }
  
  function renderBudgets() {
    const list = document.querySelector("#budgetList");
    list.innerHTML = budgetRows()
      .map((budget) => {
        const percent = Math.min(Math.round((budget.spent / budget.limit) * 100), 100);
        return `
          <div class="budget-row">
            <div class="budget-top">
              <div>
                <strong>${escapeHtml(budget.category)}</strong>
                <span>${currency.format(budget.spent)} of ${currency.format(budget.limit)}</span>
              </div>
              <strong>${percent}%</strong>
            </div>
            <div class="progress" aria-label="${escapeHtml(budget.category)} budget ${percent}% used">
              <span style="width: ${percent}%"></span>
            </div>
          </div>
        `;
      })
      .join("");
  }
  
  function drawCashflowChart() {
    const canvas = document.querySelector("#cashflowChart");
    const context = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 260 * dpr;
    context.scale(dpr, dpr);
    context.clearRect(0, 0, rect.width, 260);
  
    const padding = 34;
    const chartHeight = 180;
    const maxValue = Math.max(...state.monthly.flatMap((item) => [item.income, item.expenses]));
    const groupWidth = (rect.width - padding * 2) / state.monthly.length;
  
    context.strokeStyle = "#dde3ee";
    context.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = padding + (chartHeight / 4) * i;
      context.beginPath();
      context.moveTo(padding, y);
      context.lineTo(rect.width - padding, y);
      context.stroke();
    }
  
    state.monthly.forEach((item, index) => {
      const x = padding + index * groupWidth + groupWidth * 0.24;
      const incomeHeight = (item.income / maxValue) * chartHeight;
      const expenseHeight = (item.expenses / maxValue) * chartHeight;
      const baseline = padding + chartHeight;
  
      context.fillStyle = "#0f766e";
      context.fillRect(x, baseline - incomeHeight, groupWidth * 0.2, incomeHeight);
      context.fillStyle = "#d97706";
      context.fillRect(x + groupWidth * 0.26, baseline - expenseHeight, groupWidth * 0.2, expenseHeight);
  
      context.fillStyle = "#6b7280";
      context.font = "12px Inter, sans-serif";
      context.textAlign = "center";
      context.fillText(item.month, x + groupWidth * 0.23, baseline + 24);
    });
  
    context.fillStyle = "#0f766e";
    context.fillRect(padding, 236, 12, 12);
    context.fillStyle = "#152033";
    context.fillText("Income", padding + 50, 246);
    context.fillStyle = "#d97706";
    context.fillRect(padding + 112, 236, 12, 12);
    context.fillStyle = "#152033";
    context.fillText("Expenses", padding + 168, 246);
  }
  
  function categoryTotals() {
    return state.transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((acc, transaction) => {
        acc[transaction.category] = (acc[transaction.category] || 0) + transaction.amount;
        return acc;
      }, {});
  }
  
  function budgetRows() {
    const spending = categoryTotals();
    return state.budgets.map((budget) => ({
      ...budget,
      spent: spending[budget.category] ?? budget.spent,
    }));
  }
  
  function renderAccounts() {
    const list = document.querySelector("#accountList");
    const totalAccountBalance = state.accounts.reduce((sum, account) => sum + account.balance, 0);
  
    if (!state.accounts.length) {
      list.innerHTML = `
        <article class="account-card account-total">
          <div>
            <span>No account connected</span>
            <h3>Balance unavailable</h3>
            <p>FinWise keeps balance at zero until the user grants bank or UPI access.</p>
          </div>
          <strong>${currency.format(0)}</strong>
        </article>
      `;
      return;
    }
  
    list.innerHTML = state.accounts
      .map((account) => {
        const balanceClass = account.balance >= 0 ? "amount-income" : "amount-expense";
        return `
          <article class="account-card">
            <div>
              <span>${escapeHtml(account.type)}</span>
              <h3>${escapeHtml(account.name)}</h3>
              <p>${escapeHtml(account.number)}</p>
            </div>
            <div>
              <strong class="${balanceClass}">${currency.format(account.balance)}</strong>
              <small>${escapeHtml(account.status)}</small>
            </div>
          </article>
        `;
      })
      .join("");
  
    list.insertAdjacentHTML(
      "afterbegin",
      `<article class="account-card account-total"><span>Total across accounts</span><strong>${currency.format(totalAccountBalance)}</strong></article>`,
    );
  }
  
  function renderFullTransactions() {
    const list = document.querySelector("#fullTransactionList");
    const transactions = state.selectedFolder === "all"
      ? state.transactions
      : state.transactions.filter((transaction) => transaction.folder === state.selectedFolder);
  
    if (!transactions.length) {
      list.innerHTML = `<div class="empty-panel compact"><p>No transactions yet. Add one to see it here.</p></div>`;
      return;
    }
  
    list.innerHTML = transactions
      .map((transaction) => {
        const amountClass = transaction.type === "income" ? "amount-income" : "amount-expense";
        const sign = transaction.type === "income" ? "+" : "-";
        return `
          <div class="transaction-table-row">
            <div>
              <strong>${escapeHtml(transaction.description)}</strong>
              <span>${escapeHtml(transaction.date)}</span>
            </div>
            <span>${escapeHtml(transaction.category)}</span>
            <span>${escapeHtml(transaction.folder || "General")}</span>
            <span>${escapeHtml(transaction.type)}</span>
            <strong class="${amountClass}">${sign}${currency.format(transaction.amount)}</strong>
          </div>
        `;
      })
      .join("");
  }
  
  function renderFolderControls() {
    const options = [
      `<option value="all">All folders</option>`,
      ...state.folders.map((folder) => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`),
    ].join("");
  
    document.querySelector("#folderFilter").innerHTML = options;
    document.querySelector("#folderFilter").value = state.selectedFolder;
    document.querySelector("#folderInput").innerHTML = state.folders
      .map((folder) => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`)
      .join("");
  }
  
  function folderTotals(folderName) {
    const transactions = state.transactions.filter((transaction) => transaction.folder === folderName);
    const income = transactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expenses = transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return { count: transactions.length, income, expenses, net: income - expenses };
  }
  
  function renderFolders() {
    const list = document.querySelector("#folderList");
    list.innerHTML = state.folders
      .map((folder) => {
        const totalsForFolder = folderTotals(folder);
        return `
          <article class="folder-card">
            <div>
              <span>Folder</span>
              <h3>${escapeHtml(folder)}</h3>
              <p>${totalsForFolder.count} transaction(s)</p>
            </div>
            <strong>${currency.format(totalsForFolder.net)}</strong>
            <button class="text-btn" data-folder-jump="${escapeHtml(folder)}">View transactions</button>
          </article>
        `;
      })
      .join("");
  
    document.querySelectorAll("[data-folder-jump]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedFolder = button.dataset.folderJump;
        renderAll();
        switchView("transactions");
      });
    });
  }
  
  function renderBudgetOverview() {
    const rows = budgetRows();
    const totalLimit = rows.reduce((sum, budget) => sum + budget.limit, 0);
    const totalSpent = rows.reduce((sum, budget) => sum + budget.spent, 0);
    const remaining = totalLimit - totalSpent;
  
    document.querySelector("#budgetSummary").textContent = `${currency.format(remaining)} left`;
    document.querySelector("#budgetSummary").classList.toggle("amount-expense", remaining < 0);
    document.querySelector("#budgetSummary").classList.toggle("amount-income", remaining >= 0);
  
    document.querySelector("#budgetOverview").innerHTML = rows
      .map((budget) => {
        const percent = Math.min(Math.round((budget.spent / budget.limit) * 100), 100);
        const remainingForCategory = budget.limit - budget.spent;
        return `
          <div class="budget-overview-row">
            <div class="budget-top">
              <div>
                <strong>${escapeHtml(budget.category)}</strong>
                <span>${currency.format(budget.spent)} spent · ${currency.format(remainingForCategory)} left</span>
              </div>
              <strong>${percent}%</strong>
            </div>
            <div class="progress" aria-label="${escapeHtml(budget.category)} budget ${percent}% used">
              <span style="width: ${percent}%"></span>
            </div>
          </div>
        `;
      })
      .join("");
  }
  
  function topSpendingCategory() {
    const entries = Object.entries(categoryTotals()).sort(([, firstAmount], [, secondAmount]) => secondAmount - firstAmount);
    return entries[0] || ["-", 0];
  }
  
  function renderReports() {
    const { income, expenses, savings } = totals();
    const [topCategory, topAmount] = topSpendingCategory();
    const rows = budgetRows();
    const totalLimit = rows.reduce((sum, budget) => sum + budget.limit, 0);
    const totalSpent = rows.reduce((sum, budget) => sum + budget.spent, 0);
    const budgetPercent = totalLimit ? Math.round((totalSpent / totalLimit) * 100) : 0;
  
    document.querySelector("#reportCashFlow").textContent = currency.format(savings);
    document.querySelector("#reportCashFlow").classList.toggle("amount-income", savings >= 0);
    document.querySelector("#reportCashFlow").classList.toggle("amount-expense", savings < 0);
    document.querySelector("#reportTopCategory").textContent = topCategory;
    document.querySelector("#reportTopCategoryAmount").textContent = currency.format(topAmount);
    document.querySelector("#reportBudgetHealth").textContent = `${budgetPercent}%`;
    document.querySelector("#reportBudgetHealth").classList.toggle("amount-expense", budgetPercent > 100);
    document.querySelector("#reportBudgetHealth").classList.toggle("amount-income", budgetPercent <= 100);
    document.querySelector("#reportTransactionCount").textContent = state.transactions.length;
  
    document.querySelector("#reportList").innerHTML = rows
      .map((budget) => {
        const categorySpend = categoryTotals()[budget.category] || 0;
        const share = expenses ? Math.round((categorySpend / expenses) * 100) : 0;
        return `
          <div class="report-row">
            <div>
              <strong>${escapeHtml(budget.category)}</strong>
              <span>${share}% of total expenses</span>
            </div>
            <strong>${currency.format(categorySpend)}</strong>
          </div>
        `;
      })
      .join("");
  }
  
  function renderSettings() {
    const session = getSession();
    const email = session?.payload.email || "Signed-in Cognito user";
    const username = session?.payload["cognito:username"] || session?.payload.sub || "Available after sign in";
  
    document.querySelector("#profileSettings").innerHTML = `
      <div class="settings-row">
        <span>Email</span>
        <strong>${escapeHtml(email)}</strong>
      </div>
      <div class="settings-row">
        <span>User ID</span>
        <strong>${escapeHtml(username)}</strong>
      </div>
      <div class="settings-row">
        <span>Currency</span>
        <strong>INR (₹)</strong>
      </div>
    `;
  
    document.querySelector("#appSettings").innerHTML = `
      <div class="settings-row">
        <span>Currency</span>
        <strong>INR (₹)</strong>
      </div>
      <div class="settings-row">
        <span>Balance</span>
        <strong>Hidden until bank or UPI access is connected</strong>
      </div>
      <div class="settings-row">
        <span>Folders</span>
        <strong>${state.folders.length}</strong>
      </div>
    `;
  }
  
  function drawCategoryChart() {
    const canvas = document.querySelector("#categoryChart");
    const context = canvas.getContext("2d");
    const entries = Object.entries(categoryTotals());
    const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
    const center = canvas.width / 2;
    let start = -Math.PI / 2;
  
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!total) {
      context.beginPath();
      context.arc(center, center, 92, 0, Math.PI * 2);
      context.fillStyle = "#e9eef5";
      context.fill();
      context.beginPath();
      context.arc(center, center, 54, 0, Math.PI * 2);
      context.fillStyle = "#ffffff";
      context.fill();
      context.fillStyle = "#6b7280";
      context.font = "700 18px Inter, sans-serif";
      context.textAlign = "center";
      context.fillText("No spend", center, center + 6);
      document.querySelector("#categoryLegend").innerHTML = `<li>No expense transactions yet</li>`;
      return;
    }
  
    entries.forEach(([, amount], index) => {
      const slice = (amount / total) * Math.PI * 2;
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, 92, start, start + slice);
      context.closePath();
      context.fillStyle = colors[index % colors.length];
      context.fill();
      start += slice;
    });
  
    context.beginPath();
    context.arc(center, center, 54, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    context.fillStyle = "#152033";
    context.font = "700 20px Inter, sans-serif";
    context.textAlign = "center";
    context.fillText(currency.format(total), center, center + 7);
  
    document.querySelector("#categoryLegend").innerHTML = entries
      .map(([category, amount], index) => {
        return `<li><span><i class="swatch" style="background:${colors[index % colors.length]}"></i>${category}</span><strong>${currency.format(amount)}</strong></li>`;
      })
      .join("");
  }
  
  function renderAll() {
    renderMetrics();
    renderTransactions();
    renderBudgets();
    renderFolderControls();
    renderAccounts();
    renderFullTransactions();
    renderFolders();
    renderBudgetOverview();
    renderReports();
    renderSettings();
    drawCashflowChart();
    drawCategoryChart();
  }
  
  function openTransactionDialog() {
    renderFolderControls();
    document.querySelector("#transactionDialog").showModal();
  }
  
  function openFolderDialog() {
    document.querySelector("#folderDialog").showModal();
  }
  
  function greetingForNow() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    if (hour < 21) return "Good evening";
    return "Good night";
  }
  
  function setPageTitle(userName) {
    const titles = {
      dashboard: `${greetingForNow()}, ${userName}`,
      accounts: "Accounts",
      transactions: "Transactions",
      folders: "Folders",
      budgets: "Monthly Budget",
      reports: "Reports",
      settings: "Settings",
    };
    document.querySelector("#pageTitle").textContent = titles[activeView] || titles.dashboard;
  }
  
  function switchView(viewName) {
    const session = getSession();
    const userName = session?.payload.email || session?.payload["cognito:username"] || "there";
    activeView = viewName;
  
    document.querySelectorAll(".view-section").forEach((section) => section.classList.remove("active"));
    document.querySelector(`#${viewName}View`)?.classList.add("active");
    document.querySelectorAll(".nav-list a").forEach((link) => {
      link.classList.toggle("active", link.dataset.view === viewName);
    });
  
    setPageTitle(userName);
    if (viewName === "dashboard") {
      drawCashflowChart();
      drawCategoryChart();
    }
  }
  
  document.querySelector("#addTransactionBtn").addEventListener("click", openTransactionDialog);
  document.querySelectorAll("[data-open-transaction]").forEach((button) => {
    button.addEventListener("click", openTransactionDialog);
  });
  document.querySelectorAll("[data-open-folder]").forEach((button) => {
    button.addEventListener("click", openFolderDialog);
  });
  document.querySelector("#folderFilter").addEventListener("change", (event) => {
    state.selectedFolder = event.target.value;
    renderFullTransactions();
  });
  document.querySelectorAll("[data-view], [data-view-button]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      switchView(event.currentTarget.dataset.view || event.currentTarget.dataset.viewButton);
    });
  });
  
  document.querySelector("#showSignIn").addEventListener("click", () => showAuthForm("signIn"));
  document.querySelector("#showSignUp").addEventListener("click", () => showAuthForm("signUp"));
  document.querySelector("#showConfirm").addEventListener("click", () => showAuthForm("confirm"));
  document.querySelector("#signOutBtn").addEventListener("click", signOut);
  
  document.querySelector("#signUpForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Creating your Cognito user...");
    const email = document.querySelector("#signUpEmail").value.trim();
    const password = document.querySelector("#signUpPassword").value;
  
    try {
      await cognitoRequest("SignUp", {
        ClientId: cognitoConfig.clientId,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: "email", Value: email }],
      });
      document.querySelector("#confirmEmail").value = email;
      showAuthForm("confirm");
      setAuthMessage("Account created. Check your email for the confirmation code.");
    } catch (error) {
      setAuthMessage(error.message, true);
    }
  });
  
  document.querySelector("#confirmForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Confirming your email...");
    const email = document.querySelector("#confirmEmail").value.trim();
    const code = document.querySelector("#confirmCode").value.trim();
  
    try {
      await cognitoRequest("ConfirmSignUp", {
        ClientId: cognitoConfig.clientId,
        Username: email,
        ConfirmationCode: code,
      });
      document.querySelector("#signInEmail").value = email;
      showAuthForm("signIn");
      setAuthMessage("Email confirmed. You can sign in now.");
    } catch (error) {
      setAuthMessage(error.message, true);
    }
  });
  
  document.querySelector("#signInForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Signing in with Cognito...");
    const email = document.querySelector("#signInEmail").value.trim();
    const password = document.querySelector("#signInPassword").value;
  
    try {
      const data = await cognitoRequest("InitiateAuth", {
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: cognitoConfig.clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });
      saveSession(data.AuthenticationResult);
      setAuthMessage("");
      showDashboard();
    } catch (error) {
      if (error.message.includes("UserNotConfirmedException")) {
        document.querySelector("#confirmEmail").value = email;
        showAuthForm("confirm");
      }
      setAuthMessage(error.message, true);
    }
  });
  
  document.querySelector("#transactionDialog").addEventListener("close", async (event) => {
    if (event.target.returnValue !== "default") return;
  
    const description = document.querySelector("#descriptionInput").value.trim();
    const amount = Number(document.querySelector("#amountInput").value);
    const type = document.querySelector("#typeInput").value;
    const category = document.querySelector("#categoryInput").value;
    const folder = document.querySelector("#folderInput").value || "General";
  
    if (!description || !amount) return;
  
    const transaction = {
      description,
      amount,
      type,
      category,
      folder,
      date: "Today",
    };
  
    event.target.querySelector("form").reset();
    setTransactionStatus("Saving transaction through API Gateway...");
  
    try {
      const savedTransaction = await createTransactionInApi(transaction);
      state.transactions.unshift(savedTransaction);
      setTransactionStatus("Transaction saved to DynamoDB");
    } catch (error) {
      state.transactions.unshift(transaction);
      setTransactionStatus(`Saved locally only. API error: ${error.message}`, true);
    }
  
    renderAll();
  });
  
  document.querySelector("#folderDialog").addEventListener("close", (event) => {
    if (event.target.returnValue !== "default") return;
  
    const folderName = document.querySelector("#folderNameInput").value.trim();
    if (!folderName) return;
  
    if (!state.folders.some((folder) => folder.toLowerCase() === folderName.toLowerCase())) {
      state.folders.push(folderName);
      saveFolders();
    }
  
    state.selectedFolder = folderName;
    event.target.querySelector("form").reset();
    renderAll();
    switchView("folders");
  });
  
  window.addEventListener("resize", drawCashflowChart);
  loadFolders();
  showDashboard();