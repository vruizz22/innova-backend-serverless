import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class TelemetryEventDto {
  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;

  @IsNumber()
  durationMs!: number;

  @IsDate()
  @Type(() => Date)
  timestamp!: Date;
}

export class TelemetryMetadataDto {
  @IsString()
  @IsNotEmpty()
  deviceType!: string;

  @IsString()
  @IsNotEmpty()
  clientVersion!: string;

  @IsNumber()
  fps!: number;
}

export class ParseRawTelemetryDto {
  @IsUUID()
  @IsNotEmpty()
  student_uuid!: string;

  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsDate()
  @Type(() => Date)
  timestamp!: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TelemetryEventDto)
  events!: TelemetryEventDto[];

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => TelemetryMetadataDto)
  metadata!: TelemetryMetadataDto;
}
