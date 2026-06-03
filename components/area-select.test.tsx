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

import { AreaSelect } from "@/components/area-select";

describe("AreaSelect", () => {
  beforeEach(() => {
    pushMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams({ q: "飯" }));
  });

  it("pushes the selected area while preserving existing params", async () => {
    const user = userEvent.setup();
    render(
      <AreaSelect
        byCity={{
          新竹: [
            { id: "area-1", name: "竹科 A", city: "新竹" },
            { id: "area-2", name: "竹科 B", city: "新竹" },
          ],
        }}
        defaultAreaId="area-1"
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "竹科 B" }));

    expect(pushMock).toHaveBeenCalledWith("/?q=%E9%A3%AF&area=area-2");
  });
});
