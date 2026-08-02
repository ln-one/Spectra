import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ReactElement, type ReactNode, useState } from "react";
import messages from "../messages/zh-CN.json";

export function renderWithIntl(element: ReactElement, options?: RenderOptions) {
  function IntlWrapper({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
      () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    );
    return (
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh-CN" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  }

  return render(element, { wrapper: IntlWrapper, ...options });
}
