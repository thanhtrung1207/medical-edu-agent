# Slash-Command & Clinical Record Redesign

> **Replaces** the current scenario-card + `/case/[scenario]` approach with a chat-first UX:
> slash-commands trigger clinical analysis modes, and a multi-step wizard form captures
> the full Van Lang University clinical record (Bệnh Án) inline in the chat.

## Goal

Remove the two homepage scenario cards and the dedicated case study route. All case study
functionality moves into the chat interface via slash-commands. Students can chat freely
without a clinical record; the record is required only when a slash-command needs clinical
context.

### Privacy Notice

This is a **learning tool** — students fill in fictional patient data to practice clinical
documentation. The wizard displays a disclaimer: *"Đây là bệnh án giả định cho mục đích
học tập. Không nhập thông tin bệnh nhân thật."* The serialize function strips PII fields
(`ho_ten`, `sdt`, `dia_chi`) before sending to the AI (see §2.5).

## Architecture

- **Frontend-driven slash-command system** with an extensible registry. Commands compose
  messages sent through the existing `/api/chat` endpoint. Two additive fields on
  `ChatRequest`: `command` (slash-command id) and `clinical_context` (condensed record
  summary injected into every LLM call as a dedicated context block — see §6).
- **Two clinical record schemas** (Phục Hình Cố Định and Phục Hình Tháo Lắp) rendered as
  a 5-step stepper wizard inline in the chat message area.
- **Interactive dental chart** with per-tooth status annotation, replacing the simple
  toggle-only `ToothChart`.
- **Collapsible context badge** above chat messages showing the active clinical record.

## Tech Stack

- Next.js App Router (existing)
- React state + localStorage for clinical record persistence (same pattern as current `case-storage.ts`)
- Tailwind CSS (existing)
- Two additive backend fields: `command` and `clinical_context` on `ChatRequest`, plus
  `ContextBuilder` injection (see §6)

---

## 1. Slash Command System

### 1.1 Registry Architecture

File: `frontend/src/lib/slash-commands/types.ts`

```ts
export type CommandCategory = "case" | "analysis" | "settings";
export type CommandHandler = "form-wizard" | "send-message" | "action";

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;                        // Lucide icon name
  category: CommandCategory;
  requiresClinicalRecord?: boolean;    // default false
  handler: CommandHandler;
  formSchemaId?: string;               // for handler="form-wizard"
}
```

File: `frontend/src/lib/slash-commands/registry.ts`

A `CommandRegistry` class holding a `Map<string, SlashCommand>`. Public API:

- `register(cmd: SlashCommand): void`
- `getAll(): SlashCommand[]`
- `getById(id: string): SlashCommand | undefined`
- `search(query: string): SlashCommand[]` — diacritics-insensitive fuzzy match on `id` +
  `label`. Normalizes input with `normalize("NFD")` + strip combining marks + `đ→d`, so
  typing `chan doan` matches `chẩn đoán`.
- `getByCategory(cat: CommandCategory): SlashCommand[]`

Exported singleton: `const commandRegistry = new CommandRegistry()`.

File: `frontend/src/lib/slash-commands/commands.ts`

Registers the 6 default commands on module load:

| id | label | category | requiresClinicalRecord | handler | formSchemaId |
|----|-------|----------|----------------------|---------|-------------|
| `benh-an-co-dinh` | Bệnh án Phục Hình Cố Định | case | false | form-wizard | `co-dinh` |
| `benh-an-thao-lap` | Bệnh án Phục Hình Tháo Lắp | case | false | form-wizard | `thao-lap` |
| `chan-doan` | Phân tích chẩn đoán | analysis | true | send-message | — |
| `ke-hoach-dieu-tri` | Lập kế hoạch điều trị | analysis | true | send-message | — |
| `so-sanh` | So sánh phương án phục hình | analysis | true | send-message | — |
| `ket-thuc` | Tóm tắt và lưu case | analysis | true | **action** | — |

The `/ket-thuc` command has side-effects beyond sending a message: it sends a summary
request (with `clinical_context` so the AI can summarize the correct case), waits for the
AI response, saves the clinical record + summary to localStorage via
`clinical-record/storage.ts`, then navigates to `/history`. Error handling:
- If the request fails or times out: show toast error, do **not** navigate or save.
- If the response has no usable summary: show toast "Không nhận được tóm tắt", stay on chat.
- Summary is extracted from the last assistant message in the response.

