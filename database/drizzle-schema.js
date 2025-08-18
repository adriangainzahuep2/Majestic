const { pgTable, serial, text, varchar, integer, decimal, boolean, timestamp, date, jsonb, index, unique } = require('drizzle-orm/pg-core');
const { relations } = require('drizzle-orm');

// Users table
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  googleId: varchar('google_id', { length: 255 }).unique(),
  name: varchar('name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Health Systems table
const healthSystems = pgTable('health_systems', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow()
});

// Uploads table
const uploads = pgTable('uploads', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 100 }),
  fileSize: integer('file_size'),
  uploadType: varchar('upload_type', { length: 50 }).default('manual'),
  storagePath: text('storage_path'),
  processingStatus: varchar('processing_status', { length: 50 }).default('pending'),
  processingError: text('processing_error'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  userStatusIdx: index('idx_uploads_user_status').on(table.userId, table.processingStatus)
}));

// Metrics table
const metrics = pgTable('metrics', {
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
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  uniqueMetric: unique().on(table.userId, table.metricName, table.testDate, table.uploadId),
  userSystemIdx: index('idx_metrics_user_system').on(table.userId, table.systemId),
  testDateIdx: index('idx_metrics_test_date').on(table.testDate)
}));

// Questionnaire Responses table
const questionnaireResponses = pgTable('questionnaire_responses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  questionType: varchar('question_type', { length: 255 }).notNull(),
  question: text('question').notNull(),
  response: text('response').notNull(),
  responseDate: date('response_date').defaultNow(),
  createdAt: timestamp('created_at').defaultNow()
});

// AI Outputs Log table
const aiOutputsLog = pgTable('ai_outputs_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  outputType: varchar('output_type', { length: 100 }).notNull(),
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),
  modelVersion: varchar('model_version', { length: 50 }).default('gpt-4o'),
  processingTimeMs: integer('processing_time_ms'),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  userTypeIdx: index('idx_ai_outputs_user_type').on(table.userId, table.outputType)
}));

// User Custom Metrics table
const userCustomMetrics = pgTable('user_custom_metrics', {
  id: serial('id').primaryKey(),
  systemId: integer('system_id').references(() => healthSystems.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  metricName: varchar('metric_name', { length: 255 }).notNull(),
  value: varchar('value', { length: 100 }).notNull(),
  units: varchar('units', { length: 50 }),
  normalRangeMin: decimal('normal_range_min', { precision: 10, scale: 3 }),
  normalRangeMax: decimal('normal_range_max', { precision: 10, scale: 3 }),
  rangeApplicableTo: varchar('range_applicable_to', { length: 100 }).default('General'),
  sourceType: varchar('source_type', { length: 50 }).default('user'),
  reviewStatus: varchar('review_status', { length: 50 }).default('pending'),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  userSystemIdx: index('idx_user_custom_metrics_user_system').on(table.userId, table.systemId),
  reviewIdx: index('idx_user_custom_metrics_review').on(table.sourceType, table.reviewStatus)
}));

// Imaging Studies table
const imagingStudies = pgTable('imaging_studies', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  linkedSystemId: integer('linked_system_id').references(() => healthSystems.id),
  studyType: varchar('study_type', { length: 100 }),
  fileUrl: text('file_url'),
  thumbnailUrl: text('thumbnail_url'),
  testDate: date('test_date'),
  aiSummary: text('ai_summary'),
  metricsJson: jsonb('metrics_json'),
  comparisonSummary: text('comparison_summary'),
  metricChangesJson: jsonb('metric_changes_json'),
  status: varchar('status', { length: 50 }).default('pendingProcessing'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  userSystemIdx: index('idx_imaging_studies_user_system').on(table.userId, table.linkedSystemId),
  typeDateIdx: index('idx_imaging_studies_type_date').on(table.studyType, table.testDate)
}));

// Relations
const usersRelations = relations(users, ({ many }) => ({
  uploads: many(uploads),
  metrics: many(metrics),
  questionnaireResponses: many(questionnaireResponses),
  aiOutputsLog: many(aiOutputsLog),
  userCustomMetrics: many(userCustomMetrics),
  imagingStudies: many(imagingStudies)
}));

const healthSystemsRelations = relations(healthSystems, ({ many }) => ({
  metrics: many(metrics),
  userCustomMetrics: many(userCustomMetrics),
  imagingStudies: many(imagingStudies)
}));

const uploadsRelations = relations(uploads, ({ one, many }) => ({
  user: one(users, {
    fields: [uploads.userId],
    references: [users.id]
  }),
  metrics: many(metrics)
}));

const metricsRelations = relations(metrics, ({ one }) => ({
  user: one(users, {
    fields: [metrics.userId],
    references: [users.id]
  }),
  upload: one(uploads, {
    fields: [metrics.uploadId],
    references: [uploads.id]
  }),
  healthSystem: one(healthSystems, {
    fields: [metrics.systemId],
    references: [healthSystems.id]
  })
}));

// Export all tables and relations
module.exports = {
  users,
  healthSystems,
  uploads,
  metrics,
  questionnaireResponses,
  aiOutputsLog,
  userCustomMetrics,
  imagingStudies,
  usersRelations,
  healthSystemsRelations,
  uploadsRelations,
  metricsRelations
};