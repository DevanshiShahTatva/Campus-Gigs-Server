import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from "class-validator";

const STATUS = ['all', 'pending', 'under_review', 'resolved'];

const OUTCOME = ['provider_won', 'user_won'];

export class RatingDto {

  @IsNumber()
  @IsInt()
  gig_id: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  rating_feedback: string;

  @IsString()
  @ValidateIf((object, value) => object.rating < 4)
  issue_text: string;

  @IsString()
  @ValidateIf((object, value) => object.rating < 4)
  what_provider_done: string;
}

export class ChallengeComplaintDto {
  @IsInt()
  complaint_id: number;

  @IsString()
  @IsNotEmpty()
  provider_response: string;
}

export class DeputeQueryParams {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(STATUS)
  status?: string;
}

export class ResolveDeputeGigDto {
  @IsString()
  @IsNotEmpty()
  admin_notes: string;

  @IsEnum(OUTCOME)
  outcome: string;
}