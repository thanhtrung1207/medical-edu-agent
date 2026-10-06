export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "multi-checkbox"
  | "dental-chart"
  | "radio-with-other"
  | "select-with-text";

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  pairedTextLabel?: string;
  required?: boolean;
  half?: boolean;
  visibleWhen?: { fieldId: string; notEquals: string };
}

export interface WizardStep {
  id: string;
  label: string;
  shortLabel: string;
  fields: FieldDef[];
}

export interface ClinicalRecordSchema {
  id: string;
  title: string;
  steps: WizardStep[];
  sampleData?: Record<string, unknown>;
}

export function isFieldVisible(field: FieldDef, data: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  const value = data[field.visibleWhen.fieldId];
  return Boolean(value) && value !== field.visibleWhen.notEquals;
}

// --- Shared step builders ---

const STEP_1_HANH_CHINH: FieldDef[] = [
  { id: "ho_ten", label: "Họ và tên", type: "text", half: true },
  { id: "nam_sinh", label: "Năm sinh", type: "text", half: true, required: true, placeholder: "VD: 1990" },
  { id: "gioi_tinh", label: "Giới tính", type: "radio", half: true, required: true, options: [{ value: "Nam", label: "Nam" }, { value: "Nữ", label: "Nữ" }] },
  { id: "nghe_nghiep", label: "Nghề nghiệp", type: "text", half: true },
  { id: "dia_chi", label: "Địa chỉ", type: "text" },
  { id: "sdt", label: "Số điện thoại", type: "text", half: true },
  { id: "ngay_kham", label: "Ngày khám", type: "text", half: true },
];

const STEP_2_BENH_SU_BASE: FieldDef[] = [
  { id: "ly_do_kham", label: "Lý do đến khám", type: "textarea", required: true },
  { id: "dien_tien_rang", label: "Diễn tiến bệnh răng", type: "textarea" },
  { id: "suc_khoe_chung", label: "Sức khỏe chung", type: "radio", options: [{ value: "Tốt", label: "Tốt" }, { value: "Trung bình", label: "Trung bình" }, { value: "Yếu", label: "Yếu" }] },
  { id: "benh_nen", label: "Bệnh nền", type: "multi-checkbox", options: [{ value: "Tiểu đường", label: "Tiểu đường" }, { value: "THA", label: "THA" }, { value: "Tim mạch", label: "Tim mạch" }, { value: "Khác", label: "Khác" }] },
  { id: "vs_rang_mieng", label: "Vệ sinh răng miệng", type: "radio", options: [{ value: "Tốt", label: "Tốt" }, { value: "TB", label: "TB" }, { value: "Kém", label: "Kém" }] },
  { id: "voi_rang", label: "Vôi răng", type: "radio", options: [{ value: "Không", label: "Không" }, { value: "Ít", label: "Ít" }, { value: "Nhiều", label: "Nhiều" }] },
  { id: "vet_dinh", label: "Vết dính", type: "radio", options: [{ value: "Không", label: "Không" }, { value: "Ít", label: "Ít" }, { value: "Nhiều", label: "Nhiều" }] },
  { id: "can_xung_mat", label: "Cân xứng mặt", type: "text" },
  { id: "ba_tang_mat", label: "Ba tầng mặt", type: "text" },
  { id: "hinh_dang_mat", label: "Hình dạng mặt", type: "radio", options: [{ value: "Vuông", label: "Vuông" }, { value: "Bầu dục", label: "Bầu dục" }, { value: "Tam giác", label: "Tam giác" }] },
  { id: "net_mat_nghieng", label: "Nét mặt nghiêng", type: "radio", options: [{ value: "Thẳng", label: "Thẳng" }, { value: "Nhô", label: "Nhô" }, { value: "Lõm", label: "Lõm" }] },
  { id: "nang_do_moi", label: "Nâng độ môi", type: "radio", options: [{ value: "Có", label: "Có" }, { value: "Không", label: "Không" }] },
  { id: "mo_mem_da_niem", label: "Mô mềm, da niêm", type: "textarea" },
  { id: "tieng_keu_khop", label: "Tiếng kêu khớp", type: "text" },
  { id: "van_dong_ha_ngam", label: "Vận động hạ ngàm", type: "text" },
  { id: "truong_luc_co", label: "Trương lực cơ", type: "radio", options: [{ value: "Bình thường", label: "Bình thường" }, { value: "Mạnh", label: "Mạnh" }, { value: "Yếu", label: "Yếu" }] },
];

