import { pgTable, serial, varchar, text, integer, decimal, boolean, timestamp, date, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  googleId: varchar('google_id', { length: 255 }).unique(),
  name: varchar('name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Health Systems table
export const healthSystems = pgTable('health_systems', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Uploads table
export const uploads = pgTable('uploads', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 50 }),
  fileSize: integer('file_size'),
  uploadType: varchar('upload_type', { length: 50 }).default('manual'),
  storagePath: text('storage_path'),
  processingStatus: varchar('processing_status', { length: 50 }).default('pending'),
  processingError: text('processing_error'),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
});

// Metrics table
export const metrics = pgTable('metrics', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  uploadId: integer('upload_id').references(() => uploads.id, { onDelete: 'cascade' }),
  systemId: integer('system_id').references(() => healthSystems.id),
  metricName: varchar('metric_name', { length: 255 }).notNull(),
  metricValue: decimal('metric_value'),
  metricUnit: varchar('metric_unit', { length: 50 }),
  referenceRange: text('reference_range'),
  isKeyMetric: boolean('is_key_metric').default(false),
  isOutlier: boolean('is_outlier').default(false),
  testDate: date('test_date'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    uniqueMetric: unique().on(table.userId, table.metricName, table.testDate, table.uploadId),
  };
});

// Questionnaire Responses table
export const questionnaireResponses = pgTable('questionnaire_responses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  questionType: varchar('question_type', { length: 255 }).notNull(),
  question: text('question').notNull(),
  response: text('response').notNull(),
  responseDate: date('response_date').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

// AI Outputs Log table
export const aiOutputsLog = pgTable('ai_outputs_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  systemId: integer('system_id').references(() => healthSystems.id),
  inputType: varchar('input_type', { length: 50 }),
  inputData: text('input_data'),
  outputType: varchar('output_type', { length: 50 }),
  outputData: text('output_data'),
  processingTime: integer('processing_time'),
  tokensUsed: integer('tokens_used'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Daily Plans table
export const dailyPlans = pgTable('daily_plans', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  planDate: date('plan_date').notNull(),
  planData: text('plan_data'),
  isCompleted: boolean('is_completed').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    uniquePlan: unique().on(table.userId, table.planDate),
  };
});

// Imaging Studies table
export const imagingStudies = pgTable('imaging_studies', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  uploadId: integer('upload_id').references(() => uploads.id, { onDelete: 'cascade' }),
  systemId: integer('system_id').references(() => healthSystems.id),
  studyType: varchar('study_type', { length: 100 }),
  studyDate: date('study_date'),
  findings: text('findings'),
  summary: text('summary'),
  metricChanges: text('metric_changes'),
  comparisonData: text('comparison_data'),
  thumbnailPath: text('thumbnail_path'),
  createdAt: timestamp('created_at').defaultNow(),
});

// User Custom Metrics table
export const userCustomMetrics = pgTable('user_custom_metrics', {
  id: serial('id').primaryKey(),
  systemId: integer('system_id').references(() => healthSystems.id).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  metricName: text('metric_name').notNull(),
  value: text('value').notNull(),
  units: varchar('units', { length: 255 }).notNull(),
  normalRangeMin: decimal('normal_range_min'),
  normalRangeMax: decimal('normal_range_max'),
  rangeApplicableTo: varchar('range_applicable_to', { length: 255 }).notNull(),
  sourceType: varchar('source_type', { length: 50 }).notNull(),
  reviewStatus: varchar('review_status', { length: 50 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    idxUserCustomMetricsReview: index('idx_user_custom_metrics_review').on(table.sourceType, table.reviewStatus),
  };
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  uploads: many(uploads),
  metrics: many(metrics),
  questionnaireResponses: many(questionnaireResponses),
  aiOutputsLog: many(aiOutputsLog),
  dailyPlans: many(dailyPlans),
  imagingStudies: many(imagingStudies),
  userCustomMetrics: many(userCustomMetrics),
}));

export const healthSystemsRelations = relations(healthSystems, ({ many }) => ({
  metrics: many(metrics),
  aiOutputsLog: many(aiOutputsLog),
  imagingStudies: many(imagingStudies),
  userCustomMetrics: many(userCustomMetrics),
}));

export const uploadsRelations = relations(uploads, ({ one, many }) => ({
  user: one(users, {
    fields: [uploads.userId],
    references: [users.id],
  }),
  metrics: many(metrics),
  imagingStudies: many(imagingStudies),
}));

export const metricsRelations = relations(metrics, ({ one }) => ({
  user: one(users, {
    fields: [metrics.userId],
    references: [users.id],
  }),
  upload: one(uploads, {
    fields: [metrics.uploadId],
    references: [uploads.id],
  }),
  healthSystem: one(healthSystems, {
    fields: [metrics.systemId],
    references: [healthSystems.id],
  }),
}));

export const questionnaireResponsesRelations = relations(questionnaireResponses, ({ one }) => ({
  user: one(users, {
    fields: [questionnaireResponses.userId],
    references: [users.id],
  }),
}));

export const aiOutputsLogRelations = relations(aiOutputsLog, ({ one }) => ({
  user: one(users, {
    fields: [aiOutputsLog.userId],
    references: [users.id],
  }),
  healthSystem: one(healthSystems, {
    fields: [aiOutputsLog.systemId],
    references: [healthSystems.id],
  }),
}));

export const dailyPlansRelations = relations(dailyPlans, ({ one }) => ({
  user: one(users, {
    fields: [dailyPlans.userId],
    references: [users.id],
  }),
}));

export const imagingStudiesRelations = relations(imagingStudies, ({ one }) => ({
  user: one(users, {
    fields: [imagingStudies.userId],
    references: [users.id],
  }),
  upload: one(uploads, {
    fields: [imagingStudies.uploadId],
    references: [uploads.id],
  }),
  healthSystem: one(healthSystems, {
    fields: [imagingStudies.systemId],
    references: [healthSystems.id],
  }),
}));

export const userCustomMetricsRelations = relations(userCustomMetrics, ({ one }) => ({
  user: one(users, {
    fields: [userCustomMetrics.userId],
    references: [users.id],
  }),
  healthSystem: one(healthSystems, {
    fields: [userCustomMetrics.systemId],
    references: [healthSystems.id],
  }),
}));