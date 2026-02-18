const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 15000;

async function request(path, options = {}) {
  const { signal: externalSignal, ...fetchOptions } = options;
  const abortController = new AbortController();
  let timedOut = false;
  let removeExternalAbortHandler = null;

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortController.abort();
    } else {
      const onExternalAbort = () => abortController.abort();
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      removeExternalAbortHandler = () => {
        externalSignal.removeEventListener("abort", onExternalAbort);
      };
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers: {
        ...(fetchOptions.headers || {})
      },
      signal: abortController.signal
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json() : null;

    if (!response.ok) {
      const errorMessage = payload?.error?.message || `Request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      if (timedOut) {
        throw new Error("Request timed out. Retry with the same data.");
      }
      throw new Error("Request cancelled.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (removeExternalAbortHandler) {
      removeExternalAbortHandler();
    }
  }
}

function withAuthHeaders(token, headers = {}) {
  const authHeaders = { ...headers };
  if (token) {
    authHeaders.Authorization = `Bearer ${token}`;
  }
  return authHeaders;
}

export async function requestOtp({ email, intent }) {
  return request("/auth/request-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, intent })
  });
}

export async function verifyOtpWithPassword({ email, intent, otp, password }) {
  return request("/auth/verify-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, intent, otp, password })
  });
}

export async function loginWithPassword({ email, password }) {
  return request("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
}

export async function loginWithGoogle({ idToken }) {
  return request("/auth/google", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ id_token: idToken })
  });
}

export async function fetchExpenses({ token, category, sort, date, month, year, page, pageSize, signal }) {
  const params = new URLSearchParams();
  if (category) {
    params.set("category", category);
  }
  if (sort) {
    params.set("sort", sort);
  }
  if (date) {
    params.set("date", date);
  }
  if (month) {
    params.set("month", String(month));
  }
  if (year) {
    params.set("year", String(year));
  }
  params.set("page", String(page || 1));
  params.set("page_size", String(pageSize || 20));

  return request(`/expenses?${params.toString()}`, {
    method: "GET",
    headers: withAuthHeaders(token),
    signal
  });
}

export async function createExpense(expenseInput, idempotencyKey, token) {
  return request("/expenses", {
    method: "POST",
    headers: withAuthHeaders(token, {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    }),
    body: JSON.stringify(expenseInput)
  });
}

export async function deleteExpense(expenseId, token) {
  return request(`/expenses/${expenseId}`, {
    method: "DELETE",
    headers: withAuthHeaders(token)
  });
}