const STEP_3_KHAM_TRONG_MIENG_BASE: FieldDef[] = [
  { id: "dental_chart", label: "Sơ đồ răng", type: "dental-chart", required: true },
  { id: "ghi_chu_rang", label: "Ghi chú răng", type: "textarea" },
  { id: "mo_nha_chu_chung", label: "Mô tả nha chu chung", type: "textarea" },
  { id: "sap_xep_ham_tren", label: "Sắp xếp hàm trên", type: "radio", options: [{ value: "Đều", label: "Đều" }, { value: "Lệch lạc", label: "Lệch lạc" }] },
  { id: "sap_xep_ham_duoi", label: "Sắp xếp hàm dưới", type: "radio", options: [{ value: "Đều", label: "Đều" }, { value: "Lệch lạc", label: "Lệch lạc" }] },
  { id: "duong_cong_spee", label: "Đường cong Spee", type: "text" },
  { id: "duong_cong_wilson", label: "Đường cong Wilson", type: "text" },
  { id: "tuong_quan_khop_can", label: "Tương quan khớp cắn", type: "textarea" },
  { id: "can_phu_chia_cheo", label: "Cắn phủ / cắn chéo", type: "text" },
  { id: "long_mui_toi_da", label: "Lồng múi tối đa", type: "radio", options: [{ value: "Vững ổn", label: "Vững ổn" }, { value: "Không vững ổn", label: "Không vững ổn" }] },
  { id: "huong_dan_can", label: "Hướng dẫn cắn (ra trước + sang bên)", type: "text" },
  { id: "ph_cu_tren_mieng", label: "PH cũ trên miệng", type: "textarea" },
];

const STEP_5_TOM_TAT: FieldDef[] = [
  { id: "tom_tat_benh_an", label: "Tóm tắt bệnh án", type: "textarea" },
  { id: "chan_doan_lam_sang", label: "Chẩn đoán lâm sàng", type: "textarea", required: true },
];

// --- Cố Định schema ---

const CO_DINH_STEP_4: FieldDef[] = [
  { id: "do_day_thanh_rang", label: "Độ dày thành răng (4 mặt)", type: "text" },
  { id: "chieu_cao_thanh_rang", label: "Chiều cao thành răng (4 mặt)", type: "text" },
  { id: "khoang_ph_doc", label: "Khoảng PH dọc", type: "text" },
  { id: "khoang_ph_ngang", label: "Khoảng PH ngang", type: "text" },
  { id: "vat_lieu_tai_tao_cu", label: "Vật liệu tái tạo cũ", type: "text" },
  { id: "do_lung_lay", label: "Độ lung lay", type: "select", options: [{ value: "Không", label: "Không" }, { value: "Độ 1", label: "Độ 1" }, { value: "Độ 2", label: "Độ 2" }, { value: "Độ 3", label: "Độ 3" }] },
  { id: "nuou_roi", label: "Nướu rời", type: "text" },
  { id: "do_sau_khe_nuou", label: "Độ sâu khe nướu", type: "text" },
  { id: "chieu_cao_nuou_dinh", label: "Chiều cao nướu dính", type: "text" },
  { id: "rang_doi_dien", label: "Răng đối diện", type: "textarea" },
  { id: "xquang", label: "X-quang", type: "textarea" },
  { id: "ghi_chu_khac", label: "Ghi chú khác", type: "textarea" },
];

