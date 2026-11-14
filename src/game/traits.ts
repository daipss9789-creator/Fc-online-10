import { PlayerTemplate, PositionCode, SeasonCode } from './types';

export interface FcoTraitMeta {
  id: number;
  code: string;
  name: string;
  description: string;
  iconUrl: string;
  tier: 'gold' | 'standard';
}

/**
 * Official FC Online Vietnam Hidden Traits (Chỉ Số Ẩn Vàng & Chỉ Số Ẩn Thường)
 * backed by authentic local 90x90 PNG icons in /public/traits/trait_icon_{id}.png.
 */
export const FCO_TRAIT_CATALOG: Record<number, FcoTraitMeta> = {
  // ================= STANDARD HIDDEN TRAITS (CHỈ SỐ ẨN BÌNH THƯỜNG · 0..49) =================
  0: {
    id: 0,
    code: 'corner_specialist',
    name: 'Chuyên gia phạt góc',
    description: 'Thực hiện các tình huống đá phạt góc có độ cuộn và điểm rơi chuẩn xác.',
    iconUrl: '/traits/trait_icon_0.png',
    tier: 'standard',
  },
  1: {
    id: 1,
    code: 'long_throw_in',
    name: 'Ném biên xa',
    description: 'Có thể thực hiện các pha ném biên rất xa thẳng vào vòng cấm đối phương.',
    iconUrl: '/traits/trait_icon_1.png',
    tier: 'standard',
  },
  2: {
    id: 2,
    code: 'avoids_weaker_foot',
    name: 'Ưu tiên chân thuận',
    description: 'Luôn khéo léo đưa bóng sang chân thuận để đạt độ chính xác cao nhất.',
    iconUrl: '/traits/trait_icon_2.png',
    tier: 'standard',
  },
  3: {
    id: 3,
    code: 'standing_tackle',
    name: 'Xoạc bóng chuẩn',
    description: 'Thực hiện các pha tắc bóng đứng và xoạc bóng thu hồi gọn gàng.',
    iconUrl: '/traits/trait_icon_3.png',
    tier: 'standard',
  },
  4: {
    id: 4,
    code: 'tries_to_beat_offside_trap',
    name: 'Phá bẫy việt vị',
    description: 'Chủ động căn nhịp xuất phát ngang hàng hậu vệ cuối để đón chọc khe.',
    iconUrl: '/traits/trait_icon_4.png',
    tier: 'standard',
  },
  5: {
    id: 5,
    code: 'solid_player',
    name: 'Cứng như thép',
    description: 'Cơ địa bền bỉ, rất khó gặp chấn thương khi va chạm quyết liệt.',
    iconUrl: '/traits/trait_icon_5.png',
    tier: 'standard',
  },
  6: {
    id: 6,
    code: 'shot_blocker',
    name: 'Lăn xả cản bóng',
    description: 'Chủ động che chắn góc sút của tiền đạo đối phương trong vòng 16m50.',
    iconUrl: '/traits/trait_icon_6.png',
    tier: 'standard',
  },
  7: {
    id: 7,
    code: 'dives_into_tackles',
    name: 'Xoạc bóng (AI)',
    description: 'Chủ động xoạc bóng truy cản đúng thời điểm khi phòng ngự.',
    iconUrl: '/traits/trait_icon_7.png',
    tier: 'standard',
  },
  8: {
    id: 8,
    code: 'power_body',
    name: 'Càn lướt',
    description: 'Tận dụng thể hình và thăng bằng để đè vai giữ bóng khi bị áp sát.',
    iconUrl: '/traits/trait_icon_8.png',
    tier: 'standard',
  },
  9: {
    id: 9,
    code: 'engine_stamina',
    name: 'Bền bỉ',
    description: 'Duy trì nền tảng thể lực dồi dào khi lên công về thủ liên tục.',
    iconUrl: '/traits/trait_icon_9.png',
    tier: 'standard',
  },
  10: {
    id: 10,
    code: 'leadership',
    name: 'Thủ lĩnh',
    description: 'Tố chất thủ lĩnh giúp duy trì cự ly và tinh thần thi đấu toàn đội.',
    iconUrl: '/traits/trait_icon_10.png',
    tier: 'standard',
  },
  11: {
    id: 11,
    code: 'team_player',
    name: 'Lối chơi đồng đội',
    description: 'Phối hợp nhịp nhàng với vệ tinh xung quanh trong các pha đập nhả ngắn.',
    iconUrl: '/traits/trait_icon_11.png',
    tier: 'standard',
  },
  12: {
    id: 12,
    code: 'tight_marking',
    name: 'Kèm người',
    description: 'Theo sát cầu thủ tấn công nguy hiểm của đối phương trong khu vực phòng ngự.',
    iconUrl: '/traits/trait_icon_12.png',
    tier: 'standard',
  },
  13: {
    id: 13,
    code: 'finesse_shot',
    name: 'Sút xoáy',
    description: 'Tăng độ xoáy và độ chính xác trong các pha cứa lòng kỹ thuật (ZD).',
    iconUrl: '/traits/trait_icon_13.png',
    tier: 'standard',
  },
  14: {
    id: 14,
    code: 'flair',
    name: 'Tinh tế',
    description: 'Khả năng xử lý bóng khéo léo, giữ bóng chắc và chuyền bóng ngẫu hứng.',
    iconUrl: '/traits/trait_icon_14.png',
    tier: 'standard',
  },
  15: {
    id: 15,
    code: 'long_passer',
    name: 'Chuyền dài',
    description: 'Tăng độ chuẩn xác khi mở bóng dài vượt tuyến và phất bóng chuyển cánh.',
    iconUrl: '/traits/trait_icon_15.png',
    tier: 'standard',
  },
  16: {
    id: 16,
    code: 'long_shot_taker',
    name: 'Sút xa',
    description: 'Thường xuyên tung ra những cú sút xa uy lực từ ngoài vòng cấm.',
    iconUrl: '/traits/trait_icon_16.png',
    tier: 'standard',
  },
  17: {
    id: 17,
    code: 'speed_dribbler',
    name: 'Ma tốc độ',
    description: 'Tốc độ dắt bóng cực nhanh trong các tình huống phản công tốc độ cao.',
    iconUrl: '/traits/trait_icon_17.png',
    tier: 'standard',
  },
  18: {
    id: 18,
    code: 'playmaker',
    name: 'Kiến tạo',
    description: 'Nhãn quan chiến thuật sắc bén để tung đường chuyền quyết định.',
    iconUrl: '/traits/trait_icon_18.png',
    tier: 'standard',
  },
  19: {
    id: 19,
    code: 'early_crosser',
    name: 'Tạt bóng sớm',
    description: 'Thực hiện các quả tạt sớm (QA) có độ cuộn chuẩn xác vào đà băng cắt.',
    iconUrl: '/traits/trait_icon_19.png',
    tier: 'standard',
  },
  20: {
    id: 20,
    code: 'gk_flat_kick',
    name: 'TM phát bóng xa',
    description: 'Thủ môn phát bóng sống đi căng, chuẩn xác sang phần sân đối phương.',
    iconUrl: '/traits/trait_icon_20.png',
    tier: 'standard',
  },
  21: {
    id: 21,
    code: 'gk_long_throw',
    name: 'TM ném bóng xa',
    description: 'Thủ môn có khả năng ném bóng phát động phản công nhanh qua giữa sân.',
    iconUrl: '/traits/trait_icon_21.png',
    tier: 'standard',
  },
  22: {
    id: 22,
    code: 'power_header',
    name: 'Đánh đầu mạnh',
    description: 'Tăng lực găm bóng trong các pha bật nhảy không chiến.',
    iconUrl: '/traits/trait_icon_22.png',
    tier: 'standard',
  },
  23: {
    id: 23,
    code: 'gk_one_on_ones',
    name: 'TM đối mặt 1vs1',
    description: 'Thủ môn có bản lĩnh khép góc và phản xạ nhanh trong thế 1 đối 1.',
    iconUrl: '/traits/trait_icon_23.png',
    tier: 'standard',
  },
  24: {
    id: 24,
    code: 'gk_puncher',
    name: 'TM đấm bóng',
    description: 'Chủ động bật cao đấm bóng giải nguy dứt khoát khi bị vây ráp.',
    iconUrl: '/traits/trait_icon_24.png',
    tier: 'standard',
  },
  25: {
    id: 25,
    code: 'outside_foot_shot',
    name: 'Sút & tạt má ngoài',
    description: 'Sử dụng má ngoài chân thuận để vẩy bóng và dứt điểm hiểm hóc.',
    iconUrl: '/traits/trait_icon_25.png',
    tier: 'standard',
  },
  26: {
    id: 26,
    code: 'gk_rushes_out',
    name: 'TM băng ra chủ động',
    description: 'Thủ môn đọc tình huống chọc khe nhanh để băng ra bọc lót kịp thời.',
    iconUrl: '/traits/trait_icon_26.png',
    tier: 'standard',
  },
  27: {
    id: 27,
    code: 'swerve_pass',
    name: 'Thánh chuyền bóng',
    description: 'Kỹ năng chuyền bóng hai chân và chọc khe xoáy đạt độ chính xác cao.',
    iconUrl: '/traits/trait_icon_27.png',
    tier: 'standard',
  },
  28: {
    id: 28,
    code: 'second_wind',
    name: 'Nỗ lực đến cùng',
    description: 'Càng về cuối trận càng dũng mãnh, bùng nổ khi vào sân hoặc hiệp phụ.',
    iconUrl: '/traits/trait_icon_28.png',
    tier: 'standard',
  },
  29: {
    id: 29,
    code: 'decisive_defender',
    name: 'Quyết đoán',
    description: 'Áp sát tranh chấp quyết liệt ngay khi đối phương vừa khống chế bóng.',
    iconUrl: '/traits/trait_icon_29.png',
    tier: 'standard',
  },
  30: {
    id: 30,
    code: 'giant_crosser',
    name: 'Tạt bóng bổng chuẩn',
    description: 'Đưa bóng từ biên vào cột hai với quỹ đạo xoáy thuận lợi cho tiền đạo.',
    iconUrl: '/traits/trait_icon_30.png',
    tier: 'standard',
  },
  31: {
    id: 31,
    code: 'agile_turn',
    name: 'Khéo léo xoay sở',
    description: 'Chuyển hướng phạm vi hẹp mượt mà để thoát pressing tuyến giữa.',
    iconUrl: '/traits/trait_icon_31.png',
    tier: 'standard',
  },
  32: {
    id: 32,
    code: 'aerial_defender',
    name: 'Chống bóng bổng',
    description: 'Chọn điểm rơi tốt trong các pha không chiến phòng ngự phạt góc.',
    iconUrl: '/traits/trait_icon_32.png',
    tier: 'standard',
  },
  33: {
    id: 33,
    code: 'interception_sense',
    name: 'Cắt bóng chủ động',
    description: 'Đọc hướng chuyền bóng của đối thủ để cắt đường lên bóng từ xa.',
    iconUrl: '/traits/trait_icon_33.png',
    tier: 'standard',
  },
  34: {
    id: 34,
    code: 'gk_close_reflex',
    name: 'TM phản xạ cận thành',
    description: 'Phản xạ đổ người cực nhanh trước các pha dứt điểm cự ly gần.',
    iconUrl: '/traits/trait_icon_34.png',
    tier: 'standard',
  },
  41: {
    id: 41,
    code: 'chip_shot',
    name: 'Bấm bóng',
    description: 'Thực hiện các pha lốp bóng kỹ thuật qua đầu thủ môn cực kỳ nhạy cảm.',
    iconUrl: '/traits/trait_icon_41.png',
    tier: 'standard',
  },
  42: {
    id: 42,
    code: 'technical_dribbler',
    name: 'Qua người',
    description: 'Kỹ năng rê bóng 1 đối 1 dính chân và đổi hướng mượt mà.',
    iconUrl: '/traits/trait_icon_42.png',
    tier: 'standard',
  },
  46: {
    id: 46,
    code: 'finesse_free_kick',
    name: 'Sút phạt xoáy',
    description: 'Tăng độ cuộn và hiểm hóc trong các tình huống đá phạt cố định.',
    iconUrl: '/traits/trait_icon_46.png',
    tier: 'standard',
  },

  // ================= GOLD TRAITS (CHỈ SỐ ẨN VÀNG HIẾM FC ONLINE · 50..68) =================
  50: {
    id: 50,
    code: 'acrobatic_finisher',
    name: 'Chuyên gia vô lê',
    description: 'Dứt điểm vô lê và bắt bóng sống trên không với quỹ đạo cực căng.',
    iconUrl: '/traits/trait_icon_50.png',
    tier: 'gold',
  },
  51: {
    id: 51,
    code: 'cross_poacher',
    name: 'Sát thủ băng cắt',
    description: 'Di chuyển nhanh đến điểm rơi trong các tình huống căng ngang và tạt bóng.',
    iconUrl: '/traits/trait_icon_51.png',
    tier: 'gold',
  },
  52: {
    id: 52,
    code: 'line_breaker',
    name: 'Bậc thầy chạy chỗ',
    description: 'Di chuyển không bóng thông minh để phá vỡ bẫy việt vị của đối phương.',
    iconUrl: '/traits/trait_icon_52.png',
    tier: 'gold',
  },
  53: {
    id: 53,
    code: 'master_tackler',
    name: 'Cao thủ tắc bóng',
    description: 'Tăng sải chân và độ chuẩn xác khi thực hiện tắc bóng và xoạc bóng.',
    iconUrl: '/traits/trait_icon_53.png',
    tier: 'gold',
  },
  54: {
    id: 54,
    code: 'chaser',
    name: 'Chuyên gia đeo bám',
    description: 'Bám đuổi cầu thủ đối phương nhanh hơn và khóa góc sút khi bị phản công.',
    iconUrl: '/traits/trait_icon_54.png',
    tier: 'gold',
  },
  55: {
    id: 55,
    code: 'tireless',
    name: 'Người không phổi',
    description: 'Khi tăng tốc thể lực tiêu hao ít hơn và giữ nguyên phong độ suốt 120 phút.',
    iconUrl: '/traits/trait_icon_55.png',
    tier: 'gold',
  },
  56: {
    id: 56,
    code: 'predator',
    name: 'Chặn đà tấn công',
    description: 'Phán đoán và cắt đường chuyền trung lộ của đối thủ cực kỳ chủ động.',
    iconUrl: '/traits/trait_icon_56.png',
    tier: 'gold',
  },
  57: {
    id: 57,
    code: 'blocker',
    name: 'Siêu cản phá',
    description: 'Lăn xả chắn bóng và hóa giải các cú sút hiểm hóc trong vòng cấm.',
    iconUrl: '/traits/trait_icon_57.png',
    tier: 'gold',
  },
  59: {
    id: 59,
    code: 'commander',
    name: 'Nhạc trưởng',
    description: 'Tung đường chọc khe bổng (ZW) thấp, nhanh với hiệu ứng xoáy ngược.',
    iconUrl: '/traits/trait_icon_59.png',
    tier: 'gold',
  },
  60: {
    id: 60,
    code: 'gk_aerial_dominance',
    name: 'GK Áp đảo không chiến',
    description: 'Làm chủ khoảng không 5m50 và bắt gọn các pha tạt bóng bổng.',
    iconUrl: '/traits/trait_icon_60.png',
    tier: 'gold',
  },
  62: {
    id: 62,
    code: 'cannon_shooter',
    name: 'Đại pháo tầm xa',
    description: 'Cú sút xa mang lực đi sấm sét và độ liệng khiến thủ môn khó bắt dính.',
    iconUrl: '/traits/trait_icon_62.png',
    tier: 'gold',
  },
  63: {
    id: 63,
    code: 'speedster',
    name: 'Siêu Bứt Tốc',
    description: 'Tăng tốc bùng nổ và bứt qua hậu vệ ngay nhịp đẩy bóng đầu tiên.',
    iconUrl: '/traits/trait_icon_63.png',
    tier: 'gold',
  },
  64: {
    id: 64,
    code: 'aerial_master',
    name: 'Bậc thầy không chiến',
    description: 'Bật nhảy cao vượt trội và găm bóng hiểm từ các tình huống bóng bổng.',
    iconUrl: '/traits/trait_icon_64.png',
    tier: 'gold',
  },
  65: {
    id: 65,
    code: 'trickster',
    name: 'Ảo thuật gia',
    description: 'Thực hiện kỹ thuật cá nhân 5 sao nhanh và mượt hơn đáng kể.',
    iconUrl: '/traits/trait_icon_65.png',
    tier: 'gold',
  },
  66: {
    id: 66,
    code: 'laser_shooter',
    name: 'Dứt điểm 1 chạm',
    description: 'Dứt điểm trực tiếp một chạm với quỹ đạo chìm, căng và hiểm hóc.',
    iconUrl: '/traits/trait_icon_66.png',
    tier: 'gold',
  },
  67: {
    id: 67,
    code: 'titan',
    name: 'Hòn đá tảng',
    description: 'Sức mạnh tì đè và trụ vững vượt trội trong các pha tranh chấp tay đôi.',
    iconUrl: '/traits/trait_icon_67.png',
    tier: 'gold',
  },
  68: {
    id: 68,
    code: 'gk_dead_eye',
    name: 'GK Bắt bài Sút xa',
    description: 'Phản xạ bay người cứu thua xuất thần trước các pha sút xa và ZD.',
    iconUrl: '/traits/trait_icon_68.png',
    tier: 'gold',
  },
};

