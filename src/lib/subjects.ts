/**
 * Seeded people, standing in for a database.
 *
 * Three of them rather than one, because a carer holding several people is the
 * case that makes attaching every finding to a subject matter. Two are a family
 * pair; the third is a facility resident, where the gap is a shift handover
 * rather than an absent child.
 *
 * Synthetic. No real patient data is in this repository.
 */

import type { ConditionCode } from "./rules/types";

export type SeededSubject = {
  id: string;
  displayName: string;
  ageYears: number;
  conditions: ConditionCode[];
  relation: "family" | "facility_staff";
  /** Pre-filled so the demo starts from a realistic cupboard, not an empty box. */
  cupboard: { text: string; source: "prescription" | "otc" | "supplement" | "leftover" }[];
};

/**
 * The public demo intentionally has one clinical subject. Other seeded people
 * remain below as engine fixtures, but no LINE role or dashboard control may
 * switch away from this record during the two-phone demo.
 */
export const DEMO_SUBJECT_ID = "subj-father";

export const SUBJECTS: SeededSubject[] = [
  {
    id: "subj-father",
    displayName: "父親",
    ageYears: 72,
    conditions: ["chronic_liver_disease"],
    relation: "family",
    cupboard: [
      { text: "普拿疼膜衣錠500毫克", source: "otc" },
      { text: "鄰居給的紅麴膠囊", source: "supplement" },
      { text: "阿姨推薦的魚油", source: "supplement" },
    ],
  },
  {
    id: "subj-mother",
    displayName: "母親",
    ageYears: 69,
    conditions: ["recurrent_falls", "peptic_ulcer_or_gi_bleed"],
    relation: "family",
    cupboard: [
      { text: "使蒂諾斯膜衣錠10毫克", source: "prescription" },
      { text: "上次剩的止痛藥 待克菲那", source: "leftover" },
    ],
  },
  {
    id: "subj-resident-a",
    displayName: "陳女士(機構住民)",
    ageYears: 84,
    conditions: ["recurrent_falls", "ckd_egfr_under_50"],
    relation: "facility_staff",
    cupboard: [{ text: "安佳錠", source: "prescription" }],
  },
];

export const DEMO_SUBJECT = SUBJECTS.find((subject) => subject.id === DEMO_SUBJECT_ID)!;

export function findSubject(id: string): SeededSubject | undefined {
  return SUBJECTS.find((s) => s.id === id);
}

export const CONDITION_LABELS: Record<ConditionCode, string> = {
  chronic_liver_disease: "慢性肝病",
  low_bmi: "體重過輕 (BMI < 18)",
  recurrent_falls: "反覆跌倒",
  peptic_ulcer_or_gi_bleed: "消化性潰瘍或腸胃道出血病史",
  heart_failure: "心臟衰竭",
  severe_hypertension: "嚴重高血壓",
  ckd_egfr_under_50: "腎功能下降 (eGFR < 50)",
};