export const coDinhSchema: ClinicalRecordSchema = {
  id: "co-dinh",
  title: "Bệnh án Phục Hình Cố Định",
  steps: [
    { id: "hanh-chinh", label: "Hành chính", shortLabel: "HC", fields: STEP_1_HANH_CHINH },
    { id: "benh-su", label: "Bệnh sử & Khám lâm sàng", shortLabel: "BS", fields: STEP_2_BENH_SU_BASE },
    { id: "kham-trong-mieng", label: "Khám trong miệng", shortLabel: "KTM", fields: STEP_3_KHAM_TRONG_MIENG_BASE },
    { id: "kham-vung-ph", label: "Khám vùng phục hình", shortLabel: "KPH", fields: CO_DINH_STEP_4 },
    { id: "tom-tat", label: "Tóm tắt & Chẩn đoán", shortLabel: "TT", fields: STEP_5_TOM_TAT },
  ],
};

// --- Tháo Lắp schema ---

const HAM_GIA_CU_VISIBLE = { fieldId: "ham_gia_cu", notEquals: "Không" };

const THAO_LAP_HAM_GIA_CU: FieldDef[] = [
  { id: "ham_gia_cu", label: "Hàm giả cũ", type: "radio", options: [{ value: "Không", label: "Không" }, { value: "Có HT", label: "Có HT" }, { value: "Có HD", label: "Có HD" }, { value: "Có cả HT+HD", label: "Có cả HT+HD" }] },
  { id: "cach_su_dung", label: "Cách sử dụng", type: "radio", visibleWhen: HAM_GIA_CU_VISIBLE, options: [{ value: "Mang ngày", label: "Mang ngày" }, { value: "Mang ngày đêm", label: "Mang ngày đêm" }, { value: "Ăn không mang", label: "Ăn không mang" }] },
  { id: "ly_do_lam_lai", label: "Lý do làm lại", type: "radio-with-other", visibleWhen: HAM_GIA_CU_VISIBLE, options: [{ value: "Thẩm mỹ", label: "Thẩm mỹ" }, { value: "Chức năng", label: "Chức năng" }, { value: "Khác", label: "Khác" }] },
  { id: "thoi_gian_mang", label: "Thời gian mang", type: "text", visibleWhen: HAM_GIA_CU_VISIBLE },
  { id: "kich_thuoc_doc_can_khop_cu", label: "Kích thước dọc cắn khớp cũ", type: "text", visibleWhen: HAM_GIA_CU_VISIBLE },
  { id: "duong_giua", label: "Đường giữa", type: "text", visibleWhen: HAM_GIA_CU_VISIBLE },
  { id: "tinh_trang_rang_gia", label: "Tình trạng răng giả", type: "text", visibleWhen: HAM_GIA_CU_VISIBLE },
  { id: "tinh_trang_nen_ham_gia", label: "Tình trạng nền hàm giả", type: "text", visibleWhen: HAM_GIA_CU_VISIBLE },
  { id: "can_sang_ben", label: "Cắn sang bên", type: "text", visibleWhen: HAM_GIA_CU_VISIBLE },
  { id: "can_toi", label: "Cắn tới", type: "text", visibleWhen: HAM_GIA_CU_VISIBLE },
  { id: "nhan_xet_ham_gia_cu", label: "Nhận xét hàm giả cũ", type: "textarea", visibleWhen: HAM_GIA_CU_VISIBLE },
  { id: "ky_vong_ham_gia_moi", label: "Kỳ vọng hàm giả mới", type: "textarea", visibleWhen: HAM_GIA_CU_VISIBLE },
];

