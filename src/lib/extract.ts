import { z } from "zod";
import { groqConfigured, groqExtract } from "./groq";
import { rulesExtract } from "./rules";

export const ROUND_TYPES = [
  "registration",
  "ppt",
  "online_test",
  "group_discussion",
  "interview",
  "selected",
  "event",
  "other",
] as const;
export type RoundType = (typeof ROUND_TYPES)[number];

export const ExtractionSchema = z.object({
  relevant: z.boolean().describe("True only if the mail is about one specific company's internship or placement drive."),
  kind: z.enum(["announcement", "schedule", "shortlist", "selection", "event", "reminder", "other"]),
  summary: z.string().describe("One plain sentence saying what this mail tells students."),
  confidence: z.number().describe("0 to 1: how sure you are about company, drive and round linking."),
  existing_drive_id: z.number().nullable().describe("id of the known drive this mail belongs to, or null if it is a new drive."),
  company: z.string().nullable().describe("Short canonical company name, e.g. 'UPL', 'Natwest', 'Marvell'."),
  program: z.string().nullable().describe("Named programme if any, e.g. 'M-STEM Scholar'. Otherwise null."),
  category: z.enum(["internship", "placement", "both", "other"]),
  batch: z.string().nullable().describe("Graduation year the drive targets, e.g. '2028'."),
  role: z.string().nullable(),
  stipend_monthly_inr: z.number().nullable().describe("Monthly stipend in rupees, e.g. 55000."),
  stipend_text: z.string().nullable().describe("Stipend exactly as the mail words it."),
  ctc_lpa: z.number().nullable().describe("Full-time CTC in lakhs per annum."),
  ctc_text: z.string().nullable().describe("CTC exactly as the mail words it."),
  locations: z.array(z.string()),
  eligible_branches: z.string().nullable(),
  eligibility_criteria: z.string().nullable().describe("CGPA, X/XII marks, arrears and similar conditions."),
  registration_deadline: z.string().nullable().describe("ISO date YYYY-MM-DD."),
  website: z.string().nullable(),
  rounds: z.array(
    z.object({
      existing_round_id: z.number().nullable().describe("id of the known round this refers to, else null."),
      type: z.enum(ROUND_TYPES),
      name: z.string().describe("Short label, e.g. 'Online test', 'Interview', 'Final selection'."),
      date: z.string().nullable().describe("ISO date YYYY-MM-DD."),
      time: z.string().nullable(),
      venue: z.string().nullable(),
      mode: z.enum(["online", "offline", "unknown"]),
      has_student_list: z.boolean().describe("True for the one round that the student list in this mail belongs to."),
    }),
  ),
  student_list_stage: z.enum(["none", "registered", "shortlisted", "selected"]).describe("What being on the student list in this mail means."),
  student_list_is_addition: z.boolean().describe("True only if the mail says these students are added on top of an earlier list for the same round."),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export type KnownDrive = {
  id: number;
  company: string;
  program: string;
  category: string;
  batch: string;
  rounds: { id: number; type: string; name: string; date: string | null }[];
};

export type ExtractInput = {
  subject: string;
  sender: string;
  sentAt: number;
  bodyText: string;
  /** Cells of every table row in the mail body. */
  tableRows: string[][];
  attachments: { filename: string; preview?: string }[];
  studentCount: number;
  knownDrives: KnownDrive[];
};

export type Extractor = (input: ExtractInput) => Promise<Extraction>;

/** Below this the rules are guessing, and the mail is shown for review. */
export const REVIEW_BELOW = 0.6;

/**
 * Rules read every mail. Only when they are unsure, and a Groq key is set,
 * is the mail handed to a language model for a second opinion.
 */
export const extract: Extractor = async (input) => {
  const byRules = rulesExtract(input);
  if (byRules.confidence >= REVIEW_BELOW || !groqConfigured()) return byRules;
  try {
    return await groqExtract(input);
  } catch (e) {
    console.warn(`Groq could not read "${input.subject}": ${e instanceof Error ? e.message : e}`);
    return byRules;
  }
};