const LABEL_TO_TRAIT_ID: Record<string, number> = {
  // Explicit FC Online Gold Traits ONLY (rare signature tiers)
  'chuyên gia vô lê': 50,
  'sát thủ băng cắt': 51,
  'bậc thầy chạy chỗ': 52,
  'cao thủ tắc bóng': 53,
  'chuyên gia đeo bám': 54,
  'người không phổi': 55,
  'chặn đà tấn công': 56,
  'siêu cản phá': 57,
  'nhạc trưởng': 59,
  'gk áp đảo không chiến': 60,
  'đại pháo tầm xa': 62,
  'siêu bứt tốc': 63,
  'bậc thầy không chiến': 64,
  'ảo thuật gia': 65,
  'dứt điểm 1 chạm': 66,
  'hòn đá tảng': 67,
  'gk bắt bài sút xa': 68,

  // Standard Hidden Traits (Chỉ số ẩn bình thường — rich pool)
  'chuyên gia phạt góc': 0,
  'ném biên xa': 1,
  'ưu tiên chân thuận': 2,
  'xoạc bóng chuẩn': 3,
  'phá bẫy việt vị': 4,
  'cứng như thép': 5,
  'lăn xả cản bóng': 6,
  'xoạc bóng': 7,
  'xoạc bóng (ai)': 7,
  'càn lướt': 8,
  'bền bỉ': 9,
  'thủ lĩnh': 10,
  'lãnh đạo': 10,
  'lối chơi đồng đội': 11,
  'đồng đội': 11,
  'kèm người': 12,
  'sút xoáy': 13,
  'tinh tế': 14,
  'giữ bóng': 14,
  'chuyền dài': 15,
  'sút xa': 16,
  'sút xa sấm sét': 16,
  'ma tốc độ': 17,
  'tốc độ tia chớp': 17,
  'kiến tạo': 18,
  'kiến tạo vàng': 18,
  'tạt bóng sớm': 19,
  'tm phát bóng xa': 20,
  'ném bóng xa': 21,
  'tm ném bóng xa': 21,
  'đánh đầu mạnh': 22,
  'đối mặt 1vs1': 23,
  'tm đối mặt 1vs1': 23,
  'tm đấm bóng': 24,
  'bắt bóng bổng': 24,
  'vẩy má ngoài': 25,
  'sút và tạt má ngoài': 25,
  'sút & tạt má ngoài': 25,
  'tm băng ra chủ động': 26,
  'hai chân như một': 27,
  'chuyền một chạm': 27,
  'thánh chuyền bóng': 27,
  'siêu dự bị': 28,
  'nỗ lực đến cùng': 28,
  'quyết đoán': 29,
  'tạt bóng bổng chuẩn': 30,
  'khéo léo xoay sở': 31,
  'chống bóng bổng': 32,
  'cắt bóng chủ động': 33,
  'siêu đánh chặn': 33,
  'tm phản xạ cận thành': 34,
  'phản xạ xuất thần': 34,
  'bấm bóng': 41,
  'qua người': 42,
  'rê bóng ma thuật': 42,
  'sút phạt': 46,
  'sút phạt xoáy': 46,
};