### 1.2 Popup UI

File: `frontend/src/components/chat/SlashCommandMenu.tsx`

**Menu trigger:** The menu opens when the textarea value (after `trimStart()`) starts with
`/`. Close the menu when: user types a space after the command word (to allow normal `/`
usage like "1/2"), presses Esc, backspaces past the `/`, or clicks outside.

Behavior:
- Positioned above the textarea input, anchored to the bottom of the chat area.
- Groups commands by `category` with section headers ("Ca lâm sàng", "Phân tích").
- Each item shows: icon + label + short description.
- Keyboard: Arrow up/down to navigate, Enter to select, Esc to dismiss.
- **IME guard:** All keyboard handlers check `event.nativeEvent.isComposing === true` and
  skip processing if so — prevents Telex/VNI composition from triggering Enter-to-select.
- Typing after `/` filters the list via `registry.search(query)`.

When a command is selected:
- `handler = "form-wizard"`: clear the textarea, mount the `ClinicalRecordWizard` component
  inline in the chat area with the schema identified by `formSchemaId`.
- `handler = "send-message"`: resolve via the **record state machine** (see §2.7).
- `handler = "action"`: execute the command's action handler directly (currently only
  `/ket-thuc`).

### 1.3 Integration with ChatInterface

File: `frontend/src/components/chat/ChatInterface.tsx` (modified)

New state:
- `slashMenuOpen: boolean`
- `slashQuery: string` (characters typed after `/`)
- `activeClinicalRecord: ClinicalRecordData | null` (persisted to localStorage)
- `wizardOpen: boolean`
- `wizardSchemaId: string | null`

No sent-tracking state is needed. When `activeClinicalRecord` exists, every outgoing
`ChatRequest` includes `clinical_context: buildClinicalSummary(schema, record.data)`.
When it does not exist, `clinical_context` is omitted.

The existing textarea `onChange` handler gains a check: if `trimStart().startsWith("/")`,
open the slash menu and pass the remainder as `slashQuery`.

New child components rendered inside `ChatInterface`:
- `<SlashCommandMenu>` (conditional on `slashMenuOpen`)
- `<ClinicalRecordWizard>` (conditional on `wizardOpen`)
- `<ClinicalRecordBadge>` (conditional on `activeClinicalRecord !== null`)

---

## 2. Clinical Record Form

### 2.1 Schema Definition

File: `frontend/src/lib/clinical-record/schemas.ts`

Reuses the existing pattern from `case-schemas.ts` but with richer field types.

```ts
export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "multi-checkbox"
  | "dental-chart"
  | "radio-with-other"    // radio group + free-text input when "Khác" selected
  | "select-with-text";   // select dropdown + paired text input (e.g., Kennedy class + variant)

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  pairedTextLabel?: string;  // label for the companion text input (radio-with-other / select-with-text)
  required?: boolean;
  half?: boolean;   // render at 50% width in a 2-column grid
}

export interface WizardStep {
  id: string;
  label: string;      // shown in stepper
  shortLabel: string;  // shown in stepper on mobile
  fields: FieldDef[];
}

export interface ClinicalRecordSchema {
  id: string;                  // "co-dinh" | "thao-lap"
  title: string;
  steps: WizardStep[];
  sampleData?: Record<string, unknown>;
}
```

### 2.2 Schema: Phục Hình Cố Định (`co-dinh`)

5 steps, 49 fields total. **Required fields** (marked with `required: true`):
`nam_sinh`, `gioi_tinh`, `ly_do_kham`, `dental_chart` (at least 1 tooth with any status
annotation), `chan_doan_lam_sang`. Validation for `nam_sinh`: must be 4 digits,
`1900 ≤ year ≤ currentYear`, derived age `≥ 0`.

**Step 1 — Hành chính** (7 fields):
`ho_ten` (text, half), `nam_sinh` (text, half), `gioi_tinh` (radio: Nam/Nữ, half),
`nghe_nghiep` (text, half), `dia_chi` (text), `sdt` (text, half), `ngay_kham` (text, half).

