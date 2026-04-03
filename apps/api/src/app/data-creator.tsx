"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { ArrowLeft, Check, Loader2, Circle } from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3 | 4;

interface DataCreatorProps {
  simPassword: string;
}

interface MenuItem {
  id: string;
  name: string;
  priceInCents: number;
  category: string;
}

interface OrderItem {
  id: string;
  menuItemId: string;
  quantity: number;
  priceInCents: number;
  name: string;
}

interface Order {
  id: string;
  status: string;
  totalInCents: number;
  createdAt: string;
}

interface Driver {
  id: string;
  name: string;
  phone: string;
  status: string;
}

interface Delivery {
  id: string;
  orderId: string;
  driverId: string;
  status: string;
  startedAt: string;
  deliveredAt: string | null;
}

interface SupportCase {
  id: string;
  subject: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Emily",
  "James",
  "Sofia",
  "Liam",
  "Olivia",
  "Noah",
  "Ava",
  "Mason",
  "Isabella",
  "Lucas",
];
const LAST_NAMES = [
  "Davis",
  "Chen",
  "Martinez",
  "Patel",
  "Kim",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 5);
}

function deriveEmail(name: string, suffix: string): string {
  const parts = name.trim().split(/\s+/);
  const first = (parts[0] ?? "user").toLowerCase();
  const last = (
    parts.length > 1 ? parts[parts.length - 1] : "unknown"
  ).toLowerCase();
  return `${first}.${last}.${suffix}@sim.caspers.kitchen`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(startStr: string, endStr: string): string {
  const diffMs = new Date(endStr).getTime() - new Date(startStr).getTime();
  const totalMinutes = Math.round(diffMs / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function toLocalDatetimeValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEP_LABELS = ["User", "Order", "Delivery", "Support"] as const;

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {STEP_LABELS.map((label, i) => {
        const step = (i + 1) as Step;
        const done = step < current;
        const active = step === current;
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && (
              <span
                className={`h-px w-6 ${done || active ? "bg-foreground" : "bg-border"}`}
              />
            )}
            <span className="flex items-center gap-1.5">
              {done ? (
                <Check className="size-3.5 text-foreground" />
              ) : active ? (
                <Circle className="size-3 fill-foreground text-foreground" />
              ) : (
                <Circle className="size-3 text-muted-foreground" />
              )}
              <span
                className={
                  done || active
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }
              >
                {label}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DataCreator({ simPassword }: DataCreatorProps) {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);

  // Step 1 state
  const [userGenerated, setUserGenerated] = useState(false);
  const [userName, setUserName] = useState("");
  const [emailSuffix, setEmailSuffix] = useState("");
  const [confirmedUser, setConfirmedUser] = useState<{
    name: string;
    email: string;
  } | null>(null);

  // Step 2 state
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  // Step 3 state
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [startedAt, setStartedAt] = useState("");
  const [deliveredAt, setDeliveredAt] = useState("");
  const [confirmedDelivery, setConfirmedDelivery] = useState<{
    driverName: string;
    startedAt: string;
    deliveredAt: string;
  } | null>(null);

  // Step 4 state
  const [messageText, setMessageText] = useState(
    "My order took forever to be delivered. It's cold and soggy.",
  );

  const router = useRouter();

  // -------------------------------------------------------------------------
  // Step 1: Create User
  // -------------------------------------------------------------------------

  const userEmail = emailSuffix ? deriveEmail(userName, emailSuffix) : "";

  function handleGenerateUser() {
    const first = randomPick(FIRST_NAMES);
    const last = randomPick(LAST_NAMES);
    setUserName(`${first} ${last}`);
    setEmailSuffix(randomSuffix());
    setUserGenerated(true);
  }

  async function handleConfirmUser() {
    if (!userGenerated || !userEmail) return;
    setLoading(true);
    try {
      const { error: signUpErr } = await signUp.email({
        name: userName,
        email: userEmail,
        password: simPassword,
      });
      if (signUpErr) throw new Error(signUpErr.message ?? "Sign up failed");

      const { error: signInErr } = await signIn.email({
        email: userEmail,
        password: simPassword,
      });
      if (signInErr) throw new Error(signInErr.message ?? "Sign in failed");

      setConfirmedUser({ name: userName, email: userEmail });
      setCurrentStep(2);
    } catch (err) {
      alert(err instanceof Error ? err.message : "User creation failed");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Create Order
  // -------------------------------------------------------------------------

  async function handleCreateOrder() {
    setLoading(true);
    try {
      const menuRes = await fetch("/api/menu");
      if (!menuRes.ok) throw new Error("Failed to fetch menu");
      const menu: MenuItem[] = await menuRes.json();
      if (menu.length === 0) throw new Error("Menu is empty");

      const count = Math.min(menu.length, 2 + Math.floor(Math.random() * 3));
      const shuffled = [...menu].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, count);

      for (const item of picked) {
        const qty = 1 + Math.floor(Math.random() * 2);
        const cartRes = await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: item.id, quantity: qty }),
        });
        if (!cartRes.ok) throw new Error("Failed to add item to cart");
      }

      const orderRes = await fetch("/api/orders", { method: "POST" });
      if (!orderRes.ok) throw new Error("Failed to place order");
      const newOrder: Order = await orderRes.json();

      const detailRes = await fetch(`/api/orders/${newOrder.id}`);
      if (!detailRes.ok) throw new Error("Failed to fetch order details");
      const { order: fetchedOrder, items } = (await detailRes.json()) as {
        order: Order;
        items: OrderItem[];
      };

      setOrder(fetchedOrder);
      setOrderItems(items);
      setCurrentStep(3);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Order creation failed");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Generate Delivery
  // -------------------------------------------------------------------------

  async function handleGenerateDelivery() {
    setLoading(true);
    try {
      const driversRes = await fetch("/api/drivers");
      if (!driversRes.ok) throw new Error("Failed to fetch drivers");
      const allDrivers: Driver[] = await driversRes.json();
      if (allDrivers.length === 0) throw new Error("No drivers found");

      setDrivers(allDrivers);
      const driver = randomPick(allDrivers);
      setSelectedDriver(driver);

      const now = new Date();
      const start = new Date(now.getTime() - 90 * 60000);
      setStartedAt(toLocalDatetimeValue(start));
      setDeliveredAt(toLocalDatetimeValue(now));
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to load delivery form",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmDelivery() {
    if (!order || !selectedDriver) return;
    setLoading(true);
    try {
      const createRes = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          driverId: selectedDriver.id,
          startedAt: new Date(startedAt).toISOString(),
        }),
      });
      if (!createRes.ok) throw new Error("Failed to create delivery");
      const delivery: Delivery = await createRes.json();

      const completeRes = await fetch(
        `/api/deliveries/${delivery.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deliveredAt: new Date(deliveredAt).toISOString(),
          }),
        },
      );
      if (!completeRes.ok) throw new Error("Failed to complete delivery");

      setConfirmedDelivery({
        driverName: selectedDriver.name,
        startedAt,
        deliveredAt,
      });
      setCurrentStep(4);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delivery failed");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Support Ticket
  // -------------------------------------------------------------------------

  async function handleSendMessage() {
    setLoading(true);
    try {
      const caseRes = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "Late delivery" }),
      });
      if (!caseRes.ok) throw new Error("Failed to create support case");
      const newCase: SupportCase = await caseRes.json();

      const msgRes = await fetch(`/api/support/${newCase.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageText }),
      });
      if (!msgRes.ok) throw new Error("Failed to send message");

      router.push(`/support?caseId=${newCase.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Support ticket failed");
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
          <span className="text-xl font-bold tracking-tight">
            Casper&apos;s Kitchen
          </span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            Data Creator
          </span>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-2xl space-y-8">
          <StepIndicator current={currentStep} />

          <Separator />

          {/* ---- Step 1: Create User ---- */}
          {currentStep > 1 && confirmedUser ? (
            <CompletedRow
              label={`${confirmedUser.name} — ${confirmedUser.email}`}
            />
          ) : (
            currentStep === 1 && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Create User</h2>
                {!userGenerated ? (
                  <Button onClick={handleGenerateUser}>Generate User</Button>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="user-name">Name</Label>
                      <Input
                        id="user-name"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Email</Label>
                      <p className="text-sm text-muted-foreground">
                        {userEmail}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label>Password</Label>
                      <p className="text-sm text-muted-foreground font-mono">
                        {simPassword}
                      </p>
                    </div>
                    <Button onClick={handleConfirmUser} disabled={loading}>
                      {loading && (
                        <Loader2 className="size-4 animate-spin mr-2" />
                      )}
                      Confirm &amp; Sign In
                    </Button>
                  </div>
                )}
              </section>
            )
          )}

          {/* ---- Step 2: Create Order ---- */}
          {currentStep > 2 && order ? (
            <CompletedRow
              label={`Order #${order.id.slice(0, 6)} · ${orderItems.length} items · ${formatCents(order.totalInCents)}`}
            />
          ) : (
            currentStep === 2 && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Create Order</h2>
                {!order ? (
                  <Button onClick={handleCreateOrder} disabled={loading}>
                    {loading && (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    )}
                    Create Order
                  </Button>
                ) : (
                  <OrderReceipt order={order} items={orderItems} />
                )}
              </section>
            )
          )}

          {/* ---- Step 3: Generate Delivery ---- */}
          {currentStep > 3 && confirmedDelivery ? (
            <CompletedRow
              label={`Delivered by ${confirmedDelivery.driverName} · ${formatDuration(confirmedDelivery.startedAt, confirmedDelivery.deliveredAt)}`}
            />
          ) : (
            currentStep === 3 && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Generate Delivery</h2>
                {!selectedDriver ? (
                  <Button onClick={handleGenerateDelivery} disabled={loading}>
                    {loading && (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    )}
                    Generate Delivery
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="driver-select">Driver</Label>
                      <select
                        id="driver-select"
                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={selectedDriver.id}
                        onChange={(e) => {
                          const d = drivers.find(
                            (dr) => dr.id === e.target.value,
                          );
                          if (d) setSelectedDriver(d);
                        }}
                      >
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="started-at">Started At</Label>
                        <Input
                          id="started-at"
                          type="datetime-local"
                          value={startedAt}
                          onChange={(e) => setStartedAt(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="delivered-at">Delivered At</Label>
                        <Input
                          id="delivered-at"
                          type="datetime-local"
                          value={deliveredAt}
                          onChange={(e) => setDeliveredAt(e.target.value)}
                        />
                      </div>
                    </div>
                    {startedAt && deliveredAt && (
                      <p className="text-sm text-muted-foreground">
                        Duration: {formatDuration(startedAt, deliveredAt)}
                      </p>
                    )}
                    <Button onClick={handleConfirmDelivery} disabled={loading}>
                      {loading && (
                        <Loader2 className="size-4 animate-spin mr-2" />
                      )}
                      Confirm Delivery
                    </Button>
                  </div>
                )}
              </section>
            )
          )}

          {/* ---- Step 4: Support Ticket ---- */}
          {currentStep === 4 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Support Ticket</h2>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Subject</Label>
                  <p className="text-sm">Late delivery</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="support-message">Message</Label>
                  <Textarea
                    id="support-message"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button onClick={handleSendMessage} disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Send &amp; Open Support Chat
                </Button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CompletedRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Check className="size-4 text-foreground shrink-0" />
      <span className="text-foreground">{label}</span>
    </div>
  );
}

function OrderReceipt({ order, items }: { order: Order; items: OrderItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Order #{order.id.slice(0, 6)}</CardTitle>
        <Badge variant="outline">{order.status}</Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>
                {item.name} × {item.quantity}
              </span>
              <span className="text-muted-foreground">
                {formatCents(item.priceInCents * item.quantity)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex w-full justify-between font-medium">
          <span>Total</span>
          <span>{formatCents(order.totalInCents)}</span>
        </div>
      </CardFooter>
    </Card>
  );
}
