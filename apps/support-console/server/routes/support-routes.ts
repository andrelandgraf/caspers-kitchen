import { z } from 'zod';
import { Application } from 'express';

interface AppKitWithLakebase {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

const ADMIN_DECISIONS_EXISTS_SQL = `
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'support_console' AND table_name = 'admin_decisions'
`;

const SETUP_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS support_console`;

const CREATE_DECISIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS support_console.admin_decisions (
    id SERIAL PRIMARY KEY,
    case_id BYTEA NOT NULL,
    admin_action TEXT NOT NULL,
    admin_amount_cents INTEGER NOT NULL DEFAULT 0,
    admin_response TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const SubmitDecisionBody = z.object({
  case_id: z.string().min(1),
  admin_action: z.enum(['refund', 'credit', 'no_action', 'escalate']),
  admin_amount_cents: z.number().int().min(0),
  admin_response: z.string().min(1),
});

const UpdateStatusBody = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
});

function hexToUuid(hex: string): string {
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

export async function setupSupportRoutes(appkit: AppKitWithLakebase) {
  try {
    const { rows } = await appkit.lakebase.query(ADMIN_DECISIONS_EXISTS_SQL);
    if (rows.length > 0) {
      console.log('[support] Table support_console.admin_decisions already exists');
    } else {
      await appkit.lakebase.query(SETUP_SCHEMA_SQL);
      await appkit.lakebase.query(CREATE_DECISIONS_TABLE_SQL);
      console.log('[support] Created schema and table support_console.admin_decisions');
    }
  } catch (err) {
    console.warn('[support] Database setup failed:', (err as Error).message);
  }

  appkit.server.extend((app) => {
    app.get('/api/cases', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT
            encode(sc.case_id, 'hex') AS case_id,
            sc.user_id,
            sc.user_name,
            sc.user_email,
            sc.subject,
            sc.status,
            sc.case_created_at,
            sc.message_count,
            sc.has_admin_reply,
            sc.first_response_minutes,
            ar.suggested_action,
            ar.suggested_amount_cents,
            ar.case_summary
          FROM gold.support_case_context_sync sc
          LEFT JOIN LATERAL (
            SELECT suggested_action, suggested_amount_cents, case_summary
            FROM gold.support_agent_responses_sync
            WHERE case_id = sc.case_id
            ORDER BY generated_at DESC LIMIT 1
          ) ar ON true
          ORDER BY sc.case_created_at DESC
        `);
        res.json(result.rows);
      } catch (err) {
        console.error('Failed to list cases:', err);
        res.status(500).json({ error: 'Failed to list cases' });
      }
    });

    app.get('/api/cases/:caseId', async (req, res) => {
      try {
        const caseId = req.params.caseId;
        const caseIdUuid = [
          caseId.slice(0, 8),
          caseId.slice(8, 12),
          caseId.slice(12, 16),
          caseId.slice(16, 20),
          caseId.slice(20, 32),
        ].join('-');

        const caseResult = await appkit.lakebase.query(
          `
          SELECT
            encode(sc.case_id, 'hex') AS case_id,
            sc.user_id,
            sc.user_name,
            sc.user_email,
            sc.user_region,
            sc.subject,
            sc.status,
            sc.case_created_at,
            sc.message_count,
            sc.has_admin_reply,
            sc.first_response_minutes,
            sc.linked_refund_cents,
            sc.linked_credit_cents,
            sc.user_lifetime_spend_cents,
            sc.user_cases_90d
          FROM gold.support_case_context_sync sc
          WHERE encode(sc.case_id, 'hex') = $1
        `,
          [caseId]
        );

        if (caseResult.rows.length === 0) {
          res.status(404).json({ error: 'Case not found' });
          return;
        }

        const messagesResult = await appkit.lakebase.query(
          `
          SELECT
            id::text AS id,
            CASE WHEN admin_id IS NOT NULL THEN 'admin' ELSE 'customer' END AS role,
            content,
            created_at
          FROM public.support_messages
          WHERE case_id::text = $1
          ORDER BY created_at ASC
        `,
          [caseIdUuid]
        );

        const agentResult = await appkit.lakebase.query(
          `
          SELECT
            encode(message_id, 'hex') AS message_id,
            case_summary,
            suggested_response,
            suggested_action,
            suggested_amount_cents,
            reasoning,
            model,
            generated_at
          FROM gold.support_agent_responses_sync
          WHERE encode(case_id, 'hex') = $1
          ORDER BY generated_at DESC
        `,
          [caseId]
        );

        const profileResult = await appkit.lakebase.query(
          `
          SELECT
            total_orders_90d,
            total_spend_90d_cents,
            lifetime_order_count,
            lifetime_spend_cents,
            support_cases_90d,
            support_cases_lifetime,
            total_refunds_90d_cents,
            total_credits_90d_cents
          FROM gold.user_support_profile_sync
          WHERE user_id = $1
        `,
          [caseResult.rows[0].user_id as string]
        );

        res.json({
          case: caseResult.rows[0],
          messages: messagesResult.rows,
          agentResponses: agentResult.rows,
          userProfile: profileResult.rows[0] || null,
        });
      } catch (err) {
        console.error('Failed to get case detail:', err);
        res.status(500).json({ error: 'Failed to get case detail' });
      }
    });

    app.post('/api/cases/:caseId/decision', async (req, res) => {
      try {
        const caseId = req.params.caseId;
        const parsed = SubmitDecisionBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
          return;
        }

        const caseIdBytes = Buffer.from(caseId, 'hex');
        const caseIdUuid = hexToUuid(caseId);

        const adminResult = await appkit.lakebase.query(`SELECT id FROM public.admins LIMIT 1`);
        const adminId = adminResult.rows.length > 0 ? (adminResult.rows[0].id as string) : null;

        const decisionResult = await appkit.lakebase.query(
          `INSERT INTO support_console.admin_decisions (id, case_id, admin_action, admin_amount_cents, admin_response)
           VALUES (
             (SELECT COALESCE(MAX(id), 0) + 1 FROM support_console.admin_decisions),
             $1, $2, $3, $4
           )
           RETURNING id, admin_action, admin_amount_cents, admin_response, created_at`,
          [caseIdBytes, parsed.data.admin_action, parsed.data.admin_amount_cents, parsed.data.admin_response]
        );

        let message: Record<string, unknown> | null = null;
        if (adminId) {
          const msgResult = await appkit.lakebase.query(
            `INSERT INTO public.support_messages (case_id, admin_id, content)
             VALUES ($1::uuid, $2::uuid, $3)
             RETURNING id::text AS id, 'admin' AS role, content, created_at`,
            [caseIdUuid, adminId, parsed.data.admin_response]
          );
          message = msgResult.rows[0] ?? null;

          await appkit.lakebase.query(
            `UPDATE public.support_cases
             SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
                 updated_at = NOW()
             WHERE id = $1::uuid`,
            [caseIdUuid]
          );
        }

        res.status(201).json({
          ...decisionResult.rows[0],
          message,
        });
      } catch (err) {
        console.error('Failed to submit decision:', err);
        res.status(500).json({ error: 'Failed to submit decision' });
      }
    });

    app.get('/api/cases/:caseId/decisions', async (req, res) => {
      try {
        const caseId = req.params.caseId;
        const caseIdBytes = Buffer.from(caseId, 'hex');

        const result = await appkit.lakebase.query(
          `SELECT id, admin_action, admin_amount_cents, admin_response, created_at
           FROM support_console.admin_decisions
           WHERE case_id = $1
           ORDER BY created_at DESC`,
          [caseIdBytes]
        );

        res.json(result.rows);
      } catch (err) {
        console.error('Failed to get decisions:', err);
        res.status(500).json({ error: 'Failed to get decisions' });
      }
    });

    app.patch('/api/cases/:caseId/status', async (req, res) => {
      try {
        const caseId = req.params.caseId;
        const parsed = UpdateStatusBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
          return;
        }

        const caseIdUuid = hexToUuid(caseId);

        await appkit.lakebase.query(
          `UPDATE public.support_cases
           SET status = $1, updated_at = NOW()
           WHERE id = $2::uuid`,
          [parsed.data.status, caseIdUuid]
        );

        res.json({ status: parsed.data.status });
      } catch (err) {
        console.error('Failed to update case status:', err);
        res.status(500).json({ error: 'Failed to update case status' });
      }
    });
  });
}
