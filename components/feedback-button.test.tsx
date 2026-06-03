// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { attachToMock, getFeedbackMock } = vi.hoisted(() => ({
  attachToMock: vi.fn(),
  getFeedbackMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  getFeedback: getFeedbackMock,
}));

import { FeedbackButton } from "@/components/feedback-button";

describe("FeedbackButton", () => {
  beforeEach(() => {
    attachToMock.mockReset();
    getFeedbackMock.mockReset();
  });

  it("attaches Sentry feedback to the rendered button", async () => {
    getFeedbackMock.mockReturnValue({ attachTo: attachToMock });

    render(<FeedbackButton />);

    const button = screen.getByRole("button", { name: "回報問題" });
    await waitFor(() => expect(attachToMock).toHaveBeenCalledWith(button));
  });

  it("renders without attaching when feedback integration is unavailable", async () => {
    getFeedbackMock.mockReturnValue(undefined);

    render(<FeedbackButton />);

    expect(screen.getByRole("button", { name: "回報問題" })).toBeInTheDocument();
    await waitFor(() => expect(attachToMock).not.toHaveBeenCalled());
  });
});
