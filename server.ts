import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { db } from './src/db';
import { auditions, auditionSlots, judges, auditionRounds, roundCriteria, roundParticipants, roundEvaluations, roundScores, scoringTemplates, scoringTemplateCriteria, customAttributes, auditionUsers, auditionUserCustomFields, users, loginTokens, userSettings, reports, subscriptions, attributeSets, attributeSetItems, organizations, orgUsers, divisions, divisionUsers } from './src/db/schema';
import { eq, and, or, asc, gt, lte, desc, sql, inArray, isNull, isNotNull } from 'drizzle-orm';
import cors from 'cors';
import { BrevoClient } from '@getbrevo/brevo';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Stripe from 'stripe';
import { getPlanLimits } from './src/planLimits';
import { evaluateRound, type AdvanceRule } from './src/lib/roundScoring';
import { normalizeAuditionSettings, mergeAuditionSettings } from './src/lib/auditionSettings';

const client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY || '' });

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

const UNAMBIGUOUS_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateInviteCode(): string {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, b => UNAMBIGUOUS_CHARS[b % UNAMBIGUOUS_CHARS.length]).join('');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

  // Stripe webhook needs raw body — must be before express.json()
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any;
          const userId = parseInt(session.metadata?.userId || '0');
          const plan = session.metadata?.plan as 'business' | 'enterprise';
          const amount = session.metadata?.amount || '0';

          if (userId && session.subscription) {
            const sub = await stripe.subscriptions.retrieve(session.subscription as string) as any;
            const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
            await db.insert(subscriptions).values({
              userId,
              stripeSubscriptionId: sub.id,
              plan,
              amount,
              status: 'active',
              endDate: periodEnd ? new Date(periodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });

            if (session.customer) {
              await db.update(users)
                .set({ stripeCustomerId: session.customer as string })
                .where(eq(users.id, userId));
            }
          }
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object as any;
          if (invoice.subscription) {
            const sub = await stripe.subscriptions.retrieve(invoice.subscription as string) as any;
            const iPeriodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
            await db.update(subscriptions)
              .set({
                status: 'active',
                endDate: iPeriodEnd ? new Date(iPeriodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                amount: (invoice.amount_paid / 100).toFixed(2),
              })
              .where(eq(subscriptions.stripeSubscriptionId, sub.id));
          }
          break;
        }
        case 'customer.subscription.updated': {
          const sub = event.data.object as any;
          const uPeriodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
          await db.update(subscriptions)
            .set({
              status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled',
              endDate: uPeriodEnd ? new Date(uPeriodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            })
            .where(eq(subscriptions.stripeSubscriptionId, sub.id));
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as any;
          await db.update(subscriptions)
            .set({ status: 'canceled', cancelledOn: new Date() })
            .where(eq(subscriptions.stripeSubscriptionId, sub.id));
          break;
        }
      }
    } catch (err) {
      console.error('Webhook handler error:', err);
    }

    res.json({ received: true });
  });

  app.use(express.json());

  // --- Auth Helper ---
  const getUserIdFromRequest = (req: express.Request): number | null => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return null;
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
      return decoded.userId;
    } catch {
      return null;
    }
  };

  const verifyAuditionOwnership = async (auditionId: number, userId: number): Promise<boolean> => {
    const audition = await db.select({
      id: auditions.id,
      userId: auditions.userId,
      divisionId: auditions.divisionId,
    }).from(auditions)
      .where(eq(auditions.id, auditionId))
      .then(rows => rows[0]);

    if (!audition) return false;
    if (audition.userId === userId) return true;
    if (!audition.divisionId) return false;

    const division = await db.select({ organizationId: divisions.organizationId })
      .from(divisions).where(eq(divisions.id, audition.divisionId)).then(r => r[0]);
    if (!division) return false;

    const org = await db.select({ id: organizations.id }).from(organizations)
      .where(and(eq(organizations.id, division.organizationId), eq(organizations.ownerId, userId)))
      .then(r => r[0]);
    if (org) return true;

    const adminMembership = await db.select({ id: orgUsers.id }).from(orgUsers)
      .where(and(
        eq(orgUsers.organizationId, division.organizationId),
        eq(orgUsers.userId, userId),
        eq(orgUsers.role, 'admin'),
        eq(orgUsers.status, 'accepted'),
      )).then(r => r[0]);
    if (adminMembership) return true;

    const managerAssignment = await db.select({ id: divisionUsers.id }).from(divisionUsers)
      .where(and(eq(divisionUsers.divisionId, audition.divisionId), eq(divisionUsers.userId, userId)))
      .then(r => r[0]);
    return !!managerAssignment;
  };

  async function getAccessibleAuditionConditions(userId: number) {
    const orgResult = await getUserOrg(userId);
    const conditions: any[] = [eq(auditions.userId, userId)];

    if (orgResult) {
      if (orgResult.role === 'owner' || orgResult.role === 'admin') {
        const orgDivs = await db.select({ id: divisions.id }).from(divisions)
          .where(eq(divisions.organizationId, orgResult.org.id));
        const ids = orgDivs.map(d => d.id);
        if (ids.length > 0) conditions.push(inArray(auditions.divisionId, ids));
      } else if (orgResult.role === 'manager') {
        const myDivs = await db.select({ divisionId: divisionUsers.divisionId }).from(divisionUsers)
          .where(eq(divisionUsers.userId, userId));
        const ids = myDivs.map(d => d.divisionId);
        if (ids.length > 0) conditions.push(inArray(auditions.divisionId, ids));
      }
    }

    return or(...conditions)!;
  }

  async function getAccessibleDivisionIds(userId: number): Promise<number[]> {
    const orgResult = await getUserOrg(userId);
    if (!orgResult) return [];
    if (orgResult.role === 'owner' || orgResult.role === 'admin') {
      const orgDivs = await db.select({ id: divisions.id }).from(divisions)
        .where(eq(divisions.organizationId, orgResult.org.id));
      return orgDivs.map(d => d.id);
    }
    const myDivs = await db.select({ divisionId: divisionUsers.divisionId }).from(divisionUsers)
      .where(eq(divisionUsers.userId, userId));
    return myDivs.map(d => d.divisionId);
  }

  function canAccessAttribute(attr: { userId: number; divisionId: number | null }, userId: number, accessibleDivisionIds: number[]): boolean {
    if (attr.divisionId) return accessibleDivisionIds.includes(attr.divisionId);
    return attr.userId === userId;
  }

  // --- Judges ---
  // Anyone who can manage an audition can judge it. Listed judge emails can judge auditions in the
  // division (division auditions) or of the owner (personal auditions) that listed them.
  const getUserEmail = async (userId: number) => {
    const u = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).then(r => r[0]);
    return u ? u.email.trim().toLowerCase() : null;
  };

  const judgeScopeCondition = (audition: { userId: number; divisionId: number | null }) =>
    audition.divisionId
      ? eq(judges.divisionId, audition.divisionId)
      : and(eq(judges.ownerUserId, audition.userId), isNull(judges.divisionId));

  const getAuditionRole = async (auditionId: number, userId: number): Promise<'manager' | 'judge' | null> => {
    if (!Number.isFinite(auditionId)) return null;
    if (await verifyAuditionOwnership(auditionId, userId)) return 'manager';
    const audition = await db.select({ userId: auditions.userId, divisionId: auditions.divisionId })
      .from(auditions).where(eq(auditions.id, auditionId)).then(r => r[0]);
    if (!audition) return null;
    const email = await getUserEmail(userId);
    if (!email) return null;
    const listed = await db.select({ id: judges.id }).from(judges)
      .where(and(eq(judges.email, email), judgeScopeCondition(audition))).limit(1);
    return listed.length > 0 ? 'judge' : null;
  };

  const getAuditionSettings = async (auditionId: number) => {
    const row = await db.select({ settings: auditions.settings }).from(auditions).where(eq(auditions.id, auditionId)).then(r => r[0]);
    return normalizeAuditionSettings(row?.settings);
  };

  // Auditions a user can judge only because their email is on a judge list
  const getJudgeOnlyAuditions = async (userId: number) => {
    const email = await getUserEmail(userId);
    if (!email) return [];
    const rows = await db.selectDistinct({
      id: auditions.id,
      title: auditions.title,
      date: auditions.date,
      location: auditions.location,
      status: auditions.status,
      divisionId: auditions.divisionId,
      divisionTitle: divisions.title,
    }).from(judges)
      .innerJoin(auditions, or(
        and(isNotNull(judges.divisionId), eq(auditions.divisionId, judges.divisionId)),
        and(isNotNull(judges.ownerUserId), eq(auditions.userId, judges.ownerUserId), isNull(auditions.divisionId)),
      ))
      .leftJoin(divisions, eq(divisions.id, auditions.divisionId))
      .where(eq(judges.email, email));
    const managed = new Set((await db.select({ id: auditions.id }).from(auditions)
      .where(await getAccessibleAuditionConditions(userId))).map(a => a.id));
    return rows.filter(r => !managed.has(r.id));
  };

  // Who can maintain a judge list: division managers/admins/owner for a division; the account owner
  // (Business or Enterprise plan) for their personal auditions.
  const canManageJudgeScope = async (userId: number, divisionId: number | null): Promise<string | null> => {
    if (divisionId) {
      const divIds = await getAccessibleDivisionIds(userId);
      return divIds.includes(divisionId) ? null : 'Forbidden';
    }
    const sub = await db.select({ plan: subscriptions.plan }).from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
      .orderBy(desc(subscriptions.createdAt)).then(r => r[0]);
    if (sub?.plan !== 'business' && sub?.plan !== 'enterprise') return 'Judges require a Business or Enterprise plan';
    return null;
  };

  // --- API Routes ---

  // Admin Stats (restricted to user id 10)
  app.get('/api/admin/stats', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (userId !== 10) return res.status(403).json({ error: 'Forbidden' });

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        totalUsersResult,
        totalAuditionsResult,
        totalSubscriptionsResult,
        totalSlotsResult,
        bookedSlotsResult,
        completedSlotsResult,
        totalRoundsResult,
        openRoundsResult,
        closedRoundsResult,
        totalEvaluationsResult,
        totalInviteSignupsResult,
        subscriptionsByPlanResult,
        auditionsByStatusResult,
        recentUsersResult,
        usersLast30Result,
        auditionsLast30Result,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(users),
        db.select({ count: sql<number>`count(*)::int` }).from(auditions),
        db.select({ count: sql<number>`count(*)::int` }).from(subscriptions).where(eq(subscriptions.status, 'active')),
        db.select({ count: sql<number>`count(*)::int` }).from(auditionSlots),
        db.select({ count: sql<number>`count(*)::int` }).from(auditionSlots).where(eq(auditionSlots.status, 'booked')),
        db.select({ count: sql<number>`count(*)::int` }).from(auditionSlots).where(eq(auditionSlots.status, 'completed')),
        db.select({ count: sql<number>`count(*)::int` }).from(auditionRounds),
        db.select({ count: sql<number>`count(*)::int` }).from(auditionRounds).where(eq(auditionRounds.status, 'open')),
        db.select({ count: sql<number>`count(*)::int` }).from(auditionRounds).where(eq(auditionRounds.status, 'closed')),
        db.select({ count: sql<number>`count(*)::int` }).from(roundEvaluations),
        db.select({ count: sql<number>`count(*)::int` }).from(auditionUsers),
        db.select({ plan: subscriptions.plan, count: sql<number>`count(*)::int` }).from(subscriptions).where(eq(subscriptions.status, 'active')).groupBy(subscriptions.plan),
        db.select({ status: auditions.status, count: sql<number>`count(*)::int` }).from(auditions).groupBy(auditions.status),
        db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, createdAt: users.createdAt }).from(users).orderBy(desc(users.id)).limit(20),
        db.select({ count: sql<number>`count(*)::int` }).from(users).where(gt(users.createdAt, thirtyDaysAgo)),
        db.select({ count: sql<number>`count(*)::int` }).from(auditions).where(gt(auditions.createdAt, thirtyDaysAgo)),
      ]);

      res.json({
        totalUsers: totalUsersResult[0].count,
        totalAuditions: totalAuditionsResult[0].count,
        totalSubscriptions: totalSubscriptionsResult[0].count,
        totalInviteSignups: totalInviteSignupsResult[0].count,
        totalSlots: totalSlotsResult[0].count,
        bookedSlots: bookedSlotsResult[0].count,
        completedSlots: completedSlotsResult[0].count,
        totalRounds: totalRoundsResult[0].count,
        openRounds: openRoundsResult[0].count,
        closedRounds: closedRoundsResult[0].count,
        totalEvaluations: totalEvaluationsResult[0].count,
        subscriptionsByPlan: subscriptionsByPlanResult,
        auditionsByStatus: auditionsByStatusResult,
        recentUsers: recentUsersResult,
        usersCreatedLast30Days: usersLast30Result[0].count,
        auditionsCreatedLast30Days: auditionsLast30Result[0].count,
      });
    } catch (err) {
      console.error('Admin stats error:', err);
      res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
  });

  // User Settings
  app.get('/api/user-settings', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch user settings' });
    }
  });

  app.get('/api/user-settings/:key', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const setting = await db.select().from(userSettings)
        .where(and(eq(userSettings.userId, userId), eq(userSettings.key, req.params.key)))
        .then(rows => rows[0]);
      if (!setting) return res.status(404).json({ error: 'Setting not found' });
      res.json(setting);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch setting' });
    }
  });

  app.put('/api/user-settings/:key', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { value } = req.body;
      const existing = await db.select().from(userSettings)
        .where(and(eq(userSettings.userId, userId), eq(userSettings.key, req.params.key)))
        .then(rows => rows[0]);

      if (existing) {
        const updated = await db.update(userSettings)
          .set({ value })
          .where(eq(userSettings.id, existing.id))
          .returning();
        res.json(updated[0]);
      } else {
        const created = await db.insert(userSettings)
          .values({ userId, key: req.params.key, value })
          .returning();
        res.json(created[0]);
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to save setting' });
    }
  });

  app.delete('/api/user-settings/:key', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      await db.delete(userSettings)
        .where(and(eq(userSettings.userId, userId), eq(userSettings.key, req.params.key)));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete setting' });
    }
  });

  // Custom Attributes
  app.get('/api/custom-attributes', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const divIds = await getAccessibleDivisionIds(userId);
      const userOrg = await getUserOrg(userId);
      const conditions: any[] = [];
      if (!userOrg) conditions.push(and(eq(customAttributes.userId, userId), isNull(customAttributes.divisionId)));
      if (divIds.length > 0) conditions.push(inArray(customAttributes.divisionId, divIds));
      if (conditions.length === 0) return res.json([]);
      const attrs = await db.select().from(customAttributes).where(or(...conditions)).orderBy(asc(customAttributes.order));
      res.json(attrs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch custom attributes' });
    }
  });

  app.post('/api/custom-attributes', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { divisionId, ...rest } = req.body;
      if (divisionId) {
        const divIds = await getAccessibleDivisionIds(userId);
        if (!divIds.includes(divisionId)) return res.status(403).json({ error: 'Forbidden' });
      }
      const scopeCondition = divisionId
        ? eq(customAttributes.divisionId, divisionId)
        : and(eq(customAttributes.userId, userId), isNull(customAttributes.divisionId));
      const [maxRow] = await db.select({ maxOrder: sql<number>`coalesce(max(${customAttributes.order}), -1)` })
        .from(customAttributes).where(scopeCondition);
      const nextOrder = (maxRow?.maxOrder ?? -1) + 1;
      const newAttr = await db.insert(customAttributes).values({ ...rest, userId, divisionId: divisionId || null, order: nextOrder }).returning();
      res.json(newAttr[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create custom attribute' });
    }
  });

  app.put('/api/custom-attributes/reorder', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { orderedIds } = req.body as { orderedIds: number[] };
      if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
      const divIds = await getAccessibleDivisionIds(userId);
      const conditions = [and(eq(customAttributes.userId, userId), isNull(customAttributes.divisionId))];
      if (divIds.length > 0) conditions.push(inArray(customAttributes.divisionId, divIds));
      const existing = await db.select({ id: customAttributes.id }).from(customAttributes)
        .where(or(...conditions));
      const ownedIds = new Set(existing.map(r => r.id));
      for (const id of orderedIds) {
        if (!ownedIds.has(id)) return res.status(403).json({ error: 'Forbidden' });
      }
      await Promise.all(orderedIds.map((id, index) =>
        db.update(customAttributes).set({ order: index }).where(eq(customAttributes.id, id))
      ));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to reorder attributes' });
    }
  });

  app.delete('/api/custom-attributes/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const attrId = parseInt(req.params.id);
      const attr = await db.select().from(customAttributes).where(eq(customAttributes.id, attrId)).then(rows => rows[0]);
      if (!attr) return res.status(404).json({ error: 'Not found' });
      const divIds = await getAccessibleDivisionIds(userId);
      if (!canAccessAttribute(attr, userId, divIds)) return res.status(403).json({ error: 'Forbidden' });
      await db.delete(auditionUserCustomFields).where(eq(auditionUserCustomFields.customAttributeId, attrId));
      await db.delete(attributeSetItems).where(eq(attributeSetItems.customAttributeId, attrId));
      await db.delete(customAttributes).where(eq(customAttributes.id, attrId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete custom attribute' });
    }
  });

  // Attribute Sets
  app.get('/api/attribute-sets', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const divIds = await getAccessibleDivisionIds(userId);
      const userOrg = await getUserOrg(userId);
      const conditions: any[] = [];
      if (!userOrg) conditions.push(and(eq(attributeSets.userId, userId), isNull(attributeSets.divisionId)));
      if (divIds.length > 0) conditions.push(inArray(attributeSets.divisionId, divIds));
      if (conditions.length === 0) return res.json([]);
      const sets = await db.select().from(attributeSets).where(or(...conditions));
      const allItems = sets.length > 0
        ? await db.select().from(attributeSetItems).where(inArray(attributeSetItems.attributeSetId, sets.map(s => s.id)))
        : [];
      const itemsBySet = new Map<number, number[]>();
      for (const item of allItems) {
        let arr = itemsBySet.get(item.attributeSetId);
        if (!arr) { arr = []; itemsBySet.set(item.attributeSetId, arr); }
        arr.push(item.customAttributeId);
      }
      res.json(sets.map(s => ({ ...s, attributeIds: itemsBySet.get(s.id) || [] })));
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch attribute sets' });
    }
  });

  app.post('/api/attribute-sets', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { name, attributeIds, divisionId } = req.body as { name: string; attributeIds: number[]; divisionId?: number };
      if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
      const divIds = await getAccessibleDivisionIds(userId);
      if (divisionId && !divIds.includes(divisionId)) return res.status(403).json({ error: 'Forbidden' });
      const [newSet] = await db.insert(attributeSets).values({ userId, divisionId: divisionId || null, name: name.trim() }).returning();
      if (Array.isArray(attributeIds) && attributeIds.length > 0) {
        const attrConditions = [and(eq(customAttributes.userId, userId), isNull(customAttributes.divisionId))];
        if (divIds.length > 0) attrConditions.push(inArray(customAttributes.divisionId, divIds));
        const owned = await db.select({ id: customAttributes.id }).from(customAttributes).where(or(...attrConditions));
        const ownedIds = new Set(owned.map(r => r.id));
        const valid = attributeIds.filter(id => ownedIds.has(id));
        if (valid.length > 0) {
          await db.insert(attributeSetItems).values(valid.map(attrId => ({ attributeSetId: newSet.id, customAttributeId: attrId })));
        }
      }
      res.json({ ...newSet, attributeIds: attributeIds || [] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create attribute set' });
    }
  });

  app.patch('/api/attribute-sets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const setId = parseInt(req.params.id);
      const existing = await db.select().from(attributeSets).where(eq(attributeSets.id, setId)).then(rows => rows[0]);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const divIds = await getAccessibleDivisionIds(userId);
      if (!canAccessAttribute(existing, userId, divIds)) return res.status(403).json({ error: 'Forbidden' });
      const { name, attributeIds } = req.body as { name?: string; attributeIds?: number[] };
      if (name !== undefined) {
        if (!name.trim()) return res.status(400).json({ error: 'Name is required' });
        await db.update(attributeSets).set({ name: name.trim() }).where(eq(attributeSets.id, setId));
      }
      if (Array.isArray(attributeIds)) {
        await db.delete(attributeSetItems).where(eq(attributeSetItems.attributeSetId, setId));
        if (attributeIds.length > 0) {
          const attrConditions = [and(eq(customAttributes.userId, userId), isNull(customAttributes.divisionId))];
          if (divIds.length > 0) attrConditions.push(inArray(customAttributes.divisionId, divIds));
          const owned = await db.select({ id: customAttributes.id }).from(customAttributes).where(or(...attrConditions));
          const ownedIds = new Set(owned.map(r => r.id));
          const valid = attributeIds.filter(id => ownedIds.has(id));
          if (valid.length > 0) {
            await db.insert(attributeSetItems).values(valid.map(attrId => ({ attributeSetId: setId, customAttributeId: attrId })));
          }
        }
      }
      const updated = await db.select().from(attributeSets).where(eq(attributeSets.id, setId)).then(rows => rows[0]);
      const items = await db.select().from(attributeSetItems).where(eq(attributeSetItems.attributeSetId, setId));
      res.json({ ...updated, attributeIds: items.map(i => i.customAttributeId) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update attribute set' });
    }
  });

  app.delete('/api/attribute-sets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const setId = parseInt(req.params.id);
      const existing = await db.select().from(attributeSets).where(eq(attributeSets.id, setId)).then(rows => rows[0]);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const divIds = await getAccessibleDivisionIds(userId);
      if (!canAccessAttribute(existing, userId, divIds)) return res.status(403).json({ error: 'Forbidden' });
      await db.update(auditions).set({ attributeSetId: null }).where(eq(auditions.attributeSetId, setId));
      await db.delete(attributeSetItems).where(eq(attributeSetItems.attributeSetId, setId));
      await db.delete(attributeSets).where(eq(attributeSets.id, setId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete attribute set' });
    }
  });

  // Audition Users (vocalists participating in an audition)
  app.get('/api/auditions/:id/users', async (req, res) => {
    const currentUserId = getUserIdFromRequest(req);
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });
    const auditionId = parseInt(req.params.id);
    if (!await verifyAuditionOwnership(auditionId, currentUserId)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const auRows = await db.select().from(auditionUsers)
        .where(eq(auditionUsers.auditionId, auditionId));
      if (auRows.length === 0) return res.json([]);

      const auIds = auRows.map(au => au.id);
      const userIds = auRows.map(au => au.userId);

      const [usersData, cfValues] = await Promise.all([
        db.select().from(users).where(inArray(users.id, userIds)),
        db.select().from(auditionUserCustomFields).where(inArray(auditionUserCustomFields.auditionUserId, auIds)),
      ]);

      const userMap = new Map(usersData.map(u => [u.id, u]));
      const cfByAuId = new Map<number, (typeof cfValues)[number][]>();
      for (const cf of cfValues) {
        let arr = cfByAuId.get(cf.auditionUserId);
        if (!arr) { arr = []; cfByAuId.set(cf.auditionUserId, arr); }
        arr.push(cf);
      }

      res.json(auRows.map(au => {
        const user = userMap.get(au.userId);
        return {
          auditionUserId: au.id,
          userId: au.userId,
          firstName: user?.firstName ?? '',
          lastName: user?.lastName ?? '',
          email: user?.email ?? '',
          phone: user?.phone ?? '',
          notes: user?.notes ?? '',
          customFieldValues: cfByAuId.get(au.id) || [],
        };
      }));
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch audition users' });
    }
  });

  app.patch('/api/audition-users/:auId', async (req, res) => {
    const currentUserId = getUserIdFromRequest(req);
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });
    const auId = parseInt(req.params.auId);
    try {
      const auRow = await db.select().from(auditionUsers).where(eq(auditionUsers.id, auId)).then(r => r[0]);
      if (!auRow) return res.status(404).json({ error: 'Not found' });
      if (!await verifyAuditionOwnership(auRow.auditionId, currentUserId)) return res.status(403).json({ error: 'Forbidden' });

      const { firstName, lastName, phone, customFieldValues } = req.body;
      if (firstName !== undefined || lastName !== undefined || phone !== undefined) {
        const updates: Record<string, any> = {};
        if (firstName !== undefined) updates.firstName = firstName;
        if (lastName !== undefined) updates.lastName = lastName;
        if (phone !== undefined) updates.phone = phone || null;
        await db.update(users).set(updates).where(eq(users.id, auRow.userId));
      }

      if (customFieldValues && Array.isArray(customFieldValues)) {
        const existingCf = await db.select().from(auditionUserCustomFields)
          .where(eq(auditionUserCustomFields.auditionUserId, auId));
        const existingMap = new Map(existingCf.map(cf => [cf.customAttributeId, cf]));
        const incomingCfs: { customAttributeId: number; value: string }[] = customFieldValues;
        const incomingIds = new Set(incomingCfs.map(cf => cf.customAttributeId));

        for (const cf of incomingCfs) {
          const prev = existingMap.get(cf.customAttributeId);
          if (prev) {
            if (prev.value !== cf.value) {
              await db.update(auditionUserCustomFields)
                .set({ value: cf.value, updatedAt: new Date() })
                .where(eq(auditionUserCustomFields.id, prev.id));
            }
          } else {
            await db.insert(auditionUserCustomFields).values({
              auditionUserId: auId,
              customAttributeId: cf.customAttributeId,
              value: cf.value,
              updatedAt: new Date(),
            });
          }
        }
        const removedIds = existingCf
          .filter(cf => !incomingIds.has(cf.customAttributeId))
          .map(cf => cf.id);
        if (removedIds.length > 0) {
          await db.delete(auditionUserCustomFields).where(inArray(auditionUserCustomFields.id, removedIds));
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update applicant' });
    }
  });

  // Auditions
  app.get('/api/auditions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const whereCondition = await getAccessibleAuditionConditions(userId);
      const allAuditions = await db
        .select({
          id: auditions.id,
          userId: auditions.userId,
          title: auditions.title,
          description: auditions.description,
          date: auditions.date,
          location: auditions.location,
          status: auditions.status,
          inviteCode: auditions.inviteCode,
          attributeSetId: auditions.attributeSetId,
          settings: auditions.settings,
          divisionId: auditions.divisionId,
          divisionTitle: sql<string | null>`(select title from divisions where divisions.id = auditions.division_id)`,
          createdAt: auditions.createdAt,
          userCount: sql<number>`${sql.raw("cast((select count(*) from audition_users where audition_users.audition_id = auditions.id) as int)")}`,
          openSlots: sql<number>`${sql.raw("cast((select count(*) from audition_slots where audition_slots.audition_id = auditions.id and audition_slots.status = 'available') as int)")}`,
          filledSlots: sql<number>`${sql.raw("cast((select count(*) from audition_slots where audition_slots.audition_id = auditions.id and audition_slots.status in ('booked', 'completed', 'no-show')) as int)")}`,
        })
        .from(auditions)
        .where(whereCondition);
      res.json(allAuditions);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch auditions' });
    }
  });

  app.post('/api/auditions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const sub = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
        .orderBy(desc(subscriptions.createdAt))
        .then(rows => rows[0]);
      const limits = getPlanLimits(sub?.plan);
      if (limits.maxAuditions !== Infinity) {
        const countResult = await db.select({ count: sql<number>`cast(count(*) as int)` })
          .from(auditions).where(eq(auditions.userId, userId));
        if (countResult[0].count >= limits.maxAuditions) {
          return res.status(403).json({
            error: `Your plan allows up to ${limits.maxAuditions} auditions. Please upgrade to add more.`,
            code: 'AUDITION_LIMIT',
          });
        }
      }
      const { inviteCode, attributeSetId, divisionId: rawDivisionId, settings, ...rest } = req.body;
      const code = (inviteCode || generateInviteCode()).trim();
      if (code.length === 0 || code.length > 31) {
        return res.status(400).json({ error: 'Invite code must be between 1 and 31 characters' });
      }
      if (!/^[A-Za-z0-9_-]+$/.test(code)) {
        return res.status(400).json({ error: 'Invite code can only contain letters, numbers, underscores, and dashes' });
      }
      const existing = await db.select({ id: auditions.id }).from(auditions)
        .where(sql`lower(${auditions.inviteCode}) = ${code.toLowerCase()}`);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Invite code is already in use' });
      }
      const setId = attributeSetId ? parseInt(attributeSetId) : null;

      let divisionId: number | null = null;
      const orgResult = await getUserOrg(userId);
      if (orgResult) {
        if (!rawDivisionId) {
          return res.status(400).json({ error: 'Organization members must select a division' });
        }
        divisionId = parseInt(rawDivisionId);
        const div = await db.select().from(divisions)
          .where(and(eq(divisions.id, divisionId), eq(divisions.organizationId, orgResult.org.id)))
          .then(r => r[0]);
        if (!div) {
          return res.status(400).json({ error: 'Invalid division' });
        }
        if (orgResult.role === 'manager') {
          const assignment = await db.select().from(divisionUsers)
            .where(and(eq(divisionUsers.divisionId, divisionId), eq(divisionUsers.userId, userId)))
            .then(r => r[0]);
          if (!assignment) {
            return res.status(403).json({ error: 'You are not assigned to this division' });
          }
        }
      }

      const newAudition = await db.insert(auditions).values({ ...rest, userId, inviteCode: code, attributeSetId: setId || null, divisionId, settings: normalizeAuditionSettings(settings) }).returning();
      res.json(newAudition[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create audition' });
    }
  });

  app.patch('/api/auditions/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const auditionId = parseInt(req.params.id);
    if (!await verifyAuditionOwnership(auditionId, userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    try {
      const { title, description, date, location, status, inviteCode, attributeSetId, settings } = req.body;
      if (inviteCode !== undefined) {
        const code = inviteCode.trim();
        if (code.length === 0 || code.length > 31) {
          return res.status(400).json({ error: 'Invite code must be between 1 and 31 characters' });
        }
        if (!/^[A-Za-z0-9_-]+$/.test(code)) {
          return res.status(400).json({ error: 'Invite code can only contain letters, numbers, underscores, and dashes' });
        }
        const existing = await db.select({ id: auditions.id }).from(auditions)
          .where(and(sql`lower(${auditions.inviteCode}) = ${code.toLowerCase()}`, sql`${auditions.id} != ${auditionId}`));
        if (existing.length > 0) {
          return res.status(409).json({ error: 'Invite code is already in use' });
        }
      }
      const updates: Record<string, any> = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (date !== undefined) updates.date = date;
      if (location !== undefined) updates.location = location;
      if (status !== undefined) updates.status = status;
      if (inviteCode !== undefined) updates.inviteCode = inviteCode.trim();
      if (attributeSetId !== undefined) updates.attributeSetId = attributeSetId ? parseInt(attributeSetId) : null;
      if (settings !== undefined) {
        const current = await db.select({ settings: auditions.settings }).from(auditions).where(eq(auditions.id, auditionId)).then(r => r[0]);
        updates.settings = mergeAuditionSettings(current?.settings, settings);
      }
      const updated = await db.update(auditions).set(updates).where(eq(auditions.id, auditionId)).returning();
      res.json(updated[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update audition' });
    }
  });

  app.delete('/api/auditions/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const auditionId = parseInt(req.params.id);
    if (!await verifyAuditionOwnership(auditionId, userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    try {
      const auRows = await db.select({ id: auditionUsers.id }).from(auditionUsers)
        .where(eq(auditionUsers.auditionId, auditionId));
      if (auRows.length > 0) {
        await db.delete(auditionUserCustomFields)
          .where(inArray(auditionUserCustomFields.auditionUserId, auRows.map(r => r.id)));
      }
      await db.delete(auditionUsers).where(eq(auditionUsers.auditionId, auditionId));
      await db.delete(auditionSlots).where(eq(auditionSlots.auditionId, auditionId));
      await db.delete(auditionRounds).where(eq(auditionRounds.auditionId, auditionId));
      await db.delete(auditions).where(eq(auditions.id, auditionId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete audition' });
    }
  });

  // Slots
  app.get('/api/auditions/:id/slots', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const auditionId = parseInt(req.params.id);
    if (!await verifyAuditionOwnership(auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const slots = await db.select().from(auditionSlots).where(eq(auditionSlots.auditionId, auditionId));
      res.json(slots);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch slots' });
    }
  });

  app.post('/api/slots', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!await verifyAuditionOwnership(req.body.auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const newSlot = await db.insert(auditionSlots).values(req.body).returning();
      res.json(newSlot[0]);
    } catch (err) {
      console.error('Failed to create slot:', err);
      res.status(500).json({ error: 'Failed to create slot' });
    }
  });

  app.patch('/api/slots/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const slot = await db.select().from(auditionSlots).where(eq(auditionSlots.id, parseInt(req.params.id))).then(rows => rows[0]);
      if (!slot || !slot.auditionId || !await verifyAuditionOwnership(slot.auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });
      const updates: Record<string, any> = {};
      for (const key of ['userId', 'status', 'date', 'startTime', 'endTime'] as const) {
        if (req.body?.[key] !== undefined) updates[key] = req.body[key];
      }
      if (Object.keys(updates).length === 0) return res.json(slot);
      const updatedSlot = await db.update(auditionSlots)
        .set(updates)
        .where(eq(auditionSlots.id, parseInt(req.params.id)))
        .returning();
      res.json(updatedSlot[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update slot' });
    }
  });

  app.delete('/api/slots/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const slot = await db.select().from(auditionSlots).where(eq(auditionSlots.id, parseInt(req.params.id))).then(rows => rows[0]);
      if (!slot || !slot.auditionId || !await verifyAuditionOwnership(slot.auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });
      if (slot.userId) return res.status(400).json({ error: 'Cannot delete a slot that has an applicant assigned' });
      await db.delete(auditionSlots).where(eq(auditionSlots.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete slot' });
    }
  });

  // --- Scoring Templates & Rounds ---

  type CriterionInput = { id?: number; title: string; description: string | null; maxScore: number; weight: number };

  const toNumber = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  // Validates a criteria array from a request body. Returns an error string or the cleaned list.
  const parseCriteriaInput = (input: unknown): CriterionInput[] | string => {
    if (!Array.isArray(input)) return 'Criteria must be a list';
    const out: CriterionInput[] = [];
    for (const raw of input) {
      const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
      if (!title) return 'Each criterion needs a title';
      const maxScore = toNumber(raw?.maxScore) ?? 10;
      const weight = toNumber(raw?.weight) ?? 1;
      if (maxScore <= 0) return `Max score for "${title}" must be greater than 0`;
      if (weight < 0) return `Weight for "${title}" cannot be negative`;
      out.push({
        id: typeof raw?.id === 'number' ? raw.id : undefined,
        title,
        description: typeof raw?.description === 'string' && raw.description.trim() ? raw.description.trim() : null,
        maxScore,
        weight,
      });
    }
    return out;
  };

  const DEFAULT_CRITERIA: CriterionInput[] = [{ title: 'Overall', description: null, maxScore: 10, weight: 1 }];

  const getTemplatesWithCriteria = async (templateIds: number[]) => {
    if (templateIds.length === 0) return [];
    const [templates, criteria] = await Promise.all([
      db.select().from(scoringTemplates).where(inArray(scoringTemplates.id, templateIds)),
      db.select().from(scoringTemplateCriteria).where(inArray(scoringTemplateCriteria.templateId, templateIds)).orderBy(asc(scoringTemplateCriteria.order), asc(scoringTemplateCriteria.id)),
    ]);
    return templates.map(t => ({ ...t, criteria: criteria.filter(c => c.templateId === t.id) }));
  };

  const loadAccessibleTemplate = async (templateId: number, userId: number) => {
    const template = await db.select().from(scoringTemplates).where(eq(scoringTemplates.id, templateId)).then(r => r[0]);
    if (!template) return null;
    const divIds = await getAccessibleDivisionIds(userId);
    if (!canAccessAttribute({ userId: template.userId ?? 0, divisionId: template.divisionId }, userId, divIds)) return null;
    return template;
  };

  const loadRoundForUser = async (roundId: number, userId: number) => {
    if (!Number.isFinite(roundId)) return null;
    const round = await db.select().from(auditionRounds).where(eq(auditionRounds.id, roundId)).then(r => r[0]);
    if (!round || !await verifyAuditionOwnership(round.auditionId, userId)) return null;
    return round;
  };

  const loadRoundParticipantForUser = async (rpId: number, userId: number) => {
    if (!Number.isFinite(rpId)) return null;
    const participant = await db.select().from(roundParticipants).where(eq(roundParticipants.id, rpId)).then(r => r[0]);
    if (!participant) return null;
    const round = await loadRoundForUser(participant.roundId, userId);
    if (!round) return null;
    return { participant, round };
  };

  // Like loadRoundForUser, but also lets listed judges in (for viewing and scoring only)
  const loadRoundWithRole = async (roundId: number, userId: number) => {
    if (!Number.isFinite(roundId)) return null;
    const round = await db.select().from(auditionRounds).where(eq(auditionRounds.id, roundId)).then(r => r[0]);
    if (!round) return null;
    const role = await getAuditionRole(round.auditionId, userId);
    if (!role) return null;
    return { round, role };
  };

  const loadRoundParticipantWithRole = async (rpId: number, userId: number) => {
    if (!Number.isFinite(rpId)) return null;
    const participant = await db.select().from(roundParticipants).where(eq(roundParticipants.id, rpId)).then(r => r[0]);
    if (!participant) return null;
    const found = await loadRoundWithRole(participant.roundId, userId);
    if (!found) return null;
    return { participant, ...found };
  };

  // Resolve criteria for a new round from a template, an explicit list, or the default.
  const resolveCriteriaSource = async (userId: number, templateId: unknown, criteria: unknown): Promise<CriterionInput[] | string> => {
    if (templateId) {
      const template = await loadAccessibleTemplate(Number(templateId), userId);
      if (!template) return 'Template not found';
      const [withCriteria] = await getTemplatesWithCriteria([template.id]);
      if (withCriteria.criteria.length === 0) return 'Template has no criteria';
      return withCriteria.criteria.map(c => ({ title: c.title, description: c.description, maxScore: c.maxScore, weight: c.weight }));
    }
    if (criteria !== undefined) {
      const parsed = parseCriteriaInput(criteria);
      if (typeof parsed === 'string') return parsed;
      return parsed.length > 0 ? parsed : DEFAULT_CRITERIA;
    }
    return DEFAULT_CRITERIA;
  };

  // Load everything needed to score a round: criteria + participants with all judges' evaluations.
  const loadRoundScoringData = async (roundId: number, executor: any = db) => {
    const criteria = await executor.select().from(roundCriteria).where(eq(roundCriteria.roundId, roundId))
      .orderBy(asc(roundCriteria.order), asc(roundCriteria.id));
    const participants = await executor.select().from(roundParticipants).where(eq(roundParticipants.roundId, roundId));
    const rpIds = participants.map((p: any) => p.id);
    const evaluations = rpIds.length > 0
      ? await executor.select({
          id: roundEvaluations.id,
          roundParticipantId: roundEvaluations.roundParticipantId,
          judgeUserId: roundEvaluations.judgeUserId,
          comment: roundEvaluations.comment,
          updatedAt: roundEvaluations.updatedAt,
          judgeFirstName: users.firstName,
          judgeLastName: users.lastName,
        }).from(roundEvaluations)
          .innerJoin(users, eq(users.id, roundEvaluations.judgeUserId))
          .where(inArray(roundEvaluations.roundParticipantId, rpIds))
      : [];
    const evIds = evaluations.map((e: any) => e.id);
    const scores = evIds.length > 0
      ? await executor.select().from(roundScores).where(inArray(roundScores.evaluationId, evIds))
      : [];
    const scoresByEval = new Map<number, { criterionId: number; score: number }[]>();
    for (const s of scores) {
      let arr = scoresByEval.get(s.evaluationId);
      if (!arr) { arr = []; scoresByEval.set(s.evaluationId, arr); }
      arr.push({ criterionId: s.roundCriterionId, score: s.score });
    }
    const evalsByParticipant = new Map<number, any[]>();
    for (const e of evaluations) {
      let arr = evalsByParticipant.get(e.roundParticipantId);
      if (!arr) { arr = []; evalsByParticipant.set(e.roundParticipantId, arr); }
      arr.push({
        id: e.id,
        judgeUserId: e.judgeUserId,
        judgeName: `${e.judgeFirstName} ${e.judgeLastName}`.trim(),
        comment: e.comment,
        updatedAt: e.updatedAt,
        scores: scoresByEval.get(e.id) || [],
      });
    }
    return {
      criteria,
      participants: participants.map((p: any) => ({ ...p, evaluations: evalsByParticipant.get(p.id) || [] })),
    };
  };

  const insertRoundCriteria = async (executor: any, roundId: number, criteria: CriterionInput[]) => {
    if (criteria.length === 0) return;
    await executor.insert(roundCriteria).values(criteria.map((c, i) => ({
      roundId, title: c.title, description: c.description, maxScore: c.maxScore, weight: c.weight, order: i,
    })));
  };

  const addAuditionUsersToRound = async (roundId: number, auditionId: number, onlyAuditionUserIds?: number[]) => {
    const conditions = [eq(auditionUsers.auditionId, auditionId)];
    if (onlyAuditionUserIds) {
      if (onlyAuditionUserIds.length === 0) return 0;
      conditions.push(inArray(auditionUsers.id, onlyAuditionUserIds));
    }
    const auRows = await db.select({ id: auditionUsers.id }).from(auditionUsers).where(and(...conditions));
    if (auRows.length === 0) return 0;
    const inserted = await db.insert(roundParticipants)
      .values(auRows.map(au => ({ roundId, auditionUserId: au.id })))
      .onConflictDoNothing()
      .returning({ id: roundParticipants.id });
    return inserted.length;
  };

  // Judge lists
  app.get('/api/judges', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const divisionId = req.query.divisionId ? parseInt(String(req.query.divisionId)) : null;
      if (divisionId) {
        const divIds = await getAccessibleDivisionIds(userId);
        if (!divIds.includes(divisionId)) return res.status(403).json({ error: 'Forbidden' });
      }
      const rows = await db.select({
        id: judges.id,
        email: judges.email,
        createdAt: judges.createdAt,
        firstName: users.firstName,
        lastName: users.lastName,
      }).from(judges)
        .leftJoin(users, eq(sql`lower(${users.email})`, judges.email))
        .where(divisionId ? eq(judges.divisionId, divisionId) : and(eq(judges.ownerUserId, userId), isNull(judges.divisionId)))
        .orderBy(asc(judges.email));
      res.json(rows.map(r => ({ ...r, hasAccount: r.firstName !== null })));
    } catch (err) {
      console.error('Failed to fetch judges:', err);
      res.status(500).json({ error: 'Failed to fetch judges' });
    }
  });

  app.post('/api/judges', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const divisionId = req.body?.divisionId ? Number(req.body.divisionId) : null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
      const denied = await canManageJudgeScope(userId, divisionId);
      if (denied) return res.status(403).json({ error: denied });
      const [row] = await db.insert(judges).values({
        email,
        divisionId,
        ownerUserId: divisionId ? null : userId,
        addedByUserId: userId,
      }).onConflictDoNothing().returning();
      if (!row) return res.status(409).json({ error: 'That email is already a judge' });
      res.json(row);
    } catch (err) {
      console.error('Failed to add judge:', err);
      res.status(500).json({ error: 'Failed to add judge' });
    }
  });

  app.delete('/api/judges/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const row = await db.select().from(judges).where(eq(judges.id, parseInt(req.params.id))).then(r => r[0]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.divisionId) {
        const divIds = await getAccessibleDivisionIds(userId);
        if (!divIds.includes(row.divisionId)) return res.status(403).json({ error: 'Forbidden' });
      } else if (row.ownerUserId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await db.delete(judges).where(eq(judges.id, row.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to remove judge' });
    }
  });

  // Auditions the current user can judge because they're on a judge list, with their progress in any open round
  app.get('/api/judging', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const list = await getJudgeOnlyAuditions(userId);
      if (list.length === 0) return res.json([]);
      const openRounds = await db.select().from(auditionRounds)
        .where(and(inArray(auditionRounds.auditionId, list.map(a => a.id)), eq(auditionRounds.status, 'open')));
      const roundIds = openRounds.map(r => r.id);
      const [criteriaCounts, participantCounts, myScoreCounts] = roundIds.length > 0 ? await Promise.all([
        db.select({ roundId: roundCriteria.roundId, n: sql<number>`count(*)::int` }).from(roundCriteria)
          .where(inArray(roundCriteria.roundId, roundIds)).groupBy(roundCriteria.roundId),
        db.select({ roundId: roundParticipants.roundId, n: sql<number>`count(*)::int` }).from(roundParticipants)
          .where(inArray(roundParticipants.roundId, roundIds)).groupBy(roundParticipants.roundId),
        // Scores I've entered per participant, to count people I've fully scored
        db.select({ roundId: roundParticipants.roundId, participantId: roundParticipants.id, n: sql<number>`count(*)::int` })
          .from(roundScores)
          .innerJoin(roundEvaluations, eq(roundEvaluations.id, roundScores.evaluationId))
          .innerJoin(roundParticipants, eq(roundParticipants.id, roundEvaluations.roundParticipantId))
          .where(and(inArray(roundParticipants.roundId, roundIds), eq(roundEvaluations.judgeUserId, userId)))
          .groupBy(roundParticipants.roundId, roundParticipants.id),
      ]) : [[], [], []];
      res.json(list.map(a => {
        const round = openRounds.find(r => r.auditionId === a.id);
        if (!round) return { ...a, openRound: null };
        const criteriaCount = criteriaCounts.find(c => c.roundId === round.id)?.n ?? 0;
        return {
          ...a,
          openRound: {
            id: round.id,
            title: round.title,
            participantCount: participantCounts.find(c => c.roundId === round.id)?.n ?? 0,
            scoredByMe: myScoreCounts.filter(c => c.roundId === round.id && c.n >= criteriaCount).length,
          },
        };
      }));
    } catch (err) {
      console.error('Failed to fetch judging list:', err);
      res.status(500).json({ error: 'Failed to fetch judging list' });
    }
  });

  // Scoring templates (user-level or division-level, same scoping as attribute sets)
  app.get('/api/scoring-templates', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const divIds = await getAccessibleDivisionIds(userId);
      const userOrg = await getUserOrg(userId);
      const conditions: any[] = [];
      if (!userOrg) conditions.push(and(eq(scoringTemplates.userId, userId), isNull(scoringTemplates.divisionId)));
      if (divIds.length > 0) conditions.push(inArray(scoringTemplates.divisionId, divIds));
      if (conditions.length === 0) return res.json([]);
      const rows = await db.select({ id: scoringTemplates.id }).from(scoringTemplates).where(or(...conditions));
      const templates = await getTemplatesWithCriteria(rows.map(r => r.id));
      templates.sort((a, b) => a.name.localeCompare(b.name));
      res.json(templates);
    } catch (err) {
      console.error('Failed to fetch scoring templates:', err);
      res.status(500).json({ error: 'Failed to fetch scoring templates' });
    }
  });

  app.post('/api/scoring-templates', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { name, description, divisionId, criteria } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required' });
      const parsed = parseCriteriaInput(criteria ?? []);
      if (typeof parsed === 'string') return res.status(400).json({ error: parsed });
      if (parsed.length === 0) return res.status(400).json({ error: 'Add at least one criterion' });
      const divIds = await getAccessibleDivisionIds(userId);
      if (divisionId && !divIds.includes(Number(divisionId))) return res.status(403).json({ error: 'Forbidden' });
      const [template] = await db.insert(scoringTemplates).values({
        userId,
        divisionId: divisionId ? Number(divisionId) : null,
        name: name.trim(),
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
      }).returning();
      await db.insert(scoringTemplateCriteria).values(parsed.map((c, i) => ({
        templateId: template.id, title: c.title, description: c.description, maxScore: c.maxScore, weight: c.weight, order: i,
      })));
      const [result] = await getTemplatesWithCriteria([template.id]);
      res.json(result);
    } catch (err) {
      console.error('Failed to create scoring template:', err);
      res.status(500).json({ error: 'Failed to create scoring template' });
    }
  });

  app.patch('/api/scoring-templates/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const template = await loadAccessibleTemplate(parseInt(req.params.id), userId);
      if (!template) return res.status(404).json({ error: 'Not found' });
      const { name, description, criteria } = req.body || {};
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required' });
        updates.name = name.trim();
      }
      if (description !== undefined) {
        updates.description = typeof description === 'string' && description.trim() ? description.trim() : null;
      }
      let parsed: CriterionInput[] | null = null;
      if (criteria !== undefined) {
        const result = parseCriteriaInput(criteria);
        if (typeof result === 'string') return res.status(400).json({ error: result });
        if (result.length === 0) return res.status(400).json({ error: 'Add at least one criterion' });
        parsed = result;
      }
      await db.transaction(async (tx) => {
        await tx.update(scoringTemplates).set(updates).where(eq(scoringTemplates.id, template.id));
        if (parsed) {
          await tx.delete(scoringTemplateCriteria).where(eq(scoringTemplateCriteria.templateId, template.id));
          await tx.insert(scoringTemplateCriteria).values(parsed.map((c, i) => ({
            templateId: template.id, title: c.title, description: c.description, maxScore: c.maxScore, weight: c.weight, order: i,
          })));
        }
      });
      const [result] = await getTemplatesWithCriteria([template.id]);
      res.json(result);
    } catch (err) {
      console.error('Failed to update scoring template:', err);
      res.status(500).json({ error: 'Failed to update scoring template' });
    }
  });

  app.delete('/api/scoring-templates/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const template = await loadAccessibleTemplate(parseInt(req.params.id), userId);
      if (!template) return res.status(404).json({ error: 'Not found' });
      await db.delete(scoringTemplates).where(eq(scoringTemplates.id, template.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete scoring template' });
    }
  });

  // Copy a template, optionally into another scope (personal or a division)
  app.post('/api/scoring-templates/:id/duplicate', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const template = await loadAccessibleTemplate(parseInt(req.params.id), userId);
      if (!template) return res.status(404).json({ error: 'Not found' });
      const body = req.body || {};
      const targetDivisionId = body.divisionId === undefined ? template.divisionId : (body.divisionId ? Number(body.divisionId) : null);
      if (targetDivisionId) {
        const divIds = await getAccessibleDivisionIds(userId);
        if (!divIds.includes(targetDivisionId)) return res.status(403).json({ error: 'Forbidden' });
      }
      const [source] = await getTemplatesWithCriteria([template.id]);
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : `${template.name} (copy)`;
      const [copy] = await db.insert(scoringTemplates).values({
        userId, divisionId: targetDivisionId, name, description: template.description,
      }).returning();
      if (source.criteria.length > 0) {
        await db.insert(scoringTemplateCriteria).values(source.criteria.map((c, i) => ({
          templateId: copy.id, title: c.title, description: c.description, maxScore: c.maxScore, weight: c.weight, order: i,
        })));
      }
      const [result] = await getTemplatesWithCriteria([copy.id]);
      res.json(result);
    } catch (err) {
      console.error('Failed to duplicate scoring template:', err);
      res.status(500).json({ error: 'Failed to duplicate scoring template' });
    }
  });

  // Rounds
  app.get('/api/auditions/:id/rounds', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const auditionId = parseInt(req.params.id);
    if (!await getAuditionRole(auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const rounds = await db.select().from(auditionRounds).where(eq(auditionRounds.auditionId, auditionId))
        .orderBy(asc(auditionRounds.roundNumber));
      const roundIds = rounds.map(r => r.id);
      const [criteria, counts] = roundIds.length > 0 ? await Promise.all([
        db.select().from(roundCriteria).where(inArray(roundCriteria.roundId, roundIds)).orderBy(asc(roundCriteria.order), asc(roundCriteria.id)),
        db.select({
          roundId: roundParticipants.roundId,
          total: sql<number>`count(*)::int`,
          advanced: sql<number>`count(*) filter (where ${roundParticipants.status} = 'advanced')::int`,
        }).from(roundParticipants).where(inArray(roundParticipants.roundId, roundIds)).groupBy(roundParticipants.roundId),
      ]) : [[], []];
      res.json(rounds.map(r => {
        const c = counts.find(x => x.roundId === r.id);
        return {
          ...r,
          criteria: criteria.filter(x => x.roundId === r.id),
          participantCount: c?.total ?? 0,
          advancedCount: c?.advanced ?? 0,
        };
      }));
    } catch (err) {
      console.error('Failed to fetch rounds:', err);
      res.status(500).json({ error: 'Failed to fetch rounds' });
    }
  });

  // Start Round 1 with every audition participant
  app.post('/api/auditions/:id/rounds', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const auditionId = parseInt(req.params.id);
    if (!await verifyAuditionOwnership(auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const existing = await db.select({ id: auditionRounds.id }).from(auditionRounds).where(eq(auditionRounds.auditionId, auditionId));
      if (existing.length > 0) return res.status(400).json({ error: 'This audition already has rounds' });
      const { title, templateId, criteria } = req.body || {};
      const resolved = await resolveCriteriaSource(userId, templateId, criteria);
      if (typeof resolved === 'string') return res.status(400).json({ error: resolved });
      const [round] = await db.insert(auditionRounds).values({
        auditionId,
        roundNumber: 1,
        title: typeof title === 'string' && title.trim() ? title.trim() : 'Round 1',
      }).returning();
      await insertRoundCriteria(db, round.id, resolved);
      await addAuditionUsersToRound(round.id, auditionId);
      res.json(round);
    } catch (err) {
      console.error('Failed to create round:', err);
      res.status(500).json({ error: 'Failed to create round' });
    }
  });

  app.patch('/api/rounds/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const round = await loadRoundForUser(parseInt(req.params.id), userId);
      if (!round) return res.status(404).json({ error: 'Round not found' });
      const { title, advanceRule, advanceValue } = req.body || {};
      const updates: Record<string, any> = {};
      if (title !== undefined) {
        if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Title is required' });
        updates.title = title.trim();
      }
      if (advanceRule !== undefined) {
        if (advanceRule !== 'top_n' && advanceRule !== 'min_score') return res.status(400).json({ error: 'Invalid advance rule' });
        updates.advanceRule = advanceRule;
      }
      if (advanceValue !== undefined) updates.advanceValue = toNumber(advanceValue);
      if (Object.keys(updates).length === 0) return res.json(round);
      const [updated] = await db.update(auditionRounds).set(updates).where(eq(auditionRounds.id, round.id)).returning();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update round' });
    }
  });

  // Replace a round's criteria. Existing criteria (by id) keep their scores; removed ones lose them.
  app.put('/api/rounds/:id/criteria', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const round = await loadRoundForUser(parseInt(req.params.id), userId);
      if (!round) return res.status(404).json({ error: 'Round not found' });
      if (round.status !== 'open') return res.status(400).json({ error: 'Round is closed' });
      const parsed = parseCriteriaInput(req.body?.criteria);
      if (typeof parsed === 'string') return res.status(400).json({ error: parsed });
      if (parsed.length === 0) return res.status(400).json({ error: 'Add at least one criterion' });
      await db.transaction(async (tx) => {
        const current = await tx.select({ id: roundCriteria.id }).from(roundCriteria).where(eq(roundCriteria.roundId, round.id));
        const currentIds = new Set(current.map(c => c.id));
        const keepIds = new Set(parsed.filter(c => c.id && currentIds.has(c.id)).map(c => c.id!));
        const removeIds = [...currentIds].filter(id => !keepIds.has(id));
        if (removeIds.length > 0) await tx.delete(roundCriteria).where(inArray(roundCriteria.id, removeIds));
        for (let i = 0; i < parsed.length; i++) {
          const c = parsed[i];
          const values = { title: c.title, description: c.description, maxScore: c.maxScore, weight: c.weight, order: i };
          if (c.id && keepIds.has(c.id)) {
            await tx.update(roundCriteria).set(values).where(eq(roundCriteria.id, c.id));
          } else {
            await tx.insert(roundCriteria).values({ roundId: round.id, ...values });
          }
        }
      });
      const criteria = await db.select().from(roundCriteria).where(eq(roundCriteria.roundId, round.id))
        .orderBy(asc(roundCriteria.order), asc(roundCriteria.id));
      res.json(criteria);
    } catch (err) {
      console.error('Failed to update round criteria:', err);
      res.status(500).json({ error: 'Failed to update criteria' });
    }
  });

  app.post('/api/rounds/:id/save-as-template', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const round = await loadRoundForUser(parseInt(req.params.id), userId);
      if (!round) return res.status(404).json({ error: 'Round not found' });
      const { name, description } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required' });
      // Default to the audition's division so org members can see the template
      let divisionId: number | null;
      if (req.body?.divisionId !== undefined) {
        divisionId = req.body.divisionId ? Number(req.body.divisionId) : null;
      } else {
        const audition = await db.select({ divisionId: auditions.divisionId }).from(auditions).where(eq(auditions.id, round.auditionId)).then(r => r[0]);
        divisionId = audition?.divisionId ?? null;
      }
      if (divisionId) {
        const divIds = await getAccessibleDivisionIds(userId);
        if (!divIds.includes(divisionId)) return res.status(403).json({ error: 'Forbidden' });
      }
      const criteria = await db.select().from(roundCriteria).where(eq(roundCriteria.roundId, round.id))
        .orderBy(asc(roundCriteria.order), asc(roundCriteria.id));
      const [template] = await db.insert(scoringTemplates).values({
        userId, divisionId, name: name.trim(),
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
      }).returning();
      if (criteria.length > 0) {
        await db.insert(scoringTemplateCriteria).values(criteria.map((c, i) => ({
          templateId: template.id, title: c.title, description: c.description, maxScore: c.maxScore, weight: c.weight, order: i,
        })));
      }
      const [result] = await getTemplatesWithCriteria([template.id]);
      res.json(result);
    } catch (err) {
      console.error('Failed to save template from round:', err);
      res.status(500).json({ error: 'Failed to save template' });
    }
  });

  app.get('/api/rounds/:id/participants', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const found = await loadRoundWithRole(parseInt(req.params.id), userId);
      if (!found) return res.status(404).json({ error: 'Round not found' });
      const { round, role } = found;
      const isJudge = role === 'judge';
      const blind = isJudge && (await getAuditionSettings(round.auditionId)).blindJudging;
      const { criteria, participants } = await loadRoundScoringData(round.id);
      const auIds = participants.map((p: any) => p.auditionUserId);
      const people = auIds.length > 0
        ? await db.select({
            auditionUserId: auditionUsers.id,
            userId: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
          }).from(auditionUsers).innerJoin(users, eq(users.id, auditionUsers.userId)).where(inArray(auditionUsers.id, auIds))
        : [];
      const peopleMap = new Map(people.map(p => [p.auditionUserId, p]));
      res.json({
        round,
        criteria,
        currentUserId: userId,
        role,
        blindJudging: blind,
        participants: participants.map((p: any) => {
          const person = peopleMap.get(p.auditionUserId);
          const row = {
            ...p,
            userId: person?.userId ?? null,
            firstName: person?.firstName ?? '',
            lastName: person?.lastName ?? '',
            email: person?.email ?? '',
            phone: person?.phone ?? null,
          };
          // Judges never get contact details or results; with blind judging they only see their own scores
          if (!isJudge) return row;
          return {
            ...row,
            email: '',
            phone: null,
            notes: null,
            manualOverride: null,
            finalScore: null,
            rank: null,
            evaluations: blind ? row.evaluations.filter((e: any) => e.judgeUserId === userId) : row.evaluations,
          };
        }),
      });
    } catch (err) {
      console.error('Failed to fetch round participants:', err);
      res.status(500).json({ error: 'Failed to fetch round participants' });
    }
  });

  // Add audition participants who joined after Round 1 started
  app.post('/api/rounds/:id/sync-participants', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const round = await loadRoundForUser(parseInt(req.params.id), userId);
      if (!round) return res.status(404).json({ error: 'Round not found' });
      if (round.status !== 'open' || round.roundNumber !== 1) return res.status(400).json({ error: 'Only an open first round can be synced' });
      const added = await addAuditionUsersToRound(round.id, round.auditionId);
      res.json({ added });
    } catch (err) {
      res.status(500).json({ error: 'Failed to sync participants' });
    }
  });

  // Manually pull an audition participant into an open round
  app.post('/api/rounds/:id/add-participant', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const round = await loadRoundForUser(parseInt(req.params.id), userId);
      if (!round) return res.status(404).json({ error: 'Round not found' });
      if (round.status !== 'open') return res.status(400).json({ error: 'Round is closed' });
      const ids = (Array.isArray(req.body?.auditionUserIds) ? req.body.auditionUserIds : [req.body?.auditionUserId])
        .map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v));
      if (ids.length === 0) return res.status(400).json({ error: 'No participant selected' });
      const added = await addAuditionUsersToRound(round.id, round.auditionId, ids);
      res.json({ added });
    } catch (err) {
      res.status(500).json({ error: 'Failed to add participant' });
    }
  });

  app.patch('/api/round-participants/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const found = await loadRoundParticipantForUser(parseInt(req.params.id), userId);
      if (!found) return res.status(404).json({ error: 'Participant not found' });
      const { manualOverride, notes, scheduledTime } = req.body || {};
      const updates: Record<string, any> = {};
      if (manualOverride !== undefined) {
        if (found.round.status !== 'open') return res.status(400).json({ error: 'Round is closed' });
        if (manualOverride !== null && manualOverride !== 'advance' && manualOverride !== 'exclude') {
          return res.status(400).json({ error: 'Invalid override' });
        }
        updates.manualOverride = manualOverride;
      }
      if (notes !== undefined) updates.notes = typeof notes === 'string' && notes.trim() ? notes : null;
      if (scheduledTime !== undefined) updates.scheduledTime = typeof scheduledTime === 'string' && scheduledTime.trim() ? scheduledTime : null;
      if (Object.keys(updates).length === 0) return res.json(found.participant);
      const [updated] = await db.update(roundParticipants).set(updates).where(eq(roundParticipants.id, found.participant.id)).returning();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update participant' });
    }
  });

  app.delete('/api/round-participants/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const found = await loadRoundParticipantForUser(parseInt(req.params.id), userId);
      if (!found) return res.status(404).json({ error: 'Participant not found' });
      if (found.round.status !== 'open') return res.status(400).json({ error: 'Round is closed' });
      await db.delete(roundParticipants).where(eq(roundParticipants.id, found.participant.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to remove participant' });
    }
  });

  // Upsert the current user's (judge's) scores for a participant. A null score clears that criterion.
  app.put('/api/round-participants/:id/evaluation', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const found = await loadRoundParticipantWithRole(parseInt(req.params.id), userId);
      if (!found) return res.status(404).json({ error: 'Participant not found' });
      if (found.round.status !== 'open') return res.status(400).json({ error: 'Round is closed' });
      const { comment, scores } = req.body || {};
      const criteria = await db.select().from(roundCriteria).where(eq(roundCriteria.roundId, found.round.id));
      const criteriaMap = new Map(criteria.map(c => [c.id, c]));
      const scoreInputs: { criterionId: number; score: number | null }[] = [];
      if (scores !== undefined) {
        if (!Array.isArray(scores)) return res.status(400).json({ error: 'Scores must be a list' });
        for (const s of scores) {
          const criterion = criteriaMap.get(Number(s?.criterionId));
          if (!criterion) return res.status(400).json({ error: 'Unknown criterion' });
          const value = toNumber(s?.score);
          if (value !== null && (value < 0 || value > criterion.maxScore)) {
            return res.status(400).json({ error: `Score for "${criterion.title}" must be between 0 and ${criterion.maxScore}` });
          }
          scoreInputs.push({ criterionId: criterion.id, score: value === null ? null : Math.round(value * 100) / 100 });
        }
      }
      await db.transaction(async (tx) => {
        const evalValues: Record<string, any> = { roundParticipantId: found.participant.id, judgeUserId: userId, updatedAt: new Date() };
        const conflictSet: Record<string, any> = { updatedAt: new Date() };
        if (comment !== undefined) {
          evalValues.comment = typeof comment === 'string' && comment.trim() ? comment : null;
          conflictSet.comment = evalValues.comment;
        }
        const [evaluation] = await tx.insert(roundEvaluations).values(evalValues as any)
          .onConflictDoUpdate({ target: [roundEvaluations.roundParticipantId, roundEvaluations.judgeUserId], set: conflictSet })
          .returning();
        for (const s of scoreInputs) {
          if (s.score === null) {
            await tx.delete(roundScores).where(and(eq(roundScores.evaluationId, evaluation.id), eq(roundScores.roundCriterionId, s.criterionId)));
          } else {
            await tx.insert(roundScores).values({ evaluationId: evaluation.id, roundCriterionId: s.criterionId, score: s.score })
              .onConflictDoUpdate({ target: [roundScores.evaluationId, roundScores.roundCriterionId], set: { score: s.score } });
          }
        }
        // Drop empty evaluations so they don't count as a judge
        const remaining = await tx.select({ id: roundScores.id }).from(roundScores).where(eq(roundScores.evaluationId, evaluation.id));
        if (remaining.length === 0 && !evaluation.comment) {
          await tx.delete(roundEvaluations).where(eq(roundEvaluations.id, evaluation.id));
        }
      });
      const { participants } = await loadRoundScoringData(found.round.id);
      const updated = participants.find((p: any) => p.id === found.participant.id);
      const blind = found.role === 'judge' && (await getAuditionSettings(found.round.auditionId)).blindJudging;
      const evaluations = (updated?.evaluations ?? []).filter((e: any) => !blind || e.judgeUserId === userId);
      res.json({ evaluations });
    } catch (err) {
      console.error('Failed to save evaluation:', err);
      res.status(500).json({ error: 'Failed to save scores' });
    }
  });

  // Close a round: persist weights/cutoff, snapshot scores & ranks, and open the next round with those advancing.
  app.post('/api/rounds/:id/close', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const round = await loadRoundForUser(parseInt(req.params.id), userId);
      if (!round) return res.status(404).json({ error: 'Round not found' });
      if (round.status !== 'open') return res.status(400).json({ error: 'Round is already closed' });
      const body = req.body || {};
      const advanceRule: AdvanceRule = body.advanceRule === 'min_score' ? 'min_score' : body.advanceRule === 'top_n' ? 'top_n' : round.advanceRule;
      const advanceValue = body.advanceValue !== undefined ? toNumber(body.advanceValue) : round.advanceValue;
      const isFinal = !!body.final;
      const weightsInput: Record<string, unknown> = body.weights && typeof body.weights === 'object' ? body.weights : {};
      const nextRoundInput = body.nextRound || {};

      let nextCriteriaSource: CriterionInput[] | null = null;
      if (!isFinal && nextRoundInput.templateId) {
        const resolved = await resolveCriteriaSource(userId, nextRoundInput.templateId, undefined);
        if (typeof resolved === 'string') return res.status(400).json({ error: resolved });
        nextCriteriaSource = resolved;
      }

      const result = await db.transaction(async (tx) => {
        // Persist any weight changes made in the preview
        for (const [key, raw] of Object.entries(weightsInput)) {
          const w = toNumber(raw);
          if (w === null || w < 0) continue;
          await tx.update(roundCriteria).set({ weight: w })
            .where(and(eq(roundCriteria.id, Number(key)), eq(roundCriteria.roundId, round.id)));
        }
        const { criteria, participants } = await loadRoundScoringData(round.id, tx);
        const evaluated = evaluateRound(participants, criteria, advanceRule, advanceValue);
        const advancing = evaluated.filter(r => r.advancing);
        if (!isFinal && advancing.length === 0) throw Object.assign(new Error('No participants advance'), { status: 400 });

        for (const r of evaluated) {
          await tx.update(roundParticipants).set({
            finalScore: r.unscored ? null : r.total,
            rank: r.rank,
            status: r.advancing ? 'advanced' : 'eliminated',
          }).where(eq(roundParticipants.id, r.id));
        }
        const [closed] = await tx.update(auditionRounds).set({
          status: 'closed', closedAt: new Date(), advanceRule, advanceValue, isFinal,
        }).where(eq(auditionRounds.id, round.id)).returning();

        if (isFinal) return { round: closed, nextRound: null };

        const nextNumber = round.roundNumber + 1;
        const title = typeof nextRoundInput.title === 'string' && nextRoundInput.title.trim() ? nextRoundInput.title.trim() : `Round ${nextNumber}`;
        const [next] = await tx.insert(auditionRounds).values({
          auditionId: round.auditionId,
          roundNumber: nextNumber,
          title,
          advanceRule,
        }).returning();
        const criteriaToCopy: CriterionInput[] = nextCriteriaSource
          ?? criteria.map((c: any) => ({ title: c.title, description: c.description, maxScore: c.maxScore, weight: c.weight }));
        await insertRoundCriteria(tx, next.id, criteriaToCopy);
        const participantMap = new Map(participants.map((p: any) => [p.id, p]));
        await tx.insert(roundParticipants).values(advancing.map(r => ({
          roundId: next.id,
          auditionUserId: (participantMap.get(r.id) as any).auditionUserId,
        })));
        return { round: closed, nextRound: next };
      });
      res.json(result);
    } catch (err: any) {
      if (err?.status === 400) return res.status(400).json({ error: err.message });
      console.error('Failed to close round:', err);
      res.status(500).json({ error: 'Failed to close round' });
    }
  });

  // Reopen the latest closed round. Removes the following round if nobody has been scored in it yet.
  app.post('/api/rounds/:id/reopen', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const round = await loadRoundForUser(parseInt(req.params.id), userId);
      if (!round) return res.status(404).json({ error: 'Round not found' });
      if (round.status !== 'closed') return res.status(400).json({ error: 'Round is not closed' });
      const later = await db.select().from(auditionRounds)
        .where(and(eq(auditionRounds.auditionId, round.auditionId), gt(auditionRounds.roundNumber, round.roundNumber)));
      if (later.length > 1 || later.some(r => r.status !== 'open')) {
        return res.status(400).json({ error: 'Only the most recent closed round can be reopened' });
      }
      if (later.length === 1) {
        const scored = await db.select({ id: roundEvaluations.id }).from(roundEvaluations)
          .innerJoin(roundParticipants, eq(roundParticipants.id, roundEvaluations.roundParticipantId))
          .where(eq(roundParticipants.roundId, later[0].id)).limit(1);
        if (scored.length > 0) return res.status(400).json({ error: `${later[0].title} already has scores, so this round can't be reopened` });
      }
      await db.transaction(async (tx) => {
        if (later.length === 1) await tx.delete(auditionRounds).where(eq(auditionRounds.id, later[0].id));
        await tx.update(roundParticipants).set({ status: 'pending', finalScore: null, rank: null })
          .where(eq(roundParticipants.roundId, round.id));
        await tx.update(auditionRounds).set({ status: 'open', closedAt: null, isFinal: false })
          .where(eq(auditionRounds.id, round.id));
      });
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to reopen round:', err);
      res.status(500).json({ error: 'Failed to reopen round' });
    }
  });

  app.post('/api/round-participants/:id/notify', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const found = await loadRoundParticipantForUser(parseInt(req.params.id), userId);
      if (!found) return res.status(404).json({ error: 'Participant not found' });
      const { participant, round } = found;
      const person = await db.select({ firstName: users.firstName, email: users.email })
        .from(auditionUsers).innerJoin(users, eq(users.id, auditionUsers.userId))
        .where(eq(auditionUsers.id, participant.auditionUserId)).then(r => r[0]);
      if (!person) return res.status(404).json({ error: 'User not found' });
      const audition = await db.select().from(auditions).where(eq(auditions.id, round.auditionId)).then(r => r[0]);
      const auditionTitle = escapeHtml(audition?.title || 'the audition');
      const roundTitle = escapeHtml(round.title);
      const intro = round.roundNumber > 1
        ? `<p>Congratulations! You have advanced to <strong>${roundTitle}</strong> of <strong>${auditionTitle}</strong>.</p>`
        : `<p>You are part of <strong>${roundTitle}</strong> of <strong>${auditionTitle}</strong>.</p>`;
      const scheduledInfo = participant.scheduledTime
        ? `<p>You are scheduled for: <strong>${escapeHtml(participant.scheduledTime)}</strong></p>`
        : '';
      const notesInfo = participant.notes ? `<p>Notes: ${escapeHtml(participant.notes)}</p>` : '';

      if (process.env.BREVO_API_KEY) {
        await client.transactionalEmails.sendTransacEmail({
          subject: `${audition?.title || 'Audition'} - ${round.title}`,
          htmlContent: `
            <h2>Hi ${escapeHtml(person.firstName)},</h2>
            ${intro}
            ${scheduledInfo}
            ${notesInfo}
            <p>Please contact us if you have any questions.</p>
          `,
          sender: { name: "AuditionEase", email: "noreply@auditionease.com" },
          to: [{ email: person.email }],
        });
        res.json({ success: true, message: 'Notification sent' });
      } else {
        console.log(`--- ROUND NOTIFICATION ---`);
        console.log(`To: ${person.email}`);
        console.log(`Subject: ${audition?.title} - ${round.title}`);
        console.log(`Scheduled: ${participant.scheduledTime || 'TBD'}`);
        console.log(`--------------------------`);
        res.json({ success: true, message: 'Notification logged to console (no Brevo API key configured)' });
      }
    } catch (err: any) {
      console.error('Failed to send notification:', err);
      const message = err?.status === 401
        ? 'Email service authentication failed — check your Brevo API key'
        : 'Failed to send notification';
      res.status(500).json({ error: message });
    }
  });

  // Reports
  app.get('/api/reports', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const userReports = await db.select().from(reports).where(eq(reports.userId, userId)).orderBy(desc(reports.createdAt));
      res.json(userReports);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch reports' });
    }
  });

  app.post('/api/reports', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { name, criteria, columns } = req.body;
      const newReport = await db.insert(reports).values({ userId, name, criteria, columns }).returning();
      res.json(newReport[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create report' });
    }
  });

  app.put('/api/reports/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const reportId = parseInt(req.params.id);
      const report = await db.select().from(reports).where(eq(reports.id, reportId)).then(rows => rows[0]);
      if (!report || report.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
      const { name, criteria, columns } = req.body;
      const updated = await db.update(reports).set({ name, criteria, columns, updatedAt: new Date() }).where(eq(reports.id, reportId)).returning();
      res.json(updated[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update report' });
    }
  });

  app.delete('/api/reports/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const reportId = parseInt(req.params.id);
      const report = await db.select().from(reports).where(eq(reports.id, reportId)).then(rows => rows[0]);
      if (!report || report.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
      await db.delete(reports).where(eq(reports.id, reportId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete report' });
    }
  });

  app.post('/api/reports/:id/run', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const reportId = parseInt(req.params.id);
      const report = await db.select().from(reports).where(eq(reports.id, reportId)).then(rows => rows[0]);
      if (!report || report.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

      const criteria: any[] = JSON.parse(report.criteria || '[]');
      const reportColumns: any[] = JSON.parse(report.columns || '[]');

      const accessCondition = await getAccessibleAuditionConditions(userId);
      const userAuditions = await db.select().from(auditions).where(accessCondition);
      if (userAuditions.length === 0) return res.json({ columns: reportColumns, rows: [] });

      const auditionIds = userAuditions.map(a => a.id);
      const auditionMap = new Map(userAuditions.map(a => [a.id, a]));

      const auRows = await db.select().from(auditionUsers).where(inArray(auditionUsers.auditionId, auditionIds));
      if (auRows.length === 0) return res.json({ columns: reportColumns, rows: [] });

      const auIds = auRows.map(au => au.id);
      const userIds = [...new Set(auRows.map(au => au.userId))];

      const [usersData, cfValues, roundsData, attrs] = await Promise.all([
        db.select().from(users).where(inArray(users.id, userIds)),
        db.select().from(auditionUserCustomFields).where(inArray(auditionUserCustomFields.auditionUserId, auIds)),
        db.select().from(auditionRounds).where(inArray(auditionRounds.auditionId, auditionIds)),
        db.select().from(customAttributes).where(eq(customAttributes.userId, userId)),
      ]);

      // Latest round each participant reached, with their score in it
      const latestRoundByAu = new Map<number, { round: typeof roundsData[number]; participant: any; score: number | null }>();
      for (const round of roundsData) {
        const { criteria, participants } = await loadRoundScoringData(round.id);
        const live = round.status === "open" ? evaluateRound(participants, criteria, round.advanceRule, round.advanceValue) : [];
        for (const p of participants) {
          const current = latestRoundByAu.get(p.auditionUserId);
          if (current && current.round.roundNumber >= round.roundNumber) continue;
          const liveRow = live.find(r => r.id === p.id);
          const score = round.status === "open" ? (liveRow && !liveRow.unscored ? liveRow.total : null) : p.finalScore;
          latestRoundByAu.set(p.auditionUserId, { round, participant: p, score });
        }
      }

      const userMap = new Map(usersData.map(u => [u.id, u]));
      const attrMap = new Map(attrs.map(a => [a.id, a]));

      const enrichedRows = auRows.map(au => {
        const userData = userMap.get(au.userId);
        const audition = auditionMap.get(au.auditionId);
        const cfv = cfValues.filter(cf => cf.auditionUserId === au.id);
        const latest = latestRoundByAu.get(au.id);
        let roundStatus = "";
        if (latest) {
          if (latest.round.status === "open") roundStatus = "In progress";
          else if (latest.participant.status === "advanced") roundStatus = latest.round.isFinal ? "Selected" : "Advanced";
          else roundStatus = "Eliminated";
        }

        const row: Record<string, any> = {
          firstName: userData?.firstName || '',
          lastName: userData?.lastName || '',
          email: userData?.email || '',
          phone: userData?.phone || '',
          auditionTitle: audition?.title || '',
          auditionDate: audition?.date || '',
          latestRound: latest?.round.title || '',
          score: latest?.score ?? '',
          feedback: latest ? latest.participant.evaluations.map((e: any) => e.comment).filter(Boolean).join(' | ') : '',
          roundStatus,
        };

        for (const cf of cfv) {
          row[`custom:${cf.customAttributeId}`] = cf.value;
        }

        return row;
      });

      function evaluateCondition(row: Record<string, any>, condition: any): boolean {
        const rawValue = row[condition.field];
        const fieldValue = String(rawValue ?? '');
        const compareValue = String(condition.value ?? '');

        let fieldType = 'text';
        if (condition.field.startsWith('custom:')) {
          const attrId = parseInt(condition.field.split(':')[1]);
          const attr = attrMap.get(attrId);
          if (attr) fieldType = attr.type;
        } else if (condition.field === 'score') {
          fieldType = 'number';
        } else if (condition.field === 'auditionDate') {
          fieldType = 'date';
        }

        switch (condition.operator) {
          case 'equals':
            if (fieldType === 'number') return parseFloat(fieldValue) === parseFloat(compareValue);
            return fieldValue.toLowerCase() === compareValue.toLowerCase();
          case 'not_equals':
            if (fieldType === 'number') return parseFloat(fieldValue) !== parseFloat(compareValue);
            return fieldValue.toLowerCase() !== compareValue.toLowerCase();
          case 'contains':
            if (fieldType === 'multiselect') {
              try {
                const arr = JSON.parse(fieldValue);
                if (Array.isArray(arr)) return arr.some((v: string) => String(v).toLowerCase() === compareValue.toLowerCase());
              } catch {}
            }
            return fieldValue.toLowerCase().includes(compareValue.toLowerCase());
          case 'not_contains':
            if (fieldType === 'multiselect') {
              try {
                const arr = JSON.parse(fieldValue);
                if (Array.isArray(arr)) return !arr.some((v: string) => String(v).toLowerCase() === compareValue.toLowerCase());
              } catch {}
            }
            return !fieldValue.toLowerCase().includes(compareValue.toLowerCase());
          case 'starts_with': return fieldValue.toLowerCase().startsWith(compareValue.toLowerCase());
          case 'ends_with': return fieldValue.toLowerCase().endsWith(compareValue.toLowerCase());
          case 'greater_than': return parseFloat(fieldValue) > parseFloat(compareValue);
          case 'less_than': return parseFloat(fieldValue) < parseFloat(compareValue);
          case 'greater_equal': return parseFloat(fieldValue) >= parseFloat(compareValue);
          case 'less_equal': return parseFloat(fieldValue) <= parseFloat(compareValue);
          case 'before': return fieldValue < compareValue;
          case 'after': return fieldValue > compareValue;
          case 'is_empty': return !fieldValue || fieldValue.trim() === '';
          case 'is_not_empty': return !!fieldValue && fieldValue.trim() !== '';
          default: return true;
        }
      }

      const filteredRows = enrichedRows.filter(row => {
        if (criteria.length === 0) return true;
        let result = evaluateCondition(row, criteria[0]);
        for (let i = 1; i < criteria.length; i++) {
          const cond = criteria[i];
          const condResult = evaluateCondition(row, cond);
          if (cond.logicOp === 'OR') {
            result = result || condResult;
          } else {
            result = result && condResult;
          }
        }
        return result;
      });

      const displayRows = filteredRows.map(row => {
        const display: Record<string, any> = { ...row };
        for (const key of Object.keys(display)) {
          if (key.startsWith('custom:')) {
            const attrId = parseInt(key.split(':')[1]);
            const attr = attrMap.get(attrId);
            if (attr?.type === 'multiselect' && typeof display[key] === 'string') {
              try { display[key] = JSON.parse(display[key]).join(', '); } catch {}
            } else if (attr?.type === 'boolean') {
              display[key] = display[key] === 'true' ? 'Yes' : 'No';
            }
          }
        }
        return display;
      });

      res.json({ columns: reportColumns, rows: displayRows });
    } catch (err) {
      console.error('Failed to run report:', err);
      res.status(500).json({ error: 'Failed to run report' });
    }
  });

  // --- Auth Routes ---

  // --- Public invite endpoints (no auth required) ---

  app.get('/api/invite/:code', async (req, res) => {
    try {
      const code = req.params.code;
      const audition = await db.select().from(auditions)
        .where(sql`lower(${auditions.inviteCode}) = ${code.toLowerCase()}`)
        .then(rows => rows[0]);
      if (!audition) return res.status(404).json({ error: 'Audition not found' });
      let attrs;
      if (audition.attributeSetId) {
        const setItems = await db.select({ customAttributeId: attributeSetItems.customAttributeId })
          .from(attributeSetItems).where(eq(attributeSetItems.attributeSetId, audition.attributeSetId));
        if (setItems.length > 0) {
          attrs = await db.select().from(customAttributes)
            .where(inArray(customAttributes.id, setItems.map(i => i.customAttributeId)));
        } else {
          attrs = [];
        }
      } else if (audition.divisionId) {
        attrs = await db.select().from(customAttributes)
          .where(eq(customAttributes.divisionId, audition.divisionId));
      } else {
        attrs = await db.select().from(customAttributes)
          .where(and(eq(customAttributes.userId, audition.userId), isNull(customAttributes.divisionId)));
      }
      res.json({
        audition: { id: audition.id, title: audition.title, description: audition.description, date: audition.date, location: audition.location, status: audition.status },
        customAttributes: attrs,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to look up audition' });
    }
  });

  app.post('/api/invite/:code/verify-email', async (req, res) => {
    try {
      const code = req.params.code;
      const { email } = req.body;
      const audition = await db.select().from(auditions)
        .where(sql`lower(${auditions.inviteCode}) = ${code.toLowerCase()}`)
        .then(rows => rows[0]);
      if (!audition) return res.status(404).json({ error: 'Audition not found' });

      const verifyCode = crypto.randomInt(100000, 999999).toString();
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(loginTokens).values({
        userId: audition.userId,
        token: `invite:${token}:${verifyCode}:${email}`,
        expiresAt,
      });

      try {
        if (process.env.BREVO_API_KEY) {
          await client.transactionalEmails.sendTransacEmail({
            subject: "AuditionEase - Verify your email",
            htmlContent: `<p>Your verification code for <strong>${audition.title}</strong> is:</p><h2>${verifyCode}</h2><p>This code expires in 15 minutes.</p>`,
            sender: { name: "AuditionEase", email: "noreply@auditionease.com" },
            to: [{ email }],
          });
        } else {
          console.log('--- INVITE VERIFY CODE (No Brevo API Key) ---');
          console.log(`Email: ${email}, Code: ${verifyCode}`);
          console.log('----------------------------------------------');
        }
      } catch (emailErr) {
        console.error('Email send failed:', emailErr);
        console.log('--- INVITE VERIFY CODE (Email failed) ---');
        console.log(`Email: ${email}, Code: ${verifyCode}`);
        console.log('------------------------------------------');
      }

      res.json({ success: true, token });
    } catch (err) {
      res.status(500).json({ error: 'Failed to send verification email' });
    }
  });

  app.post('/api/invite/:code/confirm-email', async (req, res) => {
    try {
      const code = req.params.code;
      const { token, verifyCode, email } = req.body;

      const expectedToken = `invite:${token}:${verifyCode}:${email}`;
      const loginToken = await db.select().from(loginTokens)
        .where(and(
          eq(loginTokens.token, expectedToken),
          eq(loginTokens.used, false),
          gt(loginTokens.expiresAt, new Date())
        ))
        .then(rows => rows[0]);

      if (!loginToken) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }

      await db.delete(loginTokens).where(
        or(eq(loginTokens.id, loginToken.id), lte(loginTokens.expiresAt, new Date()))
      );

      const audition = await db.select().from(auditions)
        .where(sql`lower(${auditions.inviteCode}) = ${code.toLowerCase()}`)
        .then(rows => rows[0]);
      if (!audition) return res.status(404).json({ error: 'Audition not found' });

      const existingUser = await db.select().from(users)
        .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
        .then(rows => rows[0]);

      let userData = null;
      if (existingUser) {
        const auRecord = await db.select().from(auditionUsers)
          .where(and(eq(auditionUsers.auditionId, audition.id), eq(auditionUsers.userId, existingUser.id)))
          .then(rows => rows[0]);

        let cfValues: any[] = [];
        if (auRecord) {
          cfValues = await db.select().from(auditionUserCustomFields)
            .where(eq(auditionUserCustomFields.auditionUserId, auRecord.id));
        }
        userData = { ...existingUser, customFieldValues: cfValues };
      }

      res.json({ verified: true, user: userData });
    } catch (err) {
      res.status(500).json({ error: 'Failed to confirm email' });
    }
  });

  app.post('/api/invite/:code/submit', async (req, res) => {
    try {
      const code = req.params.code;
      const { email, firstName, lastName, phone, customFieldValues } = req.body;

      if (!email || !firstName || !lastName) {
        return res.status(400).json({ error: 'First name, last name, and email are required' });
      }

      const audition = await db.select().from(auditions)
        .where(sql`lower(${auditions.inviteCode}) = ${code.toLowerCase()}`)
        .then(rows => rows[0]);
      if (!audition) return res.status(404).json({ error: 'Audition not found' });

      // Check participant limit for audition owner's plan
      const ownerSub = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.userId, audition.userId), eq(subscriptions.status, 'active')))
        .orderBy(desc(subscriptions.createdAt))
        .then(rows => rows[0]);
      const limits = getPlanLimits(ownerSub?.plan);
      if (limits.maxParticipantsPerAudition !== Infinity) {
        const existingUser = await db.select().from(users)
          .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
          .then(rows => rows[0]);
        const alreadyInAudition = existingUser
          ? await db.select().from(auditionUsers)
              .where(and(eq(auditionUsers.auditionId, audition.id), eq(auditionUsers.userId, existingUser.id)))
              .then(rows => rows.length > 0)
          : false;
        if (!alreadyInAudition) {
          const participantCount = await db.select({ count: sql<number>`cast(count(*) as int)` })
            .from(auditionUsers).where(eq(auditionUsers.auditionId, audition.id));
          if (participantCount[0].count >= limits.maxParticipantsPerAudition) {
            return res.status(403).json({
              error: 'This audition has reached its maximum number of participants.',
              code: 'PARTICIPANT_LIMIT',
            });
          }
        }
      }

      // Find or create user
      let existingUser = await db.select().from(users)
        .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
        .then(rows => rows[0]);

      let user;
      if (existingUser) {
        const updated = await db.update(users)
          .set({ firstName, lastName, phone: phone || null })
          .where(eq(users.id, existingUser.id))
          .returning();
        user = updated[0];
      } else {
        const created = await db.insert(users)
          .values({ firstName, lastName, email, phone: phone || null })
          .returning();
        user = created[0];
      }

      // Ensure audition_users entry exists
      let auRecord = await db.select().from(auditionUsers)
        .where(and(eq(auditionUsers.auditionId, audition.id), eq(auditionUsers.userId, user.id)))
        .then(rows => rows[0]);

      if (!auRecord) {
        const created = await db.insert(auditionUsers)
          .values({ auditionId: audition.id, userId: user.id })
          .returning();
        auRecord = created[0];

        // Late signups join Round 1 automatically while it's still open
        const firstRound = await db.select().from(auditionRounds)
          .where(and(eq(auditionRounds.auditionId, audition.id), eq(auditionRounds.roundNumber, 1)))
          .then(rows => rows[0]);
        if (firstRound?.status === 'open') {
          await addAuditionUsersToRound(firstRound.id, audition.id, [auRecord.id]);
        }
      }

      // Upsert custom field values
      if (customFieldValues && customFieldValues.length > 0) {
        const existingCf = await db.select().from(auditionUserCustomFields)
          .where(eq(auditionUserCustomFields.auditionUserId, auRecord.id));
        const existingMap = new Map(existingCf.map(cf => [cf.customAttributeId, cf]));
        const incomingCfs: { customAttributeId: number; value: string }[] = customFieldValues;
        const incomingIds = new Set(incomingCfs.map(cf => cf.customAttributeId));

        for (const cf of incomingCfs) {
          const prev = existingMap.get(cf.customAttributeId);
          if (prev) {
            if (prev.value !== cf.value) {
              await db.update(auditionUserCustomFields)
                .set({ value: cf.value, updatedAt: new Date() })
                .where(eq(auditionUserCustomFields.id, prev.id));
            }
          } else {
            await db.insert(auditionUserCustomFields).values({
              auditionUserId: auRecord.id,
              customAttributeId: cf.customAttributeId,
              value: cf.value,
              updatedAt: new Date(),
            });
          }
        }
        const removedIds = existingCf
          .filter(cf => !incomingIds.has(cf.customAttributeId))
          .map(cf => cf.id);
        if (removedIds.length > 0) {
          await db.delete(auditionUserCustomFields).where(inArray(auditionUserCustomFields.id, removedIds));
        }
      }

      const sessionToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '90d' });
      res.json({ success: true, user, sessionToken });
    } catch (err) {
      res.status(500).json({ error: 'Failed to submit information' });
    }
  });

  // --- Applicant endpoints (authenticated, for users signed up via invite) ---

  app.get('/api/my-auditions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const auRows = await db.select().from(auditionUsers)
        .where(eq(auditionUsers.userId, userId));
      if (auRows.length === 0) return res.json([]);

      const auditionIds = auRows.map(au => au.auditionId);

      const [auditionData, userSlots] = await Promise.all([
        db.select().from(auditions).where(inArray(auditions.id, auditionIds)),
        db.select().from(auditionSlots).where(and(
          inArray(auditionSlots.auditionId, auditionIds),
          eq(auditionSlots.userId, userId)
        )),
      ]);

      const slotMap = new Map(userSlots.map(s => [s.auditionId, s]));

      res.json(auditionData.map(a => ({
        id: a.id,
        title: a.title,
        description: a.description,
        date: a.date,
        location: a.location,
        status: a.status,
        slot: slotMap.get(a.id) || null,
      })));
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch auditions' });
    }
  });

  app.get('/api/auditions/:id/available-slots', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const auditionId = parseInt(req.params.id);

    const auRecord = await db.select().from(auditionUsers)
      .where(and(eq(auditionUsers.auditionId, auditionId), eq(auditionUsers.userId, userId)))
      .then(rows => rows[0]);
    if (!auRecord) return res.status(403).json({ error: 'Not registered for this audition' });

    try {
      const slots = await db.select().from(auditionSlots)
        .where(and(
          eq(auditionSlots.auditionId, auditionId),
          or(
            eq(auditionSlots.status, 'available'),
            and(eq(auditionSlots.userId, userId), eq(auditionSlots.status, 'booked'))
          )
        ));
      res.json(slots);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch available slots' });
    }
  });

  app.post('/api/auditions/:id/book-slot', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const auditionId = parseInt(req.params.id);
    const { slotId } = req.body;

    const auRecord = await db.select().from(auditionUsers)
      .where(and(eq(auditionUsers.auditionId, auditionId), eq(auditionUsers.userId, userId)))
      .then(rows => rows[0]);
    if (!auRecord) return res.status(403).json({ error: 'Not registered for this audition' });

    try {
      const slot = await db.select().from(auditionSlots)
        .where(and(eq(auditionSlots.id, slotId), eq(auditionSlots.auditionId, auditionId), eq(auditionSlots.status, 'available')))
        .then(rows => rows[0]);
      if (!slot) return res.status(400).json({ error: 'Slot is no longer available' });

      await db.update(auditionSlots)
        .set({ userId: null, status: 'available' })
        .where(and(
          eq(auditionSlots.auditionId, auditionId),
          eq(auditionSlots.userId, userId),
          eq(auditionSlots.status, 'booked')
        ));

      const updated = await db.update(auditionSlots)
        .set({ userId, status: 'booked' })
        .where(eq(auditionSlots.id, slotId))
        .returning();

      res.json(updated[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to book slot' });
    }
  });

  app.post('/api/auditions/:id/cancel-slot', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const auditionId = parseInt(req.params.id);

    const auRecord = await db.select().from(auditionUsers)
      .where(and(eq(auditionUsers.auditionId, auditionId), eq(auditionUsers.userId, userId)))
      .then(rows => rows[0]);
    if (!auRecord) return res.status(403).json({ error: 'Not registered for this audition' });

    try {
      await db.update(auditionSlots)
        .set({ userId: null, status: 'available' })
        .where(and(
          eq(auditionSlots.auditionId, auditionId),
          eq(auditionSlots.userId, userId),
          eq(auditionSlots.status, 'booked')
        ));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to cancel slot' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { firstName, lastName, email } = req.body;
      const newUser = await db.insert(users).values({ firstName, lastName, email }).returning();
      res.json(newUser[0]);
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'Email already registered' });
      }
      res.status(500).json({ error: 'Failed to register user' });
    }
  });

  app.post('/api/auth/login-request', async (req, res) => {
    try {
      const { email } = req.body;
      const user = await db.select().from(users).where(eq(users.email, email)).then(rows => rows[0]);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const code = crypto.randomInt(100000, 999999).toString();
      const token = `login:${email}:${code}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(loginTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      try {
        if (process.env.BREVO_API_KEY) {
          await client.transactionalEmails.sendTransacEmail({
            subject: "Your AuditionEase Login Code",
            htmlContent: `<p>Your verification code is:</p><h1 style="letter-spacing: 8px; font-size: 36px;">${code}</h1><p>This code expires in 15 minutes.</p>`,
            sender: { "name": "AuditionEase", "email": "noreply@auditionease.com" },
            to: [{ "email": email }],
          });
        } else {
          console.log('--- LOGIN CODE (No Brevo API Key) ---');
          console.log(`Code: ${code}`);
          console.log('-----------------------------------------');
        }
      } catch (emailErr) {
        console.error('Email send failed, printing code to console:', emailErr);
        console.log('--- LOGIN CODE (Email failed) ---');
        console.log(`Code: ${code}`);
        console.log('-----------------------------------------');
      }

      res.json({ success: true, message: 'Verification code sent' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to process login request' });
    }
  });

  app.post('/api/auth/verify-token', async (req, res) => {
    try {
      const { email, code, token: legacyToken } = req.body;
      const lookupToken = email && code ? `login:${email}:${code}` : legacyToken;
      const loginToken = await db.select().from(loginTokens)
        .where(and(
          eq(loginTokens.token, lookupToken),
          eq(loginTokens.used, false),
          gt(loginTokens.expiresAt, new Date())
        ))
        .then(rows => rows[0]);

      if (!loginToken) {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }

      await db.delete(loginTokens).where(
        or(eq(loginTokens.id, loginToken.id), lte(loginTokens.expiresAt, new Date()))
      );

      const user = await db.select().from(users).where(eq(users.id, loginToken.userId)).then(rows => rows[0]);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const sessionToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '90d' });

      res.json({ user, sessionToken });
    } catch (err) {
      res.status(500).json({ error: 'Failed to verify token' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'No token provided' });

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

      const user = await db.select().from(users).where(eq(users.id, decoded.userId)).then(rows => rows[0]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json(user);
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // --- Stripe / Subscription Routes ---

  app.post('/api/stripe/create-checkout-session', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { plan } = req.body;
      const priceIdMap: Record<string, string | undefined> = {
        business: process.env.STRIPE_BUSINESS_PRICE_ID,
        enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
      };
      const amountMap: Record<string, string> = { business: '19.95', enterprise: '49.95' };

      const priceId = priceIdMap[plan];
      if (!priceId) return res.status(400).json({ error: 'Invalid plan' });

      const user = await db.select().from(users).where(eq(users.id, userId)).then(rows => rows[0]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId: String(userId) },
        });
        customerId = customer.id;
        await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        ui_mode: 'embedded_page',
        return_url: `${APP_URL}?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
        metadata: { userId: String(userId), plan, amount: amountMap[plan] },
      });

      res.json({ clientSecret: session.client_secret, sessionId: session.id });
    } catch (err) {
      console.error('Stripe checkout error:', err);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  app.post('/api/stripe/verify-session', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.status !== 'complete') {
        return res.status(400).json({ error: 'Session not complete' });
      }

      const sessionUserId = parseInt(session.metadata?.userId || '0');
      if (sessionUserId !== userId) {
        return res.status(403).json({ error: 'Session does not belong to this user' });
      }

      const existing = await db.select().from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, session.subscription as string))
        .then(rows => rows[0]);

      if (!existing && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string) as any;
        const plan = session.metadata?.plan as 'business' | 'enterprise';
        const amount = session.metadata?.amount || '0';

        const periodEnd = sub.current_period_end
          ?? sub.items?.data?.[0]?.current_period_end;
        const endDate = periodEnd
          ? new Date(periodEnd * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await db.insert(subscriptions).values({
          userId,
          stripeSubscriptionId: sub.id,
          plan,
          amount,
          status: 'active',
          endDate,
        });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Verify session error:', err);
      res.status(500).json({ error: 'Failed to verify session' });
    }
  });

  app.get('/api/subscription', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const sub = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
        .orderBy(desc(subscriptions.createdAt))
        .then(rows => rows[0]);

      res.json({ subscription: sub || null });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch subscription' });
    }
  });

  app.post('/api/stripe/change-plan', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { newPlan } = req.body;
      if (!['personal', 'business', 'enterprise'].includes(newPlan)) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      const currentSub = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
        .orderBy(desc(subscriptions.createdAt))
        .then(rows => rows[0]);

      if (!currentSub) {
        return res.status(400).json({ error: 'No active subscription to change' });
      }

      const planRank: Record<string, number> = { personal: 0, business: 1, enterprise: 2 };
      if (planRank[newPlan] === planRank[currentSub.plan]) {
        return res.status(400).json({ error: 'Already on this plan' });
      }

      const isUpgrade = planRank[newPlan] > planRank[currentSub.plan];

      // Retrieve current Stripe subscription to get payment method
      const currentStripeSub = await stripe.subscriptions.retrieve(
        currentSub.stripeSubscriptionId,
        { expand: ['default_payment_method', 'latest_invoice.payment_intent'] },
      ) as any;
      const pm = currentStripeSub.default_payment_method;
      const paymentMethod: string | null =
        (typeof pm === 'string' ? pm : pm?.id)
        ?? currentStripeSub.latest_invoice?.payment_intent?.payment_method
        ?? null;

      // Cancel current subscription at period end
      await stripe.subscriptions.update(currentSub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      await db.update(subscriptions)
        .set({ status: 'canceled', cancelledOn: new Date() })
        .where(eq(subscriptions.id, currentSub.id));

      if (newPlan === 'personal') {
        res.json({ success: true, message: `Your ${currentSub.plan} plan will remain active until ${currentSub.endDate.toLocaleDateString()}` });
        return;
      }

      // Create new subscription for the target paid plan
      const priceIdMap: Record<string, string | undefined> = {
        business: process.env.STRIPE_BUSINESS_PRICE_ID,
        enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
      };
      const amountMap: Record<string, string> = { business: '19.95', enterprise: '49.95' };
      const priceId = priceIdMap[newPlan];
      if (!priceId) return res.status(400).json({ error: 'Price not configured' });

      const user = await db.select().from(users).where(eq(users.id, userId)).then(rows => rows[0]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId: String(userId) },
        });
        customerId = customer.id;
        await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
      }

      // Set payment method as customer default so future subscriptions can use it
      if (paymentMethod) {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethod as string },
        });
      }

      const subscriptionParams: any = {
        customer: customerId,
        items: [{ price: priceId }],
        metadata: { userId: String(userId), plan: newPlan, amount: amountMap[newPlan] },
        ...(paymentMethod ? { default_payment_method: paymentMethod } : {}),
      };

      if (!isUpgrade) {
        // Downgrade: add trial days so billing starts when current period ends
        const now = Date.now();
        const currentEnd = new Date(currentSub.endDate).getTime();
        const trialDays = Math.max(1, Math.ceil((currentEnd - now) / (1000 * 60 * 60 * 24)));
        subscriptionParams.trial_period_days = trialDays;
      }

      const newStripeSub = await stripe.subscriptions.create(subscriptionParams) as any;
      const periodEnd = newStripeSub.current_period_end
        ?? newStripeSub.items?.data?.[0]?.current_period_end;
      const endDate = periodEnd
        ? new Date(periodEnd * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db.insert(subscriptions).values({
        userId,
        stripeSubscriptionId: newStripeSub.id,
        plan: newPlan,
        amount: amountMap[newPlan],
        status: 'active',
        endDate,
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Change plan error:', err);
      res.status(500).json({ error: 'Failed to change plan' });
    }
  });

  // --- Profile Update Routes ---

  app.patch('/api/auth/profile', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { firstName, lastName } = req.body;
      if (!firstName || !lastName) return res.status(400).json({ error: 'First name and last name are required' });

      await db.update(users).set({ firstName, lastName }).where(eq(users.id, userId));
      const updatedUser = await db.select().from(users).where(eq(users.id, userId)).then(rows => rows[0]);
      res.json(updatedUser);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // --- Email Change Routes ---

  app.post('/api/auth/request-email-change', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { newEmail } = req.body;
      if (!newEmail) return res.status(400).json({ error: 'New email is required' });

      const existing = await db.select().from(users).where(eq(users.email, newEmail)).then(rows => rows[0]);
      if (existing) return res.status(400).json({ error: 'Email already in use' });

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const token = `email-change:${userId}:${newEmail}:${code}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(loginTokens).values({ userId, token, expiresAt });

      try {
        if (process.env.BREVO_API_KEY) {
          await client.transactionalEmails.sendTransacEmail({
            subject: "Verify your new email - AuditionEase",
            htmlContent: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 15 minutes.</p>`,
            sender: { name: "AuditionEase", email: "noreply@auditionease.com" },
            to: [{ email: newEmail }],
          });
        } else {
          console.log('--- EMAIL CHANGE CODE ---');
          console.log(`Code: ${code} for ${newEmail}`);
          console.log('-----------------------------------------');
        }
      } catch (emailErr) {
        console.error('Email send failed:', emailErr);
        console.log(`--- EMAIL CHANGE CODE: ${code} for ${newEmail} ---`);
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to request email change' });
    }
  });

  app.post('/api/auth/verify-email-change', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { newEmail, code } = req.body;
      const tokenValue = `email-change:${userId}:${newEmail}:${code}`;

      const tokenRecord = await db.select().from(loginTokens)
        .where(and(
          eq(loginTokens.token, tokenValue),
          eq(loginTokens.userId, userId),
          eq(loginTokens.used, false),
          gt(loginTokens.expiresAt, new Date())
        ))
        .then(rows => rows[0]);

      if (!tokenRecord) {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }

      await db.delete(loginTokens).where(eq(loginTokens.id, tokenRecord.id));

      await db.update(users).set({ email: newEmail }).where(eq(users.id, userId));

      const updatedUser = await db.select().from(users).where(eq(users.id, userId)).then(rows => rows[0]);
      const sessionToken = jwt.sign({ userId: updatedUser!.id, email: updatedUser!.email }, JWT_SECRET, { expiresIn: '90d' });

      res.json({ user: updatedUser, sessionToken });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to verify email change' });
    }
  });

  // --- Organization Routes ---

  // Helper: get the org the current user owns or belongs to
  async function getUserOrg(userId: number) {
    const owned = await db.select().from(organizations).where(eq(organizations.ownerId, userId)).then(r => r[0]);
    if (owned) return { org: owned, role: 'owner' as const };
    const membership = await db.select().from(orgUsers)
      .where(and(eq(orgUsers.userId, userId), eq(orgUsers.status, 'accepted')))
      .then(r => r[0]);
    if (membership) {
      const org = await db.select().from(organizations).where(eq(organizations.id, membership.organizationId)).then(r => r[0]);
      return org ? { org, role: membership.role } : null;
    }
    return null;
  }

  // Get current user's organization
  app.get('/api/organization', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result) return res.json({ organization: null, role: null });
      res.json({ organization: result.org, role: result.role });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch organization' });
    }
  });

  // Create organization (enterprise users only)
  app.post('/api/organization', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const sub = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active'), eq(subscriptions.plan, 'enterprise')))
        .then(r => r[0]);
      if (!sub) return res.status(403).json({ error: 'Enterprise subscription required' });
      const existing = await getUserOrg(userId);
      if (existing) return res.status(400).json({ error: 'You already belong to an organization' });
      const { name } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'Organization name is required' });
      const [org] = await db.insert(organizations).values({ name: name.trim(), ownerId: userId }).returning();
      res.json({ organization: org });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create organization' });
    }
  });

  // Update organization settings
  app.patch('/api/organization', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result || (result.role !== 'owner' && result.role !== 'admin'))
        return res.status(403).json({ error: 'Not authorized' });
      const { name } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'Organization name is required' });
      const [updated] = await db.update(organizations).set({ name: name.trim() }).where(eq(organizations.id, result.org.id)).returning();
      res.json({ organization: updated });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update organization' });
    }
  });

  // List org users
  app.get('/api/organization/users', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result) return res.status(404).json({ error: 'No organization found' });
      const members = await db.select({
        id: orgUsers.id,
        userId: orgUsers.userId,
        role: orgUsers.role,
        status: orgUsers.status,
        invitedAt: orgUsers.invitedAt,
        acceptedAt: orgUsers.acceptedAt,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      }).from(orgUsers)
        .innerJoin(users, eq(orgUsers.userId, users.id))
        .where(eq(orgUsers.organizationId, result.org.id));
      const owner = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }).from(users).where(eq(users.id, result.org.ownerId)).then(r => r[0]);
      res.json({ members, owner });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch organization users' });
    }
  });

  // Invite user to organization
  app.post('/api/organization/invite', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result || (result.role !== 'owner' && result.role !== 'admin'))
        return res.status(403).json({ error: 'Not authorized to invite users' });
      const { email, role } = req.body;
      if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required' });
      if (role !== 'admin' && role !== 'manager') return res.status(400).json({ error: 'Role must be admin or manager' });

      // Check if user already belongs to an org
      let targetUser = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).then(r => r[0]);
      if (targetUser) {
        const existingOrg = await getUserOrg(targetUser.id);
        if (existingOrg) return res.status(400).json({ error: 'This user already belongs to an organization' });
        const existingInvite = await db.select().from(orgUsers)
          .where(and(eq(orgUsers.organizationId, result.org.id), eq(orgUsers.userId, targetUser.id)))
          .then(r => r[0]);
        if (existingInvite) return res.status(400).json({ error: 'This user has already been invited' });
      }

      const inviteToken = crypto.randomBytes(32).toString('hex');

      if (!targetUser) {
        // Create a placeholder account
        [targetUser] = await db.insert(users).values({
          firstName: '',
          lastName: '',
          email: email.trim().toLowerCase(),
        }).returning();
      }

      await db.insert(orgUsers).values({
        organizationId: result.org.id,
        userId: targetUser.id,
        role,
        status: 'pending',
        inviteToken,
      });

      // Send invite email
      const inviteUrl = `${APP_URL}/org-invite/${inviteToken}`;
      try {
        if (process.env.BREVO_API_KEY) {
          await client.transactionalEmails.sendTransacEmail({
            subject: `You've been invited to join ${result.org.name} on AuditionEase`,
            htmlContent: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>You've been invited!</h2>
                <p>You've been invited to join <strong>${result.org.name}</strong> as ${role === 'admin' ? 'an Admin' : 'a Manager'} on AuditionEase.</p>
                <p><a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Accept Invitation</a></p>
                <p style="color: #6B7280; font-size: 14px;">Or copy this link: ${inviteUrl}</p>
              </div>
            `,
            sender: { name: "AuditionEase", email: "noreply@auditionease.com" },
            to: [{ email: email.trim().toLowerCase() }],
          });
        } else {
          console.log('--- ORG INVITE (No Brevo API Key) ---');
          console.log(`Invite URL: ${inviteUrl}`);
          console.log('-----------------------------------------');
        }
      } catch (emailErr) {
        console.error('Invite email send failed:', emailErr);
        console.log('--- ORG INVITE (Email failed) ---');
        console.log(`Invite URL: ${inviteUrl}`);
        console.log('-----------------------------------------');
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to invite user' });
    }
  });

  // Remove user from organization
  app.delete('/api/organization/users/:orgUserId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result || (result.role !== 'owner' && result.role !== 'admin'))
        return res.status(403).json({ error: 'Not authorized' });
      const orgUserId = parseInt(req.params.orgUserId);
      const member = await db.select().from(orgUsers).where(eq(orgUsers.id, orgUserId)).then(r => r[0]);
      if (!member || member.organizationId !== result.org.id)
        return res.status(404).json({ error: 'Member not found' });
      // Remove from all divisions first
      await db.delete(divisionUsers).where(eq(divisionUsers.userId, member.userId));
      await db.delete(orgUsers).where(eq(orgUsers.id, orgUserId));
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to remove user' });
    }
  });

  // Update org user role
  app.patch('/api/organization/users/:orgUserId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result || (result.role !== 'owner' && result.role !== 'admin'))
        return res.status(403).json({ error: 'Not authorized' });
      const orgUserId = parseInt(req.params.orgUserId);
      const { role } = req.body;
      if (role !== 'admin' && role !== 'manager') return res.status(400).json({ error: 'Role must be admin or manager' });
      const member = await db.select().from(orgUsers).where(eq(orgUsers.id, orgUserId)).then(r => r[0]);
      if (!member || member.organizationId !== result.org.id)
        return res.status(404).json({ error: 'Member not found' });
      // If changing from admin to manager, division assignments are kept
      await db.update(orgUsers).set({ role }).where(eq(orgUsers.id, orgUserId));
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  });

  // Accept org invite
  app.get('/api/org-invite/:token', async (req, res) => {
    try {
      const invite = await db.select({
        id: orgUsers.id,
        organizationId: orgUsers.organizationId,
        userId: orgUsers.userId,
        role: orgUsers.role,
        status: orgUsers.status,
        orgName: organizations.name,
        email: users.email,
        firstName: users.firstName,
      }).from(orgUsers)
        .innerJoin(organizations, eq(orgUsers.organizationId, organizations.id))
        .innerJoin(users, eq(orgUsers.userId, users.id))
        .where(eq(orgUsers.inviteToken, req.params.token))
        .then(r => r[0]);
      if (!invite) return res.status(404).json({ error: 'Invalid invite link' });
      if (invite.status === 'accepted') return res.json({ alreadyAccepted: true, orgName: invite.orgName });
      res.json({ orgName: invite.orgName, email: invite.email, role: invite.role, needsProfile: !invite.firstName });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch invite' });
    }
  });

  app.post('/api/org-invite/:token/accept', async (req, res) => {
    try {
      const invite = await db.select().from(orgUsers)
        .where(and(eq(orgUsers.inviteToken, req.params.token), eq(orgUsers.status, 'pending')))
        .then(r => r[0]);
      if (!invite) return res.status(404).json({ error: 'Invalid or expired invite' });

      const { firstName, lastName } = req.body;
      const user = await db.select().from(users).where(eq(users.id, invite.userId)).then(r => r[0]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Update profile if needed (new user created from invite)
      if (!user.firstName && firstName) {
        await db.update(users).set({ firstName, lastName: lastName || '' }).where(eq(users.id, user.id));
      }

      await db.update(orgUsers).set({ status: 'accepted', acceptedAt: new Date(), inviteToken: null }).where(eq(orgUsers.id, invite.id));

      // Issue a session token so they're logged in
      const sessionToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '90d' });
      const updatedUser = await db.select().from(users).where(eq(users.id, user.id)).then(r => r[0]);
      res.json({ user: updatedUser, sessionToken });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to accept invite' });
    }
  });

  // Get divisions the current user manages
  app.get('/api/my-divisions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const assignments = await db.select({
        id: divisions.id,
        title: divisions.title,
        organizationId: divisions.organizationId,
        createdAt: divisions.createdAt,
        orgName: organizations.name,
      }).from(divisionUsers)
        .innerJoin(divisions, eq(divisionUsers.divisionId, divisions.id))
        .innerJoin(organizations, eq(divisions.organizationId, organizations.id))
        .where(eq(divisionUsers.userId, userId))
        .orderBy(asc(divisions.title));
      res.json(assignments);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch divisions' });
    }
  });

  // --- Division Routes ---

  // List divisions for current user's org
  app.get('/api/organization/divisions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result) return res.status(404).json({ error: 'No organization found' });
      const divs = await db.select().from(divisions).where(eq(divisions.organizationId, result.org.id)).orderBy(asc(divisions.title));
      // Get manager assignments for each division
      const divIds = divs.map(d => d.id);
      let assignments: any[] = [];
      if (divIds.length > 0) {
        assignments = await db.select({
          divisionId: divisionUsers.divisionId,
          userId: divisionUsers.userId,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        }).from(divisionUsers)
          .innerJoin(users, eq(divisionUsers.userId, users.id))
          .where(inArray(divisionUsers.divisionId, divIds));
      }
      const divsWithManagers = divs.map(d => ({
        ...d,
        managers: assignments.filter(a => a.divisionId === d.id),
      }));
      res.json({ divisions: divsWithManagers });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch divisions' });
    }
  });

  // Create division
  app.post('/api/organization/divisions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result || (result.role !== 'owner' && result.role !== 'admin'))
        return res.status(403).json({ error: 'Not authorized' });
      const { title } = req.body;
      if (!title || !title.trim()) return res.status(400).json({ error: 'Division title is required' });
      const [div] = await db.insert(divisions).values({ organizationId: result.org.id, title: title.trim() }).returning();
      res.json({ division: div });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create division' });
    }
  });

  // Update division
  app.patch('/api/organization/divisions/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result || (result.role !== 'owner' && result.role !== 'admin'))
        return res.status(403).json({ error: 'Not authorized' });
      const divId = parseInt(req.params.id);
      const div = await db.select().from(divisions).where(eq(divisions.id, divId)).then(r => r[0]);
      if (!div || div.organizationId !== result.org.id) return res.status(404).json({ error: 'Division not found' });
      const { title } = req.body;
      if (!title || !title.trim()) return res.status(400).json({ error: 'Division title is required' });
      const [updated] = await db.update(divisions).set({ title: title.trim() }).where(eq(divisions.id, divId)).returning();
      res.json({ division: updated });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update division' });
    }
  });

  // Delete division
  app.delete('/api/organization/divisions/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result || (result.role !== 'owner' && result.role !== 'admin'))
        return res.status(403).json({ error: 'Not authorized' });
      const divId = parseInt(req.params.id);
      const div = await db.select().from(divisions).where(eq(divisions.id, divId)).then(r => r[0]);
      if (!div || div.organizationId !== result.org.id) return res.status(404).json({ error: 'Division not found' });
      const auditionCount = await db.select({ count: sql<number>`cast(count(*) as int)` })
        .from(auditions).where(eq(auditions.divisionId, divId)).then(r => r[0].count);
      if (auditionCount > 0) {
        return res.status(400).json({ error: 'Cannot delete a division that has auditions. Reassign or delete them first.' });
      }
      await db.delete(divisionUsers).where(eq(divisionUsers.divisionId, divId));
      await db.delete(divisions).where(eq(divisions.id, divId));
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete division' });
    }
  });

  // Assign manager to division
  app.post('/api/organization/divisions/:id/managers', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result || (result.role !== 'owner' && result.role !== 'admin'))
        return res.status(403).json({ error: 'Not authorized' });
      const divId = parseInt(req.params.id);
      const div = await db.select().from(divisions).where(eq(divisions.id, divId)).then(r => r[0]);
      if (!div || div.organizationId !== result.org.id) return res.status(404).json({ error: 'Division not found' });
      const { managerId } = req.body;
      // Verify the manager belongs to this org with manager role
      const member = await db.select().from(orgUsers)
        .where(and(eq(orgUsers.organizationId, result.org.id), eq(orgUsers.userId, managerId), eq(orgUsers.status, 'accepted')))
        .then(r => r[0]);
      if (!member) return res.status(400).json({ error: 'User is not a member of this organization' });
      if (member.role !== 'manager') return res.status(400).json({ error: 'Only managers can be assigned to divisions' });
      await db.insert(divisionUsers).values({ divisionId: divId, userId: managerId }).onConflictDoNothing();
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to assign manager' });
    }
  });

  // Remove manager from division
  app.delete('/api/organization/divisions/:id/managers/:managerId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await getUserOrg(userId);
      if (!result || (result.role !== 'owner' && result.role !== 'admin'))
        return res.status(403).json({ error: 'Not authorized' });
      const divId = parseInt(req.params.id);
      const managerId = parseInt(req.params.managerId);
      const div = await db.select().from(divisions).where(eq(divisions.id, divId)).then(r => r[0]);
      if (!div || div.organizationId !== result.org.id) return res.status(404).json({ error: 'Division not found' });
      await db.delete(divisionUsers).where(and(eq(divisionUsers.divisionId, divId), eq(divisionUsers.userId, managerId)));
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to remove manager' });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