**Step 2 — Bệnh sử & Khám lâm sàng** (16 fields):
`ly_do_kham` (textarea), `dien_tien_rang` (textarea), `suc_khoe_chung` (radio: Tốt/Trung bình/Yếu),
`benh_nen` (multi-checkbox: Tiểu đường/THA/Tim mạch/Khác),
`vs_rang_mieng` (radio: Tốt/TB/Kém), `voi_rang` (radio: Không/Ít/Nhiều),
`vet_dinh` (radio: Không/Ít/Nhiều),
`can_xung_mat` (text), `ba_tang_mat` (text), `hinh_dang_mat` (radio: Vuông/Bầu dục/Tam giác),
`net_mat_nghieng` (radio: Thẳng/Nhô/Lõm), `nang_do_moi` (radio: Có/Không),
`mo_mem_da_niem` (textarea),
`tieng_keu_khop` (text), `van_dong_ha_ngam` (text), `truong_luc_co` (radio: Bình thường/Mạnh/Yếu).

**Step 3 — Khám trong miệng** (12 fields):
`dental_chart` (dental-chart — the interactive component),
`ghi_chu_rang` (textarea), `mo_nha_chu_chung` (textarea),
`sap_xep_ham_tren` (radio: Đều/Lệch lạc), `sap_xep_ham_duoi` (radio: Đều/Lệch lạc),
`duong_cong_spee` (text), `duong_cong_wilson` (text), `tuong_quan_khop_can` (textarea),
`can_phu_chia_cheo` (text),
`long_mui_toi_da` (radio: Vững ổn/Không vững ổn),
`huong_dan_can` (text — covers ra trước + sang bên LV/KLV),
`ph_cu_tren_mieng` (textarea — covers vị trí, loại PH, thẩm mỹ, chức năng).

**Step 4 — Khám vùng phục hình** (12 fields):
`do_day_thanh_rang` (text — 4 mặt: ngoài/trong/gần/xa),
`chieu_cao_thanh_rang` (text — 4 mặt),
`khoang_ph_doc` (text), `khoang_ph_ngang` (text),
`vat_lieu_tai_tao_cu` (text), `do_lung_lay` (select: Không/Độ 1/Độ 2/Độ 3),
`nuou_roi` (text), `do_sau_khe_nuou` (text), `chieu_cao_nuou_dinh` (text),
`rang_doi_dien` (textarea),
`xquang` (textarea — covers nội nha, buồng tủy, quanh chóp, tỷ lệ thân-chân, hình dạng chân, chốt),
`ghi_chu_khac` (textarea).

**Step 5 — Tóm tắt & Chẩn đoán** (2 fields):
`tom_tat_benh_an` (textarea, large), `chan_doan_lam_sang` (textarea, large).

### 2.3 Schema: Phục Hình Tháo Lắp (`thao-lap`)

5 steps, 60 fields total. Shares Step 1 and Step 5 with Cố Định (including the same
required fields). Steps 2–4 extend or replace the Cố Định equivalents. Every field is
listed below — no implicit "same as above".

**Step 1 — Hành chính** (7 fields, identical to Cố Định):
`ho_ten` (text, half), `nam_sinh` (text, half), `gioi_tinh` (radio: Nam/Nữ, half),
`nghe_nghiep` (text, half), `dia_chi` (text), `sdt` (text, half), `ngay_kham` (text, half).

**Step 2 — Bệnh sử, Khám lâm sàng & Hàm giả cũ** (28 fields):

*Bệnh sử & lâm sàng (16 fields, same as Cố Định Step 2):*
`ly_do_kham` (textarea), `dien_tien_rang` (textarea), `suc_khoe_chung` (radio: Tốt/Trung bình/Yếu),
`benh_nen` (multi-checkbox: Tiểu đường/THA/Tim mạch/Khác),
`vs_rang_mieng` (radio: Tốt/TB/Kém), `voi_rang` (radio: Không/Ít/Nhiều),
`vet_dinh` (radio: Không/Ít/Nhiều),
`can_xung_mat` (text), `ba_tang_mat` (text), `hinh_dang_mat` (radio: Vuông/Bầu dục/Tam giác),
`net_mat_nghieng` (radio: Thẳng/Nhô/Lõm), `nang_do_moi` (radio: Có/Không),
`mo_mem_da_niem` (textarea),
`tieng_keu_khop` (text), `van_dong_ha_ngam` (text), `truong_luc_co` (radio: Bình thường/Mạnh/Yếu).

