// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, searchParamsMock, getDateQuotasMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  searchParamsMock: vi.fn(),
  getDateQuotasMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock(),
}));

vi.mock("@/app/actions/filter", () => ({
  getDateQuotas: getDateQuotasMock,
}));

import { FilterPanel } from "@/components/filter-panel";

const tagVocabulary = [
  { label: "辣", axis: "taste" },
  { label: "飯", axis: "category" },
];

function renderPanel(params: Record<string, string> = {}, currentQuery = "飯") {
  searchParamsMock.mockReturnValue(new URLSearchParams(params));
  return render(
    <FilterPanel
      tagVocabulary={tagVocabulary}
      onClose={vi.fn()}
      currentQuery={currentQuery}
    />,
  );
}

describe("FilterPanel", () => {
  beforeEach(() => {
    pushMock.mockReset();
    searchParamsMock.mockReset();
    getDateQuotasMock.mockResolvedValue([
      { date: "2026-06-03", hasQuota: true },
      { date: "2026-06-04", hasQuota: false },
    ]);
  });

  it("applies selected filters to the search URL", async () => {
    const user = userEvent.setup();
    renderPanel({ area: "area-1" });

    const openRow = screen.getByText("只顯示營業中商家").parentElement;
    if (!openRow) throw new Error("Missing open-now filter row");

    await user.click(within(openRow).getByRole("button"));
    await user.click(screen.getByText(/價格：低/));
    await user.click(screen.getByRole("button", { name: "辣" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /今/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /今/ }));
    await user.click(screen.getByRole("button", { name: "套用篩選" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/search?q=%E9%A3%AF&area=area-1&open=true&sort=price_asc&dates=2026-06-03&tags=%E8%BE%A3",
    );
  });

  it("clears selected filters before applying", async () => {
    const user = userEvent.setup();
    renderPanel({ open: "true", sort: "price_asc", tags: "辣" }, "牛肉麵");

    expect(screen.getByText("已選 3 個條件")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清除全部" }));
    await user.click(screen.getByRole("button", { name: "套用篩選" }));

    expect(pushMock).toHaveBeenCalledWith("/search?q=%E7%89%9B%E8%82%89%E9%BA%B5");
  });
});
