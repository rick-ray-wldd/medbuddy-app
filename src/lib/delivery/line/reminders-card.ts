import type { FlexMessage } from "./role-card";
import type { ScheduleSlot } from "../../schedule/types";

/**
 * The caregiver's in-LINE schedule settings card — interface furniture, same
 * category as the role card: it carries times and buttons, never medication
 * content. Pushed via LineSetupClient, not the content seam.
 *
 * 新增時段 uses LINE's native datetimepicker (mode "time") so the caregiver
 * picks a time with the platform control; the picked value arrives as
 * `postback.params.time` and is re-validated server-side (client input is
 * never trusted — same rule as every other postback).
 */
export function remindersCard(slots: ScheduleSlot[]): FlexMessage {
  const rows =
    slots.length === 0
      ? [
          {
            type: "text",
            text: "目前沒有設定提醒時段。",
            size: "sm",
            color: "#666666",
            wrap: true,
          },
        ]
      : slots.map((slot) => ({
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            {
              type: "text",
              text: `${slot.timeOfDay}${slot.enabled ? "" : "(已停用)"}`,
              size: "lg",
              flex: 3,
            },
            {
              type: "button",
              style: "secondary",
              height: "sm",
              flex: 2,
              action: {
                type: "postback",
                label: "移除",
                data: `action=reminder_remove&slot=${slot.id}`,
              },
            },
          ],
        }));

  return {
    type: "flex",
    altText: "服藥提醒設定",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "服藥提醒", weight: "bold", size: "xl" },
          {
            type: "text",
            text: "到點時,用藥說明會以語音傳給長輩。最多 4 個時段、相隔至少 1 小時;22:00–07:00 不發送;錯過不補送。",
            size: "xs",
            color: "#888888",
            wrap: true,
          },
          ...rows,
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            action: {
              type: "datetimepicker",
              label: "新增時段",
              data: "action=reminder_add",
              mode: "time",
            },
          },
        ],
      },
    },
  };
}
