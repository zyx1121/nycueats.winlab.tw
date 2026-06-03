// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cancelOrderMock, confirmOrderMock, pushMock, refreshMock } = vi.hoisted(() => ({
  cancelOrderMock: vi.fn(),
  confirmOrderMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("@/app/cart/actions", () => ({
  cancelOrder: cancelOrderMock,
  confirmOrder: confirmOrderMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { CartActions } from "@/app/cart/cart-actions";

describe("CartActions", () => {
  beforeEach(() => {
    cancelOrderMock.mockReset();
    confirmOrderMock.mockReset();
    pushMock.mockReset();
    refreshMock.mockReset();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("opens checkout dialog and navigates to orders after confirmation", async () => {
    confirmOrderMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<CartActions orderId="order-1" total={180} itemCount={2} />);

    await user.click(screen.getByRole("button", { name: "結帳確認（$180）" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("確認結帳");

    await user.click(screen.getByRole("button", { name: "確認結帳" }));

    await waitFor(() => expect(confirmOrderMock).toHaveBeenCalledWith("order-1"));
    expect(pushMock).toHaveBeenCalledWith("/orders");
  });

  it("opens cancel dialog and refreshes after clearing the cart", async () => {
    cancelOrderMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<CartActions orderId="order-1" total={180} itemCount={2} />);

    await user.click(screen.getByRole("button", { name: "清空購物車" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("確定要清空購物車？");

    await user.click(screen.getByRole("button", { name: "確定清空" }));

    await waitFor(() => expect(cancelOrderMock).toHaveBeenCalledWith("order-1"));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("alerts action errors without navigating", async () => {
    confirmOrderMock.mockResolvedValue({ error: "確認失敗" });
    const user = userEvent.setup();
    render(<CartActions orderId="order-1" total={180} itemCount={2} />);

    await user.click(screen.getByRole("button", { name: "結帳確認（$180）" }));
    await user.click(screen.getByRole("button", { name: "確認結帳" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("確認失敗"));
    expect(pushMock).not.toHaveBeenCalled();
  });
});