*Đánh giá hàm giả cũ (12 fields):*
`ham_gia_cu` (radio: Không/Có HT/Có HD/Có cả HT+HD),
`cach_su_dung` (radio: Mang ngày/Mang ngày đêm/Ăn không mang),
`ly_do_lam_lai` (radio-with-other: Thẩm mỹ/Chức năng/Khác),
`thoi_gian_mang` (text), `kich_thuoc_doc_can_khop_cu` (text), `duong_giua` (text),
`tinh_trang_rang_gia` (text), `tinh_trang_nen_ham_gia` (text),
`can_sang_ben` (text), `can_toi` (text),
`nhan_xet_ham_gia_cu` (textarea), `ky_vong_ham_gia_moi` (textarea).

**Step 3 — Khám trong miệng & Phân loại Kennedy** (17 fields):

*Khám trong miệng (12 fields, same as Cố Định Step 3):*
`dental_chart` (dental-chart), `ghi_chu_rang` (textarea), `mo_nha_chu_chung` (textarea),
`sap_xep_ham_tren` (radio: Đều/Lệch lạc), `sap_xep_ham_duoi` (radio: Đều/Lệch lạc),
`duong_cong_spee` (text), `duong_cong_wilson` (text), `tuong_quan_khop_can` (textarea),
`can_phu_chia_cheo` (text),
`long_mui_toi_da` (radio: Vững ổn/Không vững ổn),
`huong_dan_can` (text), `ph_cu_tren_mieng` (textarea).

*Phân loại Kennedy (5 fields):*
`kennedy_ham_tren_ban_dau` (select-with-text: Loại I/II/III/IV — text field: biến thể),
`kennedy_ham_tren_sau_dieu_tri` (select-with-text: Loại I/II/III/IV — text field: biến thể),
`kennedy_ham_duoi_ban_dau` (select-with-text: Loại I/II/III/IV — text field: biến thể),
`kennedy_ham_duoi_sau_dieu_tri` (select-with-text: Loại I/II/III/IV — text field: biến thể),
`hinh_the_mau_rang` (text).

**Step 4 — Khám vùng phục hình tháo lắp** (6 fields):
`tuong_quan_hai_ham` (radio: Loại I/II/III),
`tuong_quan_khop_can_tl` (radio-with-other: Tốt/Không tốt — text field: lý do),
`khoang_ph_doc_tl` (radio: Tốt/Ít/Nhiều),
`hinh_the_cung_ham_tren` (radio: Vuông/Bầu dục/Tam giác),
`hinh_the_cung_ham_duoi` (radio: Vuông/Bầu dục/Tam giác),
`song_ham_vung_mat_rang` (textarea).

**Step 5 — Tóm tắt & Chẩn đoán** (2 fields, identical to Cố Định):
`tom_tat_benh_an` (textarea, large), `chan_doan_lam_sang` (textarea, large).

### 2.4 Wizard Component

File: `frontend/src/components/clinical-record/ClinicalRecordWizard.tsx`

Props:
```ts
interface ClinicalRecordWizardProps {
  schemaId: "co-dinh" | "thao-lap";
  initialData?: Record<string, unknown>;
  onSubmit: (data: ClinicalRecordData) => void;
  onCancel: () => void;
}
```

Renders:
1. **Disclaimer banner** at the top: *"Đây là bệnh án giả định cho mục đích học tập.
   Không nhập thông tin bệnh nhân thật."* (muted text, always visible).
2. **Stepper header** — 5 numbered circles with labels, active step highlighted. On mobile,
   uses `shortLabel` to save space.
3. **Form body** — renders fields for the current step using a `WizardStepRenderer` component.
   Fields with `half: true` are placed in a 2-column CSS grid. Field type `dental-chart`
   renders the `DentalChart` component. All `textarea` fields show a hint below:
   *"Không ghi tên/SĐT thật."*
4. **Navigation footer** — "Hủy" (cancel), "Quay lại" (prev step, hidden on step 1),
   "Tiếp theo" (next step) / "Gửi bệnh án" (submit, on step 5).

State managed with `useReducer`:
```ts
interface WizardState {
  currentStep: number;
  data: Record<string, unknown>;
  errors: Record<string, string>;
}
```

**Autosave:** On every step transition ("Tiếp theo" / "Quay lại"), the wizard saves a draft
to localStorage under key `unident_wizard_draft_{schemaId}`. On mount, if a draft exists
for the same `schemaId` and no `initialData` was provided, restore from draft. On successful
submit or explicit cancel, delete the draft.