/**
 * Resolves any player trait label into its official FC Online icon, canonical name,
 * tier (Gold vs Standard), and Vietnamese tactical effect description.
 */
export function resolveTraitMeta(traitLabel: string): FcoTraitMeta {
  const key = traitLabel.trim().toLowerCase();
  const id = LABEL_TO_TRAIT_ID[key] ?? 13;
  const meta = FCO_TRAIT_CATALOG[id] ?? FCO_TRAIT_CATALOG[13];
  return {
    ...meta,
    name: traitLabel.trim() || meta.name,
  };
}

/**
 * Strict Gold Trait rarity cap per season & OVR (matching FC Online PC meta):
 * - Regular/mid seasons (CU, 25UCL, UP, 26VB, BDO, 26TOTS): 0 Gold Traits
 * - Elite active / ICON_TM: 0 or 1 Gold Trait
 * - INFINITY_PRIME & LE: 1 Gold Trait (max 2 strictly for 138 IPRM & 139–140 LE pinnacle icons)
 */
export function getSeasonMaxGoldTraits(season: SeasonCode, baseOvr: number): number {
  switch (season) {
    case 'LE':
      return baseOvr >= 139 ? 2 : 1;
    case 'INFINITY_PRIME':
      return baseOvr >= 138 ? 2 : 1;
    case 'ICON_TM':
      return 1;
    case '26UCL':
      return baseOvr >= 126 ? 1 : 0;
    case '26TOTY':
      return baseOvr >= 121 ? 1 : 0;
    default:
      return 0;
  }
}

