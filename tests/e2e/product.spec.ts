import { test, expect } from "@playwright/test";
test("landing page and credential-free demo", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Know what’s down. Before it slows you down.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Take a look inside" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic data · Read-only")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Production API" }).first(),
  ).toBeVisible();
});
test("all dashboard routes render and navigation works", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true, level: 1 }),
  ).toBeVisible();
  for (const [route, title] of [
    ["monitors", "Monitors"],
    ["incidents", "Incidents"],
    ["analytics", "Analytics"],
    ["status-pages", "Status pages"],
    ["notifications", "Notifications"],
    ["team", "Team"],
    ["settings", "Settings"],
  ]) {
    if (isMobile)
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: title, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/demo/${route}$`));
    await expect(
      page.getByRole("heading", { name: title, exact: true, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "couldn’t load" }),
    ).toHaveCount(0);
  }
});
test("monitor search, detail, check history, and read-only form", async ({
  page,
}) => {
  await page.goto("/demo/monitors");
  await page
    .getByRole("textbox", { name: "Search monitors" })
    .fill("Production");
  await expect(
    page.getByRole("link", { name: "Production API" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Web application" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Production API" }).click();
  await expect(
    page.getByRole("heading", { name: "Production API", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check history" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit monitor" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("incident timeline and analytics charts", async ({ page }) => {
  await page.goto("/demo/incidents/demo-payment-outage");
  await expect(
    page.getByRole("heading", { name: "Incident timeline" }),
  ).toBeVisible();
  await expect(page.getByText(/Our team is investigating/)).toBeVisible();
  await page.goto("/demo/analytics");
  await expect(
    page.getByRole("img", { name: /Availability chart/ }),
  ).toBeVisible();
  await page.getByLabel("Analytics time range").selectOption("30d");
  await expect(
    page.getByRole("heading", { name: "Service comparison" }),
  ).toBeVisible();
});
test("public status page and 404", async ({ page }) => {
  await page.goto("/status/acme");
  await expect(
    page.getByRole("heading", { name: "Acme system status" }),
  ).toBeVisible();
  await expect(
    page.getByText("SYNTHETIC DEMONSTRATION · No live service measurements", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Some services are experiencing issues"),
  ).toBeVisible();
  await page.goto("/no-such-route");
  await expect(
    page.getByRole("heading", { name: "This signal leads nowhere." }),
  ).toBeVisible();
});
test("theme persistence and keyboard search", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true, level: 1 }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Jump to a page" }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Monitors, incidents, analytics…")
    .fill("Analytics");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Analytics" })
    .click();
  await expect(page).toHaveURL(/\/demo\/analytics$/);
});
test("responsive layout has no horizontal page overflow", async ({ page }) => {
  for (const path of [
    "/",
    "/demo/overview",
    "/demo/monitors",
    "/demo/analytics",
    "/demo/settings",
    "/status/acme",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