**Cancel confirmation:** If any field has been filled (data is non-empty), "Hủy" shows a
confirm dialog: *"Bạn có chắc muốn hủy? Dữ liệu đã nhập sẽ được lưu nháp."* — cancel
preserves the draft, confirm navigates away.

Validation: on "Tiếp theo", validate required fields for the current step. Show inline error
messages. Block advancement until errors are resolved.

### 2.5 Serialize Function

File: `frontend/src/lib/clinical-record/serialize.ts`

`serializeClinicalRecord(schema: ClinicalRecordSchema, data: Record<string, unknown>): string`

**Privacy anonymization:** The serialized text sent to the AI **strips PII fields**
(`ho_ten`, `sdt`, `dia_chi`) and replaces them with generic labels. Only age (derived
from `nam_sinh`), `gioi_tinh`, and `nghe_nghiep` are included — these are clinically
relevant and non-identifying. The full data remains in `ClinicalRecordData.data` in
localStorage for the student to review.

**Free-text scrubbing:** Before serializing any `textarea` or `text` field value, apply a
regex pass to redact Vietnamese phone numbers. Strip separators (spaces, dots, dashes) first,
then match `(?:\+?84|0)\d{9,10}` (covers `0901234567`, `090 123 4567`, `090.123.4567`,
`+84901234567`). Replace matches with `[SĐT]`. This is a best-effort safety net — the
primary defense is the UI hint discouraging real data.

**"Răng liên quan (FDI)"** in the serialized header is derived automatically from the
`dental_chart` field: all teeth where `condition !== "normal"`, listed by FDI number.
Note: `Record<number, ToothStatus>` keys become strings after JSON serialization; parse
them back to numbers when reading from localStorage.

Produces structured text sent to the backend:

```
=== BỆNH ÁN PHỤC HÌNH CỐ ĐỊNH ===
Răng liên quan (FDI): 16, 46

[1. HÀNH CHÍNH]
Tuổi: 36 | Giới tính: Nam | Nghề nghiệp: Giáo viên
Ngày khám: 06/10/2026

[2. BỆNH SỬ & KHÁM LÂM SÀNG]
Lý do đến khám: Đau răng 46 khi nhai
...

[3. KHÁM TRONG MIỆNG]
Sơ đồ răng: 16(sâu mặt xa, lộ tủy), 46(mất), 47(nghiêng gần)
...

[4. KHÁM VÙNG PHỤC HÌNH]
...

[5. TÓM TẮT & CHẨN ĐOÁN]
...
```

### 2.6 Persistence

File: `frontend/src/lib/clinical-record/storage.ts`

localStorage key: `unident_clinical_records`.

```ts
export interface ClinicalRecordData {
  id: string;              // crypto.randomUUID()
  schemaId: "co-dinh" | "thao-lap";
  data: Record<string, unknown>;
  serializedText: string;
  createdAt: string;       // ISO date
  updatedAt: string;
  sessionId?: string;      // linked chat session
}
```

Functions: `saveClinicalRecord()`, `getClinicalRecord(id)`, `listClinicalRecords()`,
`deleteClinicalRecord(id)`, `getActiveRecord(sessionId)`.

**No migration** of old `dcs_saved_cases` data — old demo data has no long-term value.
On first load, if the old key exists, delete it. The `/history` page must handle an empty
record list gracefully (show "Chưa có bệnh án nào").

### 2.7 Message Sending Strategy

#### Backend context constraints (design rationale)

The backend `ContextBuilder.build_context()` injects at most `_RECENT_HISTORY_LIMIT = 6`
messages from session history into the LLM prompt. Older messages drop out entirely. The
current user message is passed through un-truncated, but any prior message only survives
in context for ~3 back-and-forth exchanges. A clinical record (2,500-5,000 chars serialized)
would be lost from context after 3 turns if sent as a regular message.

**Consequence:** The clinical record cannot be sent as a regular chat message and relied
upon later. It must travel as a **dedicated context block** injected into every LLM call,
separate from conversation history.

#### Architecture: `clinical_context` field

```ts
// frontend/src/lib/types.ts
export interface ChatRequest {
  message: string;
  mode: "chat" | "agent";
  session_id?: string;
  command?: string;              // slash-command id
  clinical_context?: string;     // condensed clinical summary, ≤600 chars
}
```

