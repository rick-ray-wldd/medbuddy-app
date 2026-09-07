import {
  LINE_BOT_BASIC_ID,
  LINE_BOT_DISPLAY_NAME,
  lineAddFriendUrl,
} from "@/lib/delivery/line/bot-identity";
import { qrGeometry } from "@/lib/qr/module-path";

/**
 * Step zero of the two-phone demo.
 *
 * The pairing panel next to this explains what each phone does *after* it is
 * connected, which was useless to anyone who had not connected one yet — the
 * page described a conversation with no way to enter it. This is the way in.
 *
 * Both routes are here on purpose. A reviewer reading this page on a laptop
 * scans the code with their phone; a reviewer already on their phone cannot
 * scan their own screen, so the same URL is also a link they can tap.
 */

const ADD_FRIEND_URL = lineAddFriendUrl();

// Constant payload, so the symbol is computed once per process rather than per
// request — this page is `force-dynamic`.
const { size, path } = qrGeometry(ADD_FRIEND_URL);

/** Modules of blank margin the QR spec requires around the symbol. */
const QUIET_ZONE = 4;

export default function LineInvite() {
  const extent = size + QUIET_ZONE * 2;

  return (
    <div className="line-invite">
      <p className="eyebrow">先加入好友</p>
      <div className="line-invite-body">
        <svg
          className="line-invite-qr"
          viewBox={`0 0 ${extent} ${extent}`}
          role="img"
          aria-label={`加入 LINE 好友 ${LINE_BOT_DISPLAY_NAME} ${LINE_BOT_BASIC_ID} 的 QR code`}
          shapeRendering="crispEdges"
        >
          <rect width={extent} height={extent} fill="#ffffff" />
          <g transform={`translate(${QUIET_ZONE} ${QUIET_ZONE})`}>
            <path d={path} fill="#0f172a" />
          </g>
        </svg>
        <div className="line-invite-copy">
          <strong>用 LINE 掃描加入</strong>
          <span>兩支手機都要先加好友，才會出現「我是長輩／我是照顧者」的選單。</span>
          <a
            className="line-invite-link"
            href={ADD_FRIEND_URL}
            target="_blank"
            rel="noreferrer"
          >
            在手機上直接加入
          </a>
          <code className="line-invite-id">{LINE_BOT_BASIC_ID}</code>
        </div>
      </div>
    </div>
  );
}
