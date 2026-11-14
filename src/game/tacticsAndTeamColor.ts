import {
  CLUB_LICENSE_REGISTRY,
  PLAYER_TEMPLATES,
  PLAYER_TEMPLATE_MAP,
  VIETNAM_CLUB_CODES,
} from './catalog';
import { FormationCode, OwnedCard, PositionCode, SeasonCode } from './types';

export type LineGroup = 'ATT' | 'MID' | 'DEF' | 'GK';

export interface FormationSlotSpec {
  slotIndex: number;
  roleLabel: string;
  naturalPos: PositionCode;
  lineGroup: LineGroup;
  rowIndex: number;
}

export type FormationFamily = '4B' | '3B' | '5B';

export interface FormationDefinition {
  code: FormationCode;
  family: FormationFamily;
  title: string;
  styleTag: string;
  description: string;
  slots: FormationSlotSpec[];
}

export interface AssignedFormationSlot {
  slot: FormationSlotSpec;
  card: OwnedCard;
  isNaturalFit: boolean;
}

export const ALL_FORMATIONS: readonly FormationCode[] = [
  '4-3-3',
  '4-2-3-1',
  '4-2-2-2',
  '4-1-2-1-2',
  '4-1-2-1-2-W',
  '4-1-2-3',
  '4-2-1-3',
  '4-4-2',
  '4-4-2-H',
  '4-4-1-1',
  '4-3-2-1',
  '4-1-4-1',
  '4-3-1-2',
  '4-2-4',
  '3-5-2',
  '3-4-3',
  '3-4-1-2',
  '3-4-2-1',
  '5-2-3',
  '5-3-2',
  '5-2-1-2',
  '5-4-1',
] as const;

export function isValidFormationCode(val: unknown): val is FormationCode {
  return typeof val === 'string' && (ALL_FORMATIONS as readonly string[]).includes(val);
}

