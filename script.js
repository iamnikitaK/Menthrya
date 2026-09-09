(() => {
  "use strict";

  const API_BASE = "https://menthrya.onrender.com";
  const PREDICT_URL = `${API_BASE}/predict`;

  // Assumed display scale for the gauge only — the API returns a raw float,
  // this just controls how full the dial looks.
  const GAUGE_MIN = 0;
  const GAUGE_MAX = 10;

  const form = document.getElementById("predictForm");
  const submitBtn = document.getElementById("submitBtn");
  const apiErrorEl = document.getElementById("apiError");

  const introState = document.getElementById("introState");
  const loadingState = document.getElementById("loadingState");
  const resultState = document.getElementById("resultState");

  const scoreValueEl = document.getElementById("scoreValue");
  const scoreLabelEl = document.getElementById("scoreLabel");
  const resultTitleEl = document.getElementById("resultTitle");
  const gaugeFill = document.getElementById("gaugeFill");
  const gaugeNeedle = document.getElementById("gaugeNeedle");
  const resetBtn = document.getElementById("resetBtn");

  const GAUGE_CIRCUMFERENCE = 283; // approx length of the semicircle path

  // Fields that are numbers in the Pydantic model
  const NUMERIC_FIELDS = new Set([
    "age",
    "avg_daily_usage_hours",
    "daily_unlocks",
    "study_hours",
    "physical_activity_hours",
    "sleep_hours_per_night",
  ]);

  const INT_FIELDS = new Set(["age", "daily_unlocks"]);

  function showState(name) {
    introState.hidden = name !== "intro";
    loadingState.hidden = name !== "loading";
    resultState.hidden = name !== "result";
  }

  function clearFieldErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("has-error"));
    form.querySelectorAll(".field__err").forEach((el) => (el.textContent = ""));
  }

  function setFieldError(fieldName, message) {
    const errEl = form.querySelector(`.field__err[data-for="${fieldName}"]`);
    if (!errEl) return;
    errEl.textContent = message;
    errEl.closest(".field").classList.add("has-error");
  }

  function showApiError(message) {
    apiErrorEl.textContent = message;
    apiErrorEl.hidden = false;
  }

  function hideApiError() {
    apiErrorEl.hidden = true;
    apiErrorEl.textContent = "";
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("is-loading", isLoading);
  }

  function buildPayload(formData) {
    const payload = {};
    for (const [key, rawValue] of formData.entries()) {
      if (NUMERIC_FIELDS.has(key)) {
        const num = Number(rawValue);
        payload[key] = INT_FIELDS.has(key) ? Math.trunc(num) : num;
      } else {
        payload[key] = rawValue;
      }
    }
    return payload;
  }

  function friendlyMessageFor(msg) {
    // FastAPI/Pydantic messages are technical; soften the common ones.
    if (/greater than or equal/.test(msg)) return "Value is too low.";
    if (/less than or equal/.test(msg)) return "Value is too high.";
    if (/field required/i.test(msg)) return "This field is required.";
    if (/valid number/i.test(msg)) return "Enter a valid number.";
    return msg;
  }

  function applyValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let applied = false;
    detail.forEach((item) => {
      const field = item.loc && item.loc[item.loc.length - 1];
      if (typeof field === "string") {
        setFieldError(field, friendlyMessageFor(item.msg || "Invalid value."));
        applied = true;
      }
    });
    return applied;
  }

  function scoreLabelFor(score) {
    if (score >= 7.5) return "Looks like a healthy balance.";
    if (score >= 5) return "Some room to recover balance.";
    return "Signs of strain in the pattern.";
  }

  function renderResult(score) {
    const clamped = Math.max(GAUGE_MIN, Math.min(GAUGE_MAX, score));
    const pct = (clamped - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN);

    scoreValueEl.textContent = Number.isFinite(score) ? score.toFixed(2) : "–";
    resultTitleEl.textContent = "Here's your reading.";
    scoreLabelEl.textContent = scoreLabelFor(clamped);

    let fillColor = "#7FC4AE"; // teal — steady
    if (clamped < 5) fillColor = "#D98C7B"; // rust tint — strained
    else if (clamped < 7.5) fillColor = "#E0BB86"; // amber — moderate

    requestAnimationFrame(() => {
      gaugeFill.style.stroke = fillColor;
      gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - pct));
      gaugeNeedle.style.transform = `rotate(${-90 + pct * 180}deg)`;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    hideApiError();
    clearFieldErrors();

    if (!form.reportValidity()) return;

    const payload = buildPayload(new FormData(form));

    setLoading(true);
    showState("loading");

    try {
      const response = await fetch(PREDICT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 422) {
        const body = await response.json().catch(() => null);
        const handled = body && applyValidationErrors(body.detail);
        showApiError(
          handled
            ? "Please check the highlighted fields and try again."
            : "The server rejected the request. Please review your answers."
        );
        showState("intro");
        return;
      }

      if (!response.ok) {
        showApiError(`The prediction service returned an error (${response.status}). Please try again.`);
        showState("intro");
        return;
      }

      const data = await response.json();
      const score = Number(data.predicted_mental_health_score);
      renderResult(score);
      showState("result");
    } catch (err) {
      showApiError(
        "Couldn't reach the prediction service. Make sure the API is running at " +
          API_BASE +
          " and try again."
      );
      showState("intro");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    hideApiError();
    clearFieldErrors();
    showState("intro");
  }

  form.addEventListener("submit", handleSubmit);
  resetBtn.addEventListener("click", handleReset);

  // Mark fields as touched once the user leaves them, so native
  // invalid-state styling only kicks in after interaction.
  form.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("blur", () => el.setAttribute("data-touched", "true"));
  });

  showState("intro");
})();