The frontend attaches `clinical_context` to **every** `/api/chat` request when an active
clinical record exists — including free-form questions, slash-commands, and `/ket-thuc`.
The backend `ContextBuilder` injects it as a separate `[BỐI CẢNH LÂM SÀNG]` block in the
prompt, outside the 6-message history window, so it persists for the entire session.

#### State machine (simplified)

| Record state | User action | Behavior |
|-------------|-------------|----------|
| No record | Types `/chan-doan` etc. | Toast "Vui lòng tạo bệnh án trước" + open wizard type chooser (not hardcoded to Cố Định) |
| No record | Types `/benh-an-*` | Open wizard |
| Has record | Types `/chan-doan` etc. | Send `message: "Yêu cầu: [label]"` + `clinical_context` + `command` |
| Has record | Free-form question | Send `message: "..."` + `clinical_context` (no `command`) |
| Has record | Edits via badge "Sửa" | Reopen wizard → on submit, update localStorage, next request carries new `clinical_context` |

No `sentRecords` tracking needed. No "already sent" vs "not yet sent" distinction. No
`"⚠️ ĐÃ CẬP NHẬT"` prefix — the AI never sees two versions because `clinical_context`
is always the current snapshot.

#### Wizard submit behavior

When the wizard submits, it **does not send a chat message**. It only:
1. Saves the `ClinicalRecordData` to localStorage.
2. Shows a confirmation bubble in the chat UI: `"📋 Bệnh án [Cố Định|Tháo Lắp] đã được lưu"`
   (local-only, not sent to backend).
3. Sets `activeClinicalRecord` in state.

The record reaches the AI via `clinical_context` on the next actual message or command.

#### `buildClinicalSummary()` — deterministic, not AI-generated

File: `frontend/src/lib/clinical-record/summarize.ts`

```ts
buildClinicalSummary(schema: ClinicalRecordSchema, data: Record<string, unknown>): string
```

Produces a **deterministic** condensed summary (target ≤600 chars) included as
`clinical_context`. Fields extracted, in priority order:

1. **Răng liên quan (FDI):** all teeth with `condition !== "normal"` from `dental_chart`
2. **Tuổi / Giới tính** (derived from `nam_sinh` + `gioi_tinh`)
3. **Bệnh nền** (`benh_nen`)
4. **Lý do khám** (`ly_do_kham`, truncate to 120 chars)
5. **Chẩn đoán lâm sàng** (`chan_doan_lam_sang`, truncate to 200 chars)
6. **Tình trạng nha chu** (`mo_nha_chu_chung`, truncate to 80 chars)
7. For Tháo Lắp: **Phân loại Kennedy** (`kennedy_ham_tren_*`, `kennedy_ham_duoi_*`)

Each field is truncated to its char budget. Total is capped at 600 chars. If over budget,
trim from lowest-priority fields first. PII fields (`ho_ten`, `sdt`, `dia_chi`) are
**never** included.

Unit test requirement: `buildClinicalSummary()` output must be ≤600 chars for any input.

#### Chat bubble display

- Wizard submit: local-only bubble `"📋 Bệnh án Cố Định đã được lưu"` (not a real message).
- Slash-commands: normal user message bubble showing just the instruction text.
- Free-form questions: normal user message bubble. The `clinical_context` is invisible
  in the UI — it's metadata on the request, not part of the displayed message.

---

## 3. Interactive Dental Chart

File: `frontend/src/components/clinical-record/DentalChart.tsx`

### 3.1 Layout

FDI notation grid with 4 quadrants:

```
        Hàm trên (Maxilla)
  18 17 16 15 14 13 12 11 | 21 22 23 24 25 26 27 28
  ────────────────────────┼────────────────────────
  48 47 46 45 44 43 42 41 | 31 32 33 34 35 36 37 38
        Hàm dưới (Mandible)
```

Each tooth is a clickable button (min 36x36px for touch targets).

### 3.2 Per-Tooth Status

Click a tooth → a small popover appears with:
- 6 status options as colored chips: Bình thường (xanh lá), Sâu (đỏ), Mất (xám),
  Phục hình (xanh dương), Lung lay (cam), Cần điều trị (tím).
- A text input for a short note (e.g., "sâu mặt xa, lộ tủy").
- "Xong" button to close the popover.

Teeth with a status show a colored dot indicator below them.

### 3.3 Props Interface

