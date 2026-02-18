import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createExpense,
  deleteExpense,
  fetchExpenses,
  loginWithGoogle,
  loginWithPassword,
  requestOtp,
  verifyOtpWithPassword
} from "./api";

const EMPTY_FORM = {
  amount: "",
  category: "",
  description: "",
  date: ""
};

const AUTH_STORAGE_KEY = "expense-tracker.auth";
const PENDING_SUBMISSION_KEY_PREFIX = "expense-tracker.pending-submission";
const GOOGLE_SCRIPT_ID = "google-gsi-script";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function isValidAmount(value) {
  return /^\d+(\.\d{1,2})?$/.test(value);
}

function readStoredAuth() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.token && parsed?.user?.id) {
      return parsed;
    }
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  return null;
}

function App() {
  const [authMode, setAuthMode] = useState("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authOtp, setAuthOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [googleLoaded, setGoogleLoaded] = useState(false);

  const [session, setSession] = useState(() => readStoredAuth());

  const token = session?.token || "";
  const user = session?.user || null;

  const [form, setForm] = useState(EMPTY_FORM);
  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState("0.00");
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 20,
    total_items: 0,
    total_pages: 1
  });

  const [categoryInput, setCategoryInput] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [sortOption, setSortOption] = useState("newest");
  const [dateFilter, setDateFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [listError, setListError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const submitLockRef = useRef(false);
  const searchAbortRef = useRef(null);
  const latestRequestRef = useRef(0);
  const [pendingSubmission, setPendingSubmission] = useState(null);

  const pendingStorageKey = useMemo(() => {
    if (!user?.id) {
      return null;
    }
    return `${PENDING_SUBMISSION_KEY_PREFIX}.${user.id}`;
  }, [user?.id]);

  const persistSession = useCallback((nextSession) => {
    if (nextSession) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    setSession(nextSession);
  }, []);

  const logout = useCallback(() => {
    persistSession(null);
    setExpenses([]);
    setTotal("0.00");
    setAuthOtp("");
    setOtpRequested(false);
    setPendingSubmission(null);
    setStatusMessage("Signed out.");
  }, [persistSession]);

  const clearPendingSubmission = useCallback(() => {
    if (pendingStorageKey) {
      localStorage.removeItem(pendingStorageKey);
    }
    setPendingSubmission(null);
  }, [pendingStorageKey]);

  const loadExpenses = useCallback(async () => {
    if (!token) {
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }

    const abortController = new AbortController();
    searchAbortRef.current = abortController;
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    setListError("");
    setIsLoadingExpenses(true);

    try {
      const response = await fetchExpenses({
        token,
        category: filterCategory || undefined,
        sort: sortOption,
        date: dateFilter || undefined,
        month: dateFilter ? undefined : monthFilter || undefined,
        year: dateFilter ? undefined : yearFilter || undefined,
        page,
        pageSize,
        signal: abortController.signal
      });

      if (requestId !== latestRequestRef.current) {
        return;
      }

      setExpenses(response.data || []);
      setTotal(response.total || "0.00");
      setPagination(
        response.pagination || {
          page,
          page_size: pageSize,
          total_items: 0,
          total_pages: 1
        }
      );
    } catch (error) {
      if (error.message === "Request cancelled.") {
        return;
      }

      setListError(error.message);
      if (error.message.toLowerCase().includes("token")) {
        logout();
      }
    } finally {
      if (requestId === latestRequestRef.current) {
        setIsLoadingExpenses(false);
      }
    }
  }, [
    token,
    filterCategory,
    sortOption,
    dateFilter,
    monthFilter,
    yearFilter,
    page,
    pageSize,
    logout
  ]);

  const finalizeAuth = useCallback(
    (response) => {
      persistSession({
        token: response.access_token,
        user: response.user
      });
      setAuthStatus("Authenticated.");
      setStatusMessage(`Signed in as ${response.user.email}`);
      setOtpRequested(false);
      setAuthOtp("");
      setAuthPassword("");
    },
    [persistSession]
  );

  const handleGoogleCredential = useCallback(
    async (googleResponse) => {
      const idToken = googleResponse?.credential;
      if (!idToken) {
        setAuthError("Google login failed to provide token.");
        return;
      }

      try {
        setAuthLoading(true);
        setAuthError("");
        const response = await loginWithGoogle({ idToken });
        finalizeAuth(response);
      } catch (error) {
        setAuthError(error.message);
      } finally {
        setAuthLoading(false);
      }
    },
    [finalizeAuth]
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || token) {
      return;
    }

    if (window.google?.accounts?.id) {
      setGoogleLoaded(true);
      return;
    }

    const existing = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => setGoogleLoaded(true), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleLoaded(true);
    document.body.appendChild(script);
  }, [token]);

  useEffect(() => {
    if (!googleLoaded || !GOOGLE_CLIENT_ID || token || !window.google?.accounts?.id) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential
    });

    const element = document.getElementById("google-signin-button");
    if (element) {
      element.innerHTML = "";
      window.google.accounts.id.renderButton(element, {
        theme: "outline",
        size: "large",
        width: 280,
        text: "continue_with"
      });
    }
  }, [googleLoaded, token, handleGoogleCredential]);

  useEffect(() => {
    if (!pendingStorageKey) {
      setPendingSubmission(null);
      return;
    }

    const raw = localStorage.getItem(pendingStorageKey);
    if (!raw) {
      setPendingSubmission(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.idempotencyKey && parsed?.payload) {
        setPendingSubmission(parsed);
        setForm(parsed.payload);
        setStatusMessage("Recovered pending submission for retry safety.");
      }
    } catch (error) {
      localStorage.removeItem(pendingStorageKey);
      setPendingSubmission(null);
    }
  }, [pendingStorageKey]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilterCategory(categoryInput.trim());
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [categoryInput]);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadExpenses();
  }, [token, loadExpenses]);

  function resetAuthUi(nextMode) {
    setAuthMode(nextMode);
    setAuthError("");
    setAuthStatus("");
    setAuthOtp("");
    setAuthPassword("");
    setOtpRequested(false);
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value
    }));

    if (pendingSubmission && !isSubmitting) {
      clearPendingSubmission();
      setStatusMessage("Form changed. Next submission uses a new idempotency key.");
    }
  }

  async function handleRequestOtp(event) {
    event.preventDefault();
    if (authLoading) {
      return;
    }

    setAuthError("");
    setAuthStatus("");

    const email = authEmail.trim().toLowerCase();
    if (!email) {
      setAuthError("Email is required.");
      return;
    }

    const intent = authMode === "forgot" ? "forgot_password" : "signup";

    setAuthLoading(true);
    try {
      await requestOtp({
        email,
        intent
      });

      setOtpRequested(true);
      setAuthStatus("OTP sent. Check your email.");
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    if (authLoading) {
      return;
    }

    setAuthError("");

    const email = authEmail.trim().toLowerCase();
    const otp = authOtp.trim();
    const password = authPassword.trim();
    if (!email || !otp || !password) {
      setAuthError("Email, OTP and password are required.");
      return;
    }

    const intent = authMode === "forgot" ? "forgot_password" : "signup";

    setAuthLoading(true);
    try {
      const response = await verifyOtpWithPassword({
        email,
        intent,
        otp,
        password
      });

      finalizeAuth(response);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handlePasswordLogin(event) {
    event.preventDefault();
    if (authLoading) {
      return;
    }

    setAuthError("");
    const email = authEmail.trim().toLowerCase();
    const password = authPassword.trim();
    if (!email || !password) {
      setAuthError("Email and password are required.");
      return;
    }

    setAuthLoading(true);
    try {
      const response = await loginWithPassword({ email, password });
      finalizeAuth(response);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSubmitExpense(event) {
    event.preventDefault();

    if (!token) {
      setSubmitError("Sign in first.");
      return;
    }

    if (submitLockRef.current || isSubmitting) {
      return;
    }

    setSubmitError("");
    const amount = form.amount.trim();
    const category = form.category.trim();
    const description = form.description.trim();
    const date = form.date;

    if (!amount || !isValidAmount(amount)) {
      setSubmitError("Amount must be a non-negative number with up to 2 decimals.");
      return;
    }

    if (!category) {
      setSubmitError("Category is required.");
      return;
    }

    if (!date) {
      setSubmitError("Date is required.");
      return;
    }

    const payload = {
      amount,
      category,
      description,
      date
    };

    const idempotencyKey = pendingSubmission?.idempotencyKey || crypto.randomUUID();
    const pending = {
      idempotencyKey,
      payload
    };

    submitLockRef.current = true;
    if (pendingStorageKey) {
      localStorage.setItem(pendingStorageKey, JSON.stringify(pending));
    }
    setPendingSubmission(pending);
    setIsSubmitting(true);
    setStatusMessage("Submitting expense...");

    try {
      const response = await createExpense(payload, idempotencyKey, token);
      setStatusMessage(
        response.replayed
          ? "Duplicate request detected. Server returned original expense."
          : "Expense saved."
      );
      setForm(EMPTY_FORM);
      clearPendingSubmission();
      await loadExpenses();
    } catch (error) {
      setSubmitError(error.message);
      if (error.message.toLowerCase().includes("token")) {
        logout();
      } else {
        setStatusMessage("Submission failed. Retry uses same idempotency key.");
      }
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleDeleteExpense(expense) {
    if (!token || deletingExpenseId) {
      return;
    }

    const confirmed = window.confirm(
      `Confirm permanent deletion of this expense (${expense.category} - $${expense.amount})?`
    );
    if (!confirmed) {
      return;
    }

    setListError("");
    setDeletingExpenseId(expense.id);

    try {
      await deleteExpense(expense.id, token);
      setStatusMessage("Expense deleted permanently.");
      await loadExpenses();
    } catch (error) {
      setListError(error.message);
    } finally {
      setDeletingExpenseId("");
    }
  }

  return (
    <div className="page-shell">
      <main className="layout">
        <section className="panel panel-intro">
          <p className="eyebrow">Resilient Ledger</p>
          <h1>Expense Tracker</h1>
          <p className="lead">
            Email OTP signup + password login + Google OAuth, with idempotent writes and paginated expense queries.
          </p>
          <div className="status-row">
            <span className={`status-dot ${isSubmitting || isLoadingExpenses || authLoading ? "active" : ""}`} />
            <span>
              {authLoading
                ? "Authenticating..."
                : isSubmitting
                ? "Submitting..."
                : isLoadingExpenses
                ? "Loading..."
                : "Idle"}
            </span>
          </div>
          {statusMessage ? <p className="message info">{statusMessage}</p> : null}
          {user ? (
            <p className="message info">
              Signed in: <strong>{user.email}</strong>
            </p>
          ) : null}
        </section>

        {!token ? (
          <section className="panel auth-panel">
            <h2>Authentication</h2>
            {authError ? <p className="message error">{authError}</p> : null}
            {authStatus ? <p className="message info">{authStatus}</p> : null}

            <div className="intent-toggle">
              <button
                type="button"
                className={authMode === "signup" ? "active" : ""}
                onClick={() => resetAuthUi("signup")}
                disabled={authLoading}
              >
                Signup OTP
              </button>
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => resetAuthUi("login")}
                disabled={authLoading}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === "forgot" ? "active" : ""}
                onClick={() => resetAuthUi("forgot")}
                disabled={authLoading}
              >
                Forgot Password
              </button>
            </div>

            <label>
              Email
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={authLoading}
              />
            </label>

            {authMode === "login" ? (
              <form onSubmit={handlePasswordLogin} className="form-grid auth-form">
                <label>
                  Password
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Enter password"
                    disabled={authLoading}
                  />
                </label>
                <button type="submit" className="auth-submit" disabled={authLoading}>
                  {authLoading ? "Signing in..." : "Sign In"}
                </button>
              </form>
            ) : (
              <>
                <form onSubmit={handleRequestOtp} className="form-grid auth-form">
                  <button type="submit" className="auth-submit" disabled={authLoading}>
                    {authLoading ? "Sending..." : "Request OTP"}
                  </button>
                </form>

                {otpRequested ? (
                  <form onSubmit={handleVerifyOtp} className="form-grid auth-form">
                    <label>
                      OTP
                      <input
                        value={authOtp}
                        onChange={(event) => setAuthOtp(event.target.value)}
                        placeholder="6-digit code"
                        maxLength={6}
                        disabled={authLoading}
                      />
                    </label>

                    <label>
                      {authMode === "forgot" ? "New password" : "Password"}
                      <input
                        type="password"
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        placeholder="At least 8 characters"
                        disabled={authLoading}
                      />
                    </label>

                    <button type="submit" className="auth-submit" disabled={authLoading}>
                      {authLoading ? "Verifying..." : "Verify OTP"}
                    </button>
                  </form>
                ) : null}
              </>
            )}

            {GOOGLE_CLIENT_ID ? (
              <div className="google-signin-wrap">
                <div id="google-signin-button" />
              </div>
            ) : (
              <p className="message info">Set `VITE_GOOGLE_CLIENT_ID` to enable Google login.</p>
            )}
          </section>
        ) : null}

        {token ? (
          <>
            <section className="panel">
              <div className="list-header">
                <h2>Add Expense</h2>
                <button type="button" onClick={logout}>
                  Sign Out
                </button>
              </div>
              {pendingSubmission ? (
                <p className="message info">
                  Pending idempotency key: <code>{pendingSubmission.idempotencyKey.slice(0, 12)}...</code>
                </p>
              ) : null}
              {submitError ? <p className="message error">{submitError}</p> : null}

              <form onSubmit={handleSubmitExpense} className="form-grid">
                <label>
                  Amount
                  <input
                    name="amount"
                    value={form.amount}
                    onChange={handleFieldChange}
                    placeholder="12.50"
                    inputMode="decimal"
                    disabled={isSubmitting}
                  />
                </label>

                <label>
                  Category
                  <input
                    name="category"
                    value={form.category}
                    onChange={handleFieldChange}
                    placeholder="Food"
                    disabled={isSubmitting}
                  />
                </label>

                <label>
                  Date
                  <input
                    name="date"
                    type="date"
                    value={form.date}
                    onChange={handleFieldChange}
                    disabled={isSubmitting}
                  />
                </label>

                <label className="full-width">
                  Description
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleFieldChange}
                    placeholder="Optional"
                    rows={3}
                    disabled={isSubmitting}
                  />
                </label>

                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Create Expense"}
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="list-header">
                <h2>My Expenses</h2>
                <button type="button" onClick={loadExpenses} disabled={isLoadingExpenses}>
                  Refresh
                </button>
              </div>

              <div className="filters">
                <label>
                  Category
                  <input
                    value={categoryInput}
                    onChange={(event) => {
                      setCategoryInput(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search category (not case-sensitive)"
                  />
                </label>

                <label>
                  Sort
                  <select
                    value={sortOption}
                    onChange={(event) => {
                      setSortOption(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </label>

                <label>
                  Exact date
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(event) => {
                      setDateFilter(event.target.value);
                      setPage(1);
                    }}
                  />
                </label>

                <label>
                  Month
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={monthFilter}
                    onChange={(event) => {
                      setMonthFilter(event.target.value);
                      setPage(1);
                    }}
                    placeholder="1-12"
                    disabled={Boolean(dateFilter)}
                  />
                </label>

                <label>
                  Year
                  <input
                    type="number"
                    min="1970"
                    max="9999"
                    value={yearFilter}
                    onChange={(event) => {
                      setYearFilter(event.target.value);
                      setPage(1);
                    }}
                    placeholder="2026"
                    disabled={Boolean(dateFilter)}
                  />
                </label>

                <label>
                  Page size
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </label>
              </div>

              {listError ? <p className="message error">{listError}</p> : null}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th className="amount-cell">Amount</th>
                      <th className="action-cell">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty">
                          {isLoadingExpenses ? "Loading expenses..." : "No expenses found."}
                        </td>
                      </tr>
                    ) : (
                      expenses.map((expense) => (
                        <tr key={expense.id}>
                          <td>{expense.date}</td>
                          <td>{expense.category}</td>
                          <td>{expense.description || "-"}</td>
                          <td className="amount-cell">${expense.amount}</td>
                          <td className="action-cell">
                            <button
                              type="button"
                              className="danger-button"
                              onClick={() => handleDeleteExpense(expense)}
                              disabled={Boolean(deletingExpenseId)}
                            >
                              {deletingExpenseId === expense.id ? "Deleting..." : "Delete"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pagination-row">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || isLoadingExpenses}
                >
                  Previous
                </button>
                <span>
                  Page {pagination.page} of {pagination.total_pages} ({pagination.total_items} items)
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pagination.total_pages, current + 1))}
                  disabled={page >= pagination.total_pages || isLoadingExpenses}
                >
                  Next
                </button>
              </div>

              <p className="total">
                Total (filtered): <strong>${total}</strong>
              </p>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

export default App;
