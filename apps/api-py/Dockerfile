FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

# Tách layer dependency riêng khỏi code — chỉ rebuild layer này khi
# pyproject.toml/uv.lock đổi, không phải mỗi lần sửa file trong app/.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked

COPY app ./app

EXPOSE 8011
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8011"]
