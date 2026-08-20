import re
from datetime import datetime
from decimal import Decimal

# Validate ISO 6346 check digit bằng code thường — không tin thẳng kết quả AI/OCR
# (ràng buộc 3, CLAUDE.md; docs/ai-processing.md nhóm A #5).
# Format: 4 chữ cái (3 chủ sở hữu + 1 loại thiết bị) + 6 chữ số + 1 check digit.

_LETTER_VALUES = {
    "A": 10, "B": 12, "C": 13, "D": 14, "E": 15, "F": 16, "G": 17, "H": 18,
    "I": 19, "J": 20, "K": 21, "L": 23, "M": 24, "N": 25, "O": 26, "P": 27,
    "Q": 28, "R": 29, "S": 30, "T": 31, "U": 32, "V": 34, "W": 35, "X": 36,
    "Y": 37, "Z": 38,
}
_CONTAINER_RE = re.compile(r"^[A-Z]{4}\d{7}$")


def is_valid_container_number(raw: str) -> bool:
    number = raw.strip().upper()
    if not _CONTAINER_RE.match(number):
        return False
    total = 0
    for i in range(10):
        char = number[i]
        value = _LETTER_VALUES[char] if i < 4 else int(char)
        total += value * (2**i)
    expected_check_digit = (total % 11) % 10
    return expected_check_digit == int(number[10])


# Validate bằng code thường sau khi AI đọc hóa đơn (ràng buộc 3, CLAUDE.md;
# docs/ai-processing.md nhóm B #11): total phải đúng bằng subtotal + vatAmount,
# và ngày hóa đơn không được ở tương lai.


def is_invoice_total_consistent(subtotal: Decimal, vat_amount: Decimal, total: Decimal) -> bool:
    return subtotal + vat_amount == total


def is_invoice_date_valid(invoice_date: datetime) -> bool:
    return invoice_date <= datetime.utcnow()
