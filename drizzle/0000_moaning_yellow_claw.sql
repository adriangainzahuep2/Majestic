CREATE TABLE "ai_outputs_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"system_id" integer,
	"input_type" varchar(50),
	"input_data" text,
	"output_type" varchar(50),
	"output_data" text,
	"processing_time" integer,
	"tokens_used" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"plan_date" date NOT NULL,
	"plan_data" text,
	"is_completed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "daily_plans_user_id_plan_date_unique" UNIQUE("user_id","plan_date")
);
--> statement-breakpoint
CREATE TABLE "health_systems" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "imaging_studies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"upload_id" integer,
	"system_id" integer,
	"study_type" varchar(100),
	"study_date" date,
	"findings" text,
	"summary" text,
	"metric_changes" text,
	"comparison_data" text,
	"thumbnail_path" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"upload_id" integer,
	"system_id" integer,
	"metric_name" varchar(255) NOT NULL,
	"metric_value" numeric,
	"metric_unit" varchar(50),
	"reference_range" text,
	"is_key_metric" boolean DEFAULT false,
	"is_outlier" boolean DEFAULT false,
	"test_date" date,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "metrics_user_id_metric_name_test_date_upload_id_unique" UNIQUE("user_id","metric_name","test_date","upload_id")
);
--> statement-breakpoint
CREATE TABLE "questionnaire_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"question_type" varchar(255) NOT NULL,
	"question" text NOT NULL,
	"response" text NOT NULL,
	"response_date" date DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"filename" varchar(255) NOT NULL,
	"file_type" varchar(50),
	"file_size" integer,
	"upload_type" varchar(50) DEFAULT 'manual',
	"storage_path" text,
	"processing_status" varchar(50) DEFAULT 'pending',
	"processing_error" text,
	"created_at" timestamp DEFAULT now(),
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_custom_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"metric_name" varchar(255) NOT NULL,
	"system_id" integer,
	"metric_unit" varchar(50),
	"reference_range" text,
	"source_type" varchar(50) DEFAULT 'user_created',
	"review_status" varchar(50) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"google_id" varchar(255),
	"name" varchar(255),
	"avatar_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "ai_outputs_log" ADD CONSTRAINT "ai_outputs_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_outputs_log" ADD CONSTRAINT "ai_outputs_log_system_id_health_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."health_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_system_id_health_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."health_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_system_id_health_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."health_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_custom_metrics" ADD CONSTRAINT "user_custom_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_custom_metrics" ADD CONSTRAINT "user_custom_metrics_system_id_health_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."health_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_custom_metrics_review" ON "user_custom_metrics" USING btree ("source_type","review_status");