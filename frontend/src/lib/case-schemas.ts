/**
 * Schema-driven form definitions for dental clinical case scenarios.
 * Each scenario defines form sections, fields, sample data, and a buildCaseText
 * serializer that converts form data into a structured text message for the backend.
 */

export type Scenario = 'fracture' | 'missing';

export type FieldType = 'text' | 'textarea' | 'select';

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[]; // for select type
}

export interface FormSection {
  id: string;
  label: string;
  fields: FieldDef[];
}

export interface ScenarioSchema {
  id: Scenario;
  title: string;
  hint: string;
  icon: string; // emoji
  sections: FormSection[];
  sampleData: Record<string, string>;
  sampleTeeth: number[];
}

// ---------------------------------------------------------------------------
// FDI Tooth Arrays (Quadrant notation)
// ---------------------------------------------------------------------------

export const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
export const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
export const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

// ---------------------------------------------------------------------------
// FRACTURE SCHEMA — Răng vỡ / sâu nặng (5 sections, 15 fields)
// ---------------------------------------------------------------------------

export const FRACTURE_SCHEMA: ScenarioSchema = {
  id: 'fracture',
  title: 'Răng vỡ / Sâu nặng',
  hint: 'Đánh giá khả năng phục hồi và phác đồ điều trị cho răng vỡ/sâu nặng.',
  icon: '🦷',
  sections: [
    {
      id: 'patient_info',
      label: 'Thông tin bệnh nhân',
      fields: [
        {
          id: 'f_age',
          label: 'Tuổi / Giới tính',
          type: 'text',
          placeholder: 'VD: 38 tuổi, Nam',
        },
        {
          id: 'f_systemic',
          label: 'Tiền sử toàn thân',
          type: 'textarea',
          placeholder: 'VD: Không có bệnh toàn thân / Tiểu đường...',
        },
      ],
    },
    {
      id: 'fracture_condition',
      label: 'Tình trạng răng tổn thương',
      fields: [
        {
          id: 'f_fracture_type',
          label: 'Loại tổn thương',
          type: 'select',
          options: [
            'Vỡ thân lớn (còn ≥2 thành)',
            'Vỡ thân lớn (còn <2 thành)',
            'Sâu ngà sâu, gần tủy',
            'Vỡ kèm lộ tủy',
            'Mòn răng nặng',
            'Vỡ theo chiều dọc (nghi ngờ)',
          ],
        },
        {
          id: 'f_symptoms',
          label: 'Triệu chứng',
          type: 'textarea',
          placeholder: 'VD: Nhạy cảm lạnh kéo dài, đau khi cắn...',
        },
      ],
    },
    {
      id: 'restorability',
      label: 'Đánh giá khả năng phục hồi',
      fields: [
        {
          id: 'f_pulp_status',
          label: 'Tình trạng tủy',
          type: 'select',
          options: [
            'Sống bình thường',
            'Viêm tủy có hồi phục',
            'Viêm tủy không hồi phục',
            'Tủy hoại tử',
            'Đã lấy tủy',
          ],
        },
        {
          id: 'f_periapical',
          label: 'Quanh chóp',
          type: 'select',
          options: [
            'Bình thường',
            'Viêm quanh chóp cấp',
            'Viêm quanh chóp mãn',
            'U hạt / Nang',
          ],
        },
        {
          id: 'f_remaining',
          label: 'Cấu trúc còn lại',
          type: 'select',
          options: [
            'Trên 50% thân răng',
            '25 - 50% thân răng',
            'Dưới 25% thân răng',
            'Chỉ còn chân răng',
          ],
        },
        {
          id: 'f_ferrule',
          label: 'Ferrule effect',
          type: 'select',
          options: [
            '≥2mm đủ phía ✓',
            '1-2mm một số phía',
            'Dưới 1mm - Không đủ ✗',
          ],
        },
      ],
    },
    {
      id: 'periodontal',
      label: 'Tình trạng nha chu',
      fields: [
        {
          id: 'f_perio_depth',
          label: 'Độ sâu túi / BOP',
          type: 'text',
          placeholder: 'VD: BOP âm, túi 2-3mm toàn bộ',
        },
        {
          id: 'f_bone_loss',
          label: 'Tiêu xương',
          type: 'select',
          options: [
            'Không',
            'Nhẹ dưới 1/3',
            'Trung bình 1/3 - 1/2',
            'Nặng trên 1/2',
          ],
        },
        {
          id: 'f_mobility',
          label: 'Lung lay',
          type: 'select',
          options: ['Không', 'Độ 1', 'Độ 2', 'Độ 3'],
        },
      ],
    },
    {
      id: 'student_thinking',
      label: 'Suy nghĩ sinh viên',
      fields: [
        {
          id: 'f_student_diag',
          label: 'Chẩn đoán sơ bộ',
          type: 'textarea',
        },
        {
          id: 'f_student_plan',
          label: 'Phác đồ dự kiến',
          type: 'textarea',
        },
        {
          id: 'f_student_reason',
          label: 'Lý do lựa chọn',
          type: 'textarea',
        },
        {
          id: 'f_student_doubt',
          label: 'Điểm còn phân vân',
          type: 'textarea',
        },
      ],
    },
  ],
  sampleData: {
    f_age: '38 tuổi, Nam',
    f_systemic: 'Không có bệnh toàn thân. Không dị ứng thuốc.',
    f_fracture_type: 'Vỡ thân lớn (còn ≥2 thành)',
    f_symptoms:
      'Nhạy cảm lạnh kéo dài ~15 giây, không đau tự nhiên. Vỡ do cắn hạt ngô 2 tuần trước.',
    f_pulp_status: 'Viêm tủy không hồi phục',
    f_periapical: 'Bình thường',
    f_remaining: '25 - 50% thân răng',
    f_ferrule: '1-2mm một số phía',
    f_perio_depth: 'BOP âm, túi 2-3mm toàn bộ',
    f_bone_loss: 'Không',
    f_mobility: 'Không',
    f_student_diag: 'Viêm tủy không hồi phục răng 16, vỡ thân lớn',
    f_student_plan: 'Điều trị tủy → trụ intraradicular → mão toàn sứ',
    f_student_reason:
      'Tủy viêm không hồi phục cần lấy tủy, cấu trúc còn ít cần mão bảo vệ',
    f_student_doubt:
      'Có cần đặt trụ intraradicular không? Nên chọn loại mão gì?',
  },
  sampleTeeth: [16],
};

