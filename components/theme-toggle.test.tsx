// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { setThemeMock, useThemeMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  useThemeMock: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => useThemeMock(),
}));

import { ThemeToggle } from "@/components/theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    setThemeMock.mockReset();
  });

  it("switches dark theme to light", async () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "dark", setTheme: setThemeMock });

    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "切換主題" }));

    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("switches light theme to dark", async () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "light", setTheme: setThemeMock });

    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "切換主題" }));

    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });
});
