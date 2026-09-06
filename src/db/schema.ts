import { pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const performers = pgTable('performers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('performers_user_id_idx').on(table.userId),
]);

export const performerCustomFields = pgTable('performer_custom_fields', {
  id: serial('id').primaryKey(),
  performerId: integer('performer_id').references(() => performers.id).notNull(),
  customAttributeId: integer('custom_attribute_id').references(() => customAttributes.id).notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('performer_custom_fields_unique_idx').on(table.performerId, table.customAttributeId),
  index('performer_custom_fields_attribute_id_idx').on(table.customAttributeId),
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
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('auditions_user_id_idx').on(table.userId),
]);

export const auditionSlots = pgTable('audition_slots', {
  id: serial('id').primaryKey(),
  auditionId: integer('audition_id').references(() => auditions.id),
  performerId: integer('performer_id').references(() => performers.id),
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
  performerId: integer('performer_id').references(() => performers.id),
  scheduledTime: text('scheduled_time'),
  notes: text('notes'),
  finalDecision: text('final_decision').$type<'accepted' | 'rejected' | 'pending'>().default('pending'),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
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
