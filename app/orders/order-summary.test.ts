import { describe, expect, it } from "vitest";

import { buildOrderSummaries } from "@/app/orders/order-summary";

describe("buildOrderSummaries", () => {
  it("maps items by order and preserves pagination order", () => {
    const result = buildOrderSummaries(
      [
        {
          id: "order-2",
          status: "completed",
          created_at: "2026-04-02T10:00:00.000Z",
        },
        {
          id: "order-1",
          status: "confirmed",
          created_at: "2026-04-01T10:00:00.000Z",
        },
      ],
      [
        {
          id: "item-1",
          date: "2026-04-01",
          qty: 2,
          unit_price: 100,
          picked_up: false,
          order_id: "order-1",
          menu_items: {
            name: "雞胸便當",
            vendors: { name: "健康餐盒" },
          },
          order_item_options: [{ name: "加蛋", price_delta: 10 }],
        },
        {
          id: "item-2",
          date: "2026-04-02",
          qty: 1,
          unit_price: 80,
          picked_up: true,
          order_id: "order-2",
          menu_items: {
            name: "燒肉飯",
            vendors: { name: "食堂" },
          },
          order_item_options: [],
        },
      ]
    );

    expect(result.map((order) => order.id)).toEqual(["order-2", "order-1"]);
    expect(result[0].items[0]).toMatchObject({
      id: "item-2",
      menu_item_name: "燒肉飯",
      vendor_name: "食堂",
    });
    expect(result[1].items[0]).toMatchObject({
      id: "item-1",
      options: [{ name: "加蛋", price_delta: 10 }],
    });
  });

  it("fills missing nested values with safe defaults", () => {
    const result = buildOrderSummaries(
      [
        {
          id: "order-1",
          status: "cancelled",
          created_at: "2026-04-01T10:00:00.000Z",
        },
      ],
      [
        {
          id: "item-1",
          date: "2026-04-01",
          qty: 1,
          unit_price: 100,
          picked_up: false,
          order_id: "order-1",
          menu_items: null,
          order_item_options: null,
        },
      ]
    );

    expect(result[0].items[0]).toMatchObject({
      menu_item_name: "",
      vendor_name: "",
      options: [],
    });
  });
});
