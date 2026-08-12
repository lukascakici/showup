"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * A scannable QR for a link.
 *
 * Deliberately black-on-white inside a white block, even though every other
 * surface here is dark. Camera apps are built to find dark modules on a light
 * field, and an inverted code is the classic reason a QR "doesn't work" on half
 * the phones in a room. The white box is the quiet zone the spec requires, not
 * decoration — the code needs clear margin around it to be found at all.
 *
 * Encoding is async, so this renders a same-sized placeholder first: a QR that
 * pops in and reflows the page under someone's thumb is worse than one that
 * takes a beat to appear.
 */
export function QrCode({
  value,
  size = 176,
  label,
}: {
  value: string;
  /** Rendered size in CSS pixels. The image is encoded at 2x for sharp scaling. */
  size?: number;
  /** What the code points at, for anyone using a screen reader. */
  label: string;
}) {
  // Results are tagged with the input they came from and compared during
  // render, rather than being cleared by a setState at the top of the effect.
  // Same outcome — a changed link never shows the previous code — without the
  // cascading render that resetting-in-an-effect causes.
  const key = `${value}|${size}`;
  const [drawn, setDrawn] = useState<{ key: string; src: string } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000ff", light: "#ffffffff" },
    })
      .then((url) => {
        if (live) setDrawn({ key, src: url });
      })
      .catch(() => {
        if (live) setFailedKey(key);
      });

    return () => {
      live = false;
    };
  }, [value, size, key]);

  const src = drawn?.key === key ? drawn.src : null;
  const failed = failedKey === key;

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl bg-white p-2"
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL, not an asset
        <img src={src} alt={label} width={size - 16} height={size - 16} />
      ) : (
        // The link itself is always on screen next to this, so a QR that can't be
        // drawn costs nothing but the convenience it was there to add.
        <span className="px-2 text-center text-xs text-black/50">
          {failed ? "Couldn't draw a QR — use the link" : ""}
        </span>
      )}
    </div>
  );
}
