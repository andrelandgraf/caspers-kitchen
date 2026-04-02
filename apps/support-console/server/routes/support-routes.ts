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
          LEFT JOIN gold.support_agent_responses_sync ar
            ON sc.case_id = ar.case_id
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

        const caseResult = await appkit.lakebase.query(`
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
        `, [caseId]);

        if (caseResult.rows.length === 0) {
          res.status(404).json({ error: 'Case not found' });
          return;
        }

        const messagesResult = await appkit.lakebase.query(`
          SELECT
            encode(id, 'hex') AS id,
            CASE WHEN admin_id IS NOT NULL THEN 'admin' ELSE 'customer' END AS role,
            content,
            created_at
          FROM public.support_messages
          WHERE encode(case_id, 'hex') = $1
          ORDER BY created_at ASC
        `, [caseId]);

        const agentResult = await appkit.lakebase.query(`
          SELECT
            case_summary,
            suggested_response,
            suggested_action,
            suggested_amount_cents,
            reasoning,
            model,
            generated_at
          FROM gold.support_agent_responses_sync
          WHERE encode(case_id, 'hex') = $1
        `, [caseId]);

        const profileResult = await appkit.lakebase.query(`
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
        `, [caseResult.rows[0].user_id as string]);

        res.json({
          case: caseResult.rows[0],
          messages: messagesResult.rows,
          agentResponse: agentResult.rows[0] || null,
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

        const result = await appkit.lakebase.query(
          `INSERT INTO support_console.admin_decisions (case_id, admin_action, admin_amount_cents, admin_response)
           VALUES ($1, $2, $3, $4)
           RETURNING id, admin_action, admin_amount_cents, admin_response, created_at`,
          [caseIdBytes, parsed.data.admin_action, parsed.data.admin_amount_cents, parsed.data.admin_response],
        );

        res.status(201).json(result.rows[0]);
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
          [caseIdBytes],
        );

        res.json(result.rows);
      } catch (err) {
        console.error('Failed to get decisions:', err);
        res.status(500).json({ error: 'Failed to get decisions' });
      }
    });
  });
}
