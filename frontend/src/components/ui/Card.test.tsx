import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card";


describe("Card", () => {
  it("renders structured card sections", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Tiêu đề</CardTitle>
          <CardDescription>Mô tả</CardDescription>
        </CardHeader>
        <CardContent>Nội dung</CardContent>
      </Card>,
    );

    expect(screen.getByText("Tiêu đề")).toBeDefined();
    expect(screen.getByText("Mô tả")).toBeDefined();
    expect(screen.getByText("Nội dung")).toBeDefined();
  });
});
