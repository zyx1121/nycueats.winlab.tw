// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, searchParamsMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  searchParamsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock(),
}));

vi.mock("@/components/filter-panel", () => ({
  FilterPanel: ({ currentQuery }: { currentQuery?: string }) => (
    <div role="dialog">
      篩選條件
      <span data-testid="current-query">{currentQuery}</span>
    </div>
  ),
}));

import { SearchForm } from "@/components/search-form";

function params(value: Record<string, string> = {}) {
  return new URLSearchParams(value);
}

describe("SearchForm", () => {
  beforeEach(() => {
    pushMock.mockReset();
    searchParamsMock.mockReturnValue(params());
  });

  it("submits a trimmed query while preserving current params", async () => {
    searchParamsMock.mockReturnValue(params({ area: "area-1" }));
    const user = userEvent.setup();
    render(<SearchForm tagVocabulary={[]} />);

    await user.type(screen.getByRole("searchbox"), "  牛肉麵  ");
    await user.keyboard("{Enter}");

    expect(pushMock).toHaveBeenCalledWith("/search?area=area-1&q=%E7%89%9B%E8%82%89%E9%BA%B5");
  });

  it("does not submit a blank query", async () => {
    const user = userEvent.setup();
    render(<SearchForm tagVocabulary={[]} />);

    await user.type(screen.getByRole("searchbox"), "   ");
    await user.keyboard("{Enter}");

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows the active filter badge and passes the current query to the panel", async () => {
    searchParamsMock.mockReturnValue(params({ q: "飯", open: "true", sort: "price_asc" }));
    const user = userEvent.setup();
    render(<SearchForm tagVocabulary={[]} />);

    expect(screen.getByText("2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "篩選" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("篩選條件");
    expect(screen.getByTestId("current-query")).toHaveTextContent("飯");
  });
});
