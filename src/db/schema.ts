import { pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex, numeric } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  notes: text('notes'),
  isTest: boolean('is_test').default(false).notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull(),
  plan: text('plan').$type<'personal' | 'business' | 'enterprise'>().notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  status: text('status').$type<'active' | 'canceled' | 'past_due' | 'incomplete'>().default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  endDate: timestamp('end_date').notNull(),
  cancelledOn: timestamp('cancelled_on'),
}, (table) => [
  index('subscriptions_user_id_idx').on(table.userId),
  index('subscriptions_stripe_sub_id_idx').on(table.stripeSubscriptionId),
]);

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
  divisionId: integer('division_id').references(() => divisions.id),
  label: text('label').notNull(),
  type: text('type').$type<'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect'>().notNull(),
  options: text('options'),
  required: boolean('required').default(false),
  order: integer('order').default(0),
}, (table) => [
  index('custom_attributes_user_id_idx').on(table.userId),
  index('custom_attributes_division_id_idx').on(table.divisionId),
]);

export const attributeSets = pgTable('attribute_sets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  divisionId: integer('division_id').references(() => divisions.id),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('attribute_sets_user_id_idx').on(table.userId),
  index('attribute_sets_division_id_idx').on(table.divisionId),
]);

export const attributeSetItems = pgTable('attribute_set_items', {
  id: serial('id').primaryKey(),
  attributeSetId: integer('attribute_set_id').references(() => attributeSets.id).notNull(),
  customAttributeId: integer('custom_attribute_id').references(() => customAttributes.id).notNull(),
}, (table) => [
  uniqueIndex('attribute_set_items_unique_idx').on(table.attributeSetId, table.customAttributeId),
  index('attribute_set_items_set_id_idx').on(table.attributeSetId),
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
  attributeSetId: integer('attribute_set_id').references(() => attributeSets.id),
  divisionId: integer('division_id').references(() => divisions.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('auditions_user_id_idx').on(table.userId),
  index('auditions_division_id_idx').on(table.divisionId),
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

export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: integer('owner_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('organizations_owner_id_idx').on(table.ownerId),
]);

export const orgUsers = pgTable('org_users', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').references(() => organizations.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  role: text('role').$type<'admin' | 'manager'>().notNull(),
  status: text('status').$type<'pending' | 'accepted'>().default('pending').notNull(),
  inviteToken: text('invite_token').unique(),
  invitedAt: timestamp('invited_at').defaultNow(),
  acceptedAt: timestamp('accepted_at'),
}, (table) => [
  uniqueIndex('org_users_unique_idx').on(table.organizationId, table.userId),
  index('org_users_user_id_idx').on(table.userId),
  index('org_users_org_id_idx').on(table.organizationId),
]);

export const divisions = pgTable('divisions', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').references(() => organizations.id).notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('divisions_org_id_idx').on(table.organizationId),
]);

export const divisionUsers = pgTable('division_users', {
  id: serial('id').primaryKey(),
  divisionId: integer('division_id').references(() => divisions.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
}, (table) => [
  uniqueIndex('division_users_unique_idx').on(table.divisionId, table.userId),
  index('division_users_division_id_idx').on(table.divisionId),
  index('division_users_user_id_idx').on(table.userId),
]);