const GOLD_DEMOTION_TO_STANDARD_NAME: Record<number, string> = {
  50: 'Tinh tế',
  51: 'Phá bẫy việt vị',
  52: 'Phá bẫy việt vị',
  53: 'Xoạc bóng chuẩn',
  54: 'Kèm người',
  55: 'Bền bỉ',
  56: 'Cắt bóng chủ động',
  57: 'Lăn xả cản bóng',
  59: 'Kiến tạo',
  60: 'TM đấm bóng',
  62: 'Sút xa',
  63: 'Ma tốc độ',
  64: 'Đánh đầu mạnh',
  65: 'Qua người',
  66: 'Sút xoáy',
  67: 'Cứng như thép',
  68: 'TM phản xạ cận thành',
};

const SIGNATURE_GOLD_BY_POSITION: Record<PositionCode, string[]> = {
  ST: ['Dứt điểm 1 chạm', 'Bậc thầy chạy chỗ', 'Chuyên gia vô lê', 'Bậc thầy không chiến'],
  CF: ['Dứt điểm 1 chạm', 'Ảo thuật gia', 'Nhạc trưởng'],
  LW: ['Siêu Bứt Tốc', 'Ảo thuật gia', 'Sát thủ băng cắt'],
  RW: ['Siêu Bứt Tốc', 'Ảo thuật gia', 'Dứt điểm 1 chạm'],
  CAM: ['Nhạc trưởng', 'Đại pháo tầm xa', 'Ảo thuật gia'],
  CM: ['Nhạc trưởng', 'Người không phổi', 'Đại pháo tầm xa'],
  CDM: ['Chặn đà tấn công', 'Người không phổi', 'Hòn đá tảng'],
  CB: ['Hòn đá tảng', 'Cao thủ tắc bóng', 'Siêu cản phá'],
  LB: ['Chuyên gia đeo bám', 'Người không phổi', 'Cao thủ tắc bóng'],
  RB: ['Chuyên gia đeo bám', 'Người không phổi', 'Cao thủ tắc bóng'],
  GK: ['GK Bắt bài Sút xa', 'GK Áp đảo không chiến'],
};

