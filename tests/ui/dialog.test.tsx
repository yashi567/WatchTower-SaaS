// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "../../src/components/ui/dialog";
import { ThemeProvider, useTheme } from "../../src/lib/context";
import "@testing-library/jest-dom/vitest";
afterEach(cleanup);
describe("accessible controls", () => {
  it("labels its modal and closes on Escape", async () => {
    const change = vi.fn();
    render(
      <Dialog
        open
        onOpenChange={change}
        title="Monitor configuration"
        description="Edit your endpoint"
      >
        <input aria-label="Endpoint" />
      </Dialog>,
    );
    expect(
      screen.getByRole("dialog", { name: "Monitor configuration" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(change).toHaveBeenCalledWith(false);
  });
  it("persists theme changes", async () => {
    localStorage.clear();
    function Toggle() {
      const { theme, toggle } = useTheme();
      return <button onClick={toggle}>{theme}</button>;
    }
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "dark" }));
    expect(localStorage.getItem("watchtower-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
