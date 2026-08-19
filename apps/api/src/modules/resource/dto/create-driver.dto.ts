import { IsOptional, IsString } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  fullName!: string;

  @IsString()
  phone!: string;

  @IsString()
  licenseNumber!: string;

  // Có giá trị nếu là tài xế thuộc nhà vận tải thuê ngoài; để trống = tài xế nội bộ G3.
  @IsOptional()
  @IsString()
  carrierId?: string;
}
