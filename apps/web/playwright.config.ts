import { defineConfig, devices } from "@playwright/test";

// Happy-path E2E against FIXED data: the API replays recorded upstream payloads (DATA_MODE=fixture).
const API_PORT = 8010;
const WEB_PORT = 3010;
const py = process.env.PYTHON ?? "../../services/api/.venv/bin/python";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `${py} -m uvicorn app.main:app --app-dir ../../services/api --port ${API_PORT}`,
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      env: { DATA_MODE: "fixture", DATABASE_URL: "sqlite:///./.e2e/e2e.db", RATE_LIMIT_PER_MINUTE: "1000" },
      reuseExistingServer: false,
    },
    {
      command: `npx next dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_ORIGIN: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