export const FORMATION_CATALOG: Record<FormationCode, FormationDefinition> = {
  '4-3-3': {
    code: '4-3-3',
    family: '4B',
    title: '4-3-3 Tấn Công Biên',
    styleTag: 'Cân bằng · Leo biên tốc độ',
    description: 'Ba mũi nhọn LW – ST – RW phối hợp cùng bộ ba tiền vệ trung tâm kiểm soát tuyến giữa.',
    slots: [
      { slotIndex: 0, roleLabel: 'LW', naturalPos: 'LW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'RW', naturalPos: 'RW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 3, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'CM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 5, roleLabel: 'RCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 3 },
    ],
  },
  '4-2-3-1': {
    code: '4-2-3-1',
    family: '4B',
    title: '4-2-3-1 Kiểm Soát Hiện Đại',
    styleTag: 'Meta Xếp Hạng · 2 CDM che chắn',
    description: 'Cặp tiền vệ trụ LDM – RDM bọc lót vững chắc phía sau bộ ba hộ công LAM – CAM – RAM.',
    slots: [
      { slotIndex: 0, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'LAM', naturalPos: 'LW', lineGroup: 'ATT', rowIndex: 1 },
      { slotIndex: 2, roleLabel: 'CAM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'RAM', naturalPos: 'RW', lineGroup: 'ATT', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'LDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-2-2-2': {
    code: '4-2-2-2',
    family: '4B',
    title: '4-2-2-2 Meta Quốc Dân PC',
    styleTag: 'Song sát LS/RS · Bật tường nhanh',
    description: 'Sơ đồ giải đấu chuyên nghiệp FC Online với 2 tiền đạo cắm và 2 hộ công dạt biên linh hoạt.',
    slots: [
      { slotIndex: 0, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'LAM', naturalPos: 'LW', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'RAM', naturalPos: 'RW', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'LDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-1-2-1-2': {
    code: '4-1-2-1-2',
    family: '4B',
    title: '4-1-2-1-2 Kim Cương Hẹp',
    styleTag: 'Tiki-Taka · Áp đảo trung tuyến',
    description: 'Khối kim cương trung lộ CDM – LCM/RCM – CAM chọc khe sắc bén cho cặp tiền đạo LS – RS.',
    slots: [
      { slotIndex: 0, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'CAM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 4, roleLabel: 'CDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-1-2-1-2-W': {
    code: '4-1-2-1-2-W',
    family: '4B',
    title: '4-1-2-1-2 Kim Cương Rộng',
    styleTag: 'Đôi cánh LM/RM · Chọc khe & tạt biên',
    description: 'Biến thể kim cương mở rộng biên với cặp LM – RM tốc độ kéo giãn hàng thủ đối phương.',
    slots: [
      { slotIndex: 0, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'CAM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'LM', naturalPos: 'LW', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 4, roleLabel: 'CDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RM', naturalPos: 'RW', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-1-2-3': {
    code: '4-1-2-3',
    family: '4B',
    title: '4-1-2-3 Tổng Lực Pressing',
    styleTag: 'Sút xa · Đè sân tầm cao',
    description: 'Một mỏ neo CDM giữ nhịp cho cặp tiền vệ công dâng cao hỗ trợ tam tấu hàng tiền đạo.',
    slots: [
      { slotIndex: 0, roleLabel: 'LW', naturalPos: 'LW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'RW', naturalPos: 'RW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 3, roleLabel: 'LCM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'RCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 5, roleLabel: 'CDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-2-1-3': {
    code: '4-2-1-3',
    family: '4B',
    title: '4-2-1-3 Phản Công Tốc Độ',
    styleTag: 'Chuyển trạng thái nhanh · Phá bẫy việt vị',
    description: 'Kết hợp 2 tiền vệ phòng ngự LDM/RDM với nhạc trưởng CAM phất bóng dài cho 3 tiền đạo.',
    slots: [
      { slotIndex: 0, roleLabel: 'LW', naturalPos: 'LW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'RW', naturalPos: 'RW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 3, roleLabel: 'CAM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'LDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-4-2': {
    code: '4-4-2',
    family: '4B',
    title: '4-4-2 Cổ Điển Anh Quốc',
    styleTag: 'Tạt cánh đánh đầu · Hai khối 4 người',
    description: 'Hai tuyến 4 người kỷ luật kết hợp cặp tiền vệ cánh LM – RM tạt sớm cho bộ đôi LS – RS.',
    slots: [
      { slotIndex: 0, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'LM', naturalPos: 'LW', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'RCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 5, roleLabel: 'RM', naturalPos: 'RW', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 3 },
    ],
  },
  '4-4-2-H': {
    code: '4-4-2-H',
    family: '4B',
    title: '4-4-2 Giữ Nhịp (2 CDM)',
    styleTag: 'Chắc chắn trung lộ · Phản công biên',
    description: 'Biến thể 4-4-2 lùi cặp tiền vệ trung tâm thành LDM – RDM khóa chặt khu vực trước vòng cấm.',
    slots: [
      { slotIndex: 0, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'LM', naturalPos: 'LW', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'RM', naturalPos: 'RW', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'LDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-4-1-1': {
    code: '4-4-1-1',
    family: '4B',
    title: '4-4-1-1 Hộ Công Số 10',
    styleTag: 'CF làm tường · Tuyến hai băng cắt',
    description: 'Tiền đạo lùi CF kết nối giữa khối 4 tiền vệ và mũi nhọn ST cắm cao nhất.',
    slots: [
      { slotIndex: 0, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'CF', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 1 },
      { slotIndex: 2, roleLabel: 'LM', naturalPos: 'LW', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 3, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 4, roleLabel: 'RCM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RM', naturalPos: 'RW', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-3-2-1': {
    code: '4-3-2-1',
    family: '4B',
    title: '4-3-2-1 Cây Thông Ancelotti',
    styleTag: 'Cặp hộ công LF/RF · Đột phá trung lộ',
    description: 'Sơ đồ Cây Thông trứ danh với bộ đôi LF – RF bó trong phối hợp tam giác cùng ST.',
    slots: [
      { slotIndex: 0, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'LF', naturalPos: 'LW', lineGroup: 'ATT', rowIndex: 1 },
      { slotIndex: 2, roleLabel: 'RF', naturalPos: 'RW', lineGroup: 'ATT', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 4, roleLabel: 'CM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-1-4-1': {
    code: '4-1-4-1',
    family: '4B',
    title: '4-1-4-1 Kiểm Soát Bóng Toàn Diện',
    styleTag: 'Mỏ neo CDM · Khóa chặt hành lang trong',
    description: 'Một CDM đơn độc bọc lót phía sau dàn 4 tiền vệ giăng ngang giàu sức sáng tạo.',
    slots: [
      { slotIndex: 0, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'LM', naturalPos: 'LW', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 2, roleLabel: 'LCM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'RCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'RM', naturalPos: 'RW', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 5, roleLabel: 'CDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-3-1-2': {
    code: '4-3-1-2',
    family: '4B',
    title: '4-3-1-2 Đột Phá Trung Lộ',
    styleTag: '3 CM cơ động · Nhạc trưởng CAM',
    description: 'Tập trung quân số dày đặc ở trục dọc sân với bộ ba tiền vệ hỗ trợ CAM và cặp LS – RS.',
    slots: [
      { slotIndex: 0, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'CAM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 4, roleLabel: 'CM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '4-2-4': {
    code: '4-2-4',
    family: '4B',
    title: '4-2-4 Siêu Tấn Công Tổng Lực',
    styleTag: '4 Tiền đạo · Dồn ép nghẹt thở',
    description: 'Bốn mũi giáp công LW – LS – RS – RW tràn sang phần sân đối phương tìm bàn thắng sớm.',
    slots: [
      { slotIndex: 0, roleLabel: 'LW', naturalPos: 'LW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 3, roleLabel: 'RW', naturalPos: 'RW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 4, roleLabel: 'LCM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 5, roleLabel: 'RCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 6, roleLabel: 'LB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 9, roleLabel: 'RB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 3 },
    ],
  },
  '3-5-2': {
    code: '3-5-2',
    family: '3B',
    title: '3-5-2 Kiểm Soát 5 Tiền Vệ',
    styleTag: '3 Trung vệ · Áp đảo tuyến giữa',
    description: 'Ba trung vệ dập kèm người hỗ trợ 5 tiền vệ cơ động bọc lót cả công lẫn thủ.',
    slots: [
      { slotIndex: 0, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'CAM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'LM', naturalPos: 'LW', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 4, roleLabel: 'LDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'RM', naturalPos: 'RW', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'CB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '3-4-3': {
    code: '3-4-3',
    family: '3B',
    title: '3-4-3 Đôi Cánh Dâng Cao',
    styleTag: '3 Trung vệ · Dồn ép biên toàn diện',
    description: 'Tối đa hỏa lực tấn công biên và trung lộ với 3 tiền đạo và 4 tiền vệ dàn ngang.',
    slots: [
      { slotIndex: 0, roleLabel: 'LW', naturalPos: 'LW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'RW', naturalPos: 'RW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 3, roleLabel: 'LM', naturalPos: 'LB', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 5, roleLabel: 'RCM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 6, roleLabel: 'RM', naturalPos: 'RB', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 8, roleLabel: 'CB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 9, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 3 },
    ],
  },
  '3-4-1-2': {
    code: '3-4-1-2',
    family: '3B',
    title: '3-4-1-2 Song Sát & Hộ Công',
    styleTag: 'CAM kiến thiết · 2 Tiền đạo cắm',
    description: 'Biến thể 3 trung vệ giàu tính đột biến với nhạc trưởng CAM tiếp đạn cho cặp LS – RS.',
    slots: [
      { slotIndex: 0, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'CAM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'LM', naturalPos: 'LW', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 4, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RCM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'RM', naturalPos: 'RW', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'CB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '3-4-2-1': {
    code: '3-4-2-1',
    family: '3B',
    title: '3-4-2-1 Pressing Hiện Đại',
    styleTag: 'Cặp LF/RF bó trong · Cánh cơ động',
    description: 'Hai hộ công LF – RF khai thác nách trung vệ đối phương cùng đôi cánh LM – RM lên công về thủ.',
    slots: [
      { slotIndex: 0, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'LF', naturalPos: 'LW', lineGroup: 'ATT', rowIndex: 1 },
      { slotIndex: 2, roleLabel: 'RF', naturalPos: 'RW', lineGroup: 'ATT', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'LM', naturalPos: 'LB', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 4, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'RCM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'RM', naturalPos: 'RB', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 7, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'CB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '5-2-3': {
    code: '5-2-3',
    family: '5B',
    title: '5-2-3 Phòng Ngự Phản Công',
    styleTag: '5 Hậu vệ · Wing-back thần tốc',
    description: 'Hệ thống 3 trung vệ cùng cặp Wing-back LWB – RWB khóa chặt khung thành và phóng lao phản công.',
    slots: [
      { slotIndex: 0, roleLabel: 'LW', naturalPos: 'LW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'RW', naturalPos: 'RW', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 3, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'RCM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 5, roleLabel: 'LWB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 7, roleLabel: 'CB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 9, roleLabel: 'RWB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 3 },
    ],
  },
  '5-3-2': {
    code: '5-3-2',
    family: '5B',
    title: '5-3-2 Bê Tông Catenaccio',
    styleTag: '3 Trung vệ + CDM · Phản công 2 mũi nhọn',
    description: 'Khối phòng ngự 5 người kết hợp bộ 3 tiền vệ trung tâm tạo bức tường thép trước cầu môn.',
    slots: [
      { slotIndex: 0, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'CDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'RCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 5, roleLabel: 'LWB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 7, roleLabel: 'CB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 9, roleLabel: 'RWB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 3 },
    ],
  },
  '5-2-1-2': {
    code: '5-2-1-2',
    family: '5B',
    title: '5-2-1-2 Meta Giải Đấu FC Online',
    styleTag: 'Chắc chắn · CAM chọc khe cho LS/RS',
    description: 'Sơ đồ thực dụng bậc nhất giải đấu chuyên nghiệp với 5 hậu vệ, 2 trụ và CAM tỉa bóng.',
    slots: [
      { slotIndex: 0, roleLabel: 'LS', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'RS', naturalPos: 'CF', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 2, roleLabel: 'CAM', naturalPos: 'CAM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'LDM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 4, roleLabel: 'RDM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 2 },
      { slotIndex: 5, roleLabel: 'LWB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 6, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 7, roleLabel: 'CB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 9, roleLabel: 'RWB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 3 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 4 },
    ],
  },
  '5-4-1': {
    code: '5-4-1',
    family: '5B',
    title: '5-4-1 Tử Thủ Phản Kích',
    styleTag: 'Khối 5-4 kín kẽ · Bóng dài lên ST',
    description: 'Hai lớp phòng ngự 5 hậu vệ và 4 tiền vệ bịt kín mọi khoảng trống, chờ thời cơ phản đòn.',
    slots: [
      { slotIndex: 0, roleLabel: 'ST', naturalPos: 'ST', lineGroup: 'ATT', rowIndex: 0 },
      { slotIndex: 1, roleLabel: 'LM', naturalPos: 'LW', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 2, roleLabel: 'LCM', naturalPos: 'CM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 3, roleLabel: 'RCM', naturalPos: 'CDM', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 4, roleLabel: 'RM', naturalPos: 'RW', lineGroup: 'MID', rowIndex: 1 },
      { slotIndex: 5, roleLabel: 'LWB', naturalPos: 'LB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 6, roleLabel: 'LCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 7, roleLabel: 'CB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 8, roleLabel: 'RCB', naturalPos: 'CB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 9, roleLabel: 'RWB', naturalPos: 'RB', lineGroup: 'DEF', rowIndex: 2 },
      { slotIndex: 10, roleLabel: 'GK', naturalPos: 'GK', lineGroup: 'GK', rowIndex: 3 },
    ],
  },
};

function getCardLineGroup(pos: PositionCode): LineGroup {
  if (pos === 'GK') return 'GK';
  if (pos === 'ST' || pos === 'CF' || pos === 'LW' || pos === 'RW') return 'ATT';
  if (pos === 'CAM' || pos === 'CM' || pos === 'CDM') return 'MID';
  return 'DEF';
}

function slotFillPriority(slot: FormationSlotSpec): number {
  if (slot.lineGroup === 'GK') return 0;
  if (slot.naturalPos === 'LB' || slot.naturalPos === 'RB') return 1;
  if (slot.naturalPos === 'CB') return 2;
  if (slot.naturalPos === 'CDM') return 3;
  if (slot.naturalPos === 'LW' || slot.naturalPos === 'RW') return 4;
  if (slot.naturalPos === 'CAM' || slot.naturalPos === 'CM') return 5;
  return 6;
}

export function computePositionAffinity(
  cardPos: PositionCode,
  slot: FormationSlotSpec
): {
  bonus: number;
  isNaturalFit: boolean;
} {
  if (slot.lineGroup === 'GK') {
    return cardPos === 'GK'
      ? { bonus: 600, isNaturalFit: true }
      : { bonus: -600, isNaturalFit: false };
  }
  if (cardPos === 'GK') {
    return { bonus: -600, isNaturalFit: false };
  }
  if (cardPos === slot.naturalPos) {
    return { bonus: 150, isNaturalFit: true };
  }

  // Wide midfielders LM / RM naturally accept both wingers (LW/RW) and fullbacks/wingbacks (LB/RB)
  if (slot.roleLabel === 'LM') {
    if (cardPos === 'LW' || cardPos === 'LB') return { bonus: 130, isNaturalFit: true };
    if (cardPos === 'RW' || cardPos === 'RB') return { bonus: 110, isNaturalFit: true };
  }
  if (slot.roleLabel === 'RM') {
    if (cardPos === 'RW' || cardPos === 'RB') return { bonus: 130, isNaturalFit: true };
    if (cardPos === 'LW' || cardPos === 'LB') return { bonus: 110, isNaturalFit: true };
  }

  // Strict FC Online natural secondary position pairs (no forwards in defense, no CBs stealing fullback/striker)
  const closePairs: Record<PositionCode, PositionCode[]> = {
    ST: ['CF'],
    CF: ['ST', 'CAM'],
    LW: ['RW', 'CF'],
    RW: ['LW', 'CF'],
    CAM: ['CM', 'CF'],
    CM: ['CAM', 'CDM'],
    CDM: ['CM'],
    CB: [],
    LB: ['RB'],
    RB: ['LB'],
    GK: [],
  };

  if (closePairs[slot.naturalPos]?.includes(cardPos)) {
    return { bonus: 95, isNaturalFit: true };
  }

  // Emergency same-line or tactical-adjacent cover (marked Trái sở trường)
  if (slot.naturalPos === 'CB' && (cardPos === 'CDM' || cardPos === 'LB' || cardPos === 'RB')) {
    return { bonus: 40, isNaturalFit: false };
  }
  if ((slot.naturalPos === 'LB' || slot.naturalPos === 'RB') && cardPos === 'CB') {
    return { bonus: 35, isNaturalFit: false };
  }
  if (getCardLineGroup(cardPos) === slot.lineGroup) {
    return { bonus: 35, isNaturalFit: false };
  }

  const cardGroup = getCardLineGroup(cardPos);
  if (
    (cardGroup === 'MID' && (slot.lineGroup === 'ATT' || slot.lineGroup === 'DEF')) ||
    (slot.lineGroup === 'MID' && (cardGroup === 'ATT' || cardGroup === 'DEF'))
  ) {
    return { bonus: -35, isNaturalFit: false };
  }

  return { bonus: -120, isNaturalFit: false };
}

export function buildFormationLineup(
  cards: OwnedCard[],
  formationCode: FormationCode = '4-3-3',
  preferredSlotUids?: string[]
): {
  formation: FormationDefinition;
  slots: AssignedFormationSlot[];
  rows: AssignedFormationSlot[][];
  starterUids: string[];
  totalSalary: number;
} {
  const formation = FORMATION_CATALOG[formationCode] ?? FORMATION_CATALOG['4-3-3'];
  if (cards.length === 0) {
    return {
      formation,
      slots: [],
      rows: [],
      starterUids: [],
      totalSalary: 0,
    };
  }

  const cardByUid = new Map<string, OwnedCard>();
  for (const c of cards) {
    cardByUid.set(c.uid, c);
  }

  const assignedMap = new Map<number, AssignedFormationSlot>();
  const usedUids = new Set<string>();

  // 1. Honor explicit manager slot placements first (if valid and unique)
  if (Array.isArray(preferredSlotUids) && preferredSlotUids.length > 0) {
    for (let sIdx = 0; sIdx < formation.slots.length; sIdx++) {
      const uid = preferredSlotUids[sIdx];
      if (!uid || usedUids.has(uid)) continue;
      const card = cardByUid.get(uid);
      if (!card) continue;
      const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
      const fit = tpl
        ? computePositionAffinity(tpl.position, formation.slots[sIdx])
        : { bonus: 0, isNaturalFit: false };
      usedUids.add(uid);
      assignedMap.set(sIdx, {
        slot: formation.slots[sIdx],
        card,
        isNaturalFit: fit.isNaturalFit,
      });
    }
  }

  // Sort remaining unused cards by OVR desc, then valueBp desc
  const sortedRemaining = [...cards]
    .filter((c) => !usedUids.has(c.uid))
    .sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp);

  // 2. Order unfilled slots by specialist scarcity (GK -> LB/RB -> CB -> CDM -> LW/RW -> CAM/CM -> ST/CF)
  const unfilledSlots = formation.slots
    .filter((s) => !assignedMap.has(s.slotIndex))
    .sort((a, b) => slotFillPriority(a) - slotFillPriority(b) || a.slotIndex - b.slotIndex);

  for (const slot of unfilledSlots) {
    if (sortedRemaining.length === 0) break;

    let bestIdx = 0;
    let bestScore = -Infinity;
    let bestNatural = false;

    for (let i = 0; i < sortedRemaining.length; i++) {
      const cand = sortedRemaining[i];
      const tpl = PLAYER_TEMPLATE_MAP[cand.templateId];
      const fit = tpl
        ? computePositionAffinity(tpl.position, slot)
        : { bonus: 0, isNaturalFit: false };
      const score = cand.ovr + fit.bonus;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestNatural = fit.isNaturalFit;
      }
    }

    const chosen = sortedRemaining.splice(bestIdx, 1)[0];
    usedUids.add(chosen.uid);
    assignedMap.set(slot.slotIndex, {
      slot,
      card: chosen,
      isNaturalFit: bestNatural,
    });
  }

  const slots = formation.slots
    .map((s) => assignedMap.get(s.slotIndex))
    .filter((entry): entry is AssignedFormationSlot => Boolean(entry));

  const rowMap = new Map<number, AssignedFormationSlot[]>();
  for (const assigned of slots) {
    const r = assigned.slot.rowIndex;
    const arr = rowMap.get(r) ?? [];
    arr.push(assigned);
    rowMap.set(r, arr);
  }
  const rows = Array.from(rowMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, items]) => items);

  const totalSalary = slots.reduce((sum, item) => {
    const tpl = PLAYER_TEMPLATE_MAP[item.card.templateId];
    return sum + (tpl ? tpl.salary : 25);
  }, 0);

  return {
    formation,
    slots,
    rows,
    starterUids: slots.map((s) => s.card.uid),
    totalSalary,
  };
}

export function swapFormationSlots(
  currentStarterUids: string[],
  slotIndex: number,
  incomingCardUid: string
): string[] {
  const next = [...currentStarterUids];
  if (slotIndex < 0 || slotIndex >= next.length) return next;
  const existingIdx = next.indexOf(incomingCardUid);
  if (existingIdx >= 0) {
    const temp = next[slotIndex];
    next[slotIndex] = next[existingIdx];
    next[existingIdx] = temp;
    return next;
  }
  next[slotIndex] = incomingCardUid;
  return next;
}

// ============================================================================
// COMPLETE FC ONLINE TEAM COLOR SYSTEM (ALL VN CLUBS + WORLD CLUBS + NATIONS + GRADES/SEASONS)
// ============================================================================

export type TeamColorCategory = 'VN_CLUB' | 'INTL_CLUB' | 'NATION' | 'SPECIAL';

export interface TeamColorDefinition {
  id: string;
  name: string;
  shortLabel: string;
  category: TeamColorCategory;
  subtitle: string;
  clubCode?: string;
  nationCode?: string;
  seasonCode?: SeasonCode;
  minGrade?: number;
  maxGrade?: number;
  maxOvrBonus: number;
  statBuffs: [string, string, string];
  marketKeyword: string;
}

export interface EvaluatedTeamColorBadge {
  teamColor: TeamColorDefinition;
  matchedCount: number;
  tierLevel: 1 | 2 | 3 | 4;
  ovrBonus: number;
  isSelectedPrimary: boolean;
}

export interface CardTeamColorBonus {
  bonusOvr: number;
  activeLabels: string[];
  statBuffs: string[];
}

export interface SquadTeamColorEvaluation {
  selectedTeamColor: TeamColorDefinition | null;
  activeBadges: EvaluatedTeamColorBadge[];
  cardBonusMap: Record<string, CardTeamColorBonus>;
  baseAvgOvr: number;
  boostedAvgOvr: number;
  totalBoostedStarters: number;
}

/**
 * Authentic FC Online career club histories (cầu thủ từng khoác áo CLB trong sự nghiệp)
 * covering Vietnamese stars & International ICONs/Superstars so club Team Colors work authentically.
 */
export const PLAYER_CAREER_CLUBS: Record<string, readonly string[]> = {
  // --- 26 VIETNAM BEST & VIETNAMESE STARS ---
  'Nguyễn Quang Hải': ['CAH', 'HAN', 'SGN', 'VNM', 'VB26'],
  'Nguyễn Hoàng Đức': ['NBI', 'VTL', 'VNM', 'VB26'],
  'Đỗ Hoàng Hên': ['NDI', 'BND', 'SHB', 'DNG', 'HAG', 'VNM', 'VB26'],
  'Nguyễn Đình Bắc': ['CAH', 'QNA', 'VNM', 'VB26'],
  'Lê Huỳnh Đức': ['VB26', 'CAT', 'DNG', 'HCM', 'VNM'],
  'Nguyễn Xuân Son': ['NDI', 'DNG', 'BND', 'VNM', 'VB26'],
  'Nguyễn Hai Long': ['HAN', 'TQN', 'HPH', 'VNM', 'VB26'],
  'Trần Trung Kiên': ['HAG', 'VNM', 'VB26'],
  'Khuất Văn Khang': ['VTL', 'VNM', 'VB26'],
  'Phạm Tuấn Hải': ['HAN', 'HLH', 'PTH', 'VNM', 'VB26'],
  'Quế Ngọc Hải': ['BBD', 'SLN', 'VTL', 'THO', 'VNM', 'VB26'],
  'Trần Đình Trọng': ['CAH', 'HAN', 'BND', 'SGN', 'VNM', 'VB26'],
  'Đỗ Hùng Dũng': ['HAN', 'SGN', 'VNM', 'VB26'],
  'Đỗ Duy Mạnh': ['HAN', 'VNM', 'VB26'],
  'Bùi Hoàng Việt Anh': ['CAH', 'HAN', 'HLH', 'VNM', 'VB26'],
  'Đoàn Văn Hậu': ['CAH', 'HAN', 'VNM', 'VB26'],
  'Phạm Đức Huy': ['NDI', 'HAN', 'BBD', 'HPH', 'VNM', 'VB26'],
  'Nguyễn Văn Trường': ['HAN', 'HYE', 'VNM', 'VB26'],
  'Bùi Tấn Trường': ['VB26', 'DTH', 'BBD', 'HAN', 'BPH', 'CTH', 'SGN', 'VNM'],
  'Nguyễn Thanh Bình': ['VTL', 'BND', 'VNM', 'VB26'],
  'Lê Công Vinh': ['SLN', 'HAN', 'BBD', 'HCM', 'VNM', 'VB26'],
  'Nguyễn Hồng Sơn': ['VTL', 'VNM', 'VB26'],
  'Nguyễn Công Phượng': ['HAG', 'BPH', 'HCM', 'VNM', 'VB26'],
  'Vũ Như Thành': ['BBD', 'NBI', 'VTL', 'VNM', 'VB26'],

  // --- INTERNATIONAL LEGENDS & SUPERSTARS ---
  'Cristiano Ronaldo': ['RMA', 'MUN', 'JUV', 'SCP', 'ALN', 'ICONS'],
  'Lionel Messi': ['BAR', 'PSG', 'MIA', 'ICONS'],
  'Pelé': ['SAN', 'ICONS'],
  'Ronaldo Nazário': ['RMA', 'BAR', 'INT', 'MIL', 'PSV', 'COR', 'ICONS'],
  'Diego Maradona': ['NAP', 'BAR', 'BOC', 'SEV', 'ICONS'],
  'Ruud Gullit': ['MIL', 'CHE', 'PSV', 'FEY', 'ICONS'],
  'Zinédine Zidane': ['RMA', 'JUV', 'ICONS'],
  'Kaká': ['MIL', 'RMA', 'SAO', 'ICONS'],
  'Neymar Jr.': ['BAR', 'PSG', 'SAN', 'HIL'],
  'Johan Cruyff': ['BAR', 'AJX', 'FEY', 'ICONS'],
  'Ronaldinho': ['BAR', 'MIL', 'PSG', 'FLA', 'GRE', 'ICONS'],
  'Thierry Henry': ['ARS', 'BAR', 'JUV', 'MON', 'ICONS'],
  'Paolo Maldini': ['MIL', 'ICONS'],
  'Toni Kroos': ['RMA', 'BAY', 'LEV', 'ICONS'],
  'David Beckham': ['MUN', 'RMA', 'MIL', 'PSG', 'LAFC', 'ICONS'],
  'Rio Ferdinand': ['MUN', 'WHU', 'ICONS'],
  'Xavi Hernández': ['BAR', 'ICONS'],
  'Andrés Iniesta': ['BAR', 'ICONS'],
  'Philipp Lahm': ['BAY', 'STU', 'ICONS'],
  'Gareth Bale': ['RMA', 'TOT', 'LAFC', 'ICONS'],
  'Roberto Carlos': ['RMA', 'INT', 'FEN', 'PAL', 'COR', 'ICONS'],
  'Marcelo': ['RMA', 'FLU', 'ICONS'],
  'Raphaël Varane': ['RMA', 'MUN', 'ICONS'],
  'Casemiro': ['MUN', 'RMA', 'POR', 'SAO'],
  'Didier Drogba': ['CHE', 'MAR', 'GAL', 'ICONS'],
  'Wayne Rooney': ['MUN', 'EVE', 'ICONS'],
  "Samuel Eto'o": ['BAR', 'INT', 'CHE', 'RMA', 'EVE', 'ICONS'],
  'Alessandro Del Piero': ['JUV', 'ICONS'],
  'Luís Figo': ['RMA', 'BAR', 'INT', 'SCP', 'ICONS'],
  'Robin van Persie': ['ARS', 'MUN', 'FEY', 'FEN', 'ICONS'],
  'Eusébio': ['BEN', 'ICONS'],
  'Marco van Basten': ['MIL', 'AJX', 'ICONS'],
  'Steven Gerrard': ['LIV', 'ICONS'],
  'Fernando Torres': ['LIV', 'CHE', 'ATM', 'MIL', 'ICONS'],
  'Patrick Vieira': ['ARS', 'INT', 'JUV', 'MCI', 'MIL', 'ICONS'],
  'Andrea Pirlo': ['MIL', 'JUV', 'INT', 'ICONS'],
  'Gianluigi Buffon': ['JUV', 'PSG', 'ICONS'],
  'Pavel Nedvěd': ['JUV', 'LAZ', 'ICONS'],
  'Zlatan Ibrahimović': ['MIL', 'PSG', 'INT', 'BAR', 'MUN', 'JUV', 'AJX', 'ICONS'],
  'Eden Hazard': ['CHE', 'RMA', 'LIL', 'ICONS'],
  'Franck Ribéry': ['BAY', 'MAR', 'GAL', 'FIO', 'ICONS'],
  'Arjen Robben': ['BAY', 'CHE', 'RMA', 'PSV', 'ICONS'],
  'Andriy Shevchenko': ['MIL', 'CHE', 'ICONS'],
  'Edwin van der Sar': ['MUN', 'JUV', 'AJX', 'FUL', 'ICONS'],
  'Fabio Cannavaro': ['RMA', 'JUV', 'INT', 'NAP', 'ICONS'],
  'Cafu': ['MIL', 'ROM', 'PAL', 'SAO', 'ICONS'],
  'Lothar Matthäus': ['BAY', 'INT', 'ICONS'],
  'Franz Beckenbauer': ['BAY', 'ICONS'],
  'Carles Puyol': ['BAR', 'ICONS'],
  'Frank Lampard': ['CHE', 'MCI', 'WHU', 'ICONS'],
  'Paul Scholes': ['MUN', 'ICONS'],
  'Ryan Giggs': ['MUN', 'ICONS'],
  'Dennis Bergkamp': ['ARS', 'INT', 'AJX', 'ICONS'],
  'Raúl González': ['RMA', 'ATM', 'ICONS'],
  'Rivaldo': ['BAR', 'MIL', 'PAL', 'COR', 'ICONS'],
  'Nemanja Vidić': ['MUN', 'INT', 'ICONS'],
  'Petr Čech': ['CHE', 'ARS', 'ICONS'],
  'Michael Ballack': ['CHE', 'BAY', 'LEV', 'ICONS'],
  'Bastian Schweinsteiger': ['BAY', 'MUN', 'ICONS'],
  'Clarence Seedorf': ['MIL', 'RMA', 'INT', 'AJX', 'ICONS'],
  'Alessandro Nesta': ['MIL', 'LAZ', 'ICONS'],
  'Peter Schmeichel': ['MUN', 'MCI', 'AVL', 'SCP', 'ICONS'],
  'Michael Laudrup': ['BAR', 'RMA', 'JUV', 'LAZ', 'AJX', 'ICONS'],
  'Hristo Stoichkov': ['BAR', 'ICONS'],
  'Jay-Jay Okocha': ['PSG', 'FEN', 'FRA', 'ICONS'],
  'Kylian Mbappé': ['RMA', 'PSG', 'MON'],
  'Ousmane Dembélé': ['PSG', 'BAR', 'BVB'],
  'Robert Lewandowski': ['BAR', 'BAY', 'BVB'],
  'Erling Haaland': ['MCI', 'BVB', 'SAL'],
  'Jude Bellingham': ['RMA', 'BVB'],
  'Kevin De Bruyne': ['NAP', 'MCI', 'CHE'],
  'Harry Kane': ['BAY', 'TOT'],
  'Mohamed Salah': ['LIV', 'CHE', 'ROM', 'FIO'],
  'Luka Modrić': ['MIL', 'RMA', 'TOT'],
  'Karim Benzema': ['ITT', 'RMA', 'LYO'],
  'Achraf Hakimi': ['PSG', 'INT', 'BVB', 'RMA'],
  'Theo Hernández': ['MIL', 'RMA', 'ATM'],
  'Son Heung-Min': ['TOT', 'LEV'],
  'Ferenc Puskás': ['RMA', 'ICONS'],
  'Frank Rijkaard': ['MIL', 'AJX', 'SCP', 'ICONS'],
  'Oliver Kahn': ['BAY', 'ICONS'],
  'Lilian Thuram': ['JUV', 'BAR', 'MON', 'ICONS'],
  'Javier Zanetti': ['INT', 'ICONS'],
  'Claude Makélélé': ['CHE', 'RMA', 'PSG', 'MAR', 'ICONS'],
  'Park Ji-Sung': ['MUN', 'PSV', 'ICONS'],
  'James Milner': ['LIV', 'MCI', 'AVL', 'NEW', 'BHA'],
  'Ivan Rakitić': ['BAR', 'SEV'],
  'Frank de Boer': ['BAR', 'AJX', 'GAL', 'RAN', 'ICONS'],
  'Pedro': ['BAR', 'CHE', 'ROM', 'LAZ'],
  'Sergio Busquets': ['BAR', 'MIA'],
  'Pep Guardiola': ['BAR', 'ROM', 'ICONS'],
  'Emmanuel Petit': ['ARS', 'BAR', 'CHE', 'MON', 'ICONS'],
  'Ole Gunnar Solskjær': ['MUN', 'ICONS'],
  'Gennaro Gattuso': ['MIL', 'RAN', 'ICONS'],
  'Juan Sebastián Verón': ['MUN', 'INT', 'CHE', 'LAZ', 'ICONS'],
  'Fernandinho': ['MCI'],
  'Kasper Schmeichel': ['CEL', 'MCI', 'NIC'],
  'Łukasz Piszczek': ['BVB'],
  'Marc Overmars': ['ARS', 'BAR', 'AJX', 'ICONS'],
  'Henrik Larsson': ['BAR', 'CEL', 'MUN', 'FEY', 'ICONS'],
  'Pepe': ['RMA', 'POR', 'BES'],
  'César Azpilicueta': ['CHE', 'ATM', 'MAR'],
  'Jordi Alba': ['BAR', 'VAL', 'MIA'],
  'Roberto Firmino': ['LIV', 'AHL', 'TSG'],
  'George Best': ['MUN', 'FUL', 'ICONS'],
  'Zico': ['FLA', 'UDI', 'ICONS'],
  'Ruud van Nistelrooy': ['MUN', 'RMA', 'PSV', 'ICONS'],
  'Jaap Stam': ['MUN', 'MIL', 'LAZ', 'AJX', 'PSV', 'ICONS'],
  'Bobby Charlton': ['MUN', 'ICONS'],
  'Karl-Heinz Rummenigge': ['BAY', 'INT', 'ICONS'],
  'Roberto Baggio': ['JUV', 'MIL', 'INT', 'FIO', 'BOL', 'ICONS'],
};

const VN_CLUB_STAT_SIGNATURES: Record<string, [string, string, string]> = {
  VB26: ['Tốc độ +4', 'Dứt điểm +4', 'Khéo léo +4'],
  VNM: ['Thể lực +4', 'Quyết đoán +4', 'Chuyền ngắn +4'],
  CAH: ['Tốc độ +4', 'Sút xoáy +4', 'Dứt điểm +3'],
  HAN: ['Chuyền ngắn +4', 'Giữ bóng +4', 'Tầm nhìn +3'],
  VTL: ['Thể lực +4', 'Chuyền dài +4', 'Tranh bóng +3'],
  NDI: ['Dứt điểm +4', 'Tốc độ +4', 'Sức mạnh +3'],
  NBI: ['Chuyền dài +4', 'Kiểm soát bóng +4', 'Sút xa +3'],
  BBD: ['Sức mạnh +4', 'Sút xa +4', 'Đánh đầu +3'],
  HAG: ['Rê bóng +4', 'Khéo léo +4', 'Tăng tốc +3'],
  THO: ['Thể lực +4', 'Quyết đoán +4', 'Tranh bóng +3'],
  HPH: ['Sút xa +4', 'Tạt bóng +4', 'Sức mạnh +3'],
  CAT: ['Dứt điểm +4', 'Chọn vị trí +4', 'Đánh đầu +3'],
  SLN: ['Quyết đoán +4', 'Tranh bóng +4', 'Sút xa +3'],
  DNG: ['Đánh đầu +4', 'Tốc độ +4', 'Dứt điểm +3'],
  HLH: ['Thể lực +4', 'Kèm người +4', 'Phản ứng +3'],
  QNA: ['Tăng tốc +4', 'Khéo léo +4', 'Dứt điểm +3'],
  BND: ['Sức mạnh +4', 'Tạt bóng +4', 'Phản xạ +3'],
  HCM: ['Tốc độ +4', 'Phản ứng +4', 'Chuyền ngắn +3'],
  PVF: ['Tăng tốc +4', 'Rê bóng +4', 'Thể lực +3'],
  BPH: ['Sút xa +4', 'Bình tĩnh +4', 'Tốc độ +3'],
  BNI: ['Chuyền ngắn +4', 'Tầm nhìn +4', 'Tăng tốc +3'],
  DNA: ['Sức mạnh +4', 'Dứt điểm +4', 'Thể lực +3'],
  HUE: ['Khéo léo +4', 'Chuyền ngắn +4', 'Giữ bóng +3'],
  KHO: ['Thể lực +4', 'Tốc độ +4', 'Xoạc bóng +3'],
  LAN: ['Bình tĩnh +4', 'Chuyền dài +4', 'Dứt điểm +3'],
  CTH: ['Tốc độ +4', 'Sút xa +4', 'Thăng bằng +3'],
  PTH: ['Quyết đoán +4', 'Thể lực +4', 'Cắt bóng +3'],
  TNG: ['Sức mạnh +4', 'Tạt bóng +4', 'Sút xa +3'],
  HYE: ['Tăng tốc +4', 'Khéo léo +4', 'Chuyền ngắn +3'],
  LDO: ['Thể lực +4', 'Tốc độ +4', 'Rê bóng +3'],
  VHI: ['Chuyền ngắn +4', 'Tầm nhìn +4', 'Khéo léo +3'],
  BMS: ['Tăng tốc +4', 'Rê bóng +4', 'Dứt điểm +3'],
  DTH: ['Phản xạ +4', 'Bình tĩnh +4', 'Chuyền dài +3'],
  DLK: ['Sức mạnh +4', 'Sút xa +4', 'Thể lực +3'],
  TQN: ['Tạt bóng +4', 'Sút xa +4', 'Thể lực +3'],
  SGN: ['Tốc độ +4', 'Khéo léo +4', 'Phản ứng +3'],
  BRV: ['Tăng tốc +4', 'Chuyền ngắn +4', 'Thể lực +3'],
  HBI: ['Sức mạnh +4', 'Quyết đoán +4', 'Tranh bóng +3'],
  AGFC: ['Tốc độ +4', 'Tạt bóng +4', 'Dứt điểm +3'],
  TGFC: ['Khéo léo +4', 'Sút xa +4', 'Bình tĩnh +3'],
};

const INTL_CLUB_STAT_SIGNATURES: Record<string, [string, string, string]> = {
  ICONS: ['Bình tĩnh +4', 'Dứt điểm +4', 'Tốc độ +4'],
  RMA: ['Dứt điểm +4', 'Tốc độ +4', 'Bình tĩnh +4'],
  BAR: ['Chuyền ngắn +4', 'Rê bóng +4', 'Tầm nhìn +4'],
  MUN: ['Sút xa +4', 'Tốc độ +4', 'Quyết đoán +3'],
  MCI: ['Kiểm soát bóng +4', 'Chuyền ngắn +4', 'Phản ứng +4'],
  ARS: ['Tăng tốc +4', 'Chuyền ngắn +4', 'Cắt bóng +3'],
  LIV: ['Tốc độ +4', 'Thể lực +4', 'Dứt điểm +3'],
  CHE: ['Sút xa +4', 'Sức mạnh +4', 'Cắt bóng +3'],
  BAY: ['Lực sút +4', 'Chọn vị trí +4', 'Sức mạnh +3'],
  PSG: ['Tốc độ +4', 'Rê bóng +4', 'Khéo léo +4'],
  MIL: ['Kèm người +4', 'Tốc độ +4', 'Xoạc bóng +4'],
  INT: ['Sức mạnh +4', 'Đánh đầu +4', 'Dứt điểm +3'],
  JUV: ['Bình tĩnh +4', 'Cắt bóng +4', 'Sút xoáy +3'],
};

function buildAllTeamColors(): TeamColorDefinition[] {
  const result: TeamColorDefinition[] = [];

  // 1. ALL 36 VIETNAMESE CLUBS (V.League 1, V.League 2, Historic VN Clubs, ĐT Việt Nam & 26VB)
  const vnClubEntries = Object.values(CLUB_LICENSE_REGISTRY).filter((c) =>
    VIETNAM_CLUB_CODES.has(c.code)
  );
  for (const club of vnClubEntries) {
    const buffs = VN_CLUB_STAT_SIGNATURES[club.code] ?? [
      'Tốc độ +3',
      'Chuyền ngắn +3',
      'Thể lực +3',
    ];
    result.push({
      id: `tc_club_${club.code.toLowerCase()}`,
      name: `${club.officialName}`,
      shortLabel: club.shortCode,
      category: 'VN_CLUB',
      subtitle: `${club.league} · Buff CLB & Liên kết VPF Việt Nam`,
      clubCode: club.code,
      maxOvrBonus: 4,
      statBuffs: buffs,
      marketKeyword: club.code === 'VB26' || club.code === 'VNM' ? 'Việt Nam' : club.officialName,
    });
  }

  // 2. ALL 73 INTERNATIONAL CLUBS (Europe, Americas, Asia & FC Online ICONs)
  const intlClubEntries = Object.values(CLUB_LICENSE_REGISTRY).filter(
    (c) => !VIETNAM_CLUB_CODES.has(c.code)
  );
  for (const club of intlClubEntries) {
    const buffs = INTL_CLUB_STAT_SIGNATURES[club.code] ?? [
      'Tốc độ +3',
      'Dứt điểm +3',
      'Kiểm soát bóng +3',
    ];
    result.push({
      id: `tc_club_${club.code.toLowerCase()}`,
      name: club.officialName,
      shortLabel: club.shortCode,
      category: 'INTL_CLUB',
      subtitle: club.league,
      clubCode: club.code,
      maxOvrBonus: club.code === 'ICONS' ? 4 : 4,
      statBuffs: buffs,
      marketKeyword: club.officialName,
    });
  }

  // 3. ALL NATIONAL TEAM COLORS (Derived from all nationalities in catalog, Vietnam first)
  const nationMap = new Map<string, string>();
  nationMap.set('VN', 'Việt Nam');
  for (const tpl of PLAYER_TEMPLATES) {
    if (!nationMap.has(tpl.nationalityCode)) {
      nationMap.set(tpl.nationalityCode, tpl.nationalityName);
    }
  }
  const nationBuffMap: Record<string, [string, string, string]> = {
    VN: ['Tốc độ +4', 'Thể lực +4', 'Khéo léo +4'],
    FR: ['Tốc độ +4', 'Tăng tốc +4', 'Sức mạnh +3'],
    BR: ['Rê bóng +4', 'Khéo léo +4', 'Sút xoáy +4'],
    ES: ['Chuyền ngắn +4', 'Tầm nhìn +4', 'Giữ bóng +4'],
    EN: ['Lực sút +4', 'Tốc độ +4', 'Tạt bóng +3'],
    PT: ['Dứt điểm +4', 'Rê bóng +4', 'Sút xa +3'],
    AR: ['Khéo léo +4', 'Bình tĩnh +4', 'Dứt điểm +4'],
    DE: ['Lực sút +4', 'Chuyền dài +4', 'Bình tĩnh +4'],
    NL: ['Chọn vị trí +4', 'Lực sút +4', 'Kiểm soát bóng +3'],
    IT: ['Kèm người +4', 'Xoạc bóng +4', 'Phản ứng +4'],
  };
  for (const [natCode, natName] of nationMap.entries()) {
    result.push({
      id: `tc_nation_${natCode.toLowerCase()}`,
      name: `ĐTQG ${natName}`,
      shortLabel: natCode,
      category: 'NATION',
      subtitle: `Team Color Đội Tuyển Quốc Gia ${natName}`,
      nationCode: natCode,
      maxOvrBonus: 4,
      statBuffs: nationBuffMap[natCode] ?? ['Tốc độ +3', 'Chuyền ngắn +3', 'Dứt điểm +3'],
      marketKeyword: natName,
    });
  }

  // 4. ENHANCEMENT GRADE & SPECIAL SEASON TEAM COLORS (13 entries)
  const gradeTiers: Array<{
    id: string;
    name: string;
    shortLabel: string;
    minGrade: number;
    maxGrade: number;
    maxOvrBonus: number;
    buffs: [string, string, string];
  }> = [
    {
      id: 'tc_grade_bronze',
      name: 'Team Color Cộng Đồng (+2 ~ +4)',
      shortLabel: '+2~+4',
      minGrade: 2,
      maxGrade: 4,
      maxOvrBonus: 2,
      buffs: ['Tốc độ +1', 'Tăng tốc +1', 'Thể lực +1'],
    },
    {
      id: 'tc_grade_silver',
      name: 'Team Color Cộng Bạc (+5 ~ +7)',
      shortLabel: '+5~+7',
      minGrade: 5,
      maxGrade: 7,
      maxOvrBonus: 3,
      buffs: ['Tốc độ +2', 'Dứt điểm +2', 'Sức mạnh +2'],
    },
    {
      id: 'tc_grade_gold',
      name: 'Team Color Cộng Vàng (+8 ~ +10)',
      shortLabel: '+8~+10',
      minGrade: 8,
      maxGrade: 10,
      maxOvrBonus: 4,
      buffs: ['Tốc độ +3', 'Dứt điểm +3', 'Bình tĩnh +3'],
    },
    {
      id: 'tc_grade_diamond',
      name: 'Team Color Kim Cương (+11 ~ +13)',
      shortLabel: '+11~+13',
      minGrade: 11,
      maxGrade: 13,
      maxOvrBonus: 5,
      buffs: ['Toàn bộ chỉ số +5', 'Tốc độ +5', 'Lực sút +5'],
    },
  ];

  for (const gt of gradeTiers) {
    result.push({
      id: gt.id,
      name: gt.name,
      shortLabel: gt.shortLabel,
      category: 'SPECIAL',
      subtitle: `Kích hoạt khi đội hình có cầu thủ cấp cộng từ +${gt.minGrade} trở lên`,
      minGrade: gt.minGrade,
      maxGrade: gt.maxGrade,
      maxOvrBonus: gt.maxOvrBonus,
      statBuffs: gt.buffs,
      marketKeyword: '',
    });
  }

  const seasonDefs: Array<{
    code: SeasonCode;
    label: string;
    name: string;
    maxBonus: number;
    buffs: [string, string, string];
  }> = [
    {
      code: 'INFINITY_PRIME',
      label: 'IPRM',
      name: 'Mùa Infinite Prime',
      maxBonus: 4,
      buffs: ['Dứt điểm +4', 'Tốc độ +4', 'Bình tĩnh +4'],
    },
    {
      code: 'LE',
      label: 'LE',
      name: 'Mùa Legendary Eternal (LE)',
      maxBonus: 4,
      buffs: ['Dứt điểm +4', 'Tốc độ +4', 'Lực sút +4'],
    },
    {
      code: '26VB',
      label: '26VB',
      name: 'Mùa 26 Vietnam Best',
      maxBonus: 4,
      buffs: ['Tốc độ +4', 'Thể lực +4', 'Sút xa +4'],
    },
    {
      code: '26UCL',
      label: '26UCL',
      name: 'Mùa 26 UEFA Champions League',
      maxBonus: 3,
      buffs: ['Tăng tốc +3', 'Chuyền ngắn +3', 'Phản ứng +3'],
    },
    {
      code: 'ICON_TM',
      label: 'ICON TM',
      name: 'Mùa ICON The Moment',
      maxBonus: 4,
      buffs: ['Bình tĩnh +4', 'Sút xoáy +4', 'Tầm nhìn +4'],
    },
    {
      code: '26TOTY',
      label: '26TOTY',
      name: 'Mùa 26 Team Of The Year',
      maxBonus: 3,
      buffs: ['Tốc độ +3', 'Dứt điểm +3', 'Kiểm soát bóng +3'],
    },
    {
      code: '26TOTS',
      label: '26TOTS',
      name: 'Mùa 26 Team Of The Season',
      maxBonus: 3,
      buffs: ['Thể lực +3', 'Tốc độ +3', 'Lực sút +3'],
    },
    {
      code: 'BDO',
      label: 'BDO',
      name: 'Mùa Ballon d’Or',
      maxBonus: 3,
      buffs: ['Rê bóng +3', 'Dứt điểm +3', 'Bình tĩnh +3'],
    },
    {
      code: 'UP',
      label: 'UP',
      name: 'Mùa Unsung Players (UP)',
      maxBonus: 3,
      buffs: ['Thể lực +4', 'Cắt bóng +3', 'Chuyền ngắn +3'],
    },
    {
      code: '25UCL',
      label: '25UCL',
      name: 'Mùa 25 UEFA Champions League',
      maxBonus: 3,
      buffs: ['Tốc độ +3', 'Chuyền dài +3', 'Cắt bóng +3'],
    },
    {
      code: 'CU',
      label: 'CU',
      name: 'Mùa Continental Heroes (CU)',
      maxBonus: 3,
      buffs: ['Tăng tốc +3', 'Khéo léo +3', 'Sút xa +3'],
    },
  ];

  for (const s of seasonDefs) {
    result.push({
      id: `tc_season_${s.code.toLowerCase()}`,
      name: s.name,
      shortLabel: s.label,
      category: 'SPECIAL',
      subtitle: `Team Color Mùa Thẻ ${s.label} chính thức FC Online`,
      seasonCode: s.code,
      maxOvrBonus: s.maxBonus,
      statBuffs: s.buffs,
      marketKeyword: s.label,
    });
  }

  return result;
}

export const ALL_TEAM_COLORS: readonly TeamColorDefinition[] = buildAllTeamColors();

export const TEAM_COLOR_MAP: Record<string, TeamColorDefinition> = Object.fromEntries(
  ALL_TEAM_COLORS.map((tc) => [tc.id, tc])
);

export function doesCardMatchTeamColor(
  card: OwnedCard,
  teamColor: TeamColorDefinition,
  allowVpfLeagueSynergy: boolean = true
): 'direct' | 'vpf_synergy' | false {
  const tpl = PLAYER_TEMPLATE_MAP[card.templateId];
  if (!tpl) return false;

  if (teamColor.clubCode) {
    if (tpl.clubCode === teamColor.clubCode) return 'direct';
    const career = PLAYER_CAREER_CLUBS[tpl.name];
    if (career && career.includes(teamColor.clubCode)) return 'direct';
    // Every ICON_TM / INFINITY_PRIME / LE legend qualifies for ICONS
    if (
      teamColor.clubCode === 'ICONS' &&
      (tpl.season === 'ICON_TM' || tpl.season === 'INFINITY_PRIME' || tpl.season === 'LE')
    ) {
      return 'direct';
    }
    // Vietnamese League VPF Synergy: Vietnamese national stars activate VN club Team Color synergy
    if (
      allowVpfLeagueSynergy &&
      teamColor.category === 'VN_CLUB' &&
      tpl.nationalityCode === 'VN'
    ) {
      return 'vpf_synergy';
    }
    return false;
  }

  if (teamColor.nationCode) {
    return tpl.nationalityCode === teamColor.nationCode ? 'direct' : false;
  }

  if (teamColor.seasonCode) {
    return tpl.season === teamColor.seasonCode ? 'direct' : false;
  }

  if (typeof teamColor.minGrade === 'number') {
    return card.grade >= teamColor.minGrade ? 'direct' : false;
  }

  return false;
}

function computeTierFromCount(
  count: number,
  maxBonus: number,
  isSelectedPrimary: boolean
): { tierLevel: 1 | 2 | 3 | 4; ovrBonus: number } | null {
  if (count >= 8) {
    return { tierLevel: 4, ovrBonus: maxBonus };
  }
  if (count >= 5) {
    return { tierLevel: 3, ovrBonus: Math.max(2, maxBonus - 1) };
  }
  if (count >= 3) {
    return { tierLevel: 2, ovrBonus: Math.max(2, maxBonus - 2) };
  }
  if (count >= 2 || (isSelectedPrimary && count >= 1)) {
    return { tierLevel: 1, ovrBonus: Math.min(2, maxBonus) };
  }
  return null;
}

export function evaluateSquadTeamColors(
  starterCards: OwnedCard[],
  activeTeamColorId: string = 'auto'
): SquadTeamColorEvaluation {
  const cardBonusMap: Record<string, CardTeamColorBonus> = {};
  for (const c of starterCards) {
    cardBonusMap[c.uid] = {
      bonusOvr: 0,
      activeLabels: [],
      statBuffs: [],
    };
  }

  if (starterCards.length === 0) {
    return {
      selectedTeamColor: null,
      activeBadges: [],
      cardBonusMap,
      baseAvgOvr: 0,
      boostedAvgOvr: 0,
      totalBoostedStarters: 0,
    };
  }

  const selectedTeamColor =
    activeTeamColorId && activeTeamColorId !== 'auto'
      ? TEAM_COLOR_MAP[activeTeamColorId] ?? null
      : null;

  const activeBadges: EvaluatedTeamColorBadge[] = [];

  // 1. Evaluate explicitly selected primary Team Color first
  if (selectedTeamColor) {
    const matchedCards = starterCards.filter((c) =>
      Boolean(doesCardMatchTeamColor(c, selectedTeamColor, true))
    );
    const tier = computeTierFromCount(
      matchedCards.length,
      selectedTeamColor.maxOvrBonus,
      true
    );
    const effectiveBonus = tier ? Math.max(2, tier.ovrBonus) : 2;
    activeBadges.push({
      teamColor: selectedTeamColor,
      matchedCount: matchedCards.length,
      tierLevel: tier ? tier.tierLevel : 1,
      ovrBonus: effectiveBonus,
      isSelectedPrimary: true,
    });

    for (const c of matchedCards) {
      const matchKind = doesCardMatchTeamColor(c, selectedTeamColor, true);
      if (!matchKind) continue;
      const grant = matchKind === 'direct' ? effectiveBonus : Math.max(2, effectiveBonus - 1);
      const entry = cardBonusMap[c.uid];
      entry.bonusOvr = Math.min(5, entry.bonusOvr + grant);
      entry.activeLabels.push(selectedTeamColor.name);
      for (const b of selectedTeamColor.statBuffs) {
        if (!entry.statBuffs.includes(b)) entry.statBuffs.push(b);
      }
    }
  }

  // 2. Auto-detect highest Enhancement Grade Team Color among starters (>= 3 cards)
  const gradeDefs = [
    TEAM_COLOR_MAP.tc_grade_diamond,
    TEAM_COLOR_MAP.tc_grade_gold,
    TEAM_COLOR_MAP.tc_grade_silver,
    TEAM_COLOR_MAP.tc_grade_bronze,
  ].filter((d): d is TeamColorDefinition => Boolean(d));

  for (const gDef of gradeDefs) {
    if (selectedTeamColor?.id === gDef.id) break;
    const matched = starterCards.filter((c) => c.grade >= (gDef.minGrade ?? 2));
    if (matched.length >= 3) {
      const tier = computeTierFromCount(matched.length, gDef.maxOvrBonus, false);
      if (tier) {
        activeBadges.push({
          teamColor: gDef,
          matchedCount: matched.length,
          tierLevel: tier.tierLevel,
          ovrBonus: tier.ovrBonus,
          isSelectedPrimary: false,
        });
        for (const c of matched) {
          const entry = cardBonusMap[c.uid];
          entry.bonusOvr = Math.min(5, entry.bonusOvr + Math.min(2, tier.ovrBonus));
          if (!entry.activeLabels.includes(gDef.shortLabel)) {
            entry.activeLabels.push(gDef.shortLabel);
          }
        }
        break;
      }
    }
  }

  // 3. Auto-detect top Club / Nation / Season synergies with >= 3 direct matches
  const candidateAutoPool = ALL_TEAM_COLORS.filter(
    (tc) =>
      tc.id !== selectedTeamColor?.id &&
      typeof tc.minGrade !== 'number'
  );

  const autoEvaluated: EvaluatedTeamColorBadge[] = [];
  for (const tc of candidateAutoPool) {
    const directMatches = starterCards.filter(
      (c) => doesCardMatchTeamColor(c, tc, false) === 'direct'
    );
    if (directMatches.length >= 3) {
      const tier = computeTierFromCount(directMatches.length, tc.maxOvrBonus, false);
      if (tier) {
        autoEvaluated.push({
          teamColor: tc,
          matchedCount: directMatches.length,
          tierLevel: tier.tierLevel,
          ovrBonus: tier.ovrBonus,
          isSelectedPrimary: false,
        });
      }
    }
  }

  autoEvaluated.sort(
    (a, b) => b.matchedCount - a.matchedCount || b.ovrBonus - a.ovrBonus
  );

  for (const badge of autoEvaluated.slice(0, 3)) {
    activeBadges.push(badge);
    for (const c of starterCards) {
      if (doesCardMatchTeamColor(c, badge.teamColor, false) === 'direct') {
        const entry = cardBonusMap[c.uid];
        entry.bonusOvr = Math.min(5, entry.bonusOvr + Math.min(2, badge.ovrBonus));
        if (!entry.activeLabels.includes(badge.teamColor.shortLabel)) {
          entry.activeLabels.push(badge.teamColor.shortLabel);
        }
      }
    }
  }

  const baseSum = starterCards.reduce((s, c) => s + c.ovr, 0);
  const boostedSum = starterCards.reduce(
    (s, c) => s + c.ovr + (cardBonusMap[c.uid]?.bonusOvr ?? 0),
    0
  );
  const totalBoostedStarters = starterCards.filter(
    (c) => (cardBonusMap[c.uid]?.bonusOvr ?? 0) > 0
  ).length;

  return {
    selectedTeamColor,
    activeBadges,
    cardBonusMap,
    baseAvgOvr: Math.round(baseSum / starterCards.length),
    boostedAvgOvr: Math.round(boostedSum / starterCards.length),
    totalBoostedStarters,
  };
}

/**
 * Builds an optimized 11-slot lineup array prioritizing owned cards that match
 * the chosen Team Color (while keeping a GK in goal when available).
 */
export function prioritizeCardsForTeamColor(
  allCards: OwnedCard[],
  formationCode: FormationCode,
  teamColorId: string
): string[] {
  const tc = TEAM_COLOR_MAP[teamColorId];
  const formation = FORMATION_CATALOG[formationCode] ?? FORMATION_CATALOG['4-3-3'];
  if (!tc || allCards.length === 0) {
    return buildFormationLineup(allCards, formationCode).starterUids;
  }

  const remaining = [...allCards].sort((a, b) => b.ovr - a.ovr || b.valueBp - a.valueBp);
  const chosenBySlot = new Map<number, OwnedCard>();

  const orderedSlots = [...formation.slots].sort(
    (a, b) => slotFillPriority(a) - slotFillPriority(b) || a.slotIndex - b.slotIndex
  );

  for (const slot of orderedSlots) {
    if (remaining.length === 0) break;

    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const tpl = PLAYER_TEMPLATE_MAP[c.templateId];
      const fit = tpl
        ? computePositionAffinity(tpl.position, slot)
        : { bonus: slot.lineGroup === 'GK' ? -600 : 0, isNaturalFit: false };
      const match = doesCardMatchTeamColor(c, tc, true);
      const tcWeight = match === 'direct' ? 58 : match === 'vpf_synergy' ? 42 : 0;
      const score = c.ovr + fit.bonus + tcWeight;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const picked = remaining.splice(bestIdx, 1)[0];
    chosenBySlot.set(slot.slotIndex, picked);
  }

  return formation.slots
    .map((s) => chosenBySlot.get(s.slotIndex)?.uid ?? '')
    .filter(Boolean);
}
