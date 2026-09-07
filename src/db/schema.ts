import { pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  notes: text('notes'),
  isTest: boolean('is_test').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditionUsers = pgTable('audition_users', {
  id: serial('id').primaryKey(),
  auditionId: integer('audition_id').references(() => auditions.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('audition_users_unique_idx').on(table.auditionId, table.userId),
  index('audition_users_user_id_idx').on(table.userId),
]);

export const auditionUserCustomFields = pgTable('audition_user_custom_fields', {
  id: serial('id').primaryKey(),
  auditionUserId: integer('audition_user_id').references(() => auditionUsers.id).notNull(),
  customAttributeId: integer('custom_attribute_id').references(() => customAttributes.id).notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('audition_user_custom_fields_unique_idx').on(table.auditionUserId, table.customAttributeId),
  index('audition_user_custom_fields_attribute_id_idx').on(table.customAttributeId),
]);

export const customAttributes = pgTable('custom_attributes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  label: text('label').notNull(),
  type: text('type').$type<'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect'>().notNull(),
  options: text('options'),
  required: boolean('required').default(false),
  order: integer('order').default(0),
}, (table) => [
  index('custom_attributes_user_id_idx').on(table.userId),
]);

export const auditions = pgTable('auditions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  date: text('date').notNull(),
  location: text('location'),
  status: text('status').$type<'open' | 'closed' | 'completed'>().default('open'),
  inviteCode: text('invite_code').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('auditions_user_id_idx').on(table.userId),
]);

export const auditionSlots = pgTable('audition_slots', {
  id: serial('id').primaryKey(),
  auditionId: integer('audition_id').references(() => auditions.id),
  userId: integer('user_id').references(() => users.id),
  date: text('date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  status: text('status').$type<'available' | 'booked' | 'completed' | 'no-show' | 'closed'>().default('available'),
  score: integer('score'),
  feedback: text('feedback'),
  passedToCallback: boolean('passed_to_callback').default(false),
});

export const callbacks = pgTable('callbacks', {
  id: serial('id').primaryKey(),
  auditionId: integer('audition_id').references(() => auditions.id),
  userId: integer('user_id').references(() => users.id),
  scheduledTime: text('scheduled_time'),
  notes: text('notes'),
  finalDecision: text('final_decision').$type<'accepted' | 'rejected' | 'pending'>().default('pending'),
});

export const loginTokens = pgTable('login_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
});

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  criteria: text('criteria').notNull().default('[]'),
  columns: text('columns').notNull().default('[]'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('reports_user_id_idx').on(table.userId),
]);
