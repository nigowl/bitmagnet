"use client";

import { useI18n } from "@/languages/provider";

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="site-footer">
      <span className="site-footer-copy">{t("footer.copyright")}</span>
      <span className="site-footer-tagline">{t("footer.tagline")}</span>
    </footer>
  );
}