const STANDARD_POOL_BY_POSITION: Record<PositionCode, string[]> = {
  ST: [
    'Sút xoáy',
    'Phá bẫy việt vị',
    'Ma tốc độ',
    'Đánh đầu mạnh',
    'Sút & tạt má ngoài',
    'Bấm bóng',
    'Tinh tế',
    'Qua người',
    'Càn lướt',
    'Sút xa',
  ],
  CF: [
    'Sút xoáy',
    'Tinh tế',
    'Kiến tạo',
    'Qua người',
    'Sút & tạt má ngoài',
    'Sút xa',
    'Bấm bóng',
    'Thánh chuyền bóng',
    'Khéo léo xoay sở',
  ],
  LW: [
    'Ma tốc độ',
    'Qua người',
    'Sút xoáy',
    'Tinh tế',
    'Sút & tạt má ngoài',
    'Tạt bóng sớm',
    'Khéo léo xoay sở',
    'Sút xa',
    'Nỗ lực đến cùng',
  ],
  RW: [
    'Ma tốc độ',
    'Sút xoáy',
    'Qua người',
    'Tinh tế',
    'Tạt bóng sớm',
    'Sút & tạt má ngoài',
    'Khéo léo xoay sở',
    'Chuyên gia phạt góc',
    'Sút xa',
  ],
  CAM: [
    'Kiến tạo',
    'Thánh chuyền bóng',
    'Tinh tế',
    'Sút xa',
    'Sút xoáy',
    'Chuyền dài',
    'Qua người',
    'Sút phạt xoáy',
    'Khéo léo xoay sở',
  ],
  CM: [
    'Chuyền dài',
    'Kiến tạo',
    'Thánh chuyền bóng',
    'Bền bỉ',
    'Sút xa',
    'Lối chơi đồng đội',
    'Cắt bóng chủ động',
    'Thủ lĩnh',
    'Tinh tế',
  ],
  CDM: [
    'Cắt bóng chủ động',
    'Xoạc bóng chuẩn',
    'Cứng như thép',
    'Chuyền dài',
    'Bền bỉ',
    'Kèm người',
    'Quyết đoán',
    'Thủ lĩnh',
    'Càn lướt',
  ],
  CB: [
    'Cứng như thép',
    'Xoạc bóng chuẩn',
    'Kèm người',
    'Chống bóng bổng',
    'Đánh đầu mạnh',
    'Quyết đoán',
    'Lăn xả cản bóng',
    'Xoạc bóng (AI)',
    'Thủ lĩnh',
  ],
  LB: [
    'Ma tốc độ',
    'Tạt bóng sớm',
    'Bền bỉ',
    'Xoạc bóng chuẩn',
    'Kèm người',
    'Ném biên xa',
    'Tạt bóng bổng chuẩn',
    'Nỗ lực đến cùng',
    'Cắt bóng chủ động',
  ],
  RB: [
    'Ma tốc độ',
    'Tạt bóng sớm',
    'Bền bỉ',
    'Xoạc bóng chuẩn',
    'Kèm người',
    'Tạt bóng bổng chuẩn',
    'Ném biên xa',
    'Cắt bóng chủ động',
    'Nỗ lực đến cùng',
  ],
  GK: [
    'TM đối mặt 1vs1',
    'TM ném bóng xa',
    'TM phản xạ cận thành',
    'TM phát bóng xa',
    'TM băng ra chủ động',
    'TM đấm bóng',
    'Thủ lĩnh',
  ],
};

/**
 * Player-specific iconic FC Online PC Gold Traits mapping.
 * Ensures every legend and superstar receives their authentic, realistic playstyle gold traits.
 */
