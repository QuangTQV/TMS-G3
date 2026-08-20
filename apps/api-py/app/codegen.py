import time
import uuid


def generate_code(prefix: str) -> str:
    # Khớp cách sinh mã bên NestJS: `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0,4)}`.
    timestamp = int(time.time() * 1000)
    suffix = uuid.uuid4().hex[:4].upper()
    return f"{prefix}-{_to_base36(timestamp).upper()}-{suffix}"


def _to_base36(value: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    out = []
    while value > 0:
        value, rem = divmod(value, 36)
        out.append(digits[rem])
    return "".join(reversed(out))
