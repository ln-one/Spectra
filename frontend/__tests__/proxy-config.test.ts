import { config } from "../proxy";

describe("proxy matcher", () => {
  test("excludes health routes from auth redirects", () => {
    expect(config.matcher).toContain(
      "/((?!api|health|_next/static|_next/image|favicon.ico).*)"
    );
  });
});