const PLAYER_SIGNATURE_GOLD_MAP: Record<string, string[]> = {
  // Cristiano Ronaldo (CR7): Power Laser Finisher & Towering Aerial Master
  cr7: ['Dứt điểm 1 chạm', 'Bậc thầy không chiến'],
  cristiano: ['Dứt điểm 1 chạm', 'Bậc thầy không chiến'],

  // Lionel Messi: Master Trickster & Genius Playmaker
  messi: ['Ảo thuật gia', 'Nhạc trưởng'],

  // Ronaldo Nazário (R9): Lethal 1-Touch Finisher & Explosive Speedster
  r9: ['Dứt điểm 1 chạm', 'Siêu Bứt Tốc'],
  ronaldo_r9: ['Dứt điểm 1 chạm', 'Siêu Bứt Tốc'],
  nazario: ['Dứt điểm 1 chạm', 'Siêu Bứt Tốc'],

  // Pelé: Iconic Trickster & Clinical Finisher
  pele: ['Ảo thuật gia', 'Dứt điểm 1 chạm'],

  // Diego Maradona: Maestro Trickster & Free-Kick Commander
  maradona: ['Ảo thuật gia', 'Nhạc trưởng'],

  // Zinédine Zidane: Master Playmaker & Elegant Trickster
  zidane: ['Nhạc trưởng', 'Ảo thuật gia'],

  // Franz Beckenbauer: Defensive Commander & Master Tackler
  beckenbauer: ['Nhạc trưởng', 'Cao thủ tắc bóng'],

  // Marco van Basten: Acrobatic Volley Finisher & Lethal 1-Touch
  vanbasten: ['Chuyên gia vô lê', 'Dứt điểm 1 chạm'],

  // Paolo Maldini: World-Class Tackler & Defensive Titan
  maldini: ['Cao thủ tắc bóng', 'Hòn đá tảng'],

  // Ruud Gullit: Gullit Gang Titan & Long-Range Cannon
  gullit: ['Hòn đá tảng', 'Đại pháo tầm xa'],

  // Thierry Henry: Va-Va-Voom Speedster & Finesse Finisher
  henry: ['Siêu Bứt Tốc', 'Dứt điểm 1 chạm'],

  // Kylian Mbappé: Lightning Speedster & Line Breaker
  mbappe: ['Siêu Bứt Tốc', 'Bậc thầy chạy chỗ'],

  // Erling Haaland: Ruthless 1-Touch Finisher & Physical Titan
  haaland: ['Dứt điểm 1 chạm', 'Hòn đá tảng'],

  // Ronaldinho: Joga Bonito Trickster & Speedster
  ronaldinho: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Johan Cruyff: Total Football Trickster & Maestro
  cruyff: ['Ảo thuật gia', 'Nhạc trưởng'],

  // Kaká: Explosive Burst Speedster & Cannon Shooter
  kaka: ['Siêu Bứt Tốc', 'Đại pháo tầm xa'],

  // Neymar Jr.: Samba Trickster & High-Agility Speedster
  neymar: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Kevin De Bruyne: Master Playmaker & Long-Range Cannon
  debruyne: ['Nhạc trưởng', 'Đại pháo tầm xa'],

  // Toni Kroos: Sniper Playmaker & Long-Range Cannon
  kroos: ['Nhạc trưởng', 'Đại pháo tầm xa'],

  // Luka Modrić: Trivela Playmaker & Tireless Engine
  modric: ['Nhạc trưởng', 'Người không phổi'],

  // David Beckham: Pinpoint Playmaker & Cannon Shooter
  beckham: ['Nhạc trưởng', 'Đại pháo tầm xa'],

  // Patrick Vieira: Midfield Predator & Physical Titan
  vieira: ['Chặn đà tấn công', 'Hòn đá tảng'],

  // Sergio Ramos: 92:48 Aerial Master & Defensive Titan
  ramos: ['Bậc thầy không chiến', 'Hòn đá tảng'],

  // Virgil van Dijk: Unbreakable Titan & Master Blocker
  vandijk: ['Hòn đá tảng', 'Siêu cản phá'],

  // Thibaut Courtois: Long-Shot Dead Eye & Aerial Dominance
  courtois: ['GK Bắt bài Sút xa', 'GK Áp đảo không chiến'],

  // Manuel Neuer: Sweeper-Keeper Dead Eye & Aerial Dominance
  neuer: ['GK Bắt bài Sút xa', 'GK Áp đảo không chiến'],

  // Edwin van der Sar: High-Frame Dead Eye & Aerial Dominance
  vandersar: ['GK Bắt bài Sút xa', 'GK Áp đảo không chiến'],

  // Lev Yashin: Black Spider Dead Eye & Aerial Dominance
  yashin: ['GK Bắt bài Sút xa', 'GK Áp đảo không chiến'],

  // Peter Schmeichel: Great Dane Aerial Dominance & Dead Eye
  schmeichel: ['GK Áp đảo không chiến', 'GK Bắt bài Sút xa'],

  // Iker Casillas: Saint Iker Dead Eye
  casillas: ['GK Bắt bài Sút xa'],

  // Petr Čech: Helmet Giant Aerial Dominance & Dead Eye
  cech: ['GK Áp đảo không chiến', 'GK Bắt bài Sút xa'],

  // Roberto Carlos: Bullet Cannon Shooter & Lightning Speedster
  carlos: ['Đại pháo tầm xa', 'Siêu Bứt Tốc'],

  // Cafu: Express Tireless Engine & Chaser
  cafu: ['Người không phổi', 'Chuyên gia đeo bám'],

  // Javier Zanetti: El Tractor Tireless & Master Tackler
  zanetti: ['Người không phổi', 'Cao thủ tắc bóng'],

  // Carles Puyol: Lionheart Titan & Master Tackler
  puyol: ['Hòn đá tảng', 'Cao thủ tắc bóng'],

  // Fabio Cannavaro: Berlin Wall Master Tackler & Aerial Master
  cannavaro: ['Cao thủ tắc bóng', 'Bậc thầy không chiến'],

  // Alessandro Nesta: Elegant Master Tackler & Blocker
  nesta: ['Cao thủ tắc bóng', 'Siêu cản phá'],

  // Franco Baresi: Sweeper Master Tackler & Predator
  baresi: ['Cao thủ tắc bóng', 'Chặn đà tấn công'],

  // Rio Ferdinand: Athletic Titan & Master Tackler
  ferdinand: ['Hòn đá tảng', 'Cao thủ tắc bóng'],

  // Nemanja Vidić: Fearless Titan & Aerial Master
  vidic: ['Hòn đá tảng', 'Bậc thầy không chiến'],

  // Jaap Stam: Dutch Beast Titan & Master Tackler
  stam: ['Hòn đá tảng', 'Cao thủ tắc bóng'],

  // Didier Drogba: Chelsea King Titan & Aerial Master
  drogba: ['Hòn đá tảng', 'Bậc thầy không chiến'],

  // Andriy Shevchenko: Eastern European Line Breaker & 1-Touch Finisher
  shevchenko: ['Bậc thầy chạy chỗ', 'Dứt điểm 1 chạm'],

  // Ruud van Nistelrooy: Box Fox Cross Poacher & 1-Touch Finisher
  nistelrooy: ['Sát thủ băng cắt', 'Dứt điểm 1 chạm'],

  // Raúl González: Eternal Captain Line Breaker & 1-Touch Finisher
  raul: ['Bậc thầy chạy chỗ', 'Dứt điểm 1 chạm'],

  // Filippo Inzaghi: Offside Born Line Breaker & Cross Poacher
  inzaghi: ['Bậc thầy chạy chỗ', 'Sát thủ băng cắt'],

  // Wayne Rooney: Cannon Shooter & Physical Titan
  rooney: ['Đại pháo tầm xa', 'Hòn đá tảng'],

  // Robert Lewandowski: Complete Striker 1-Touch & Line Breaker
  lewandowski: ['Dứt điểm 1 chạm', 'Bậc thầy chạy chỗ'],

  // Karim Benzema: Ballon d'Or 1-Touch & Trickster
  benzema: ['Dứt điểm 1 chạm', 'Ảo thuật gia'],

  // Harry Kane: Deadly 1-Touch & Deep-Lying Playmaker
  kane: ['Dứt điểm 1 chạm', 'Nhạc trưởng'],

  // Mohamed Salah: Egyptian King Speedster & 1-Touch Finisher
  salah: ['Siêu Bứt Tốc', 'Dứt điểm 1 chạm'],

  // Vinícius Jr.: Samba Speedster & Trickster
  vinicius: ['Siêu Bứt Tốc', 'Ảo thuật gia'],

  // Lamine Yamal: Golden Boy Trickster & Speedster
  yamal: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Jude Bellingham: Box-to-Box Tireless & Playmaker
  bellingham: ['Người không phổi', 'Nhạc trưởng'],

  // Rodri: Midfield General Predator & Cannon Shooter
  rodri: ['Chặn đà tấn công', 'Đại pháo tầm xa'],

  // Casemiro: Tank Titan & Predator
  casemiro: ['Hòn đá tảng', 'Chặn đà tấn công'],

  // N'Golo Kanté: Tireless Everywhere & Predator
  kante: ['Người không phổi', 'Chặn đà tấn công'],

  // Claude Makélélé: Original Destroyer Predator & Chaser
  makelele: ['Chặn đà tấn công', 'Chuyên gia đeo bám'],

  // Ousmane Dembélé: 5-Star Skill Trickster & Speedster
  dembele: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Bukayo Saka: Star Boy Trickster & Clinical Finisher
  saka: ['Ảo thuật gia', 'Dứt điểm 1 chạm'],

  // Pedri: Golden Boy Maestro & Trickster
  pedri: ['Ảo thuật gia', 'Nhạc trưởng'],

  // Raphinha: Brazilian Trickster & Speedster
  raphinha: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Federico Valverde: Halcón Long-Range Cannon & Tireless
  valverde: ['Đại pháo tầm xa', 'Người không phổi'],

  // Jamal Musiala: Bambi Dribbler & Speedster
  musiala: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Declan Rice: Fortress Predator & Physical Titan
  rice: ['Chặn đà tấn công', 'Hòn đá tảng'],

  // William Saliba: Master Tackler & Titan
  saliba: ['Cao thủ tắc bóng', 'Hòn đá tảng'],

  // Vitinha: Pocket Maestro & Trickster
  vitinha: ['Nhạc trưởng', 'Ảo thuật gia'],

  // Khvicha Kvaratskhelia: Kvaradona Trickster & Speedster
  kvaratskhelia: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Phil Foden: Stockport Maestro & Trickster
  foden: ['Ảo thuật gia', 'Nhạc trưởng'],

  // Viktor Gyökeres: Swedish Bulldozer Finisher & Titan
  gyokeres: ['Dứt điểm 1 chạm', 'Hòn đá tảng'],

  // Michael Olise: Left-Foot Maestro & Trickster
  olise: ['Ảo thuật gia', 'Nhạc trưởng'],

  // Martin Ødegaard: Arsenal Captain Maestro & Trickster
  odegaard: ['Nhạc trưởng', 'Ảo thuật gia'],

  // Gabriel Magalhães: Aerial Dominance & Titan
  gabriel: ['Bậc thầy không chiến', 'Hòn đá tảng'],

  // Nuno Mendes: Lightning Wingback Speedster & Chaser
  nunomendes: ['Siêu Bứt Tốc', 'Chuyên gia đeo bám'],

  // Joshua Kimmich: Bavarian Maestro & Chaser
  kimmich: ['Nhạc trưởng', 'Chuyên gia đeo bám'],

  // Gianluigi Donnarumma: Gigio Dead Eye & Aerial Dominance
  donnarumma: ['GK Bắt bài Sút xa', 'GK Áp đảo không chiến'],

  // Luis Díaz: Colombian Speedster & Trickster
  luisdiaz: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Steven Gerrard: Liverpool Captain Cannon Shooter & Maestro
  gerrard: ['Đại pháo tầm xa', 'Nhạc trưởng'],

  // Frank Lampard: Super Frankie Cannon Shooter & Maestro
  lampard: ['Đại pháo tầm xa', 'Nhạc trưởng'],

  // Andrea Pirlo: Architect Maestro & Cannon Shooter
  pirlo: ['Nhạc trưởng', 'Đại pháo tầm xa'],

  // Xavi Hernández: Barca Maestro & Trickster
  xavi: ['Nhạc trưởng', 'Ảo thuật gia'],

  // Andrés Iniesta: Don Andrés Trickster & Maestro
  iniesta: ['Ảo thuật gia', 'Nhạc trưởng'],

  // Philipp Lahm: Magic Dwarf Tackler & Tireless
  lahm: ['Cao thủ tắc bóng', 'Người không phổi'],

  // Gareth Bale: Welsh Express Speedster & Cannon Shooter
  bale: ['Siêu Bứt Tốc', 'Đại pháo tầm xa'],

  // Gianluigi Buffon: Superman Dead Eye & Aerial Dominance
  buffon: ['GK Bắt bài Sút xa', 'GK Áp đảo không chiến'],

  // Fernando Torres: El Niño Line Breaker & 1-Touch Finisher
  torres: ['Bậc thầy chạy chỗ', 'Dứt điểm 1 chạm'],

  // Robin van Persie: Flying Dutchman Volley Specialist & 1-Touch
  vanpersie: ['Chuyên gia vô lê', 'Dứt điểm 1 chạm'],

  // Alessandro Del Piero: Il Pinturicchio Trickster & 1-Touch
  delpiero: ['Ảo thuật gia', 'Dứt điểm 1 chạm'],

  // Luís Figo: Portuguese Maestro Trickster & Speedster
  figo: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Rivaldo: Left-Foot Cannon Shooter & Trickster
  rivaldo: ['Đại pháo tầm xa', 'Ảo thuật gia'],

  // Pavel Nedvěd: Czech Cannon Shooter & Tireless Engine
  nedved: ['Đại pháo tầm xa', 'Người không phổi'],

  // Zico: White Pelé Trickster & Maestro
  zico: ['Ảo thuật gia', 'Nhạc trưởng'],

  // Samuel Eto'o: Indomitable Lion Speedster & 1-Touch
  etoo: ['Siêu Bứt Tốc', 'Dứt điểm 1 chạm'],

  // Marcelo: Samba Fullback Trickster & Speedster
  marcelo: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Raphaël Varane: Champions Wall Tackler & Blocker
  varane: ['Cao thủ tắc bóng', 'Siêu cản phá'],

  // Garrincha: Joy of the People Trickster & Speedster
  garrincha: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // George Best: Belfast Boy Trickster & Speedster
  best: ['Ảo thuật gia', 'Siêu Bứt Tốc'],

  // Ferenc Puskás: Galloping Major Cannon Shooter & 1-Touch
  puskas: ['Đại pháo tầm xa', 'Dứt điểm 1 chạm'],

  // Eusébio: Black Panther Speedster & 1-Touch
  eusebio: ['Siêu Bứt Tốc', 'Dứt điểm 1 chạm'],

  // ================= VIETNAM STARS (Golden Generation) =================
  lecongvinh: ['Dứt điểm 1 chạm', 'Bậc thầy chạy chỗ'],
  quanghai: ['Ảo thuật gia', 'Nhạc trưởng'],
  lehuynhduc: ['Hòn đá tảng', 'Bậc thầy không chiến'],
  hongson: ['Ảo thuật gia', 'Nhạc trưởng'],
  tienlinh: ['Dứt điểm 1 chạm', 'Bậc thầy không chiến'],
  xuanson: ['Hòn đá tảng', 'Dứt điểm 1 chạm'],
  congphuong: ['Ảo thuật gia', 'Siêu Bứt Tốc'],
  dinhbac: ['Siêu Bứt Tốc', 'Bậc thầy chạy chỗ'],
  hailong: ['Đại pháo tầm xa', 'Nhạc trưởng'],
  vankhang: ['Siêu Bứt Tốc', 'Ảo thuật gia'],
  vietanh: ['Hòn đá tảng', 'Bậc thầy không chiến'],
  dinhtrong: ['Cao thủ tắc bóng', 'Hòn đá tảng'],
  vanhau: ['Hòn đá tảng', 'Chuyên gia đeo bám'],
  vanthanh: ['Người không phổi', 'Chuyên gia đeo bám'],
  ngochai: ['Hòn đá tảng', 'Cao thủ tắc bóng'],
  duymanh: ['Hòn đá tảng', 'Siêu cản phá'],
  tantruong: ['GK Áp đảo không chiến', 'GK Bắt bài Sút xa'],
  trungkien: ['GK Bắt bài Sút xa', 'GK Áp đảo không chiến'],
  vanlam: ['GK Bắt bài Sút xa', 'GK Áp đảo không chiến'],
  tuanhai: ['Dứt điểm 1 chạm', 'Bậc thầy chạy chỗ'],
  vantoan: ['Siêu Bứt Tốc', 'Sát thủ băng cắt'],
  hoangduc: ['Nhạc trưởng', 'Ảo thuật gia'],
  hungdung: ['Người không phổi', 'Chặn đà tấn công'],
};

