import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SignInForm } from "@/app/auth/sign-in/sign-in-form";

describe("SignInForm", () => {
  it("posts credentials when submitted before client hydration", () => {
    render(<SignInForm next="/dashboard" configured />);

    const form = screen
      .getByRole("button", { name: "Sign in" })
      .closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/auth/password");
  });

  it("shows a server-side fallback error", () => {
    render(
      <SignInForm
        next="/dashboard"
        configured
        initialError="Email or password is incorrect."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Email or password is incorrect.",
    );
  });
});
