import { IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from "class-validator";

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