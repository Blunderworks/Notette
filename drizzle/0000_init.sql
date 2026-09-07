CREATE TYPE "public"."auth_request_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('dashboard', 'widget');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin');--> statement-breakpoint
CREATE TABLE "auth_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"poll_secret_hash" text NOT NULL,
	"status" "auth_request_status" DEFAULT 'pending' NOT NULL,
	"token" text,
	"session_id" text,
	"approved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_name" text,
	"author_email" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "feedback_status" DEFAULT 'open' NOT NULL,
	"body" text NOT NULL,
	"author_name" text,
	"author_email" text,
	"user_id" uuid,
	"url" text NOT NULL,
	"path" text NOT NULL,
	"page_title" text,
	"viewport_width" integer,
	"viewport_height" integer,
	"device_pixel_ratio" real,
	"scroll_x" integer,
	"scroll_y" integer,
	"click_x" integer,
	"click_y" integer,
	"element_selector" text,
	"element_xpath" text,
	"element_tag" text,
	"element_text" text,
	"element_attributes" jsonb,
	"element_rect" jsonb,
	"element_rel_x" real,
	"element_rel_y" real,
	"user_agent" text,
	"upload_token_hash" text,
	"deployment" jsonb,
	"metadata" jsonb,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"client_key" text NOT NULL,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"public_feedback_visible" boolean DEFAULT true NOT NULL,
	"reviewer_replies_enabled" boolean DEFAULT true NOT NULL,
	"screenshots_enabled" boolean DEFAULT true NOT NULL,
	"feedback_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "session_kind" NOT NULL,
	"project_id" uuid,
	"origin" text,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"feedback_id" uuid,
	"kind" text DEFAULT 'screenshot' NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_requests" ADD CONSTRAINT "auth_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_requests" ADD CONSTRAINT "auth_requests_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_requests" ADD CONSTRAINT "auth_requests_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_requests_expires_idx" ON "auth_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "comments_feedback_idx" ON "comments" USING btree ("feedback_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_project_number_idx" ON "feedback" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "feedback_project_path_idx" ON "feedback" USING btree ("project_id","path");--> statement-breakpoint
CREATE INDEX "feedback_project_status_idx" ON "feedback" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_client_key_idx" ON "projects" USING btree ("client_key");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "uploads_feedback_idx" ON "uploads" USING btree ("feedback_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");