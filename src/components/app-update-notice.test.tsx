import { expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppUpdateNotice, AppUpdateNoticeView } from "./app-update-notice";

it("is hidden before a different frontend build is detected", () => {
  expect(renderToStaticMarkup(<AppUpdateNotice currentVersion="old" />)).toBe("");
});

it("announces the update without taking focus", () => {
  const markup = renderToStaticMarkup(<AppUpdateNoticeView onReload={() => {}} onDismiss={() => {}} />);
  expect(markup).toContain('role="status"');
  expect(markup).toContain("En ny version av Förena finns.");
  expect(markup).toContain('aria-label="Stäng påminnelsen"');
  expect(markup).not.toContain("autofocus");
});

it("only reloads or dismisses after the corresponding explicit click", () => {
  const onReload = vi.fn();
  const onDismiss = vi.fn();
  const notice = AppUpdateNoticeView({ onReload, onDismiss });
  const [, reload, dismiss] = notice.props.children as ReactElement<{ onClick: () => void; type: string }>[];
  expect(onReload).not.toHaveBeenCalled();
  expect(onDismiss).not.toHaveBeenCalled();
  expect(dismiss.props.type).toBe("button");
  dismiss.props.onClick();
  expect(onDismiss).toHaveBeenCalledOnce();
  expect(onReload).not.toHaveBeenCalled();
  reload.props.onClick();
  expect(onReload).toHaveBeenCalledOnce();
});
