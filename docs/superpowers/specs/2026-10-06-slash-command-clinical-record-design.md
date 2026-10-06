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

- **Frontend-driven slash-command system** with an extensible registry (commands compose
  a structured text message and send it through the existing `/api/chat` endpoint; one
  optional `command` field is added to `ChatRequest` — see §6).
- **Two clinical record schemas** (Phục Hình Cố Định and Phục Hình Tháo Lắp) rendered as
  a 5-step stepper wizard inline in the chat message area.
- **Interactive dental chart** with per-tooth status annotation, replacing the simple
  toggle-only `ToothChart`.
- **Collapsible context badge** above chat messages showing the active clinical record.

## Tech Stack

- Next.js App Router (existing)
- React state + localStorage for clinical record persistence (same pattern as current `case-storage.ts`)
- Tailwind CSS (existing)
- One additive backend change: optional `command` field on `ChatRequest` (see §6)

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
- `search(query: string): SlashCommand[]` — fuzzy match on `id` + `label`
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
| `ket-thuc` | Tóm tắt và lưu case | analysis | true | send-message | — |

The `/ket-thuc` command reuses the existing finish-case flow: sends a summary-request message
to the backend, receives the AI summary, saves the clinical record + summary to localStorage
via `clinical-record/storage.ts`, and navigates to `/history`.

### 1.2 Popup UI

File: `frontend/src/components/chat/SlashCommandMenu.tsx`

Behavior:
- Appears when user types `/` as the first character in the textarea (or `/` preceded only by whitespace).
- Positioned above the textarea input, anchored to the bottom of the chat area.
- Groups commands by `category` with section headers ("Ca lâm sàng", "Phân tích", "Cài đặt").
- Each item shows: icon + label + short description.
- Keyboard: Arrow up/down to navigate, Enter to select, Esc or Backspace-past-`/` to dismiss.
- Typing after `/` filters the list via `registry.search(query)`.
- Click outside = dismiss.

When a command is selected:
- `handler = "form-wizard"`: clear the textarea, mount the `ClinicalRecordWizard` component
  inline in the chat area with the schema identified by `formSchemaId`.
- `handler = "send-message"`: if `requiresClinicalRecord` and no active record exists, show
  a toast "Vui lòng tạo bệnh án trước" and auto-insert `/benh-an-co-dinh` into the textarea.
  Otherwise, send a **short instruction message** (see §2.7 Message Sending Strategy).

### 1.3 Integration with ChatInterface

File: `frontend/src/components/chat/ChatInterface.tsx` (modified)

New state:
- `slashMenuOpen: boolean`
- `slashQuery: string` (characters typed after `/`)
- `activeClinicalRecord: ClinicalRecordData | null` (persisted to localStorage)
- `clinicalRecordSentInSession: boolean` — tracks whether the full serialized text has
  already been sent in the current chat session (reset on page load / session switch)
- `wizardOpen: boolean`
- `wizardSchemaId: string | null`

The existing textarea `onChange` handler gains a check: if the value starts with `/`, open the
slash menu and pass the remainder as `slashQuery`. The textarea is not cleared until a command
is selected.

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

5 steps, 49 fields total:

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

5 steps, 60 fields total. Shares Step 1 and Step 5 with Cố Định. Steps 2–4 extend or
replace the Cố Định equivalents. Every field is listed below — no implicit "same as above".

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
1. **Stepper header** — 5 numbered circles with labels, active step highlighted. On mobile,
   uses `shortLabel` to save space.
2. **Form body** — renders fields for the current step using a `WizardStepRenderer` component.
   Fields with `half: true` are placed in a 2-column CSS grid. Field type `dental-chart`
   renders the `DentalChart` component.
3. **Navigation footer** — "Hủy" (cancel), "Quay lại" (prev step, hidden on step 1),
   "Tiếp theo" (next step) / "Gửi bệnh án" (submit, on step 5).

State managed with `useReducer`:
```ts
interface WizardState {
  currentStep: number;
  data: Record<string, unknown>;
  errors: Record<string, string>;
}
```

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

Migrates old `dcs_saved_cases` data: on first load, if old data exists, convert to new format
and delete old key.

### 2.7 Message Sending Strategy

Sending the full serialized record on every slash-command wastes tokens and creates giant
chat bubbles. Instead:

| Event | What is sent | `command` field |
|-------|-------------|-----------------|
| Wizard submit (first time in session) | Full anonymized serialized text | `"benh-an-co-dinh"` or `"benh-an-thao-lap"` |
| Wizard re-submit after edit ("Sửa") | Full anonymized serialized text (updated) | same |
| `/chan-doan`, `/ke-hoach-dieu-tri`, etc. | `"Yêu cầu: [command label]"` (short string only) | command id |
| Same command, but no record sent yet this session | Auto-redirect: toast + open `/benh-an-co-dinh` | — |

**Why this works:** The backend maintains session history. Once the full record is in the
conversation, subsequent messages can reference it by instruction alone — the AI already
has it in context.

**Chat bubble display:**
- Record submission: compact bubble showing `"📋 Bệnh án Cố Định đã gửi"` with a
  collapsible "Xem chi tiết" toggle (raw text hidden by default).
- Analysis commands: normal user message bubble showing just the instruction text.

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
  serialize.ts
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
  — Add slash-command detection, wizard state, clinical record state, badge rendering

frontend/src/app/page.tsx
  — Remove scenario cards and hero card, simplify to welcome + CTA

frontend/src/app/history/page.tsx (if exists)
  — Update to read from clinical-record/storage.ts

frontend/src/lib/types.ts
  — Update SavedCase type or add ClinicalRecordData re-export
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

**Minimal.** One additive change to `ChatRequest`:

```ts
// frontend/src/lib/types.ts  (existing ChatRequest)
export interface ChatRequest {
  message: string;
  mode: "chat" | "agent";
  session_id?: string;
  command?: string;   // NEW — slash-command id, e.g. "chan-doan"
}
```

The backend `/api/chat` endpoint receives the same structured text messages as before.
The new `command` field is optional and ignored by the current backend — it exists so the
frontend can distinguish "clinical record submission" from "analysis request" without
parsing message text, and so a future backend version can route on it explicitly.

The `mode` field (chat/agent) continues to control which runner processes the request.
The existing case study sub-agent (`case_analyst`) in the ADK framework continues to be
routed to by the root agent when the message contains clinical case content.

---

## 7. Testing Strategy

- **Unit tests** (Vitest): Slash-command registry (register, search, getByCategory),
  serialize function (both schemas), storage CRUD, field validation logic.
- **Component tests** (Vitest + Testing Library): SlashCommandMenu keyboard navigation
  and filtering, WizardField rendering for each FieldType, DentalChart click + popover
  + status assignment, ClinicalRecordBadge expand/collapse.
- **Integration tests**: Full wizard flow (fill all steps → submit → verify serialized output),
  slash-command → wizard → send message → verify chat receives correct text.
- **Manual verification**: Dev server testing of the complete user flow in browser.
