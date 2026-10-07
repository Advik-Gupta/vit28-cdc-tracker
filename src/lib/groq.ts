import { z } from "zod";
import { ExtractionSchema, type ExtractInput, type Extraction } from "./extract";

export const groqConfigured = () => Boolean(process.env.GROQ_API_KEY);
const model = () => process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM = `You read mails sent by the Career Development Centre (CDC, the placement cell) of VIT to students, and turn each one into a JSON record for a tracker of internship and placement drives.

A drive is one company hiring for one category (internship, placement, or both) for one graduating batch. A drive moves through rounds: registration, pre-placement talk (ppt), online test, group discussion, interview, and finally the list of selected students.

Rules:
- You are given the drives and rounds already known. If this mail belongs to one, return its id in existing_drive_id, and return existing_round_id for any round that is the same one (same stage and date, or a reminder or revised list for it). Use the same company name the known drive uses.
- List every round the mail gives a date for.
- Student lists are parsed separately by code; you are told how many students were found. Set has_student_list on the single round they belong to and set student_list_stage. A final selection list belongs to a round of type "selected". If no students were found, student_list_stage is "none".
- Dates are YYYY-MM-DD; use the mail's sent date to work out the year.
- stipend_monthly_inr is rupees per month as a number. Use null for anything the mail does not state; never guess.
- Mails not about a specific company's drive get relevant false and kind "other".

Answer with one JSON object matching this JSON Schema, and nothing else:
`;

export async function groqExtract(input: ExtractInput): Promise<Extraction> {
  const drives =
    input.knownDrives
      .map(
        (d) =>
          `drive ${d.id}: ${d.company}${d.program ? ` (${d.program})` : ""} | ${d.category} | batch ${d.batch || "unknown"}` +
          d.rounds.map((r) => `\n    round ${r.id}: ${r.type} "${r.name}" on ${r.date ?? "unknown date"}`).join(""),
      )
      .join("\n") || "(none yet)";
  const attachments =
    input.attachments.map((a) => `- ${a.filename}${a.preview ? `\n  first rows:\n${a.preview}` : ""}`).join("\n") || "(none)";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: model(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM + JSON.stringify(z.toJSONSchema(ExtractionSchema)) },
        {
          role: "user",
          content: `<known_drives>\n${drives}\n</known_drives>\n\n<mail>\nSubject: ${input.subject}\nFrom: ${input.sender}\nSent: ${new Date(input.sentAt).toISOString().slice(0, 10)}\n\n${input.bodyText}\n</mail>\n\n<attachments>\n${attachments}\n</attachments>\n\nStudents found by the parser in this mail: ${input.studentCount}.`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = ExtractionSchema.safeParse(JSON.parse(json.choices?.[0]?.message?.content ?? "null"));
  if (!parsed.success) throw new Error("the answer did not match the expected format");
  return parsed.data;
}