```ts
export interface ToothStatus {
  condition: "normal" | "decay" | "missing" | "restored" | "mobile" | "treatment-needed";
  note?: string;
}

interface DentalChartProps {
  value: Record<number, ToothStatus>;
  onChange: (value: Record<number, ToothStatus>) => void;
  disabled?: boolean;
}
```

### 3.4 Summary Panel

Below the chart grid, a summary lists all annotated teeth:
```
Răng 16: Sâu — sâu mặt xa, lộ tủy
Răng 46: Mất
Răng 47: Cần điều trị — nghiêng gần
```

---

## 4. Homepage & Route Changes

### 4.1 Remove

- `frontend/src/app/page.tsx`: Remove hero card (lines 32-70), scenario section (lines 108-135).
  Replace with a simple welcome + "Bắt đầu chat" CTA linking to `/chat`.
- `frontend/src/app/case/[scenario]/page.tsx`: Delete entire route directory.
- `frontend/src/components/case/`: Delete directory (CaseForm, FormField, FormSection,
  CaseChatPanel, ToothChart).
- `frontend/src/components/home/ScenarioCard.tsx`: Delete.
- `frontend/src/lib/case-schemas.ts`: Delete (replaced by `clinical-record/schemas.ts`).
- `frontend/src/lib/case-storage.ts`: Delete (replaced by `clinical-record/storage.ts`).

### 4.2 Keep

- `/chat` route — unchanged, gains slash-command and wizard functionality via ChatInterface.
- `/history` route — update to display `schemaId` ("Cố Định" / "Tháo Lắp") instead of
  scenario name ("fracture" / "missing"). Read from new `clinical-record/storage.ts`.
- `/quiz` route — unchanged.
- `/progress` route — unchanged.

### 4.3 Clinical Record Badge

File: `frontend/src/components/chat/ClinicalRecordBadge.tsx`

Rendered above the message list inside `ChatInterface` when `activeClinicalRecord` is set.

```
┌─────────────────────────────────────────────────┐
│ 📋 BA Cố Định — Nguyễn Văn A (16, 46)  [Xem] [Sửa] │
└─────────────────────────────────────────────────┘
```

- "Xem": expand/collapse to show a summary of key fields (patient name, teeth, chief complaint,
  diagnosis — read-only).
- "Sửa": reopen the wizard with `initialData` pre-filled, allowing edits at any step.

---

## 5. File Structure

### New files

```
frontend/src/lib/slash-commands/
  types.ts
  registry.ts
  commands.ts

frontend/src/lib/clinical-record/
  types.ts
  schemas.ts         (both co-dinh and thao-lap schemas)
  serialize.ts       (full serialized text for localStorage)
  summarize.ts       (deterministic ≤600 char summary for clinical_context)
  storage.ts

frontend/src/components/chat/
  SlashCommandMenu.tsx
  ClinicalRecordBadge.tsx

frontend/src/components/clinical-record/
  ClinicalRecordWizard.tsx
  WizardStepRenderer.tsx
  DentalChart.tsx
  ToothPopover.tsx
  WizardField.tsx     (renders individual field by type)
```

### Modified files

```
frontend/src/components/chat/ChatInterface.tsx
  — Add slash-command detection, wizard state, clinical record state, badge rendering,
    attach clinical_context to every outgoing ChatRequest

frontend/src/app/page.tsx
  — Remove scenario cards and hero card, simplify to welcome + CTA

frontend/src/app/history/page.tsx (if exists)
  — Update to read from clinical-record/storage.ts, handle empty state

frontend/src/lib/types.ts
  — Add command + clinical_context to ChatRequest, add ClinicalRecordData re-export

app/api/models.py (backend)
  — Add optional command + clinical_context fields to ChatRequest Pydantic model

memory/context_builder.py (backend)
  — Pass clinical_context through build_context() return dict

app/services/chat_mode.py, app/services/react_runner.py (backend)
  — Read clinical_context from context dict, inject [BỐI CẢNH LÂM SÀNG] block in prompt

agents/workflow/nodes/confirm_node.py, think_node.py, answer_node.py (backend)
  — Read clinical_context from state context, inject block in prompt
```

### Deleted files

```
frontend/src/app/case/              (entire directory)
frontend/src/components/case/       (entire directory)
frontend/src/components/home/ScenarioCard.tsx
frontend/src/lib/case-schemas.ts
frontend/src/lib/case-storage.ts
```