function getSignatureGoldsForPlayer(tpl: PlayerTemplate): string[] | null {
  const idClean = tpl.id.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameClean = tpl.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const shortClean = tpl.shortName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  // 1. Explicit disambiguation for Cristiano Ronaldo (CR7) vs Ronaldo Nazário (R9)
  if (nameClean.includes('cristiano') || idClean.includes('cr7') || shortClean.includes('cronaldo')) {
    return PLAYER_SIGNATURE_GOLD_MAP.cr7;
  }
  if (nameClean.includes('nazario') || idClean.includes('r9') || (idClean.includes('ronaldo') && !nameClean.includes('cristiano'))) {
    return PLAYER_SIGNATURE_GOLD_MAP.r9;
  }

  // 2. Direct exact key match
  if (PLAYER_SIGNATURE_GOLD_MAP[idClean]) {
    return PLAYER_SIGNATURE_GOLD_MAP[idClean];
  }

  // 3. Normalized substring matches
  for (const [key, list] of Object.entries(PLAYER_SIGNATURE_GOLD_MAP)) {
    const k = key.replace(/[^a-z0-9]/g, '');
    if (k.length >= 3 && (idClean.includes(k) || nameClean.includes(k) || shortClean.includes(k))) {
      return list;
    }
  }

  return null;
}

