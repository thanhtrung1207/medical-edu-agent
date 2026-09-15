import { describe, expect, it } from "vitest";
import { KNOWLEDGE_BASE_URL, NAV } from "./navigation";

describe("navigation config", () => {
  it("defines the six app routes with stable hrefs and labels", () => {
    // Sidebar and Drawer both render from this single source; the href/label
    // pairs are pinned so a refactor cannot silently change routes or copy.
    expect(NAV.map((item) => [item.href, item.label])).toEqual([
      ["/", "Ca lâm sàng"],
      ["/chat", "Trò chuyện"],
      ["/history", "Lịch sử"],
      ["/quiz", "Trắc nghiệm"],
      ["/progress", "Tiến độ"],
      ["/upload", "Tài liệu"],
    ]);
  });

  it("attaches a renderable icon to every nav item", () => {
    NAV.forEach((item) => {
      expect(item.icon).toBeDefined();
    });
  });

  it("keeps the knowledge base link target separate from app routes", () => {
    expect(NAV.some((item) => item.href === KNOWLEDGE_BASE_URL)).toBe(false);
  });
});