---

## 6. Backend Impact

**Two additive fields** on `ChatRequest` and a small `ContextBuilder` change.

### 6.1 ChatRequest changes

```ts
// frontend/src/lib/types.ts
export interface ChatRequest {
  message: string;
  mode: "chat" | "agent";
  session_id?: string;
  command?: string;            // slash-command id, e.g. "chan-doan"
  clinical_context?: string;   // deterministic summary ≤600 chars (see §2.7)
}
```

Both fields are optional. The backend Pydantic model (`api/models.py`) adds them with
`default=None`. Existing clients that omit them are unaffected.

### 6.2 ContextBuilder injection

`ContextBuilder.build_context()` gains one line: if `clinical_context` is non-empty, include
it in the returned dict under key `"clinical_context"`.

Each prompt consumer (`ChatModeRunner._build_prompt`, `ReActRunner._build_step_prompt`,
and the workflow nodes `confirm_node`, `think_node`, `answer_node`) reads
`context.get("clinical_context", "")` and, if non-empty, inserts a block:

```
[BỐI CẢNH LÂM SÀNG]
{clinical_context}
```

This block is placed **before** `[Lịch sử gần đây]` / `NGỮ CẢNH TRƯỚC` and is **not**
counted toward the 6-message history window. It persists for the entire session as long
as the frontend keeps sending it.

### 6.3 Design constraints (documented for implementers)

| Constant | Value | Location | Effect |
|----------|-------|----------|--------|
| `_RECENT_HISTORY_LIMIT` | 6 | `memory/context_builder.py:36` | Only last 6 messages enter the prompt |
| `_MAX_CONTEXT_CHARS` | 2000 | `memory/context_builder.py:30` | Unused in production (`build_prompt_context` is test-only) |
| Current user message | no limit | `api/chat.py` → runners | Passed as-is to LLM |

**Why `clinical_context` must be a separate field:** A clinical record sent as a regular
message drops out of the 6-message window after ~3 exchanges. As a dedicated context block
it survives indefinitely.

The `mode` field (chat/agent) continues to control which runner processes the request.
The existing case study sub-agent (`case_analyst`) in the ADK framework continues to be
routed to by the root agent when the message contains clinical case content.

---

## 7. Testing Strategy

- **Unit tests** (Vitest):
  - Slash-command registry: register, search, getByCategory.
  - **Diacritics-insensitive search:** `"chan doan"` matches `"chẩn đoán"`, `"ke hoach"`
    matches `"kế hoạch"`, `"d"` matches `"đ"`.
  - Serialize function (both schemas): PII fields stripped, age derived correctly.
  - **Phone scrubbing:** `"0901234567"` → `"[SĐT]"`, `"090 123 4567"` → `"[SĐT]"`,
    `"090.123.4567"` → `"[SĐT]"`, `"+84901234567"` → `"[SĐT]"`, `"12345"` left alone.
  - **`buildClinicalSummary` output ≤600 chars** for max-length inputs (all fields filled
    to their limits). Also verify PII never appears in output.
  - Storage CRUD, old key cleanup (`dcs_saved_cases` deleted on first load).
  - Field validation: `nam_sinh` rejects `"abc"`, `"1800"`, `"2030"` (assuming 2026);
    accepts `"1990"`, `"2026"`.
  - Wizard draft autosave/restore cycle.
- **Component tests** (Vitest + Testing Library):
  - SlashCommandMenu keyboard navigation and filtering.
  - **IME guard:** simulated `isComposing=true` event does not trigger Enter-to-select.
  - WizardField rendering for each FieldType (including `radio-with-other`, `select-with-text`).
  - DentalChart click + popover + status assignment. **Mobile layout:** renders two rows
    on viewport ≤ 640px. **Accessibility:** each status shows a letter indicator alongside
    the color.
  - ClinicalRecordBadge expand/collapse.
  - Wizard cancel confirmation dialog when data exists.
- **Integration tests**: Full wizard flow (fill all steps → submit → verify localStorage
  saved, no chat message sent), slash-command → send message → verify `clinical_context`
  attached to request.
- **Backend tests** (pytest): `ContextBuilder.build_context()` includes `clinical_context`
  when provided; prompt consumers inject `[BỐI CẢNH LÂM SÀNG]` block correctly.
- **Manual verification**: Dev server testing of the complete user flow in browser.
