import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { renderCancelPage } from './cancel-page.js';
import { getCancelAssignment, trackComplaint, trackRetention, type FlagsmithPort } from './flagsmith.js';
import { isActionAllowed, offerCopy, type Arm } from './experiment.js';

type FlowStatus = 'open' | 'retained' | 'cancelled';

interface FlowState {
  arm: Arm;
  enrolled: boolean;
  status: FlowStatus;
  retentionEventSent: boolean;
  complaintEventSent: boolean;
}

const uidSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const actionBodySchema = z.object({
  uid: uidSchema,
  action: z.enum(['keep', 'accept_pause', 'accept_discount', 'cancel']),
}).strict();
const complaintBodySchema = z.object({ uid: uidSchema }).strict();

export interface ServerDependencies {
  flagsmith: FlagsmithPort;
}

export function buildServer({ flagsmith }: ServerDependencies): FastifyInstance {
  const app = Fastify({ logger: { level: 'warn' } });
  const flows = new Map<string, FlowState>();

  app.addHook('onClose', async () => {
    await flagsmith.close();
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get<{ Querystring: { uid?: string } }>('/account/cancel', async (request, reply) => {
    const parsedUid = uidSchema.safeParse(request.query.uid);
    if (!parsedUid.success) return reply.code(400).send({ error: 'A valid uid query parameter is required.' });
    const uid = parsedUid.data;
    let flow = flows.get(uid);
    if (!flow) {
      const assignment = await getCancelAssignment(flagsmith, uid);
      flow = { ...assignment, status: 'open', retentionEventSent: false, complaintEventSent: false };
      if (!flow.enrolled) {
        app.log.warn({ feature: 'cancel_flow', identity: uid }, 'Identity is not enrolled; rendering control and suppressing conversion events.');
      }
      flows.set(uid, flow);
    }

    const response = {
      uid,
      arm: flow.arm,
      enrolled: flow.enrolled,
      offer: offerCopy(flow.arm) ?? null,
      cancellation: { available: true, oneClick: true, label: flow.arm === 'control' ? 'Cancel subscription' : 'Cancel anyway' },
    };
    if ((request.headers.accept ?? '').includes('application/json')) return response;
    return reply.type('text/html; charset=utf-8').send(renderCancelPage(flow.arm, uid));
  });

  app.post('/account/cancel/action', async (request, reply) => {
    const parsed = actionBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Body must contain a valid uid and action.' });
    const { uid, action } = parsed.data;
    const flow = flows.get(uid);
    if (!flow) return reply.code(404).send({ error: 'Open the cancel flow before submitting an action.' });
    if (flow.status !== 'open') return reply.code(409).send({ error: 'This cancel flow has already ended.' });
    if (!isActionAllowed(flow.arm, action)) {
      return reply.code(400).send({ error: 'That action is not available in this variant.' });
    }

    if (action === 'cancel') {
      flow.status = 'cancelled';
      return { uid, status: flow.status, retainedEventSent: false };
    }

    if (flow.enrolled && !flow.retentionEventSent) {
      trackRetention(flagsmith, uid);
      flow.retentionEventSent = true;
    }
    flow.status = 'retained';
    return { uid, status: flow.status, retainedEventSent: flow.retentionEventSent };
  });

  app.post('/account/complaint', async (request, reply) => {
    const parsed = complaintBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Body must contain a valid uid.' });
    const { uid } = parsed.data;
    const flow = flows.get(uid);
    if (!flow) return reply.code(404).send({ error: 'Open the cancel flow before submitting a complaint.' });
    if (flow.status !== 'cancelled') {
      return reply.code(409).send({ error: 'A complaint can only be submitted after cancellation.' });
    }
    if (!flow.enrolled) return { uid, recorded: false, duplicate: false, reason: 'not_enrolled' };
    if (flow.complaintEventSent) return { uid, recorded: false, duplicate: true };

    trackComplaint(flagsmith, uid);
    flow.complaintEventSent = true;
    return { uid, recorded: true, duplicate: false };
  });

  return app;
}
