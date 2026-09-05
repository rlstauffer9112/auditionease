import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const performers = sqliteTable('performers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  voiceType: text('voice_type'), // e.g., Soprano, Alto, Tenor, Bass
  experience: text('experience'),
  notes: text('notes'),
  customFields: text('custom_fields'), // JSON string for dynamic attributes
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const customAttributes = sqliteTable('custom_attributes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  type: text('type').$type<'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect'>().notNull(),
  options: text('options'), // JSON string for select/multiselect options
  required: integer('required', { mode: 'boolean' }).default(false),
  order: integer('order').default(0),
});

export const auditions = sqliteTable('auditions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  date: text('date').notNull(),
  location: text('location'),
  status: text('status').$type<'open' | 'closed' | 'completed'>().default('open'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const auditionSlots = sqliteTable('audition_slots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  auditionId: integer('audition_id').references(() => auditions.id),
  performerId: integer('performer_id').references(() => performers.id),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  status: text('status').$type<'available' | 'booked' | 'completed' | 'no-show'>().default('available'),
  score: integer('score'), // Overall score from 1-10
  feedback: text('feedback'),
  passedToCallback: integer('passed_to_callback', { mode: 'boolean' }).default(false),
});

export const callbacks = sqliteTable('callbacks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  auditionId: integer('audition_id').references(() => auditions.id),
  performerId: integer('performer_id').references(() => performers.id),
  scheduledTime: text('scheduled_time'),
  notes: text('notes'),
  finalDecision: text('final_decision').$type<'accepted' | 'rejected' | 'pending'>().default('pending'),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const loginTokens = sqliteTable('login_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  used: integer('used', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
