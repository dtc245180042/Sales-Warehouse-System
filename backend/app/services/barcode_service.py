"""
Barcode Generation Service (SCRUM-617)
Cung cấp bộ sinh mã vạch chuẩn Code128 dạng Vector SVG thuần Python.
Không phụ thuộc bất kỳ thư viện C hay package bên ngoài nào.
"""

from typing import List

# Bộ mẫu độ rộng thanh và khoảng trống cho 107 ký tự Code128 (0 - 106)
# Mỗi chuỗi gồm 6 số (bar, space, bar, space, bar, space), riêng Stop (106) có 7 số.
CODE128_PATTERNS: List[str] = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131",
    "211412",  # 103: Start A
    "211214",  # 104: Start B
    "211232",  # 105: Start C
    "2331112", # 106: Stop (13 modules)
]


def generate_code128_svg(
    text: str,
    module_width: float = 1.6,
    height: int = 48,
    include_text: bool = True
) -> str:
    """
    Sinh chuỗi SVG Vector hiển thị mã vạch Code128-B từ chuỗi văn bản (ví dụ mã đơn 'DH-2026-001').
    """
    cleaned_text = text.strip() if text else "UNKNOWN"
    
    # 1. Mã hóa theo Code 128 Tập B (Start B = 104)
    values: List[int] = [104]
    for ch in cleaned_text:
        val = ord(ch) - 32
        if 0 <= val <= 95:
            values.append(val)
        else:
            values.append(0)  # ký tự thay thế an toàn nếu ngoài khoảng ASCII 32-127

    # 2. Tính checksum: (Start + sum(pos * val)) % 103
    checksum = values[0] + sum(i * val for i, val in enumerate(values[1:], 1))
    values.append(checksum % 103)
    values.append(106)  # Ký tự Stop

    # 3. Chuyển đổi dãy symbol thành các thanh đen và khoảng trắng
    widths: List[int] = []
    for sym_idx in values:
        pattern = CODE128_PATTERNS[sym_idx]
        for w_char in pattern:
            widths.append(int(w_char))

    # 4. Vẽ các hình chữ nhật SVG
    quiet_zone = 12 * module_width
    current_x = quiet_zone
    rects: List[str] = []
    is_bar = True  # Bắt đầu bằng thanh đen

    for w in widths:
        bar_w = w * module_width
        if is_bar:
            rects.append(
                f'<rect x="{current_x:.2f}" y="4" width="{bar_w:.2f}" height="{height}" fill="#000000" />'
            )
        current_x += bar_w
        is_bar = not is_bar

    total_width = current_x + quiet_zone
    total_height = height + (22 if include_text else 8)

    text_elem = ""
    if include_text:
        mid_x = total_width / 2.0
        text_y = height + 16
        text_elem = (
            f'<text x="{mid_x:.2f}" y="{text_y}" font-family="monospace, monospace" '
            f'font-size="12" font-weight="700" text-anchor="middle" fill="#1e293b">{cleaned_text}</text>'
        )

    svg_markup = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_width:.2f} {total_height}" '
        f'width="{total_width:.2f}" height="{total_height}" class="order-barcode-svg">\n'
        f'  <rect width="100%" height="100%" fill="#ffffff" />\n'
        f'  {"".join(rects)}\n'
        f'  {text_elem}\n'
        f'</svg>'
    )
    return svg_markup
