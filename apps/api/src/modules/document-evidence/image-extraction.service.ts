import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIJobType } from '@prisma/client';
import type { SubmitAiResultDto } from './dto/submit-ai-result.dto';

/** Chuẩn duy nhất giữa các nhà cung cấp. Những field này đi thẳng vào
 * AIExtractionResult sau khi AIProcessingJobService chạy validation nghiệp vụ. */
export interface ExtractedImageStructure extends SubmitAiResultDto {
  provider: 'vlm' | 'ocr';
  method: 'vlm' | 'ocr' | 'vlm_then_ocr';
  diagnostics: { warnings: string[]; sourceText?: string };
}

interface ExtractImageInput {
  imageUrl: string;
  jobType: AIJobType;
  documentName: string;
}

interface ImageExtractor {
  extract(input: ExtractImageInput): Promise<ExtractedImageStructure>;
}

/**
 * Pipeline có thể cấu hình:
 * - vlm: gửi ảnh + schema cho endpoint OpenAI-compatible Chat Completions.
 * - ocr: gọi endpoint OCR HTTP trả { text, confidence? }, sau đó parse có kiểm tra.
 * - hybrid: ưu tiên VLM, chỉ fallback OCR khi VLM lỗi (không nhân đôi chi phí).
 *
 * Tất cả đều bị tắt mặc định để không đưa chứng từ ra ngoài trước khi chính sách
 * bảo mật được duyệt. Endpoint VLM/OCR có thể là gateway nội bộ, không bắt buộc là
 * một hãng cụ thể.
 */
@Injectable()
export class ImageExtractionService {
  constructor(private readonly config: ConfigService) {}

  async extract(input: ExtractImageInput): Promise<ExtractedImageStructure> {
    this.assertExternalProcessingAllowed(input.imageUrl);
    const mode = this.config.get<string>('AI_EXTRACTION_MODE', 'vlm_then_ocr');
    const vlm = new OpenAiCompatibleVlmExtractor(this.config);
    const ocr = new HttpOcrExtractor(this.config);
    if (mode === 'vlm') return vlm.extract(input);
    if (mode === 'ocr') return ocr.extract(input);
    try {
      return await vlm.extract(input);
    } catch (error) {
      try {
        const output = await ocr.extract(input);
        return {
          ...output,
          method: 'vlm_then_ocr',
          diagnostics: {
            ...output.diagnostics,
            warnings: ['VLM thất bại, dùng OCR fallback'],
          },
        };
      } catch {
        throw error;
      }
    }
  }

  private assertExternalProcessingAllowed(imageUrl: string) {
    if (this.config.get<string>('AI_EXTERNAL_PROCESSING_ENABLED') !== 'true') {
      throw new ServiceUnavailableException(
        'Xử lý ảnh AI ngoài hệ thống chưa được bật',
      );
    }
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      throw new BadRequestException('URL ảnh không hợp lệ');
    }
    if (url.protocol !== 'https:')
      throw new BadRequestException('Chỉ cho phép URL ảnh HTTPS');
    const allowed = (this.config.get<string>('AI_IMAGE_HOST_ALLOWLIST') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (allowed.length === 0 || !allowed.includes(url.hostname)) {
      throw new BadRequestException(
        'Host ảnh chưa nằm trong allowlist AI_IMAGE_HOST_ALLOWLIST',
      );
    }
  }
}

class OpenAiCompatibleVlmExtractor implements ImageExtractor {
  constructor(private readonly config: ConfigService) {}

  async extract(input: ExtractImageInput): Promise<ExtractedImageStructure> {
    const endpoint = this.config.get<string>('AI_VLM_ENDPOINT');
    const apiKey = this.config.get<string>('AI_VLM_API_KEY');
    const model = this.config.get<string>('AI_VLM_MODEL');
    if (!endpoint || !apiKey || !model)
      throw new ServiceUnavailableException('Thiếu cấu hình VLM');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: extractionPrompt(input) },
              {
                type: 'image_url',
                image_url: { url: input.imageUrl, detail: 'high' },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(
        Number(this.config.get<string>('AI_REQUEST_TIMEOUT_MS', '30000')),
      ),
    });
    if (!response.ok)
      throw new ServiceUnavailableException(
        `VLM trả lỗi HTTP ${response.status}`,
      );
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content)
      throw new ServiceUnavailableException(
        'VLM không trả nội dung trích xuất',
      );
    return normalizeStructuredResult(JSON.parse(content), 'vlm', 'vlm');
  }
}

