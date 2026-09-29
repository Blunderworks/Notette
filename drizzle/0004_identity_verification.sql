CREATE TYPE "public"."identity_mode" AS ENUM('off', 'secret', 'public_key', 'jwks');--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "external_user_id" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "external_user_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "identity_mode" "identity_mode" DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "identity_secret" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "identity_previous_secret" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "identity_public_key" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "identity_jwks_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "identity_issuer" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "identity_audience" text;