// ---------------------------------------------------------------------------
// MISSING SCHEMA — Mất răng đơn lẻ (6 sections, 17 fields)
// ---------------------------------------------------------------------------

export const MISSING_SCHEMA: ScenarioSchema = {
  id: 'missing',
  title: 'Mất răng đơn lẻ',
  hint: 'Đánh giá chỉ định cấy ghép hoặc phương án thay thế cho khoảng mất răng đơn lẻ.',
  icon: '😶',
  sections: [
    {
      id: 'patient_info',
      label: 'Thông tin bệnh nhân',
      fields: [
        {
          id: 'm_age',
          label: 'Tuổi / Giới tính',
          type: 'text',
          placeholder: 'VD: 45 tuổi, Nữ',
        },
        {
          id: 'm_systemic',
          label: 'Tiền sử toàn thân',
          type: 'textarea',
          placeholder: 'VD: Tiểu đường type 2, HbA1c 7.2%...',
        },
        {
          id: 'm_habits',
          label: 'Thói quen',
          type: 'text',
          placeholder: 'VD: Không hút thuốc, không nghiến răng',
        },
      ],
    },
    {
      id: 'edentulous_space',
      label: 'Khoảng mất răng',
      fields: [
        {
          id: 'm_missing_time',
          label: 'Thời gian sau nhổ',
          type: 'select',
          options: [
            'Mới nhổ (dưới 3 tháng)',
            '3 - 12 tháng',
            '1 - 3 năm',
            'Trên 3 năm',
          ],
        },
        {
          id: 'm_missing_reason',
          label: 'Lý do nhổ răng',
          type: 'select',
          options: [
            'Sâu răng nặng',
            'Bệnh nha chu',
            'Gãy / Vỡ',
            'Thất bại nội nha',
            'Khác',
          ],
        },
      ],
    },
    {
      id: 'bone_tissue',
      label: 'Xương & Mô mềm',
      fields: [
        {
          id: 'm_bone_height',
          label: 'Chiều cao xương',
          type: 'select',
          options: [
            'Trên 10mm ✓',
            '8 - 10mm',
            '5 - 8mm (cân nhắc ghép)',
            'Dưới 5mm (cần ghép)',
          ],
        },
        {
          id: 'm_bone_width',
          label: 'Chiều rộng xương',
          type: 'select',
          options: [
            'Trên 6mm ✓',
            '4 - 6mm',
            'Dưới 4mm (cần ghép)',
            'Chưa đánh giá',
          ],
        },
        {
          id: 'm_soft_tissue',
          label: 'Mô mềm',
          type: 'select',
          options: [
            'Đầy đủ, không cần ghép',
            'Thiếu chiều cao nướu',
            'Thiếu nướu sừng hóa',
            'Cần ghép mô mềm',
          ],
        },
      ],
    },
    {
      id: 'adjacent_occlusion',
      label: 'Răng kề & Khớp cắn',
      fields: [
        {
          id: 'm_adjacent',
          label: 'Tình trạng răng kề',
          type: 'textarea',
          placeholder: 'VD: Răng 35: còn tốt, không sâu...',
        },
        {
          id: 'm_opposing',
          label: 'Răng đối diện',
          type: 'text',
          placeholder: 'VD: Răng 26 còn đủ, không trồi',
        },
        {
          id: 'm_occlusion',
          label: 'Không gian khớp cắn',
          type: 'select',
          options: [
            'Đủ (trên 6mm)',
            'Hạn chế (4 - 6mm)',
            'Thiếu (dưới 4mm)',
          ],
        },
      ],
    },
    {
      id: 'systemic_conditions',
      label: 'Điều kiện toàn thân',
      fields: [
        {
          id: 'm_hygiene',
          label: 'Vệ sinh răng miệng',
          type: 'select',
          options: ['Tốt', 'Trung bình', 'Kém'],
        },
        {
          id: 'm_diabetes',
          label: 'Tiểu đường',
          type: 'select',
          options: [
            'Không',
            'Có - KS tốt (HbA1c dưới 7%)',
            'Có - KS tương đối (7-8%)',
            'Có - không kiểm soát',
          ],
        },
        {
          id: 'm_smoking',
          label: 'Hút thuốc lá',
          type: 'select',
          options: [
            'Không hút',
            'Đã bỏ thuốc',
            'Dưới 10 điếu/ngày',
            '≥10 điếu/ngày',
          ],
        },
      ],
    },
    {
      id: 'student_thinking',
      label: 'Suy nghĩ sinh viên',
      fields: [
        {
          id: 'm_student_plan',
          label: 'Phương án dự kiến',
          type: 'select',
          options: [
            'Implant (ưu tiên)',
            'Cầu răng cố định (FPD)',
            'Hàm tháo lắp một phần (RPD)',
            'Kết hợp các phương án',
            'Chưa quyết định',
          ],
        },
        {
          id: 'm_student_reason',
          label: 'Lý do lựa chọn',
          type: 'textarea',
        },
        {
          id: 'm_student_doubt',
          label: 'Điểm còn phân vân',
          type: 'textarea',
        },
      ],
    },
  ],
  sampleData: {
    m_age: '45 tuổi, Nữ',
    m_systemic: 'Tiểu đường type 2, HbA1c 7.2%. Đang điều trị Metformin.',
    m_habits: 'Không hút thuốc, không nghiến răng',
    m_missing_time: '3 - 12 tháng',
    m_missing_reason: 'Sâu răng nặng',
    m_bone_height: 'Trên 10mm ✓',
    m_bone_width: '4 - 6mm',
    m_soft_tissue: 'Đầy đủ, không cần ghép',
    m_adjacent:
      'Răng 35: còn tốt, không sâu, tủy sống, không lung lay. Răng 37: còn tốt tương tự.',
    m_opposing: 'Răng 26 còn đủ, không trồi',
    m_occlusion: 'Đủ (trên 6mm)',
    m_hygiene: 'Trung bình',
    m_diabetes: 'Có - KS tương đối (7-8%)',
    m_smoking: 'Không hút',
    m_student_plan: 'Implant (ưu tiên)',
    m_student_reason:
      'Không muốn mài 2 răng kề khỏe, implant là tiêu chuẩn vàng',
    m_student_doubt:
      'Tiểu đường HbA1c 7.2% có đặt implant được không? Xương rộng 5mm có đủ không?',
  },
  sampleTeeth: [36],
};

// ---------------------------------------------------------------------------
// Scenario Registry
// ---------------------------------------------------------------------------

export const SCENARIO_REGISTRY: Record<string, ScenarioSchema> = {
  fracture: FRACTURE_SCHEMA,
  missing: MISSING_SCHEMA,
};

// ---------------------------------------------------------------------------
// buildCaseText — serialize form data into a structured text message
// ---------------------------------------------------------------------------

export function buildCaseText(
  scenario: Scenario,
  formData: Record<string, string>,
  selectedTeeth: number[],
): string {
  const title =
    scenario === 'fracture' ? 'RĂNG VỠ / SÂU NẶNG' : 'MẤT RĂNG ĐƠN LẺ';
  let text = `=== CA LÂM SÀNG: ${title} ===\n`;
  text += `Răng liên quan (FDI): ${
    selectedTeeth.length ? selectedTeeth.join(', ') : 'Chưa chọn'
  }\n\n`;

  const schema = SCENARIO_REGISTRY[scenario];
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const value = formData[field.id];
      if (value && value.trim()) {
        text += `${field.label}: ${value}\n`;
      }
    }
  }
  return text;
}