class HttpOcrExtractor implements ImageExtractor {
  constructor(private readonly config: ConfigService) {}

  async extract(input: ExtractImageInput): Promise<ExtractedImageStructure> {
    const endpoint = this.config.get<string>('AI_OCR_ENDPOINT');
    const apiKey = this.config.get<string>('AI_OCR_API_KEY');
    if (!endpoint) throw new ServiceUnavailableException('Thiếu cấu hình OCR');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        imageUrl: input.imageUrl,
        documentType: input.documentName,
      }),
      signal: AbortSignal.timeout(
        Number(this.config.get<string>('AI_REQUEST_TIMEOUT_MS', '30000')),
      ),
    });
    if (!response.ok)
      throw new ServiceUnavailableException(
        `OCR trả lỗi HTTP ${response.status}`,
      );
    const body = (await response.json()) as {
      text?: string;
      confidence?: number;
      raw?: unknown;
    };
    if (!body.text)
      throw new ServiceUnavailableException('OCR không trả văn bản');
    return parseOcrText(body.text, input.jobType, body.confidence, body.raw);
  }
}

function extractionPrompt(input: ExtractImageInput) {
  const structure =
    input.jobType === AIJobType.INVOICE_OCR
      ? '{"confidence":0..1,"invoice":{"issuer":"string","invoiceNumber":"string","invoiceDate":"ISO-8601","subtotal":number,"vatAmount":number,"total":number},"warnings":["string"]}'
      : '{"confidence":0..1,"containerNumber":"string|null","plateNumber":"string|null","warnings":["string"]}';
  return `Trích xuất có cấu trúc từ ảnh ${input.documentName}. Chỉ trả JSON hợp lệ theo schema ${structure}. Không đoán dữ liệu thiếu; đặt null hoặc thêm warnings.`;
}

function normalizeStructuredResult(
  value: Record<string, unknown>,
  provider: 'vlm' | 'ocr',
  method: ExtractedImageStructure['method'],
): ExtractedImageStructure {
  const invoice = value.invoice as Record<string, unknown> | undefined;
  return {
    rawResult: { provider, method, extraction: value },
    confidence: numberOrUndefined(value.confidence),
    invoice: invoice
      ? {
          issuer: stringOrUndefined(invoice.issuer) ?? '',
          invoiceNumber: stringOrUndefined(invoice.invoiceNumber) ?? '',
          invoiceDate: stringOrUndefined(invoice.invoiceDate) ?? '',
          subtotal: Number(invoice.subtotal),
          vatAmount: Number(invoice.vatAmount),
          total: Number(invoice.total),
        }
      : undefined,
    containerNumber: stringOrUndefined(value.containerNumber),
    plateNumber: stringOrUndefined(value.plateNumber),
    provider,
    method,
    diagnostics: {
      warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
    },
  };
}

function parseOcrText(
  text: string,
  jobType: AIJobType,
  confidence?: number,
  raw?: unknown,
): ExtractedImageStructure {
  const compact = text.replace(/\s+/g, ' ').trim();
  const rawResult = { provider: 'ocr', text, providerRaw: raw ?? null };
  if (jobType === AIJobType.PHOTO_CHECK) {
    const container = compact.match(/\b[A-Z]{4}\d{7}\b/i)?.[0]?.toUpperCase();
    const plate = compact
      .match(/\b\d{2}[A-Z]{1,2}[- ]?\d{3,5}\b/i)?.[0]
      ?.toUpperCase();
    return {
      rawResult,
      confidence,
      containerNumber: container,
      plateNumber: plate,
      provider: 'ocr',
      method: 'ocr',
      diagnostics: { warnings: [], sourceText: text },
    };
  }
  return {
    rawResult,
    confidence,
    provider: 'ocr',
    method: 'ocr',
    diagnostics: {
      warnings: [
        'OCR chỉ trích xuất văn bản; cần VLM hoặc mapping riêng để nhận diện đầy đủ trường hóa đơn',
      ],
      sourceText: text,
    },
  };
}

function numberOrUndefined(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
function stringOrUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