function stableSeedFromString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministically normalizes a player's traits so:
 * 1. Gold Traits (`tier === 'gold'`) are strictly capped (`0..2` max depending on season & OVR).
 * 2. Every player has `4..5` authentic Standard Hidden Traits (`tier === 'standard'`) tailored to position & stats.
 */
export function normalizePlayerTraits(tpl: PlayerTemplate): string[] {
  const maxGold = getSeasonMaxGoldTraits(tpl.season, tpl.baseOvr);
  const seed = stableSeedFromString(tpl.id);
  const usedIds = new Set<number>();
  const chosenGolds: string[] = [];
  const chosenStandards: string[] = [];

  const pushUniqueTrait = (label: string, targetList: string[], expectedTier: 'gold' | 'standard') => {
    const meta = resolveTraitMeta(label);
    if (meta.tier !== expectedTier || usedIds.has(meta.id)) return false;
    usedIds.add(meta.id);
    targetList.push(FCO_TRAIT_CATALOG[meta.id]?.name ?? meta.name);
    return true;
  };

  // 1. If season permits Gold Traits, first check player-specific signature mapping
  if (maxGold > 0) {
    const sigGolds = getSignatureGoldsForPlayer(tpl);
    if (sigGolds) {
      for (const goldLabel of sigGolds) {
        if (chosenGolds.length >= maxGold) break;
        pushUniqueTrait(goldLabel, chosenGolds, 'gold');
      }
    }

    // Next, check any explicit gold traits already defined in tpl.goldTraits
    for (const rawLabel of tpl.goldTraits ?? []) {
      if (chosenGolds.length >= maxGold) break;
      const meta = resolveTraitMeta(rawLabel);
      if (meta.tier === 'gold') {
        pushUniqueTrait(meta.name, chosenGolds, 'gold');
      }
    }

    // If still room, pick position-appropriate signature gold trait
    if (chosenGolds.length < maxGold) {
      const sigPool = SIGNATURE_GOLD_BY_POSITION[tpl.position] ?? ['Nhạc trưởng'];
      for (let i = 0; i < sigPool.length && chosenGolds.length < maxGold; i++) {
        pushUniqueTrait(sigPool[(seed + i) % sigPool.length], chosenGolds, 'gold');
      }
    }
  }

  // 2. Add existing standard traits from tpl.goldTraits (or demoted gold traits)
  for (const rawLabel of tpl.goldTraits ?? []) {
    const meta = resolveTraitMeta(rawLabel);
    if (meta.tier === 'gold') {
      if (!chosenGolds.includes(meta.name)) {
        const demoted = GOLD_DEMOTION_TO_STANDARD_NAME[meta.id] ?? 'Tinh tế';
        pushUniqueTrait(demoted, chosenStandards, 'standard');
      }
    } else {
      pushUniqueTrait(rawLabel, chosenStandards, 'standard');
    }
  }

  // Target standard count: 4 to 5 standard traits
  const maxStandardCount = 5;
  const minStandardCount = chosenGolds.length === 0 ? 5 : 4;
  const targetStandardCount = Math.min(
    maxStandardCount,
    Math.max(minStandardCount, tpl.baseOvr >= 125 ? 5 : 4 + (seed % 2))
  );

  // 3. Stat-driven authentic standard traits
  if (tpl.position !== 'GK') {
    if (tpl.weakFoot >= 5 && chosenStandards.length < maxStandardCount) {
      pushUniqueTrait('Thánh chuyền bóng', chosenStandards, 'standard');
    }
    if (
      tpl.skillMoves >= 5 &&
      chosenStandards.length < maxStandardCount &&
      (tpl.position === 'LW' ||
        tpl.position === 'RW' ||
        tpl.position === 'CAM' ||
        tpl.position === 'CF' ||
        tpl.position === 'ST')
    ) {
      pushUniqueTrait('Tinh tế', chosenStandards, 'standard');
    }
    if (
      tpl.stats.pac >= 132 &&
      chosenStandards.length < maxStandardCount &&
      (tpl.position === 'ST' ||
        tpl.position === 'LW' ||
        tpl.position === 'RW' ||
        tpl.position === 'LB' ||
        tpl.position === 'RB')
    ) {
      pushUniqueTrait('Ma tốc độ', chosenStandards, 'standard');
    }
    if (
      tpl.stats.phy >= 130 &&
      chosenStandards.length < maxStandardCount &&
      (tpl.position === 'CB' || tpl.position === 'CDM' || tpl.position === 'ST')
    ) {
      pushUniqueTrait('Cứng như thép', chosenStandards, 'standard');
    }
  }

  // 4. Fill from position pool
  const pool = STANDARD_POOL_BY_POSITION[tpl.position] ?? STANDARD_POOL_BY_POSITION.CM;
  for (let i = 0; i < pool.length && chosenStandards.length < targetStandardCount; i++) {
    const candidate = pool[(seed + i) % pool.length];
    pushUniqueTrait(candidate, chosenStandards, 'standard');
  }

  // 5. Universal fallback fill
  const universalFallback = ['Lối chơi đồng đội', 'Nỗ lực đến cùng', 'Bền bỉ', 'Thủ lĩnh', 'Quyết đoán'];
  for (const fb of universalFallback) {
    if (chosenStandards.length >= targetStandardCount) break;
    pushUniqueTrait(fb, chosenStandards, 'standard');
  }

  return [...chosenGolds, ...chosenStandards.slice(0, maxStandardCount)];
}
