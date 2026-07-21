// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { addToOrderMock } = vi.hoisted(() => ({ addToOrderMock: vi.fn() }));

vi.mock("@/app/menu/[id]/actions", () => ({
  addToOrder: addToOrderMock,
}));

import { AddToOrderDialog } from "@/app/menu/[id]/add-to-order-dialog";

const item = {
  id: "item-1",
  name: "雞腿飯",
  description: "招牌",
  price: 100,
};

const slots = [
  { id: "slot-1", date: "2026-06-03", max_qty: 5, reserved_qty: 2 },
];

const optionGroups = [
  {
    id: "group-1",
    name: "加購",
    required: true,
    max_select: 1,
    sort_order: 0,
    item_options: [
      { id: "opt-1", name: "加蛋", price_delta: 15, sort_order: 0 },
    ],
  },
];

function renderDialog(groups = optionGroups) {
  render(
    <AddToOrderDialog
      vendorId="vendor-1"
      item={item}
      slots={slots}
      optionGroups={groups}
    >
      <button type="button">打開餐點</button>
    </AddToOrderDialog>,
  );
}

async function selectDate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("combobox")[0]);
  await user.click(screen.getByRole("option", { name: /06\/03/ }));
}

function optionLabel(name: string) {
  const label = screen.getByText(name).closest("label");
  if (!label) throw new Error(`Missing option label: ${name}`);
  return label;
}

describe("AddToOrderDialog", () => {
  beforeEach(() => {
    addToOrderMock.mockReset();
  });

  it("requires date and required options before enabling submit", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "打開餐點" }));

    const submit = screen.getByRole("button", { name: "加入預約單 $100" });
    expect(submit).toBeDisabled();

    await selectDate(user);
    expect(screen.getByRole("button", { name: "加入預約單 $100" })).toBeDisabled();

    await user.click(optionLabel("加蛋"));
    expect(screen.getByRole("button", { name: "加入預約單 $115" })).toBeEnabled();
  });

  it("submits selected date, quantity, and option ids", async () => {
    addToOrderMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "打開餐點" }));
    await selectDate(user);
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(screen.getByRole("option", { name: "2" }));
    await user.click(optionLabel("加蛋"));
    await user.click(screen.getByRole("button", { name: "加入預約單 $230" }));

    await waitFor(() =>
      expect(addToOrderMock).toHaveBeenCalledWith(
        "vendor-1",
        "item-1",
        "slot-1",
        "2026-06-03",
        2,
        ["opt-1"],
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows action errors without closing the dialog", async () => {
    addToOrderMock.mockResolvedValue({ error: "此日期已售完" });
    const user = userEvent.setup();
    renderDialog([]);

    await user.click(screen.getByRole("button", { name: "打開餐點" }));
    await selectDate(user);
    await user.click(screen.getByRole("button", { name: "加入預約單 $100" }));

    await expect(screen.findByText("此日期已售完")).resolves.toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
