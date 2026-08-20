from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_secret: str
    jwt_expires_in: str = "8h"
    port: int = 8011

    ai_external_processing_enabled: bool = False
    ai_extraction_mode: str = "vlm_then_ocr"
    ai_image_host_allowlist: str = ""
    ai_request_timeout_ms: int = 30000
    ai_vlm_endpoint: str = ""
    ai_vlm_api_key: str = ""
    ai_vlm_model: str = ""
    ai_ocr_endpoint: str = ""
    ai_ocr_api_key: str = ""


settings = Settings()