const THAO_LAP_KENNEDY: FieldDef[] = [
  { id: "kennedy_ham_tren_ban_dau", label: "Kennedy hàm trên (ban đầu)", type: "select-with-text", pairedTextLabel: "Biến thể", options: [{ value: "Loại I", label: "Loại I" }, { value: "Loại II", label: "Loại II" }, { value: "Loại III", label: "Loại III" }, { value: "Loại IV", label: "Loại IV" }] },
  { id: "kennedy_ham_tren_sau_dieu_tri", label: "Kennedy hàm trên (sau điều trị)", type: "select-with-text", pairedTextLabel: "Biến thể", options: [{ value: "Loại I", label: "Loại I" }, { value: "Loại II", label: "Loại II" }, { value: "Loại III", label: "Loại III" }, { value: "Loại IV", label: "Loại IV" }] },
  { id: "kennedy_ham_duoi_ban_dau", label: "Kennedy hàm dưới (ban đầu)", type: "select-with-text", pairedTextLabel: "Biến thể", options: [{ value: "Loại I", label: "Loại I" }, { value: "Loại II", label: "Loại II" }, { value: "Loại III", label: "Loại III" }, { value: "Loại IV", label: "Loại IV" }] },
  { id: "kennedy_ham_duoi_sau_dieu_tri", label: "Kennedy hàm dưới (sau điều trị)", type: "select-with-text", pairedTextLabel: "Biến thể", options: [{ value: "Loại I", label: "Loại I" }, { value: "Loại II", label: "Loại II" }, { value: "Loại III", label: "Loại III" }, { value: "Loại IV", label: "Loại IV" }] },
  { id: "hinh_the_mau_rang", label: "Hình thể mẫu răng", type: "text" },
];

const THAO_LAP_STEP_4: FieldDef[] = [
  { id: "tuong_quan_hai_ham", label: "Tương quan hai hàm", type: "radio", options: [{ value: "Loại I", label: "Loại I" }, { value: "Loại II", label: "Loại II" }, { value: "Loại III", label: "Loại III" }] },
  { id: "tuong_quan_khop_can_tl", label: "Tương quan khớp cắn", type: "radio-with-other", options: [{ value: "Tốt", label: "Tốt" }, { value: "Không tốt", label: "Không tốt" }], pairedTextLabel: "Lý do" },
  { id: "khoang_ph_doc_tl", label: "Khoảng PH dọc", type: "radio", options: [{ value: "Tốt", label: "Tốt" }, { value: "Ít", label: "Ít" }, { value: "Nhiều", label: "Nhiều" }] },
  { id: "hinh_the_cung_ham_tren", label: "Hình thể cung hàm trên", type: "radio", options: [{ value: "Vuông", label: "Vuông" }, { value: "Bầu dục", label: "Bầu dục" }, { value: "Tam giác", label: "Tam giác" }] },
  { id: "hinh_the_cung_ham_duoi", label: "Hình thể cung hàm dưới", type: "radio", options: [{ value: "Vuông", label: "Vuông" }, { value: "Bầu dục", label: "Bầu dục" }, { value: "Tam giác", label: "Tam giác" }] },
  { id: "song_ham_vung_mat_rang", label: "Sống hàm vùng mất răng", type: "textarea" },
];

export const thaoLapSchema: ClinicalRecordSchema = {
  id: "thao-lap",
  title: "Bệnh án Phục Hình Tháo Lắp",
  steps: [
    { id: "hanh-chinh", label: "Hành chính", shortLabel: "HC", fields: STEP_1_HANH_CHINH },
    { id: "benh-su", label: "Bệnh sử, Khám LS & Hàm giả cũ", shortLabel: "BS", fields: [...STEP_2_BENH_SU_BASE, ...THAO_LAP_HAM_GIA_CU] },
    { id: "kham-trong-mieng", label: "Khám trong miệng & Kennedy", shortLabel: "KTM", fields: [...STEP_3_KHAM_TRONG_MIENG_BASE, ...THAO_LAP_KENNEDY] },
    { id: "kham-vung-ph-tl", label: "Khám vùng PH tháo lắp", shortLabel: "KPH", fields: THAO_LAP_STEP_4 },
    { id: "tom-tat", label: "Tóm tắt & Chẩn đoán", shortLabel: "TT", fields: STEP_5_TOM_TAT },
  ],
};

export const SCHEMAS: Record<string, ClinicalRecordSchema> = {
  "co-dinh": coDinhSchema,
  "thao-lap": thaoLapSchema,
};

export function getSchema(id: string): ClinicalRecordSchema {
  const schema = SCHEMAS[id];
  if (!schema) throw new Error(`Unknown schema: ${id}`);
  return schema;
}
