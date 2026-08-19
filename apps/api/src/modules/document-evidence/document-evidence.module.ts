import { Module } from '@nestjs/common';
import { TripModule } from '../trip/trip.module';
import { TripCostModule } from '../trip-cost/trip-cost.module';
import { AIProcessingJobController } from './ai-processing-job.controller';
import { AIProcessingJobService } from './ai-processing-job.service';
import {
  DocumentEvidenceController,
  TripDocumentEvidenceController,
} from './document-evidence.controller';
import { DocumentEvidenceService } from './document-evidence.service';
import { RequiredDocumentTypeController } from './required-document-type.controller';
import { RequiredDocumentTypeService } from './required-document-type.service';
import { ImageExtractionService } from './image-extraction.service';

@Module({
  imports: [TripModule, TripCostModule],
  controllers: [
    RequiredDocumentTypeController,
    TripDocumentEvidenceController,
    DocumentEvidenceController,
    AIProcessingJobController,
  ],
  providers: [
    RequiredDocumentTypeService,
    DocumentEvidenceService,
    AIProcessingJobService,
    ImageExtractionService,
  ],
  exports: [DocumentEvidenceService],
})
export class DocumentEvidenceModule {}
