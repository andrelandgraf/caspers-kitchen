import {
  useAnalyticsQuery,
  BarChart,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@databricks/appkit-ui/react';

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold font-mono mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function AnalyticsPage() {
  const { data: metrics, loading: metricsLoading } = useAnalyticsQuery('support_metrics', {});

  const latest = metrics && metrics.length > 0 ? metrics[0] : null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <h2 className="text-2xl font-bold tracking-tight">Support Analytics</h2>

      {metricsLoading && (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={`metric-${i}`} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Total Cases" value={String(latest.total_cases)} sub={`${latest.open_cases} open`} />
          <MetricCard label="Avg Response Time" value={`${latest.avg_first_response_minutes ?? '—'}m`} />
          <MetricCard
            label="Refund Cases"
            value={String(latest.cases_with_refund)}
            sub={`$${((latest.total_refund_cents as number) / 100).toFixed(2)} total`}
          />
          <MetricCard label="Avg Messages" value={String(latest.avg_messages_per_case)} sub="per case" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Agent Action Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              queryKey="agent_performance"
              parameters={{}}
              xKey="action"
              yKey="count"
              height={300}
              colors={['oklch(0.92 0.004 286.32)']}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Avg Suggested Amount by Action</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              queryKey="agent_performance"
              parameters={{}}
              xKey="action"
              yKey="avg_amount_cents"
              height={300}
              colors={['oklch(0.705 0.015 286.067)']}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
