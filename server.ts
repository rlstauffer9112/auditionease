import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { db } from './src/db';
import { auditions, auditionSlots, callbacks, customAttributes, auditionUsers, auditionUserCustomFields, users, loginTokens, userSettings, reports, subscriptions } from './src/db/schema';
import { eq, and, or, asc, gt, lte, desc, sql, inArray } from 'drizzle-orm';
import cors from 'cors';
import { BrevoClient } from '@getbrevo/brevo';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Stripe from 'stripe';

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
            await db.insert(subscriptions).values({
              userId,
              stripeSubscriptionId: sub.id,
              plan,
              amount,
              status: 'active',
              endDate: new Date(sub.current_period_end * 1000),
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
            await db.update(subscriptions)
              .set({
                status: 'active',
                endDate: new Date(sub.current_period_end * 1000),
                amount: (invoice.amount_paid / 100).toFixed(2),
              })
              .where(eq(subscriptions.stripeSubscriptionId, sub.id));
          }
          break;
        }
        case 'customer.subscription.updated': {
          const sub = event.data.object as any;
          await db.update(subscriptions)
            .set({
              status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled',
              endDate: new Date(sub.current_period_end * 1000),
            })
            .where(eq(subscriptions.stripeSubscriptionId, sub.id));
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as any;
          await db.update(subscriptions)
            .set({ status: 'canceled' })
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
    const audition = await db.select({ id: auditions.id }).from(auditions)
      .where(and(eq(auditions.id, auditionId), eq(auditions.userId, userId)))
      .then(rows => rows[0]);
    return !!audition;
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
        totalCallbacksResult,
        acceptedCallbacksResult,
        rejectedCallbacksResult,
        pendingCallbacksResult,
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
        db.select({ count: sql<number>`count(*)::int` }).from(callbacks),
        db.select({ count: sql<number>`count(*)::int` }).from(callbacks).where(eq(callbacks.finalDecision, 'accepted')),
        db.select({ count: sql<number>`count(*)::int` }).from(callbacks).where(eq(callbacks.finalDecision, 'rejected')),
        db.select({ count: sql<number>`count(*)::int` }).from(callbacks).where(eq(callbacks.finalDecision, 'pending')),
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
        totalCallbacks: totalCallbacksResult[0].count,
        acceptedCallbacks: acceptedCallbacksResult[0].count,
        rejectedCallbacks: rejectedCallbacksResult[0].count,
        pendingCallbacks: pendingCallbacksResult[0].count,
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
      const attrs = await db.select().from(customAttributes).where(eq(customAttributes.userId, userId)).orderBy(asc(customAttributes.order));
      res.json(attrs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch custom attributes' });
    }
  });

  app.post('/api/custom-attributes', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const [maxRow] = await db.select({ maxOrder: sql<number>`coalesce(max(${customAttributes.order}), -1)` })
        .from(customAttributes).where(eq(customAttributes.userId, userId));
      const nextOrder = (maxRow?.maxOrder ?? -1) + 1;
      const newAttr = await db.insert(customAttributes).values({ ...req.body, userId, order: nextOrder }).returning();
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
      const existing = await db.select({ id: customAttributes.id }).from(customAttributes)
        .where(eq(customAttributes.userId, userId));
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
      if (!attr || attr.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
      await db.delete(auditionUserCustomFields).where(eq(auditionUserCustomFields.customAttributeId, attrId));
      await db.delete(customAttributes).where(eq(customAttributes.id, attrId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete custom attribute' });
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
          createdAt: auditions.createdAt,
          userCount: sql<number>`${sql.raw("cast((select count(*) from audition_users where audition_users.audition_id = auditions.id) as int)")}`,
          openSlots: sql<number>`${sql.raw("cast((select count(*) from audition_slots where audition_slots.audition_id = auditions.id and audition_slots.status = 'available') as int)")}`,
          filledSlots: sql<number>`${sql.raw("cast((select count(*) from audition_slots where audition_slots.audition_id = auditions.id and audition_slots.status in ('booked', 'completed', 'no-show')) as int)")}`,
        })
        .from(auditions)
        .where(eq(auditions.userId, userId));
      res.json(allAuditions);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch auditions' });
    }
  });

  app.post('/api/auditions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { inviteCode, ...rest } = req.body;
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
      const newAudition = await db.insert(auditions).values({ ...rest, userId, inviteCode: code }).returning();
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
      const { title, description, date, location, status, inviteCode } = req.body;
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
      const updated = await db.update(auditions).set(updates).where(eq(auditions.id, auditionId)).returning();
      res.json(updated[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update audition' });
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
      const updatedSlot = await db.update(auditionSlots)
        .set(req.body)
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

  // Callbacks
  app.get('/api/auditions/:id/callbacks', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const auditionId = parseInt(req.params.id);
    if (!await verifyAuditionOwnership(auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const auditionCallbacks = await db.select().from(callbacks).where(eq(callbacks.auditionId, auditionId));
      res.json(auditionCallbacks);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch callbacks' });
    }
  });

  app.post('/api/callbacks', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!await verifyAuditionOwnership(req.body.auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const newCallback = await db.insert(callbacks).values(req.body).returning();
      res.json(newCallback[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create callback' });
    }
  });

  app.patch('/api/callbacks/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const callback = await db.select().from(callbacks).where(eq(callbacks.id, parseInt(req.params.id))).then(rows => rows[0]);
      if (!callback || !callback.auditionId || !await verifyAuditionOwnership(callback.auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });
      const updated = await db.update(callbacks)
        .set(req.body)
        .where(eq(callbacks.id, parseInt(req.params.id)))
        .returning();
      if (updated.length === 0) {
        res.status(404).json({ error: 'Callback not found' });
        return;
      }
      res.json(updated[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update callback' });
    }
  });

  app.delete('/api/callbacks/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const callback = await db.select().from(callbacks).where(eq(callbacks.id, parseInt(req.params.id))).then(rows => rows[0]);
      if (!callback || !callback.auditionId || !await verifyAuditionOwnership(callback.auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });
      await db.delete(callbacks).where(eq(callbacks.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete callback' });
    }
  });

  app.post('/api/callbacks/:id/notify', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const callback = await db.select().from(callbacks)
        .where(eq(callbacks.id, parseInt(req.params.id)))
        .then(rows => rows[0]);
      if (!callback) {
        return res.status(404).json({ error: 'Callback not found' });
      }
      if (!callback.auditionId || !await verifyAuditionOwnership(callback.auditionId, userId)) return res.status(403).json({ error: 'Forbidden' });

      const callbackUser = callback.userId
        ? await db.select().from(users).where(eq(users.id, callback.userId)).then(rows => rows[0])
        : null;
      if (!callbackUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const audition = callback.auditionId
        ? await db.select().from(auditions).where(eq(auditions.id, callback.auditionId)).then(rows => rows[0])
        : null;

      const scheduledInfo = callback.scheduledTime
        ? `<p>Your callback is scheduled for: <strong>${callback.scheduledTime}</strong></p>`
        : '';

      if (process.env.BREVO_API_KEY) {
        await client.transactionalEmails.sendTransacEmail({
          subject: `Callback Notification - ${audition?.title || 'Audition'}`,
          htmlContent: `
            <h2>Congratulations, ${callbackUser.firstName}!</h2>
            <p>You have been selected for a callback for <strong>${audition?.title || 'the audition'}</strong>.</p>
            ${scheduledInfo}
            ${callback.notes ? `<p>Notes: ${callback.notes}</p>` : ''}
            <p>Please contact us if you have any questions.</p>
          `,
          sender: { name: "AuditionEase", email: "noreply@auditionease.com" },
          to: [{ email: callbackUser.email }],
        });
        res.json({ success: true, message: 'Notification sent' });
      } else {
        console.log(`--- CALLBACK NOTIFICATION ---`);
        console.log(`To: ${callbackUser.email}`);
        console.log(`Subject: Callback for ${audition?.title}`);
        console.log(`Scheduled: ${callback.scheduledTime || 'TBD'}`);
        console.log(`-----------------------------`);
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

      const userAuditions = await db.select().from(auditions).where(eq(auditions.userId, userId));
      if (userAuditions.length === 0) return res.json({ columns: reportColumns, rows: [] });

      const auditionIds = userAuditions.map(a => a.id);
      const auditionMap = new Map(userAuditions.map(a => [a.id, a]));

      const auRows = await db.select().from(auditionUsers).where(inArray(auditionUsers.auditionId, auditionIds));
      if (auRows.length === 0) return res.json({ columns: reportColumns, rows: [] });

      const auIds = auRows.map(au => au.id);
      const userIds = [...new Set(auRows.map(au => au.userId))];

      const [usersData, cfValues, slotsData, attrs] = await Promise.all([
        db.select().from(users).where(inArray(users.id, userIds)),
        db.select().from(auditionUserCustomFields).where(inArray(auditionUserCustomFields.auditionUserId, auIds)),
        db.select().from(auditionSlots).where(inArray(auditionSlots.auditionId, auditionIds)),
        db.select().from(customAttributes).where(eq(customAttributes.userId, userId)),
      ]);

      const userMap = new Map(usersData.map(u => [u.id, u]));
      const attrMap = new Map(attrs.map(a => [a.id, a]));

      const enrichedRows = auRows.map(au => {
        const userData = userMap.get(au.userId);
        const audition = auditionMap.get(au.auditionId);
        const cfv = cfValues.filter(cf => cf.auditionUserId === au.id);
        const slot = slotsData.find(s => s.auditionId === au.auditionId && s.userId === au.userId && s.status === 'completed');

        const row: Record<string, any> = {
          firstName: userData?.firstName || '',
          lastName: userData?.lastName || '',
          email: userData?.email || '',
          phone: userData?.phone || '',
          auditionTitle: audition?.title || '',
          auditionDate: audition?.date || '',
          score: slot?.score ?? '',
          feedback: slot?.feedback || '',
          passedToCallback: slot ? (slot.passedToCallback ? 'Yes' : 'No') : '',
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
      const attrs = await db.select().from(customAttributes)
        .where(eq(customAttributes.userId, audition.userId));
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

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(loginTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      const loginLink = `${APP_URL}/verify?token=${token}`;

      try {
        if (process.env.BREVO_API_KEY) {
          await client.transactionalEmails.sendTransacEmail({
            subject: "Login to AuditionEase",
            htmlContent: `<p>Click the link below to login to your AuditionEase account:</p><p><a href="${loginLink}">${loginLink}</a></p><p>This link expires in 15 minutes.</p>`,
            sender: { "name": "AuditionEase", "email": "noreply@auditionease.com" },
            to: [{ "email": email }],
          });
        } else {
          console.log('--- LOGIN LINK (No Brevo API Key) ---');
          console.log(loginLink);
          console.log('-----------------------------------------');
        }
      } catch (emailErr) {
        console.error('Email send failed, printing link to console:', emailErr);
        console.log('--- LOGIN LINK (Email failed) ---');
        console.log(loginLink);
        console.log('-----------------------------------------');
      }

      res.json({ success: true, message: 'Login email sent' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to process login request' });
    }
  });

  app.post('/api/auth/verify-token', async (req, res) => {
    try {
      const { token } = req.body;
      const loginToken = await db.select().from(loginTokens)
        .where(and(
          eq(loginTokens.token, token),
          eq(loginTokens.used, false),
          gt(loginTokens.expiresAt, new Date())
        ))
        .then(rows => rows[0]);

      if (!loginToken) {
        return res.status(400).json({ error: 'Invalid or expired token' });
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
        ui_mode: 'embedded',
        return_url: `${APP_URL}?subscription=success`,
        metadata: { userId: String(userId), plan, amount: amountMap[plan] },
      });

      res.json({ clientSecret: session.client_secret });
    } catch (err) {
      console.error('Stripe checkout error:', err);
      res.status(500).json({ error: 'Failed to create checkout session' });
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
