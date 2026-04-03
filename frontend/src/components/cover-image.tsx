"use client";

import { Image, type ImageProps } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

const COVER_RETRY_INTERVAL_MS = 1000;

function isCoverAPIURL(value: string): boolean {
  return /\/api\/media\/[^/]+\/cover\/(poster|backdrop)\/(sm|md|lg|xl)(\?|$)/.test(value);
}

function withQueryValue(url: string, key: string, value: string): string {
  const [base, hash = ""] = url.split("#");
  const connector = base.includes("?") ? "&" : "?";
  return `${base}${connector}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash ? `#${hash}` : ""}`;
}

type CoverImageProps = ImageProps & {
  autoRetry?: boolean;
  alt?: string;
};

export function CoverImage({ src, autoRetry = true, alt = "", ...rest }: CoverImageProps) {
  const [revision, setRevision] = useState(0);
  const source = typeof src === "string" ? src : "";
  const coverAPI = autoRetry && source !== "" && isCoverAPIURL(source);

  useEffect(() => {
    if (!coverAPI) return undefined;

    let active = true;
    let timer: number | null = null;
    let inflight = false;

    const probe = async () => {
      if (!active || inflight) return;
      inflight = true;
      try {
        const response = await fetch(withQueryValue(source, "__cover_probe", String(Date.now())), {
          method: "HEAD",
          cache: "no-store"
        });
        if (!active) return;

        if (response.status === 200) {
          setRevision((current) => current + 1);
          if (timer != null) {
            window.clearInterval(timer);
            timer = null;
          }
          return;
        }

        if (response.status === 202) {
          return;
        }

        if (response.status === 404 || response.status === 410) {
          if (timer != null) {
            window.clearInterval(timer);
            timer = null;
          }
        }
      } catch {
        // Ignore transient network issues; next interval retries automatically.
      } finally {
        inflight = false;
      }
    };

    void probe();
    timer = window.setInterval(() => {
      void probe();
    }, COVER_RETRY_INTERVAL_MS);

    return () => {
      active = false;
      if (timer != null) {
        window.clearInterval(timer);
      }
    };
  }, [coverAPI, source]);

  const resolvedSrc = useMemo(() => {
    if (!source || !coverAPI) return src;
    return withQueryValue(source, "__cover_retry", String(revision));
  }, [coverAPI, revision, source, src]);

  return <Image {...rest} src={resolvedSrc} alt={alt} />;
}
